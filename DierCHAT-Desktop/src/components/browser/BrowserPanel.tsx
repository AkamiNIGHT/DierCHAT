import type { RefObject } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ArrowRight,
  X,
  RefreshCw,
  Share2,
  ExternalLink,
  Lock,
  Unlock,
  Plus,
  Home,
  PanelRightClose,
  PanelRightOpen,
  ZoomIn,
  ZoomOut,
  AppWindow,
} from 'lucide-react';
import { useStore } from '@/store';
import { resolveAddressBarInput, DEFAULT_NEW_TAB_URL } from '@/lib/browserNav';
import { BROWSER_MAX_TABS } from '@/types/inAppBrowser';
import { faviconUrlForPageUrl, shortTitleFromUrl } from './browserUtils';
import { BrowserDevTools } from './BrowserDevTools';
import './BrowserPanel.css';

type Hist = { stack: string[]; idx: number };

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.1;

function isWebview(el: HTMLElement | null): el is HTMLWebviewElement {
  return el?.tagName === 'WEBVIEW';
}

/** В Electron preload есть `window.dierchat` — используем `<webview>`, иначе сайты с X-Frame-Options не откроются в iframe */
function useGuestWebview(): boolean {
  return typeof window !== 'undefined' && !!window.dierchat;
}

export function BrowserPanel() {
  const inAppBrowserTabs = useStore((s) => s.inAppBrowserTabs);
  const inAppBrowserActiveTabId = useStore((s) => s.inAppBrowserActiveTabId);
  const addInAppBrowserTab = useStore((s) => s.addInAppBrowserTab);
  const clearInAppBrowser = useStore((s) => s.clearInAppBrowser);
  const setActiveTabId = useStore((s) => s.setInAppBrowserActiveTabId);
  const removeTab = useStore((s) => s.removeInAppBrowserTab);
  const setTabUrl = useStore((s) => s.setInAppBrowserTabUrl);
  const setTabMeta = useStore((s) => s.setInAppBrowserTabMeta);
  const reorderTabs = useStore((s) => s.reorderInAppBrowserTabs);
  const liquidGlassEnabled = useStore((s) => s.liquidGlassEnabled);
  const browserClearHistoryOnClose = useStore((s) => s.browserClearHistoryOnClose);

  const activeTab = useMemo(
    () => inAppBrowserTabs.find((t) => t.id === inAppBrowserActiveTabId) ?? null,
    [inAppBrowserTabs, inAppBrowserActiveTabId]
  );
  const activeUrl = activeTab?.url ?? null;

  const [addressBar, setAddressBar] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [devtoolsOpen, setDevtoolsOpen] = useState(false);
  /** Сброс подсчёта canBack/canForward после изменения histRef */
  const [histTick, setHistTick] = useState(0);

  const guestRef = useRef<HTMLIFrameElement | HTMLWebviewElement | null>(null);
  const histRef = useRef<Record<string, Hist>>({});
  const frameWrapRef = useRef<HTMLDivElement | null>(null);
  const useWv = useGuestWebview();
  /** Нативная история Chromium (только webview) */
  const [wvNav, setWvNav] = useState({ back: false, fwd: false });
  /** Масштаб страницы по id вкладки (1 = 100%) */
  const [tabZooms, setTabZooms] = useState<Record<string, number>>({});
  const tabZoomsRef = useRef(tabZooms);
  tabZoomsRef.current = tabZooms;

  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 1024
  );

  useEffect(() => {
    const u = () => setWide(window.innerWidth >= 1024);
    u();
    window.addEventListener('resize', u);
    return () => window.removeEventListener('resize', u);
  }, []);

  useEffect(() => {
    if (activeUrl) setAddressBar(activeUrl);
  }, [activeUrl, inAppBrowserActiveTabId]);

  useEffect(() => {
    if (activeUrl) setIsLoading(true);
  }, [activeUrl, inAppBrowserActiveTabId]);

  useEffect(() => {
    inAppBrowserTabs.forEach((t) => {
      if (!histRef.current[t.id]) {
        histRef.current[t.id] = { stack: [t.url], idx: 0 };
      }
    });
  }, [inAppBrowserTabs]);

  const ensureHist = (tabId: string, url: string): Hist => {
    const h = histRef.current[tabId];
    if (h) return h;
    const n = { stack: [url], idx: 0 };
    histRef.current[tabId] = n;
    return n;
  };

  const canBack = useMemo(() => {
    if (!inAppBrowserActiveTabId) return false;
    if (useWv) return wvNav.back;
    const h = histRef.current[inAppBrowserActiveTabId];
    return !!h && h.idx > 0;
  }, [inAppBrowserActiveTabId, activeUrl, inAppBrowserTabs, histTick, useWv, wvNav.back]);

  const canForward = useMemo(() => {
    if (!inAppBrowserActiveTabId) return false;
    if (useWv) return wvNav.fwd;
    const h = histRef.current[inAppBrowserActiveTabId];
    return !!h && h.idx < h.stack.length - 1;
  }, [inAppBrowserActiveTabId, activeUrl, inAppBrowserTabs, histTick, useWv, wvNav.fwd]);

  const handleCloseAll = useCallback(() => {
    if (browserClearHistoryOnClose) {
      histRef.current = {};
    }
    clearInAppBrowser();
    setAddressBar('');
    setDevtoolsOpen(false);
    setIsLoading(false);
    setTabZooms({});
  }, [browserClearHistoryOnClose, clearInAppBrowser]);

  const activeZoomValue = useMemo(
    () => (inAppBrowserActiveTabId ? tabZooms[inAppBrowserActiveTabId] ?? 1 : 1),
    [inAppBrowserActiveTabId, tabZooms]
  );

  const applyZoomToWebview = useCallback((factor: number) => {
    const el = guestRef.current;
    if (!el || !isWebview(el)) return;
    try {
      const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, factor));
      (el as HTMLWebviewElement).setZoomFactor(z);
    } catch {
      /* ignore */
    }
  }, []);

  const setZoomForActiveTab = useCallback((next: number) => {
    if (!inAppBrowserActiveTabId) return;
    const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
    setTabZooms((prev) => ({ ...prev, [inAppBrowserActiveTabId]: z }));
  }, [inAppBrowserActiveTabId]);

  const handleZoomIn = useCallback(
    () => setZoomForActiveTab(activeZoomValue + ZOOM_STEP),
    [activeZoomValue, setZoomForActiveTab]
  );
  const handleZoomOut = useCallback(
    () => setZoomForActiveTab(activeZoomValue - ZOOM_STEP),
    [activeZoomValue, setZoomForActiveTab]
  );
  const handleZoomReset = useCallback(() => setZoomForActiveTab(1), [setZoomForActiveTab]);

  /** Electron: применить масштаб к активному webview (смена вкладки / ползунок) */
  useLayoutEffect(() => {
    if (!useWv) return;
    const id = requestAnimationFrame(() => applyZoomToWebview(activeZoomValue));
    return () => cancelAnimationFrame(id);
  }, [useWv, inAppBrowserActiveTabId, activeZoomValue, applyZoomToWebview]);

  const syncFavicon = useCallback(
    (tabId: string, url: string) => {
      const fav = faviconUrlForPageUrl(url);
      if (fav) setTabMeta(tabId, { favicon: fav });
    },
    [setTabMeta]
  );

  const navigateTab = useCallback(
    (tabId: string, nextUrl: string) => {
      const h = ensureHist(tabId, nextUrl);
      const stack = h.stack.slice(0, h.idx + 1);
      if (stack[stack.length - 1] === nextUrl) {
        setTabUrl(tabId, nextUrl);
        setHistTick((x) => x + 1);
        return;
      }
      stack.push(nextUrl);
      histRef.current[tabId] = { stack, idx: stack.length - 1 };
      setTabUrl(tabId, nextUrl);
      const title = shortTitleFromUrl(nextUrl);
      setTabMeta(tabId, { title });
      syncFavicon(tabId, nextUrl);
      setHistTick((x) => x + 1);
    },
    [setTabMeta, setTabUrl, syncFavicon]
  );

  const handleGoBack = () => {
    if (!inAppBrowserActiveTabId) return;
    const el = guestRef.current;
    if (useWv && el && isWebview(el)) {
      try {
        const w = el as HTMLWebviewElement;
        if (w.canGoBack()) w.goBack();
      } catch {
        /* ignore */
      }
      return;
    }
    const h = histRef.current[inAppBrowserActiveTabId];
    if (!h || h.idx <= 0) return;
    const idx = h.idx - 1;
    const url = h.stack[idx];
    histRef.current[inAppBrowserActiveTabId] = { ...h, idx };
    setTabUrl(inAppBrowserActiveTabId, url);
    setTabMeta(inAppBrowserActiveTabId, { title: shortTitleFromUrl(url) });
    syncFavicon(inAppBrowserActiveTabId, url);
    setHistTick((x) => x + 1);
  };

  const handleGoForward = () => {
    if (!inAppBrowserActiveTabId) return;
    const el = guestRef.current;
    if (useWv && el && isWebview(el)) {
      try {
        const w = el as HTMLWebviewElement;
        if (w.canGoForward()) w.goForward();
      } catch {
        /* ignore */
      }
      return;
    }
    const h = histRef.current[inAppBrowserActiveTabId];
    if (!h || h.idx >= h.stack.length - 1) return;
    const idx = h.idx + 1;
    const url = h.stack[idx];
    histRef.current[inAppBrowserActiveTabId] = { ...h, idx };
    setTabUrl(inAppBrowserActiveTabId, url);
    setTabMeta(inAppBrowserActiveTabId, { title: shortTitleFromUrl(url) });
    syncFavicon(inAppBrowserActiveTabId, url);
    setHistTick((x) => x + 1);
  };

  const handleGoHome = () => {
    if (!inAppBrowserActiveTabId) return;
    navigateTab(inAppBrowserActiveTabId, DEFAULT_NEW_TAB_URL);
  };

  const handleReload = () => {
    setIsLoading(true);
    const el = guestRef.current;
    if (!el) return;
    if (isWebview(el)) {
      try {
        el.reload();
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      el.contentWindow?.location.reload();
    } catch {
      const u = el.src;
      el.src = u;
    }
  };

  const handleSubmitAddress = (e: React.FormEvent) => {
    e.preventDefault();
    const next = resolveAddressBarInput(addressBar);
    if (!next || !inAppBrowserActiveTabId) return;
    if (next.toLowerCase().startsWith('dierchat:')) {
      handleCloseAll();
      return;
    }
    navigateTab(inAppBrowserActiveTabId, next);
  };

  const openInSystemBrowser = () => {
    const u = addressBar.trim() || activeUrl || '';
    if (!u || !/^https?:\/\//i.test(u)) return;
    if (window.dierchat?.openExternalUrl) void window.dierchat.openExternalUrl(u);
    else window.open(u, '_blank', 'noopener,noreferrer');
  };

  const openInDierBrowser = () => {
    const raw = addressBar.trim() || activeUrl || '';
    const u = raw && /^https?:\/\//i.test(raw) ? raw : raw ? `https://${raw}` : '';
    if (window.dierchat?.openDierBrowser) {
      void window.dierchat.openDierBrowser(u || 'about:blank');
      return;
    }
    void openInSystemBrowser();
  };

  const shareUrl = async () => {
    const u = addressBar.trim() || activeUrl || '';
    if (!u) return;
    try {
      if (navigator.share) await navigator.share({ url: u });
      else await navigator.clipboard.writeText(u);
    } catch {
      try {
        await navigator.clipboard.writeText(u);
      } catch {
        /* ignore */
      }
    }
  };

  const onGuestLoad = useCallback(
    (tabId: string, url: string) => {
      setIsLoading(false);
      syncFavicon(tabId, url);
      const el = guestRef.current;
      if (el && tabId === inAppBrowserActiveTabId) {
        if (isWebview(el)) {
          void el.executeJavaScript('document.title').then((t) => {
            if (t) setTabMeta(tabId, { title: String(t) });
          });
        } else {
          try {
            const title = el.contentDocument?.title;
            if (title) setTabMeta(tabId, { title });
          } catch {
            /* cross-origin iframe */
          }
        }
      }
      if (!inAppBrowserTabs.find((t) => t.id === tabId)?.title) {
        setTabMeta(tabId, { title: shortTitleFromUrl(url) });
      }
    },
    [inAppBrowserActiveTabId, inAppBrowserTabs, setTabMeta, syncFavicon]
  );

  /** Синхронизация URL и кнопок назад/вперёд для Electron webview */
  useEffect(() => {
    const el = guestRef.current;
    if (!useWv || !el || !isWebview(el) || !inAppBrowserActiveTabId) return;
    const w = el as HTMLWebviewElement;
    const tabId = inAppBrowserActiveTabId;
    const syncNav = () => {
      try {
        setWvNav({ back: w.canGoBack(), fwd: w.canGoForward() });
        const u = w.getURL();
        if (u && /^https?:\/\//i.test(u)) {
          setTabUrl(tabId, u);
          setAddressBar(u);
          syncFavicon(tabId, u);
        }
      } catch {
        /* ignore */
      }
    };
    const onFinishLoad = () => {
      try {
        const zf = tabZoomsRef.current[tabId] ?? 1;
        w.setZoomFactor(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zf)));
      } catch {
        /* ignore */
      }
      syncNav();
      try {
        onGuestLoad(tabId, w.getURL() || '');
      } catch {
        onGuestLoad(tabId, activeUrl || '');
      }
    };
    w.addEventListener('did-navigate', syncNav);
    w.addEventListener('did-navigate-in-page', syncNav);
    w.addEventListener('did-finish-load', onFinishLoad);
    syncNav();
    return () => {
      w.removeEventListener('did-navigate', syncNav);
      w.removeEventListener('did-navigate-in-page', syncNav);
      w.removeEventListener('did-finish-load', onFinishLoad);
    };
  }, [useWv, inAppBrowserActiveTabId, activeUrl, setTabUrl, syncFavicon, onGuestLoad]);

  useEffect(() => {
    if (!activeUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (devtoolsOpen) {
          e.preventDefault();
          setDevtoolsOpen(false);
          return;
        }
        handleCloseAll();
        return;
      }
      if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i'))) {
        e.preventDefault();
        setDevtoolsOpen((v) => !v);
        return;
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd')
      ) {
        e.preventDefault();
        handleZoomIn();
        return;
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract')
      ) {
        e.preventDefault();
        handleZoomOut();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        handleZoomReset();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
        e.preventDefault();
        addInAppBrowserTab();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeUrl, addInAppBrowserTab, devtoolsOpen, handleCloseAll, handleZoomIn, handleZoomOut, handleZoomReset]);

  useLayoutEffect(() => {
    const wrap = frameWrapRef.current;
    if (!wrap) return;
    const apply = () => {
      const h = wrap.clientHeight;
      const w = wrap.clientWidth;
      if (h <= 0 || w <= 0) return;
      const el = guestRef.current;
      if (el) {
        el.style.height = `${h}px`;
        el.style.width = `${w}px`;
      }
    };
    apply();
    requestAnimationFrame(() => {
      apply();
      requestAnimationFrame(apply);
    });
    const ro = new ResizeObserver(() => apply());
    ro.observe(wrap);
    const t = window.setTimeout(apply, 100);
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, [inAppBrowserActiveTabId, activeUrl, devtoolsOpen, wide]);

  if (!activeUrl || inAppBrowserTabs.length === 0) return null;

  const secure = /^https:\/\//i.test(addressBar || activeUrl);

  const tabTitle = (t: (typeof inAppBrowserTabs)[0]) => t.title || shortTitleFromUrl(t.url);

  const onDragStartTab = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDropTab = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    const from = Number(e.dataTransfer.getData('text/plain'));
    if (Number.isFinite(from) && from !== toIndex) reorderTabs(from, toIndex);
  };

  const shellClass =
    `wb-shell ${devtoolsOpen ? 'wb-shell--devtools' : ''} ${wide ? 'wb-shell--desktop' : 'wb-shell--mobile'} ${liquidGlassEnabled ? 'wb-shell--glass' : ''}`;

  const tree = (
    <div className="wb-overlay" role="dialog" aria-label="Встроенный браузер">
      <div className="wb-backdrop" onClick={handleCloseAll} aria-hidden />
      <div className={shellClass}>
        <div className="wb-main">
          <div className="wb-tabs" role="tablist">
            <div className="wb-tabs-scroll">
              {inAppBrowserTabs.map((t, index) => (
                <div
                  key={t.id}
                  role="tab"
                  draggable
                  onDragStart={(e) => onDragStartTab(e, index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onDropTab(e, index)}
                  className={`wb-tab ${t.id === inAppBrowserActiveTabId ? 'wb-tab--active' : ''}`}
                  aria-selected={t.id === inAppBrowserActiveTabId}
                >
                  <button
                    type="button"
                    className="wb-tab__main"
                    onClick={() => setActiveTabId(t.id)}
                    title={t.url}
                  >
                    {t.favicon ? (
                      <img src={t.favicon} alt="" className="wb-tab__fav" width={16} height={16} />
                    ) : (
                      <span className="wb-tab__fav wb-tab__fav--placeholder" />
                    )}
                    <span className="wb-tab__label">{tabTitle(t)}</span>
                  </button>
                  <button
                    type="button"
                    className="wb-tab__close"
                    aria-label="Закрыть вкладку"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeTab(t.id);
                      delete histRef.current[t.id];
                      setTabZooms((prev) => {
                        if (!(t.id in prev)) return prev;
                        const n = { ...prev };
                        delete n[t.id];
                        return n;
                      });
                    }}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="wb-tab-add"
                title="Новая вкладка"
                disabled={inAppBrowserTabs.length >= BROWSER_MAX_TABS}
                onClick={() => addInAppBrowserTab()}
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          <header className="wb-toolbar">
            <div className="wb-nav">
              <button type="button" className="wb-icon-btn" title="Назад" disabled={!canBack} onClick={handleGoBack}>
                <ArrowLeft size={20} />
              </button>
              <button type="button" className="wb-icon-btn" title="Вперёд" disabled={!canForward} onClick={handleGoForward}>
                <ArrowRight size={20} />
              </button>
              <button type="button" className="wb-icon-btn" title="Обновить" onClick={handleReload}>
                <RefreshCw size={18} />
              </button>
              <button type="button" className="wb-icon-btn" title="Домой (Google)" onClick={handleGoHome}>
                <Home size={18} />
              </button>
              <div className="wb-zoom" role="group" aria-label="Масштаб страницы">
                <button
                  type="button"
                  className="wb-icon-btn"
                  title="Уменьшить (Ctrl + −)"
                  disabled={activeZoomValue <= ZOOM_MIN + 1e-6}
                  onClick={handleZoomOut}
                >
                  <ZoomOut size={18} />
                </button>
                <button type="button" className="wb-zoom-value" title="Сбросить 100% (Ctrl + 0)" onClick={handleZoomReset}>
                  {Math.round(activeZoomValue * 100)}%
                </button>
                <button
                  type="button"
                  className="wb-icon-btn"
                  title="Увеличить (Ctrl + +)"
                  disabled={activeZoomValue >= ZOOM_MAX - 1e-6}
                  onClick={handleZoomIn}
                >
                  <ZoomIn size={18} />
                </button>
              </div>
              <button
                type="button"
                className={`wb-icon-btn ${devtoolsOpen ? 'wb-icon-btn--on' : ''}`}
                title="Консоль / Элементы (F12)"
                onClick={() => setDevtoolsOpen((v) => !v)}
              >
                {devtoolsOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
              </button>
            </div>
            <form className="wb-url-form" onSubmit={handleSubmitAddress}>
              <span className="wb-lock" title={secure ? 'HTTPS' : 'Не защищено'}>
                {secure ? <Lock size={14} /> : <Unlock size={14} />}
              </span>
              <input
                className="wb-url-input"
                type="text"
                value={addressBar}
                onChange={(e) => setAddressBar(e.target.value)}
                placeholder="Поиск Google или адрес"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
              />
            </form>
            <div className="wb-actions">
              <button type="button" className="wb-icon-btn" title="Поделиться" onClick={shareUrl}>
                <Share2 size={18} />
              </button>
              <button
                type="button"
                className="wb-icon-btn"
                title="Открыть в DIERbrowser (отдельное приложение)"
                onClick={openInDierBrowser}
              >
                <AppWindow size={18} />
              </button>
              <button type="button" className="wb-icon-btn" title="В системном браузере" onClick={openInSystemBrowser}>
                <ExternalLink size={18} />
              </button>
              <button type="button" className="wb-icon-btn wb-close" title="Закрыть" onClick={handleCloseAll}>
                <X size={20} />
              </button>
            </div>
          </header>

          <div className={`wb-loadbar ${isLoading ? 'wb-loadbar--on' : ''}`} aria-hidden />

          {!useWv && (
            <div className="wb-iframe-hint">
              <p className="wb-iframe-hint__text">
                Веб-версия: многие сайты (Google и др.) <strong>блокируют</strong> iframe — возможен чёрный экран. На ПК:
                DierCHAT с <strong>&lt;webview&gt;</strong>, кнопки ниже или отдельный <strong>DIERbrowser</strong>{' '}
                (см. docs/DIERbrowser_PLAN.md).
              </p>
              <div className="wb-iframe-hint__actions">
                <button type="button" className="wb-hint-btn" onClick={openInSystemBrowser}>
                  <ExternalLink size={14} /> В системном браузере
                </button>
                <button type="button" className="wb-hint-btn wb-hint-btn--primary" onClick={openInDierBrowser}>
                  <AppWindow size={14} /> DIERbrowser
                </button>
              </div>
            </div>
          )}

          <div
            className="wb-frame-wrap"
            ref={frameWrapRef}
            onContextMenu={(e) => {
              e.preventDefault();
              setDevtoolsOpen(true);
            }}
          >
            {inAppBrowserTabs.map((t) =>
              useWv ? (
                <webview
                  key={t.id}
                  ref={
                    t.id === inAppBrowserActiveTabId
                      ? (guestRef as RefObject<HTMLWebviewElement | null>)
                      : undefined
                  }
                  className={`wb-frame ${t.id === inAppBrowserActiveTabId ? 'wb-frame--active' : ''}`}
                  src={t.url}
                  allowpopups
                  tabIndex={t.id === inAppBrowserActiveTabId ? 0 : -1}
                />
              ) : (
                <iframe
                  key={t.id}
                  ref={
                    t.id === inAppBrowserActiveTabId
                      ? (guestRef as RefObject<HTMLIFrameElement | null>)
                      : undefined
                  }
                  className={`wb-frame ${t.id === inAppBrowserActiveTabId ? 'wb-frame--active' : ''}`}
                  style={{ zoom: tabZooms[t.id] ?? 1 }}
                  src={t.url}
                  title={tabTitle(t)}
                  tabIndex={t.id === inAppBrowserActiveTabId ? 0 : -1}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
                  onLoad={(ev) => {
                    const u = (ev.target as HTMLIFrameElement).src;
                    onGuestLoad(t.id, u);
                  }}
                />
              )
            )}
          </div>
        </div>

        <BrowserDevTools
          open={devtoolsOpen}
          onClose={() => setDevtoolsOpen(false)}
          guestRef={guestRef}
          guestKind={useWv ? 'webview' : 'iframe'}
          activeUrl={activeUrl}
          layout={wide ? 'side' : 'bottom'}
          liquidGlass={liquidGlassEnabled}
        />
      </div>
    </div>
  );

  if (typeof document === 'undefined') return tree;
  return createPortal(tree, document.body);
}

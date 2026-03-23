import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type DevTab = 'console' | 'elements';
type LogFilter = 'all' | 'error' | 'warn' | 'log' | 'info';

type LogLine = { id: string; kind: 'log' | 'error' | 'warn' | 'info' | 'result'; text: string };

export type BrowserGuestKind = 'iframe' | 'webview';

function isWebview(el: HTMLElement | null): el is HTMLWebviewElement {
  return el?.tagName === 'WEBVIEW';
}

function safeEvalInIframe(iframe: HTMLIFrameElement | null, code: string): { ok: boolean; result?: unknown; error?: string } {
  if (!iframe?.contentWindow) return { ok: false, error: 'Нет iframe' };
  try {
    void iframe.contentWindow.document;
  } catch {
    return {
      ok: false,
      error:
        'Cross-origin: во встроенном iframe многие сайты (Google и др.) не открываются. В приложении для ПК используется отдельный движок страницы.',
    };
  }
  try {
    const w = iframe.contentWindow as Window & { eval: (c: string) => unknown };
    const result = w.eval(code);
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function BrowserDevTools({
  open,
  onClose,
  guestRef,
  guestKind,
  activeUrl,
  layout,
  liquidGlass,
}: {
  open: boolean;
  onClose: () => void;
  guestRef: React.RefObject<HTMLIFrameElement | HTMLWebviewElement | null>;
  guestKind: BrowserGuestKind;
  activeUrl: string;
  layout: 'side' | 'bottom';
  liquidGlass: boolean;
}) {
  const [devTab, setDevTab] = useState<DevTab>('console');
  const [filter, setFilter] = useState<LogFilter>('all');
  const [lines, setLines] = useState<LogLine[]>([]);
  const [input, setInput] = useState('');
  const [elementsHtml, setElementsHtml] = useState<string>('');
  const [elementsErr, setElementsErr] = useState<string | null>(null);
  const histRef = useRef<string[]>([]);
  const histPosRef = useRef(0);
  const endRef = useRef<HTMLDivElement | null>(null);

  const refreshElements = useCallback(async () => {
    const el = guestRef.current;
    if (!el) {
      setElementsHtml('');
      setElementsErr(null);
      return;
    }
    if (isWebview(el)) {
      try {
        const html = await el.executeJavaScript('document.documentElement.outerHTML');
        setElementsHtml(String(html ?? ''));
        setElementsErr(null);
      } catch (e) {
        setElementsHtml('');
        setElementsErr(e instanceof Error ? e.message : String(e));
      }
      return;
    }
    try {
      const doc = el.contentDocument;
      if (!doc?.documentElement) throw new Error('Нет документа');
      setElementsHtml(doc.documentElement.outerHTML);
      setElementsErr(null);
    } catch {
      setElementsHtml('');
      setElementsErr(
        'В режиме iframe без Electron инспектор DOM недоступен для этого сайта. Откройте десктоп DierCHAT или внешний браузер.'
      );
    }
  }, [guestRef]);

  useEffect(() => {
    if (!open) return;
    void refreshElements();
  }, [open, devTab, refreshElements, activeUrl, guestKind]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines, open, devTab]);

  const runConsole = async () => {
    const code = input.trim();
    if (!code) return;
    histRef.current = histRef.current.slice(0, histPosRef.current + 1);
    histRef.current.push(code);
    histPosRef.current = histRef.current.length;
    setInput('');
    setLines((prev) => [...prev, { id: `i_${Date.now()}`, kind: 'log', text: `> ${code}` }]);

    const el = guestRef.current;
    if (el && isWebview(el)) {
      try {
        const script = `(function(){ try { var __r = eval(${JSON.stringify(code)}); return { ok: true, v: typeof __r === 'object' && __r !== null ? JSON.stringify(__r) : String(__r) }; } catch(e) { return { ok: false, e: e.message }; } })()`;
        const out = await el.executeJavaScript(script);
        const o = out as { ok?: boolean; v?: string; e?: string };
        if (o?.ok) {
          setLines((prev) => [...prev, { id: `o_${Date.now()}`, kind: 'result', text: o.v ?? '' }]);
        } else {
          setLines((prev) => [...prev, { id: `e_${Date.now()}`, kind: 'error', text: o?.e || 'Ошибка' }]);
        }
      } catch (e) {
        setLines((prev) => [
          ...prev,
          { id: `e_${Date.now()}`, kind: 'error', text: e instanceof Error ? e.message : String(e) },
        ]);
      }
      return;
    }

    const { ok, result, error } = safeEvalInIframe(el as HTMLIFrameElement, code);
    if (ok) {
      let text: string;
      try {
        text = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);
      } catch {
        text = String(result);
      }
      setLines((prev) => [...prev, { id: `o_${Date.now()}`, kind: 'result', text }]);
    } else {
      setLines((prev) => [...prev, { id: `e_${Date.now()}`, kind: 'error', text: error || 'Ошибка' }]);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void runConsole();
      return;
    }
    if (e.key === 'Enter' && e.shiftKey) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (histPosRef.current > 0) {
        histPosRef.current -= 1;
        setInput(histRef.current[histPosRef.current] ?? '');
      }
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histPosRef.current < histRef.current.length - 1) {
        histPosRef.current += 1;
        setInput(histRef.current[histPosRef.current] ?? '');
      } else {
        setInput('');
      }
    }
  };

  const filtered = useMemo(() => {
    if (filter === 'all') return lines;
    const map: Record<LogFilter, LogLine['kind'] | null> = {
      all: null,
      error: 'error',
      warn: 'warn',
      log: 'log',
      info: 'info',
    };
    const k = map[filter];
    if (!k) return lines;
    return lines.filter((l) => l.kind === k || l.kind === 'result');
  }, [lines, filter]);

  if (!open) return null;

  return (
    <aside
      className={`wb-devtools wb-devtools--${layout} ${liquidGlass ? 'wb-devtools--glass' : ''}`}
      role="complementary"
      aria-label="DevTools"
    >
      <div className="wb-devtools__head">
        <div className="wb-devtools__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={devTab === 'console'}
            className={devTab === 'console' ? 'wb-devtools__tab wb-devtools__tab--on' : 'wb-devtools__tab'}
            onClick={() => setDevTab('console')}
          >
            Консоль
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={devTab === 'elements'}
            className={devTab === 'elements' ? 'wb-devtools__tab wb-devtools__tab--on' : 'wb-devtools__tab'}
            onClick={() => setDevTab('elements')}
          >
            Элементы
          </button>
        </div>
        <button type="button" className="wb-devtools__close" onClick={onClose} aria-label="Закрыть DevTools">
          ×
        </button>
      </div>
      <p className="wb-devtools__warn">
        Вы можете смотреть и пробовать код страницы. Изменения не сохраняются на сервере.
        {guestKind === 'webview'
          ? ' В режиме приложения для ПК консоль и DOM выполняются в контексте гостевой страницы (Electron webview).'
          : ' В веб-версии без Electron доступ к чужим сайтам в iframe ограничен.'}
      </p>
      {devTab === 'console' && (
        <>
          <div className="wb-devtools__filters">
            {(['all', 'error', 'warn', 'log', 'info'] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={filter === f ? 'wb-devtools__filter wb-devtools__filter--on' : 'wb-devtools__filter'}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'Все' : f}
              </button>
            ))}
            <button type="button" className="wb-devtools__clear" onClick={() => setLines([])}>
              Clear
            </button>
          </div>
          <div className="wb-devtools__console-out">
            {filtered.map((l) => (
              <div key={l.id} className={`wb-devtools__line wb-devtools__line--${l.kind}`}>
                {l.text}
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <div className="wb-devtools__console-in">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="JavaScript… (Enter — выполнить, Shift+Enter — новая строка)"
              rows={3}
              spellCheck={false}
            />
            <button type="button" className="wb-devtools__run" onClick={() => void runConsole()}>
              Выполнить
            </button>
          </div>
        </>
      )}
      {devTab === 'elements' && (
        <div className="wb-devtools__elements">
          <div className="wb-devtools__elements-toolbar">
            <button type="button" onClick={() => void refreshElements()}>
              Обновить дерево
            </button>
            {elementsHtml && (
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(elementsHtml.slice(0, 50000))}
              >
                Копировать HTML
              </button>
            )}
          </div>
          {elementsErr && <p className="wb-devtools__elements-err">{elementsErr}</p>}
          {elementsHtml && (
            <pre className="wb-devtools__elements-pre">{elementsHtml.slice(0, 200000)}</pre>
          )}
        </div>
      )}
    </aside>
  );
}

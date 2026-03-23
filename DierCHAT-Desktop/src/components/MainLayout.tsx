import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/store';
import { useTranslation } from '@/lib/i18n';
import { DialogList } from '@/components/dialogs/DialogList';
import { ChatView } from '@/components/chat/ChatView';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { FavoritesPanel } from '@/components/favorites/FavoritesPanel';
import { ContactsPanel } from '@/components/contacts/ContactsPanel';
import { MobileProfileHub } from '@/components/layout/MobileProfileHub';
import { CallModal } from '@/components/call/CallModal';
import { MessageToast } from '@/components/common/Toast';
import { BrowserPanel } from '@/components/browser/BrowserPanel';
import wsClient, { ConnectionStatus } from '@/api/ws';
import { MessageCircle, Users, User, PanelLeft } from 'lucide-react';
import './MainLayout.css';

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [breakpoint]);
  return isMobile;
}

function playNewMessageSound() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 800;
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);
  } catch {
    /* ignore */
  }
}

export function MainLayout() {
  const { t } = useTranslation();
  const [showSettings, setShowSettings] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showMobileProfile, setShowMobileProfile] = useState(false);
  /** ТЗ §33: анимация ухода панели настроек на широком ПК */
  const [settingsSlideOut, setSettingsSlideOut] = useState(false);
  /** ТЗ §33: три колонки — список чатов | чат | настройки (широкий экран) */
  const [wideThreeCol, setWideThreeCol] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 1280
  );
  const isMobile = useIsMobile();
  const {
    currentChatId,
    setCurrentChatId,
    compactSidebar,
    setCompactSidebar,
    sendSound,
    chatTypes,
    notificationPrefs,
    notificationMutedChatIds,
    liquidGlassEnabled,
  } = useStore();
  const [wsStatus, setWsStatus] = useState<ConnectionStatus>(wsClient.getStatus());
  const [browserOnline, setBrowserOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const unsub = wsClient.onStatusChange(setWsStatus);
    return unsub;
  }, []);

  useEffect(() => {
    const up = () => setBrowserOnline(true);
    const down = () => setBrowserOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-liquid-glass', liquidGlassEnabled ? 'on' : 'off');
  }, [liquidGlassEnabled]);

  useEffect(() => {
    const u = () => setWideThreeCol(window.innerWidth >= 1280);
    u();
    window.addEventListener('resize', u);
    return () => window.removeEventListener('resize', u);
  }, []);

  useEffect(() => {
    if (!sendSound) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { message?: { chat_id?: string }; chat_id?: string };
      const msg = detail?.message;
      const chatId = detail?.chat_id || msg?.chat_id || '';
      if (!chatId || chatId === currentChatId) return;
      if (notificationMutedChatIds.includes(chatId)) return;
      const ctype = chatTypes[chatId] ?? 0;
      const soundOn =
        ctype === 0
          ? notificationPrefs.personal.sound
          : ctype === 1
            ? notificationPrefs.groups.sound
            : notificationPrefs.channels.enabled && notificationPrefs.groups.sound;
      if (soundOn) playNewMessageSound();
    };
    window.addEventListener('dierchat:new_message', handler);
    return () => window.removeEventListener('dierchat:new_message', handler);
  }, [sendSound, currentChatId, chatTypes, notificationPrefs, notificationMutedChatIds]);

  type RootTab = 'chats' | 'contacts' | 'profile';
  const [rootTab, setRootTab] = useState<RootTab>('chats');

  const showChat =
    isMobile &&
    (showSettings ||
      showFavorites ||
      showMobileProfile ||
      rootTab === 'contacts' ||
      (rootTab === 'chats' && !!currentChatId));

  const handleBack = useCallback(() => {
    setCurrentChatId(null);
    setShowSettings(false);
    setShowFavorites(false);
    setShowMobileProfile(false);
    if (isMobile) {
      setRootTab('chats');
    }
  }, [setCurrentChatId, isMobile]);

  const closeSettingsOrPanelForChatSelect = useCallback(() => {
    if (showFavorites) {
      setShowFavorites(false);
      return;
    }
    if (!showSettings) return;
    const w = typeof window !== 'undefined' ? window.innerWidth : 0;
    if (!isMobile && w >= 1280) {
      setShowSettings(false);
      return;
    }
    if (!isMobile && w > 1024) {
      setSettingsSlideOut(true);
      window.setTimeout(() => {
        setShowSettings(false);
        setSettingsSlideOut(false);
      }, 300);
      return;
    }
    setShowSettings(false);
  }, [showSettings, showFavorites, isMobile]);

  const tripleSettingsMode = showSettings && !isMobile && wideThreeCol;

  const showOfflineBanner = !browserOnline || wsStatus !== 'connected';
  const offlineBannerText = !browserOnline
    ? 'Нет подключения к интернету'
    : wsStatus === 'reconnecting'
      ? 'Переподключение к серверу...'
      : 'Нет соединения с сервером';

  return (
    <div
      className={`layout ${showOfflineBanner ? 'layout--offline' : ''} ${tripleSettingsMode ? 'layout--triple' : ''}`}
    >
      <CallModal />
      <MessageToast />
      <BrowserPanel />
      {showOfflineBanner && (
        <div className={`offline-banner offline-banner--${!browserOnline ? 'offline' : wsStatus}`}>
          {offlineBannerText}
        </div>
      )}
      <aside className={`sidebar ${compactSidebar && !isMobile ? 'sidebar--compact' : ''} ${isMobile && showChat ? 'sidebar--hidden' : ''}`}>
        <div className="sidebar__toolbar">
          {!isMobile && (
            <button
              type="button"
              className="sidebar__collapse"
              onClick={() => setCompactSidebar(!compactSidebar)}
              title={compactSidebar ? 'Широкий список чатов' : 'Компактный список (UI/UX ТЗ)'}
            >
              <PanelLeft size={18} />
            </button>
          )}
          <div className="ws-status" title={wsStatus === 'connected' ? 'Подключено' : wsStatus === 'reconnecting' ? 'Переподключение...' : 'Нет соединения'}>
            <span className={`ws-status__dot ws-status__dot--${wsStatus}`} />
          </div>
        </div>
        <DialogList
          compact={compactSidebar}
          onAfterSelectChat={closeSettingsOrPanelForChatSelect}
          onOpenSettings={() => {
            setShowSettings(true);
            setShowFavorites(false);
            setShowMobileProfile(false);
          }}
          onOpenFavorites={() => {
            setShowFavorites(true);
            setShowSettings(false);
            setShowMobileProfile(false);
            if (isMobile) setRootTab('chats');
          }}
        />
      </aside>

      <main className={`chatArea ${isMobile && !showChat ? 'chatArea--hidden' : ''}`}>
        {tripleSettingsMode ? (
          <div className="chatArea__triple">
            <div className="chatArea__triple-chat">
              <ChatView isMobile={isMobile} onBack={handleBack} />
            </div>
            <div className="chatArea__triple-settings">
              <SettingsPanel
                onClose={() => {
                  setShowSettings(false);
                  if (isMobile) handleBack();
                }}
              />
            </div>
          </div>
        ) : showSettings ? (
          <div className={`chatArea__settings-wrap ${settingsSlideOut ? 'chatArea__settings-wrap--slide-out' : ''}`}>
            <SettingsPanel
              onClose={() => {
                setShowSettings(false);
                if (isMobile) handleBack();
              }}
            />
          </div>
        ) : showFavorites ? (
          <FavoritesPanel
            onClose={() => {
              setShowFavorites(false);
              if (isMobile) handleBack();
            }}
            onSelectChat={(chatId) => {
              setCurrentChatId(chatId);
              setShowFavorites(false);
            }}
          />
        ) : showMobileProfile && isMobile ? (
          <MobileProfileHub
            onOpenSettings={() => {
              setShowSettings(true);
              setShowMobileProfile(false);
            }}
            onClose={() => {
              setShowMobileProfile(false);
              setRootTab('chats');
            }}
          />
        ) : rootTab === 'contacts' ? (
          <ContactsPanel
            onClose={() => isMobile && handleBack()}
            onSelectUser={(chatId) => {
              setCurrentChatId(chatId);
              if (isMobile) setRootTab('chats');
            }}
          />
        ) : (
          <ChatView isMobile={isMobile} onBack={handleBack} />
        )}
      </main>

      {isMobile && (
        <nav className="bottom-nav">
          <button
            type="button"
            className={`bottom-nav__item ${rootTab === 'chats' && !showMobileProfile ? 'bottom-nav__item--active' : ''}`}
            onClick={() => {
              setRootTab('chats');
              setShowSettings(false);
              setShowFavorites(false);
              setShowMobileProfile(false);
            }}
          >
            <MessageCircle size={20} />
            <span>{t('chats')}</span>
          </button>
          <button
            type="button"
            className={`bottom-nav__item ${rootTab === 'contacts' ? 'bottom-nav__item--active' : ''}`}
            onClick={() => {
              setRootTab('contacts');
              setShowSettings(false);
              setShowFavorites(false);
              setShowMobileProfile(false);
            }}
          >
            <Users size={20} />
            <span>{t('friends')}</span>
          </button>
          <button
            type="button"
            className={`bottom-nav__item ${showMobileProfile ? 'bottom-nav__item--active' : ''}`}
            onClick={() => {
              setRootTab('profile');
              setShowSettings(false);
              setShowFavorites(false);
              setShowMobileProfile(true);
            }}
          >
            <User size={20} />
            <span>{t('profile')}</span>
          </button>
        </nav>
      )}
    </div>
  );
}

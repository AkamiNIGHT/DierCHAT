import { useEffect } from 'react';
import { useStore } from '@/store';
import { api } from '@/api/client';
import wsClient from '@/api/ws';
import { notificationIconUrl } from '@/lib/mediaUrl';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { MainLayout } from '@/components/MainLayout';
import { MusicPlayerProvider } from '@/contexts/MusicPlayerContext';
import { getWebSocketHttpBaseUrl } from '@/lib/publicApiUrl';
import { preloadMyStickers } from '@/lib/stickers';
import { DeviceSettingsPersistence } from '@/components/settings/DeviceSettingsPersistence';

export function App() {
  const {
    token,
    user,
    setToken,
    setUser,
    theme,
    language,
    accentColor,
    chatBg,
    fontSize,
    bubbleRadius,
    notificationPrefs,
    currentChatId,
    setCurrentChatId,
    chatTypes,
    notificationMutedChatIds,
    followSystemTheme,
    mergeOnlineUserIds,
  } = useStore();

  useEffect(() => {
    /* §23.6: флаг поддержки backdrop (для возможных fallback-стилей) */
    const ok =
      typeof CSS !== 'undefined' &&
      (CSS.supports?.('backdrop-filter', 'blur(1px)') ||
        CSS.supports?.('-webkit-backdrop-filter', 'blur(1px)'));
    document.documentElement.setAttribute('data-backdrop-support', ok ? 'yes' : 'no');
  }, []);

  /** Android: клавиатура + нижняя панель — поднимаем поле ввода */
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const apply = () => {
      const ih = window.innerHeight;
      const kb = Math.max(0, ih - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--kbd-offset', `${Math.round(kb)}px`);
    };
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    window.addEventListener('resize', apply);
    apply();
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      window.removeEventListener('resize', apply);
      document.documentElement.style.removeProperty('--kbd-offset');
    };
  }, []);

  useEffect(() => {
    if (followSystemTheme && typeof window !== 'undefined' && window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: light)');
      const apply = () => document.body.setAttribute('data-theme', mq.matches ? 'light' : 'dark');
      apply();
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
    document.body.setAttribute('data-theme', theme);
  }, [theme, followSystemTheme]);

  useEffect(() => {
    // Accent color (affects selection, icons, links, borders, etc.)
    document.documentElement.style.setProperty('--accent', accentColor);
    document.documentElement.style.setProperty(
      '--accent-hover',
      `${accentColor}cc`
    );
    document.documentElement.style.setProperty('--accent-text', accentColor);

    // Chat background override (optional)
    if (chatBg) document.documentElement.style.setProperty('--bg-chat', chatBg);
    else document.documentElement.style.removeProperty('--bg-chat');

    // Global typography scaling
    document.body.style.fontSize = `${fontSize}px`;
  }, [accentColor, chatBg, fontSize]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--bubble-radius',
      `${bubbleRadius}px`
    );
  }, [bubbleRadius]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (!token) {
      wsClient.disconnect();
      return;
    }
    let cancelled = false;
    api.setToken(token);
    api
      .getMe()
      .then((u) => {
        if (cancelled) return;
        setUser(u);
        const wsBase = getWebSocketHttpBaseUrl() || window.location.origin;
        wsClient.connect(wsBase, token);
      })
      .catch(() => {
        if (cancelled) return;
        setToken(null);
        setUser(null);
        api.setToken(null);
      });

    return () => {
      cancelled = true;
      wsClient.disconnect();
    };
  }, [token, setToken, setUser]);

  useEffect(() => {
    if (!token) return;
    void preloadMyStickers();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const refreshPresence = () => {
      api.getPeersPresence().then((p) => mergeOnlineUserIds(p.online_user_ids || [])).catch(() => {});
    };
    window.addEventListener('dierchat:ws_connected', refreshPresence);
    return () => window.removeEventListener('dierchat:ws_connected', refreshPresence);
  }, [token, mergeOnlineUserIds]);

  /** ТЗ §37, §41: online_status + групповой звонок в чате */
  useEffect(() => {
    if (!token) return;
    wsClient.setCallbacks({
      onOnlineStatus: (p) => {
        const st = useStore.getState();
        if (p.online) st.setUserOnline(p.user_id);
        else {
          st.setUserOffline(p.user_id);
          if (p.last_seen) st.setUserLastSeen(p.user_id, p.last_seen);
        }
      },
      onGroupCallUpdate: (p) => {
        if (!p.chat_id) return;
        const st = useStore.getState();
        if (p.state === 'active' && (p.participant_count ?? 0) >= 2) {
          st.setGroupCallBanner(p.chat_id, {
            state: 'active',
            participantCount: p.participant_count ?? 0,
            video: !!p.video,
            fromUserId: p.from_user_id,
          });
        } else if (p.state === 'ended') {
          st.setGroupCallBanner(p.chat_id, {
            state: 'ended',
            participantCount: 0,
            video: false,
          });
          window.setTimeout(() => {
            useStore.getState().setGroupCallBanner(p.chat_id, null);
          }, 8000);
        }
      },
    });
    return () => {
      wsClient.setCallbacks({ onOnlineStatus: undefined, onGroupCallUpdate: undefined });
    };
  }, [token]);

  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default' && token) {
      Notification.requestPermission().catch(() => {});
    }
  }, [token]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        message?: { chat_id?: string; text?: string; sender_id?: string };
        chat_id?: string;
        sender?: { display_name?: string; avatar_url?: string };
      };
      const msg = detail?.message;
      if (!msg) return;
      const chatId = detail.chat_id || msg.chat_id || '';
      if (chatId && notificationMutedChatIds.includes(chatId)) return;
      const ctype = chatTypes[chatId] ?? 0;
      const enabled =
        ctype === 0
          ? notificationPrefs.personal.enabled
          : ctype === 1
            ? notificationPrefs.groups.enabled
            : notificationPrefs.channels.enabled;
      if (!enabled) return;
      if (document.visibilityState === 'visible' && chatId === currentChatId) return;
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const preview = notificationPrefs.personal.messagePreview;
        const body = preview ? msg.text || 'Новое сообщение' : 'Новое сообщение';
        const senderName = detail.sender?.display_name?.trim();
        const title = senderName || 'DierCHAT';
        const n = new Notification(title, {
          body,
          icon: notificationIconUrl(detail.sender?.avatar_url),
          tag: chatId || 'dierchat',
        });
        n.onclick = () => {
          window.focus();
          if (chatId) setCurrentChatId(chatId);
          n.close();
        };
        if ((notificationPrefs.vibrate !== false) && typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate(60);
          } catch {
            /* ignore */
          }
        }
      }
    };
    window.addEventListener('dierchat:new_message', handler);
    return () => window.removeEventListener('dierchat:new_message', handler);
  }, [currentChatId, setCurrentChatId, chatTypes, notificationPrefs, notificationMutedChatIds]);

  const needsProfile = user && !user.username;
  const isLoading = token && !user;

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'var(--bg-primary)',
        color: 'var(--text-secondary)', fontSize: 15,
      }}>
        Загрузка…
      </div>
    );
  }

  if (!token || needsProfile) {
    return <AuthScreen needsProfile={!!needsProfile} />;
  }

  return (
    <MusicPlayerProvider>
      <DeviceSettingsPersistence />
      <MainLayout />
    </MusicPlayerProvider>
  );
}

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_NEW_TAB_URL } from '@/lib/browserNav';
import { canonicalUuid } from '@/lib/uuidCanonical';
import type { InAppBrowserTab } from '@/types/inAppBrowser';
import { BROWSER_MAX_TABS } from '@/types/inAppBrowser';
import type { User } from '@/api/client';

export type Theme = 'dark' | 'light';
export type Language = 'ru' | 'en' | 'kk' | 'tr' | 'az' | 'hy' | 'be';

export type NotificationPrefs = {
  personal: {
    enabled: boolean;
    sound: boolean;
    messagePreview: boolean;
  };
  groups: {
    enabled: boolean;
    sound: boolean;
  };
  channels: {
    enabled: boolean;
  };
  /** Вибро на мобильных (раздел 13 ТЗ) */
  vibrate: boolean;
};

export type PrivacyVisibility = 'all' | 'contacts' | 'nobody';

export type PrivacyPrefs = {
  phone: PrivacyVisibility;
  lastSeen: PrivacyVisibility;
  /** ТЗ §40: кто видит статус «в сети» */
  onlineStatus: PrivacyVisibility;
  profilePhoto: PrivacyVisibility;
  forwards: PrivacyVisibility;
  calls: PrivacyVisibility;
  groupChannels: PrivacyVisibility;
  /** Не показывать email в профиле другим (ожидает поддержку API; локально маскируем отображение) */
  hideEmail: boolean;
  /** Зарезервировано под телефон */
  hidePhone: boolean;
};

export type DevicePrefs = {
  cameraId: string;
  microphoneId: string;
  /** Пусто = устройство по умолчанию (setSinkId) */
  speakerId: string;
};

/** ТЗ §48.5: настройки звонков (громкость по userId, 0.25–2.0) */
export type CallAudioPrefs = {
  volumeByPeerId: Record<string, number>;
  normalizeVolume: boolean;
  prioritizeSpeaker: boolean;
  noiseSuppressionCalls: boolean;
};

export type IncomingCall = {
  fromUserId: string;
  fromDisplayName?: string;
  fromAvatarUrl?: string;
  chatId: string;
  video: boolean;
  sdp?: RTCSessionDescriptionInit;
  participantIds?: string[];
  initiatorId?: string;
};

export type ActiveCall = {
  peerUserId: string;
  peerDisplayName?: string;
  chatId: string;
  isVideo: boolean;
  isOutgoing: boolean;
  isGroup?: boolean;
  /** Остальные участники (без self), для mesh */
  remotePeerIds?: string[];
  initiatorId?: string;
};

interface AppState {
  token: string | null;
  user: User | null;
  theme: Theme;
  incomingCall: IncomingCall | null;
  activeCall: ActiveCall | null;
  language: Language;
  accentColor: string;
  chatBg: string; // empty string => default theme background
  fontSize: number;
  bubbleRadius: number;
  notificationPrefs: NotificationPrefs;
  privacyPrefs: PrivacyPrefs;
  devicePrefs: DevicePrefs;
  callAudioPrefs: CallAudioPrefs;
  chatFolders: { id: string; name: string; types: number[]; chatIds: string[] }[];
  compactSidebar: boolean;
  sendSound: boolean;
  /** Типы чатов для фильтра уведомлений: 0 личка, 1 группа, 2 канал */
  chatTypes: Record<string, number>;
  /** Исключения: не показывать системные уведомления и звук для этих чатов (ТЗ §13) */
  notificationMutedChatIds: string[];
  followSystemTheme: boolean;
  /** ТЗ §23: размытие панелей (Liquid Glass); на слабых устройствах можно выключить */
  liquidGlassEnabled: boolean;
  /** ТЗ §36: быстрые ответы под полем ввода */
  quickRepliesEnabled: boolean;
  /** ТЗ §46.6: авто-разметка (**жирный**, ссылки) в тексте сообщений; по умолчанию выкл. */
  messageMarkdownEnabled: boolean;
  /** ТЗ §38: toast внутри приложения при новом сообщении */
  showInAppMessageToasts: boolean;
  /** ТЗ §37 + §41: last_seen с сервера (WebSocket) */
  lastSeenByUserId: Record<string, string>;
  /** ТЗ §41: баннер группового звонка в чате */
  groupCallBannerByChatId: Record<
    string,
    { state: 'active' | 'ended'; participantCount: number; video: boolean; fromUserId?: string }
  >;
  /** ТЗ §28: ссылки http(s) во встроенном браузере вместо системного */
  inAppBrowserEnabled: boolean;
  /** §28.6 — заглушки под дальнейшую реализацию */
  browserBlockTrackers: boolean;
  browserClearHistoryOnClose: boolean;
  browserAllowDownloads: boolean;
  /** Встроенный браузер: вкладки (§28 / §30) */
  inAppBrowserTabs: InAppBrowserTab[];
  inAppBrowserActiveTabId: string | null;
  currentChatId: string | null;
  pendingInfoPanelTab: 'media' | 'favorites' | 'links' | 'voice' | null;
  onlineUserIds: string[];
  setToken: (token: string | null) => void;
  setUserOnline: (userId: string) => void;
  setUserOffline: (userId: string) => void;
  /** Слияние снимка онлайна (например GET /api/presence/peers) */
  mergeOnlineUserIds: (userIds: string[]) => void;
  setChatFolders: (folders: AppState['chatFolders']) => void;
  setCompactSidebar: (v: boolean) => void;
  setSendSound: (v: boolean) => void;
  setChatTypes: (map: Record<string, number>) => void;
  toggleNotificationMutedChat: (chatId: string) => void;
  setFollowSystemTheme: (v: boolean) => void;
  setLiquidGlassEnabled: (v: boolean) => void;
  setQuickRepliesEnabled: (v: boolean) => void;
  setMessageMarkdownEnabled: (v: boolean) => void;
  setShowInAppMessageToasts: (v: boolean) => void;
  setUserLastSeen: (userId: string, iso: string) => void;
  setGroupCallBanner: (
    chatId: string,
    payload: { state: 'active' | 'ended'; participantCount: number; video: boolean; fromUserId?: string } | null
  ) => void;
  setInAppBrowserEnabled: (v: boolean) => void;
  setBrowserBlockTrackers: (v: boolean) => void;
  setBrowserClearHistoryOnClose: (v: boolean) => void;
  setBrowserAllowDownloads: (v: boolean) => void;
  /** null — закрыть все вкладки; строка — новая вкладка с URL */
  setInAppBrowserUrl: (url: string | null) => void;
  /** Новая вкладка (по умолчанию Google); не закрывает существующие */
  addInAppBrowserTab: (url?: string) => void;
  /** Закрыть встроенный браузер (все вкладки) */
  clearInAppBrowser: () => void;
  setInAppBrowserActiveTabId: (id: string | null) => void;
  removeInAppBrowserTab: (id: string) => void;
  setInAppBrowserTabUrl: (id: string, url: string) => void;
  setInAppBrowserTabMeta: (id: string, meta: Partial<Pick<InAppBrowserTab, 'title' | 'favicon'>>) => void;
  reorderInAppBrowserTabs: (fromIndex: number, toIndex: number) => void;
  setPendingInfoPanelTab: (tab: 'media' | 'favorites' | 'links' | 'voice' | null) => void;
  setUser: (user: User | null) => void;
  setTheme: (theme: Theme) => void;
  setLanguage: (language: Language) => void;
  setAccentColor: (accentColor: string) => void;
  setChatBg: (chatBg: string) => void;
  setFontSize: (fontSize: number) => void;
  setBubbleRadius: (bubbleRadius: number) => void;
  setNotificationPrefs: (prefs: NotificationPrefs) => void;
  setPrivacyPrefs: (prefs: PrivacyPrefs) => void;
  setDevicePrefs: (prefs: DevicePrefs) => void;
  setCallAudioPrefs: (prefs: Partial<CallAudioPrefs>) => void;
  setCallPeerVolume: (peerUserId: string, volume: number) => void;
  setCurrentChatId: (chatId: string | null) => void;
  setIncomingCall: (call: IncomingCall | null) => void;
  setActiveCall: (call: ActiveCall | null) => void;
  logout: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      theme: 'dark',
      language: 'ru',
      accentColor: '#3390ec',
      chatBg: '',
      fontSize: 14,
      bubbleRadius: 12,
      notificationPrefs: {
        personal: { enabled: true, sound: true, messagePreview: true },
        groups: { enabled: true, sound: true },
        channels: { enabled: true },
        vibrate: true,
      },
      privacyPrefs: {
        phone: 'all',
        lastSeen: 'all',
        onlineStatus: 'all',
        profilePhoto: 'all',
        forwards: 'all',
        calls: 'all',
        groupChannels: 'all',
        hideEmail: false,
        hidePhone: false,
      },
      devicePrefs: { cameraId: '', microphoneId: '', speakerId: '' },
      callAudioPrefs: {
        volumeByPeerId: {},
        normalizeVolume: false,
        prioritizeSpeaker: false,
        noiseSuppressionCalls: true,
      },
      chatFolders: [],
      compactSidebar: false,
      sendSound: true,
      chatTypes: {},
      notificationMutedChatIds: [],
      followSystemTheme: false,
      liquidGlassEnabled: true,
      quickRepliesEnabled: true,
      messageMarkdownEnabled: false,
      showInAppMessageToasts: true,
      lastSeenByUserId: {},
      groupCallBannerByChatId: {},
      inAppBrowserEnabled: true,
      browserBlockTrackers: false,
      browserClearHistoryOnClose: true,
      browserAllowDownloads: true,
      inAppBrowserTabs: [],
      inAppBrowserActiveTabId: null,
      currentChatId: null,
      pendingInfoPanelTab: null,
      onlineUserIds: [],
      setUserOnline: (userId) =>
        set((s) => {
          const id = userId.toLowerCase();
          return s.onlineUserIds.some((x) => x.toLowerCase() === id)
            ? s
            : { onlineUserIds: [...s.onlineUserIds, userId] };
        }),
      setUserOffline: (userId) =>
        set((s) => ({
          onlineUserIds: s.onlineUserIds.filter((id) => id.toLowerCase() !== userId.toLowerCase()),
        })),
      mergeOnlineUserIds: (userIds) =>
        set((s) => {
          const setIds = new Set(s.onlineUserIds.map((x) => x.toLowerCase()));
          const merged = [...s.onlineUserIds];
          for (const uid of userIds) {
            const low = uid.toLowerCase();
            if (!setIds.has(low)) {
              setIds.add(low);
              merged.push(uid);
            }
          }
          return { onlineUserIds: merged };
        }),
      incomingCall: null,
      activeCall: null,
      setToken: (token) => set({ token }),
      setPendingInfoPanelTab: (pendingInfoPanelTab) => set({ pendingInfoPanelTab }),
      setUser: (user) => set({ user }),
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setAccentColor: (accentColor) => set({ accentColor }),
      setChatBg: (chatBg) => set({ chatBg }),
      setFontSize: (fontSize) => set({ fontSize }),
      setBubbleRadius: (bubbleRadius) => set({ bubbleRadius }),
      setNotificationPrefs: (notificationPrefs) => set({ notificationPrefs }),
      setPrivacyPrefs: (privacyPrefs) => set({ privacyPrefs }),
      setDevicePrefs: (devicePrefs) => set({ devicePrefs }),
      setCallAudioPrefs: (patch) =>
        set((s) => ({ callAudioPrefs: { ...s.callAudioPrefs, ...patch } })),
      setCallPeerVolume: (peerUserId, volume) =>
        set((s) => ({
          callAudioPrefs: {
            ...s.callAudioPrefs,
            volumeByPeerId: {
              ...s.callAudioPrefs.volumeByPeerId,
              [peerUserId.toLowerCase()]: Math.min(2, Math.max(0.25, volume)),
            },
          },
        })),
      setChatFolders: (chatFolders) => set({ chatFolders }),
      setCompactSidebar: (compactSidebar) => set({ compactSidebar }),
      setSendSound: (sendSound) => set({ sendSound }),
      setChatTypes: (chatTypes) => set({ chatTypes }),
      toggleNotificationMutedChat: (chatId) =>
        set((s) => {
          const setIds = new Set(s.notificationMutedChatIds);
          if (setIds.has(chatId)) setIds.delete(chatId);
          else setIds.add(chatId);
          return { notificationMutedChatIds: Array.from(setIds) };
        }),
      setFollowSystemTheme: (followSystemTheme) => set({ followSystemTheme }),
      setLiquidGlassEnabled: (liquidGlassEnabled) => set({ liquidGlassEnabled }),
      setQuickRepliesEnabled: (quickRepliesEnabled) => set({ quickRepliesEnabled }),
      setMessageMarkdownEnabled: (messageMarkdownEnabled) => set({ messageMarkdownEnabled }),
      setShowInAppMessageToasts: (showInAppMessageToasts) => set({ showInAppMessageToasts }),
      setUserLastSeen: (userId, iso) =>
        set((s) => ({
          lastSeenByUserId: { ...s.lastSeenByUserId, [userId.toLowerCase()]: iso },
        })),
      setGroupCallBanner: (chatId, payload) =>
        set((s) => {
          const next = { ...s.groupCallBannerByChatId };
          if (payload == null) delete next[chatId];
          else next[chatId] = payload;
          return { groupCallBannerByChatId: next };
        }),
      setInAppBrowserEnabled: (inAppBrowserEnabled) => set({ inAppBrowserEnabled }),
      setBrowserBlockTrackers: (browserBlockTrackers) => set({ browserBlockTrackers }),
      setBrowserClearHistoryOnClose: (browserClearHistoryOnClose) => set({ browserClearHistoryOnClose }),
      setBrowserAllowDownloads: (browserAllowDownloads) => set({ browserAllowDownloads }),
      clearInAppBrowser: () => set({ inAppBrowserTabs: [], inAppBrowserActiveTabId: null }),
      setInAppBrowserUrl: (url) => {
        if (url == null || url === '') {
          set({ inAppBrowserTabs: [], inAppBrowserActiveTabId: null });
          return;
        }
        const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        set((s) => {
          let tabs = [...s.inAppBrowserTabs];
          if (tabs.length >= BROWSER_MAX_TABS) tabs.shift();
          tabs.push({ id, url });
          return { inAppBrowserTabs: tabs, inAppBrowserActiveTabId: id };
        });
      },
      addInAppBrowserTab: (url) => {
        const finalUrl = url && url.trim() ? url.trim() : DEFAULT_NEW_TAB_URL;
        const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        set((s) => {
          let tabs = [...s.inAppBrowserTabs];
          if (tabs.length >= BROWSER_MAX_TABS) tabs.shift();
          tabs.push({ id, url: finalUrl });
          return { inAppBrowserTabs: tabs, inAppBrowserActiveTabId: id };
        });
      },
      setInAppBrowserActiveTabId: (inAppBrowserActiveTabId) => set({ inAppBrowserActiveTabId }),
      removeInAppBrowserTab: (tabId) =>
        set((s) => {
          const tabs = s.inAppBrowserTabs.filter((t) => t.id !== tabId);
          let active = s.inAppBrowserActiveTabId;
          if (active === tabId) {
            active = tabs.length ? tabs[tabs.length - 1]!.id : null;
          }
          return { inAppBrowserTabs: tabs, inAppBrowserActiveTabId: active };
        }),
      setInAppBrowserTabUrl: (tabId, url) =>
        set((s) => ({
          inAppBrowserTabs: s.inAppBrowserTabs.map((t) => (t.id === tabId ? { ...t, url } : t)),
        })),
      setInAppBrowserTabMeta: (tabId, meta) =>
        set((s) => ({
          inAppBrowserTabs: s.inAppBrowserTabs.map((t) =>
            t.id === tabId ? { ...t, ...meta } : t
          ),
        })),
      reorderInAppBrowserTabs: (fromIndex, toIndex) =>
        set((s) => {
          const tabs = [...s.inAppBrowserTabs];
          if (
            fromIndex < 0 ||
            fromIndex >= tabs.length ||
            toIndex < 0 ||
            toIndex >= tabs.length ||
            fromIndex === toIndex
          ) {
            return s;
          }
          const [moved] = tabs.splice(fromIndex, 1);
          tabs.splice(toIndex, 0, moved!);
          return { inAppBrowserTabs: tabs };
        }),
      setCurrentChatId: (id) =>
        set({
          currentChatId:
            id == null || String(id).trim() === '' ? null : canonicalUuid(String(id)),
        }),
      setIncomingCall: (incomingCall) => set({ incomingCall }),
      setActiveCall: (activeCall) => set({ activeCall }),
      logout: () =>
        set({
          token: null,
          user: null,
          currentChatId: null,
          incomingCall: null,
          activeCall: null,
          inAppBrowserTabs: [],
          inAppBrowserActiveTabId: null,
        }),
    }),
    {
      name: 'dierchat-storage',
      merge: (persisted, current) => {
        const p = persisted as Partial<AppState> | undefined;
        if (!p || typeof p !== 'object') return current;
        return {
          ...current,
          ...p,
          messageMarkdownEnabled: p.messageMarkdownEnabled ?? current.messageMarkdownEnabled,
          devicePrefs: {
            ...current.devicePrefs,
            ...(p.devicePrefs ?? {}),
            speakerId: p.devicePrefs?.speakerId ?? current.devicePrefs.speakerId ?? '',
          },
          callAudioPrefs: {
            ...current.callAudioPrefs,
            ...(p.callAudioPrefs ?? {}),
            volumeByPeerId: {
              ...current.callAudioPrefs.volumeByPeerId,
              ...(p.callAudioPrefs?.volumeByPeerId ?? {}),
            },
          },
          privacyPrefs: {
            ...current.privacyPrefs,
            ...(p.privacyPrefs ?? {}),
            onlineStatus: p.privacyPrefs?.onlineStatus ?? current.privacyPrefs.onlineStatus,
            hideEmail: p.privacyPrefs?.hideEmail ?? current.privacyPrefs.hideEmail,
            hidePhone: p.privacyPrefs?.hidePhone ?? current.privacyPrefs.hidePhone,
          },
        };
      },
      partialize: (state) => ({
        token: state.token,
        theme: state.theme,
        language: state.language,
        accentColor: state.accentColor,
        chatBg: state.chatBg,
        fontSize: state.fontSize,
        bubbleRadius: state.bubbleRadius,
        notificationPrefs: state.notificationPrefs,
        privacyPrefs: state.privacyPrefs,
        devicePrefs: state.devicePrefs,
        callAudioPrefs: state.callAudioPrefs,
        chatFolders: state.chatFolders,
        compactSidebar: state.compactSidebar,
        sendSound: state.sendSound,
        notificationMutedChatIds: state.notificationMutedChatIds,
        followSystemTheme: state.followSystemTheme,
        liquidGlassEnabled: state.liquidGlassEnabled,
        quickRepliesEnabled: state.quickRepliesEnabled,
        messageMarkdownEnabled: state.messageMarkdownEnabled,
        showInAppMessageToasts: state.showInAppMessageToasts,
        inAppBrowserEnabled: state.inAppBrowserEnabled,
        browserBlockTrackers: state.browserBlockTrackers,
        browserClearHistoryOnClose: state.browserClearHistoryOnClose,
        browserAllowDownloads: state.browserAllowDownloads,
        inAppBrowserTabs: state.inAppBrowserTabs,
        inAppBrowserActiveTabId: state.inAppBrowserActiveTabId,
      }),
    }
  )
);

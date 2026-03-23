import { useEffect, useState, useRef } from 'react';
import { useStore, type PrivacyVisibility } from '@/store';
import { api, type Session, type Report, type FriendProfile, type User } from '@/api/client';
import { normalizeMediaUrl } from '@/lib/publicApiUrl';
import { Avatar } from '@/components/common/Avatar';
import {
  ArrowLeft, User as UserIcon, Bell, Lock, Palette, Globe, Info, LogOut, Camera,
  Monitor, Check, Trash2, Moon, Sun, ChevronRight, Megaphone, HelpCircle, Heart, Lightbulb, Mic, Video, Shield,
  AppWindow,
  UserPlus,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import type { Chat } from '@/api/client';
import { dispatchAvatarCacheBust } from '@/lib/avatarCache';
import { AvatarCropModal } from './AvatarCropModal';
import { getUseTurnFromStorage, setUseTurnInStorage } from '@/lib/rtcIceServers';
import { clearDevicePrefsIDB } from '@/lib/deviceSettingsIDB';
import './SettingsPanel.css';

type Section = 'main' | 'profile' | 'appearance' | 'browser' | 'language' | 'notifications' | 'privacy' | 'friends' | 'storage' | 'devices' | 'about' | 'broadcast' | 'moderation' | 'support' | 'donations' | 'ideas';
type Props = { onClose: () => void };

function DevicesSection({
  cameras,
  microphones,
  speakers,
  savedPrefs,
  onApply,
  renderBack,
  title,
}: {
  cameras: MediaDeviceInfo[];
  microphones: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
  savedPrefs: { cameraId: string; microphoneId: string; speakerId: string };
  onApply: (prefs: { cameraId: string; microphoneId: string; speakerId: string }) => void;
  renderBack: (label: string) => React.ReactElement;
  title: string;
}) {
  const [draft, setDraft] = useState({ ...savedPrefs });
  const changed =
    draft.cameraId !== savedPrefs.cameraId ||
    draft.microphoneId !== savedPrefs.microphoneId ||
    draft.speakerId !== savedPrefs.speakerId;
  const [applied, setApplied] = useState(false);
  const [useTurn, setUseTurn] = useState(() => getUseTurnFromStorage());
  useEffect(() => {
    setDraft({ ...savedPrefs });
    setApplied(false);
  }, [savedPrefs]);

  return (
    <>{renderBack(title)}
      <div className="sp-content">
        <div className="sp-group-title">Звонки через интернет (TURN)</div>
        <label className="sp-row" style={{ alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={useTurn}
            onChange={(e) => {
              const v = e.target.checked;
              setUseTurn(v);
              setUseTurnInStorage(v);
            }}
          />
          <span>Использовать TURN (разные города, мобильный интернет, разные Wi‑Fi)</span>
        </label>
        <p className="sp-hint" style={{ margin: '0 0 12px', fontSize: 12, opacity: 0.75 }}>
          Без своего TURN‑сервера на VPS звонки часто работают только в одной сети. Укажите Coturn в переменных
          VITE_TURN_* в сборке (см. docs/COTURN.example.md). После смены переключателя начните звонок заново.
        </p>
        <div className="sp-group-title">Камера</div>
        <div className="sp-row">
          <label className="sp-label" style={{ margin: 0 }}>Камера для видеозвонков</label>
        </div>
        <select
          className="sp-input sp-select"
          value={draft.cameraId || ''}
          onChange={(e) => { setDraft((p) => ({ ...p, cameraId: e.target.value })); setApplied(false); }}
        >
          <option value="">По умолчанию</option>
          {cameras.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label || `Камера ${d.deviceId.slice(0, 8)}`}</option>
          ))}
        </select>
        <div className="sp-group-title">Микрофон</div>
        <div className="sp-row">
          <label className="sp-label" style={{ margin: 0 }}>Микрофон для звонков и записей</label>
        </div>
        <select
          className="sp-input sp-select"
          value={draft.microphoneId || ''}
          onChange={(e) => { setDraft((p) => ({ ...p, microphoneId: e.target.value })); setApplied(false); }}
        >
          <option value="">По умолчанию</option>
          {microphones.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label || `Микрофон ${d.deviceId.slice(0, 8)}`}</option>
          ))}
        </select>
        <div className="sp-group-title">Воспроизведение</div>
        <div className="sp-row">
          <label className="sp-label" style={{ margin: 0 }}>Устройство вывода звука</label>
        </div>
        <p className="sp-hint" style={{ margin: '0 0 8px', fontSize: 12, opacity: 0.75 }}>
          Звонки, голосовые, музыка. После смены нажмите «Применить»; для вывода на другой динамик может понадобиться
          снова нажать «Играть» на сообщении или перезапустить окно (Electron + политика speaker-selection).
          Список устройств может быть пустым, пока не выдан доступ к микрофону — откройте раздел ещё раз.
        </p>
        <select
          className="sp-input sp-select"
          value={draft.speakerId || ''}
          onChange={(e) => { setDraft((p) => ({ ...p, speakerId: e.target.value })); setApplied(false); }}
        >
          <option value="">По умолчанию</option>
          {speakers.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label || `Выход ${d.deviceId.slice(0, 8)}`}</option>
          ))}
        </select>
        <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            className="sp-save"
            disabled={!changed && !applied}
            onClick={() => {
              onApply(draft);
              setApplied(true);
            }}
          >
            {applied ? 'Применено ✓' : 'Применить'}
          </button>
          {changed && (
            <button
              className="sp-cancel"
              onClick={() => { setDraft({ ...savedPrefs }); setApplied(false); }}
            >
              Отменить черновик
            </button>
          )}
          <button
            type="button"
            className="sp-cancel"
            onClick={() => {
              void clearDevicePrefsIDB();
              onApply({ cameraId: '', microphoneId: '', speakerId: '' });
              setDraft({ cameraId: '', microphoneId: '', speakerId: '' });
              setApplied(true);
            }}
          >
            Сбросить настройки устройств
          </button>
        </div>
      </div>
    </>
  );
}

const ACCENT_COLORS = [
  { name: 'Синий', value: '#3390ec' },
  { name: 'Зелёный', value: '#4caf50' },
  { name: 'Красный', value: '#e53935' },
  { name: 'Оранжевый', value: '#ff9800' },
  { name: 'Фиолетовый', value: '#9c27b0' },
  { name: 'Розовый', value: '#e91e63' },
  { name: 'Голубой', value: '#00bcd4' },
  { name: 'Индиго', value: '#3f51b5' },
];

const CHAT_BACKGROUNDS = [
  { name: 'Стандартный', value: '' },
  { name: 'Тёмно-синий', value: '#0d1117' },
  { name: 'Тёмно-зелёный', value: '#0d1f0d' },
  { name: 'Тёмно-красный', value: '#1a0a0a' },
  { name: 'Серый', value: '#1a1a2e' },
  { name: 'Чёрный', value: '#000000' },
];

const FONT_SIZES = [12, 13, 14, 15, 16, 18];
const BUBBLE_RADII = [8, 10, 12, 14, 16];

export function SettingsPanel({ onClose }: Props) {
  const {
    user,
    setUser,
    theme,
    setTheme,
    language,
    setLanguage,
    logout,
    accentColor,
    chatBg,
    fontSize,
    bubbleRadius,
    setAccentColor,
    setChatBg,
    setFontSize,
    setBubbleRadius,
    notificationPrefs,
    setNotificationPrefs,
    privacyPrefs,
    setPrivacyPrefs,
    devicePrefs,
    setDevicePrefs,
    callAudioPrefs,
    setCallAudioPrefs,
    compactSidebar,
    setCompactSidebar,
    sendSound,
    setSendSound,
    followSystemTheme,
    setFollowSystemTheme,
    liquidGlassEnabled,
    setLiquidGlassEnabled,
    inAppBrowserEnabled,
    setInAppBrowserEnabled,
    browserBlockTrackers,
    setBrowserBlockTrackers,
    browserClearHistoryOnClose,
    setBrowserClearHistoryOnClose,
    browserAllowDownloads,
    setBrowserAllowDownloads,
    notificationMutedChatIds,
    toggleNotificationMutedChat,
    quickRepliesEnabled,
    setQuickRepliesEnabled,
    messageMarkdownEnabled,
    setMessageMarkdownEnabled,
    showInAppMessageToasts,
    setShowInAppMessageToasts,
  } = useStore();
  const [section, setSection] = useState<Section>('main');
  const [firstName, setFirstName] = useState(() => (user?.display_name || '').split(' ')[0] || '');
  const [lastName, setLastName] = useState(() => (user?.display_name || '').split(' ').slice(1).join(' ') || '');
  const [username, setUsername] = useState(user?.username || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [saving, setSaving] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(() => user?.avatar_url || '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [terminatingSessions, setTerminatingSessions] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);

  const [broadcastChats, setBroadcastChats] = useState<Chat[]>([]);
  const [broadcastSelected, setBroadcastSelected] = useState<Set<string>>(new Set());
  const [broadcastText, setBroadcastText] = useState('');
  const [broadcastContentType, setBroadcastContentType] = useState<'text' | 'code'>('text');
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastLoadingChats, setBroadcastLoadingChats] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [muteListChats, setMuteListChats] = useState<Chat[]>([]);
  const [muteListLoading, setMuteListLoading] = useState(false);
  const [modReports, setModReports] = useState<Report[]>([]);
  const [modLoading, setModLoading] = useState(false);
  const [friendsList, setFriendsList] = useState<FriendProfile[]>([]);
  const [friendsIncoming, setFriendsIncoming] = useState<FriendProfile[]>([]);
  const [friendsOutgoing, setFriendsOutgoing] = useState<FriendProfile[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendSearchQ, setFriendSearchQ] = useState('');
  const [friendSearchHits, setFriendSearchHits] = useState<User[]>([]);
  const { t } = useTranslation();

  function getChatDisplayName(chat: Chat): string {
    if (chat.type === 0 && chat.peer_display_name?.trim()) return chat.peer_display_name.trim();
    if (chat.title && chat.title.trim()) return chat.title;
    return 'Без названия';
  }

  function toggleBroadcastChat(chatId: string) {
    setBroadcastSelected((prev) => {
      const next = new Set(prev);
      if (next.has(chatId)) next.delete(chatId);
      else next.add(chatId);
      return next;
    });
  }

  async function sendBroadcast() {
    const ids = Array.from(broadcastSelected);
    if (ids.length === 0 || !broadcastText.trim()) return;
    setBroadcastSending(true);
    try {
      const results = await api.broadcast(ids, broadcastContentType, broadcastText.trim());
      const ok = results.filter((r) => r.ok).length;
      const failed = results.filter((r) => !r.ok).length;
      if (failed === 0) {
        setBroadcastText('');
        setBroadcastSelected(new Set());
      }
      alert(
        failed === 0
          ? `${ok} ${t('broadcast_success')}`
          : `${ok} ${t('broadcast_success')}, ${failed} ${t('broadcast_failed')}`
      );
    } catch (e) {
      alert((e as Error).message || t('broadcast_failed'));
    } finally {
      setBroadcastSending(false);
    }
  }

  useEffect(() => {
    setAvatarPreview(user?.avatar_url || '');
  }, [user?.avatar_url]);

  useEffect(() => {
    if (section !== 'privacy') return;
    setSessionsLoading(true);
    api
      .listSessions()
      .then((list) => setSessions(list ?? []))
      .catch(() => setSessions([]))
      .finally(() => setSessionsLoading(false));
  }, [section]);

  useEffect(() => {
    if (section !== 'broadcast') return;
    setBroadcastLoadingChats(true);
    api
      .getChats()
      .then((list) => setBroadcastChats(list ?? []))
      .catch(() => setBroadcastChats([]))
      .finally(() => setBroadcastLoadingChats(false));
  }, [section]);

  useEffect(() => {
    if (section !== 'notifications') return;
    setMuteListLoading(true);
    api
      .getChats()
      .then((list) => setMuteListChats(list ?? []))
      .catch(() => setMuteListChats([]))
      .finally(() => setMuteListLoading(false));
  }, [section]);

  useEffect(() => {
    if (section !== 'moderation') return;
    setModLoading(true);
    api
      .listReports(50)
      .then((reports) => {
        setModReports(reports ?? []);
      })
      .catch(() => setModReports([]))
      .finally(() => setModLoading(false));
  }, [section]);

  useEffect(() => {
    if (section !== 'friends') return;
    let cancelled = false;
    setFriendsLoading(true);
    Promise.all([
      api.listFriends(),
      api.listFriendRequestsIncoming(),
      api.listFriendRequestsOutgoing(),
    ])
      .then(([f, inc, out]) => {
        if (!cancelled) {
          setFriendsList(f);
          setFriendsIncoming(inc);
          setFriendsOutgoing(out);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFriendsList([]);
          setFriendsIncoming([]);
          setFriendsOutgoing([]);
        }
      })
      .finally(() => {
        if (!cancelled) setFriendsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [section]);

  useEffect(() => {
    if (section !== 'friends') return;
    const q = friendSearchQ.trim();
    if (q.length < 2) {
      setFriendSearchHits([]);
      return;
    }
    const timer = setTimeout(() => {
      api.searchUsers(q).then(setFriendSearchHits).catch(() => setFriendSearchHits([]));
    }, 400);
    return () => clearTimeout(timer);
  }, [friendSearchQ, section]);

  useEffect(() => {
    if (section !== 'devices' || !navigator.mediaDevices?.enumerateDevices) return;
    let cancelled = false;
    (async () => {
      try {
        if (navigator.mediaDevices?.getUserMedia) {
          try {
            const tmp = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            tmp.getTracks().forEach((t) => t.stop());
          } catch {
            /* без разрешения метки устройств могут быть пустыми */
          }
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        setCameras(devices.filter((d) => d.kind === 'videoinput'));
        setMicrophones(devices.filter((d) => d.kind === 'audioinput'));
        setSpeakers(devices.filter((d) => d.kind === 'audiooutput'));
      } catch {
        if (!cancelled) {
          setCameras([]);
          setMicrophones([]);
          setSpeakers([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [section]);

  async function saveProfile() {
    setSaving(true);
    try {
      const name = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
      let avatarUrl: string | undefined;
      if (avatarFile) {
        const uploaded = await api.uploadFile(avatarFile);
        avatarUrl = uploaded.url;
      }
      await api.updateProfile(name, username.trim(), bio.trim(), avatarUrl);
      const u = await api.getMe();
      setUser(u);
      setAvatarFile(null);
      dispatchAvatarCacheBust({ userId: u.id, url: u.avatar_url || undefined });
    } catch {}
    setSaving(false);
  }

  function handleAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCropSrc(reader.result as string);
      setCropOpen(true);
    };
    reader.readAsDataURL(f);
    e.target.value = '';
  }

  function applyAccent(color: string) {
    setAccentColor(color);
  }

  function applyBg(bg: string) {
    setChatBg(bg);
  }

  function applyFontSize(size: number) {
    setFontSize(size);
  }

  async function terminateAllSessions() {
    if (terminatingSessions) return;
    setTerminatingSessions(true);
    try {
      await api.terminateAllSessions();
      // Ensure frontend doesn't keep using the old token.
      api.setToken(null);
      logout();
      setSessions([]);
    } catch {}
    setTerminatingSessions(false);
  }

  async function clearClientCache() {
    if (clearingCache) return;
    setClearingCache(true);
    try {
      // Browser/electron cache (HTTP, service worker caches). If there is none - it will no-op.
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {}
    setClearingCache(false);
  }

  const visibilityLabels: Record<PrivacyVisibility, string> = {
    all: 'Все',
    contacts: 'Только контакты',
    nobody: 'Никто',
  };

  function cycleVisibility(v: PrivacyVisibility): PrivacyVisibility {
    if (v === 'all') return 'contacts';
    if (v === 'contacts') return 'nobody';
    return 'all';
  }

  function renderBack(label: string) {
    return (
      <div className="sp-header">
        <button className="sp-back" onClick={() => setSection('main')}><ArrowLeft size={18} /> Назад</button>
        <h2 className="sp-title">{label}</h2>
      </div>
    );
  }

  // Sub-sections
  if (section !== 'main') return (
    <div className="sp">
      {section === 'profile' && <>{renderBack('Профиль')}
        <div className="sp-content sp-content--profile">
          <input type="file" ref={fileRef} accept="image/*" style={{ display: 'none' }} onChange={handleAvatar} />
          <button type="button" className="sp-avatar-btn" onClick={() => fileRef.current?.click()}>
            {avatarPreview
              ? <img src={avatarPreview} className="sp-avatar-img" />
              : <Avatar name={firstName || 'U'} variant="profile" />}
            <div className="sp-avatar-overlay"><Camera size={24} /></div>
          </button>
          <div className="sp-form">
            <label className="sp-label">Имя</label>
            <input className="sp-input" value={firstName} onChange={e => setFirstName(e.target.value)} />
            <label className="sp-label">Фамилия</label>
            <input className="sp-input" value={lastName} onChange={e => setLastName(e.target.value)} />
            <label className="sp-label">Имя пользователя</label>
            <input className="sp-input" value={username} onChange={e => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} />
            <label className="sp-label">О себе</label>
            <textarea className="sp-textarea" value={bio} onChange={e => setBio(e.target.value)} rows={3} />
            <button className="sp-save" onClick={saveProfile} disabled={saving}>
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
          <div className="sp-info-row"><span>Телефон</span><span>{user?.phone}</span></div>
          <div className="sp-info-row"><span>ID</span><span className="sp-mono">{user?.id?.slice(0, 8)}</span></div>
        </div>
      </>}
      {section === 'notifications' && <>{renderBack('Уведомления')}
        <div className="sp-content">
          <div className="sp-group-title">Личные чаты</div>
          <div className="sp-row">
            <span>Уведомления</span>
            <div
              className={`sp-toggle ${notificationPrefs.personal.enabled ? 'sp-toggle--on' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() =>
                setNotificationPrefs({
                  ...notificationPrefs,
                  personal: { ...notificationPrefs.personal, enabled: !notificationPrefs.personal.enabled },
                })
              }
            >
              <div className="sp-knob" />
            </div>
          </div>
          <div className="sp-row">
            <span>Звук</span>
            <div
              className={`sp-toggle ${notificationPrefs.personal.sound ? 'sp-toggle--on' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() =>
                setNotificationPrefs({
                  ...notificationPrefs,
                  personal: { ...notificationPrefs.personal, sound: !notificationPrefs.personal.sound },
                })
              }
            >
              <div className="sp-knob" />
            </div>
          </div>
          <div className="sp-row">
            <span>Превью сообщений</span>
            <div
              className={`sp-toggle ${notificationPrefs.personal.messagePreview ? 'sp-toggle--on' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() =>
                setNotificationPrefs({
                  ...notificationPrefs,
                  personal: {
                    ...notificationPrefs.personal,
                    messagePreview: !notificationPrefs.personal.messagePreview,
                  },
                })
              }
            >
              <div className="sp-knob" />
            </div>
          </div>
          <div className="sp-group-title">Чаты</div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
            Быстрые ответы и всплывающие уведомления внутри приложения (ТЗ §36, §38)
          </p>
          <div className="sp-row">
            <span>Разметка в сообщениях</span>
            <div
              className={`sp-toggle ${messageMarkdownEnabled ? 'sp-toggle--on' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => setMessageMarkdownEnabled(!messageMarkdownEnabled)}
              title="ТЗ §46.6: **жирный**, ссылки, `код` в тексте"
            >
              <div className="sp-knob" />
            </div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '-4px 0 10px' }}>
            Выключено по умолчанию: текст и переносы строк сохраняются как введены (§46).
          </p>
          <div className="sp-row">
            <span>Быстрые ответы</span>
            <div
              className={`sp-toggle ${quickRepliesEnabled ? 'sp-toggle--on' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => setQuickRepliesEnabled(!quickRepliesEnabled)}
            >
              <div className="sp-knob" />
            </div>
          </div>
          <div className="sp-row">
            <span>Toast при новом сообщении</span>
            <div
              className={`sp-toggle ${showInAppMessageToasts ? 'sp-toggle--on' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => setShowInAppMessageToasts(!showInAppMessageToasts)}
            >
              <div className="sp-knob" />
            </div>
          </div>
          <div className="sp-group-title">Группы</div>
          <div className="sp-row">
            <span>Уведомления</span>
            <div
              className={`sp-toggle ${notificationPrefs.groups.enabled ? 'sp-toggle--on' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() =>
                setNotificationPrefs({
                  ...notificationPrefs,
                  groups: { ...notificationPrefs.groups, enabled: !notificationPrefs.groups.enabled },
                })
              }
            >
              <div className="sp-knob" />
            </div>
          </div>
          <div className="sp-row">
            <span>Звук</span>
            <div
              className={`sp-toggle ${notificationPrefs.groups.sound ? 'sp-toggle--on' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() =>
                setNotificationPrefs({
                  ...notificationPrefs,
                  groups: { ...notificationPrefs.groups, sound: !notificationPrefs.groups.sound },
                })
              }
            >
              <div className="sp-knob" />
            </div>
          </div>
          <div className="sp-group-title">Каналы</div>
          <div className="sp-row">
            <span>Уведомления</span>
            <div
              className={`sp-toggle ${notificationPrefs.channels.enabled ? 'sp-toggle--on' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() =>
                setNotificationPrefs({
                  ...notificationPrefs,
                  channels: { ...notificationPrefs.channels, enabled: !notificationPrefs.channels.enabled },
                })
              }
            >
              <div className="sp-knob" />
            </div>
          </div>
          <div className="sp-group-title">Устройство</div>
          <div className="sp-row">
            <span>Вибрация (мобильные)</span>
            <div
              className={`sp-toggle ${(notificationPrefs.vibrate !== false) ? 'sp-toggle--on' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => {
                const cur = notificationPrefs.vibrate !== false;
                setNotificationPrefs({
                  ...notificationPrefs,
                  vibrate: !cur,
                });
              }}
            >
              <div className="sp-knob" />
            </div>
          </div>
          <div className="sp-group-title">Исключения</div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
            Без системного уведомления и без звука входящего для выбранных чатов
          </p>
          {muteListLoading ? (
            <div className="sp-row" style={{ cursor: 'default' }}>Загрузка…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {muteListChats.map((chat) => {
                const muted = notificationMutedChatIds.includes(chat.id);
                return (
                  <div key={chat.id} className="sp-row">
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {getChatDisplayName(chat)}
                    </span>
                    <div
                      className={`sp-toggle ${muted ? 'sp-toggle--on' : ''}`}
                      role="button"
                      tabIndex={0}
                      title={muted ? 'Уведомления выкл.' : 'Уведомления вкл.'}
                      onClick={() => toggleNotificationMutedChat(chat.id)}
                    >
                      <div className="sp-knob" />
                    </div>
                  </div>
                );
              })}
              {muteListChats.length === 0 && (
                <div className="sp-row" style={{ cursor: 'default', color: 'var(--text-secondary)' }}>
                  Нет чатов
                </div>
              )}
            </div>
          )}
        </div>
      </>}
      {section === 'privacy' && <>{renderBack('Конфиденциальность')}
        <div className="sp-content">
          <div
            className="sp-row sp-row--link"
            onClick={() =>
              setPrivacyPrefs({ ...privacyPrefs, phone: cycleVisibility(privacyPrefs.phone) })
            }
          >
            <span>Номер телефона</span>
            <span className="sp-val">{visibilityLabels[privacyPrefs.phone]}</span>
          </div>

          <div
            className="sp-row sp-row--link"
            onClick={() =>
              setPrivacyPrefs({
                ...privacyPrefs,
                lastSeen: cycleVisibility(privacyPrefs.lastSeen),
              })
            }
          >
            <span>Последняя активность</span>
            <span className="sp-val">{visibilityLabels[privacyPrefs.lastSeen]}</span>
          </div>

          <div
            className="sp-row sp-row--link"
            onClick={() =>
              setPrivacyPrefs({
                ...privacyPrefs,
                onlineStatus: cycleVisibility(privacyPrefs.onlineStatus),
              })
            }
          >
            <span>Кто видит, что я онлайн</span>
            <span className="sp-val">{visibilityLabels[privacyPrefs.onlineStatus]}</span>
          </div>

          <div className="sp-row">
            <span>Скрыть email в профиле</span>
            <div
              className={`sp-toggle ${privacyPrefs.hideEmail ? 'sp-toggle--on' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => setPrivacyPrefs({ ...privacyPrefs, hideEmail: !privacyPrefs.hideEmail })}
            >
              <div className="sp-knob" />
            </div>
          </div>
          <div className="sp-row">
            <span>Скрыть номер (резерв)</span>
            <div
              className={`sp-toggle ${privacyPrefs.hidePhone ? 'sp-toggle--on' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => setPrivacyPrefs({ ...privacyPrefs, hidePhone: !privacyPrefs.hidePhone })}
            >
              <div className="sp-knob" />
            </div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
            Полная фильтрация на стороне сервера для чужих клиентов — в следующих версиях API; сейчас настройки сохраняются локально.
          </p>

          <div
            className="sp-row sp-row--link"
            onClick={() =>
              setPrivacyPrefs({
                ...privacyPrefs,
                profilePhoto: cycleVisibility(privacyPrefs.profilePhoto),
              })
            }
          >
            <span>Фото профиля</span>
            <span className="sp-val">{visibilityLabels[privacyPrefs.profilePhoto]}</span>
          </div>

          <div
            className="sp-row sp-row--link"
            onClick={() =>
              setPrivacyPrefs({
                ...privacyPrefs,
                forwards: cycleVisibility(privacyPrefs.forwards),
              })
            }
          >
            <span>Пересылка сообщений</span>
            <span className="sp-val">{visibilityLabels[privacyPrefs.forwards]}</span>
          </div>

          <div
            className="sp-row sp-row--link"
            onClick={() =>
              setPrivacyPrefs({
                ...privacyPrefs,
                calls: cycleVisibility(privacyPrefs.calls),
              })
            }
          >
            <span>Звонки</span>
            <span className="sp-val">{visibilityLabels[privacyPrefs.calls]}</span>
          </div>

          <div
            className="sp-row sp-row--link"
            onClick={() =>
              setPrivacyPrefs({
                ...privacyPrefs,
                groupChannels: cycleVisibility(privacyPrefs.groupChannels),
              })
            }
          >
            <span>Группы и каналы</span>
            <span className="sp-val">{visibilityLabels[privacyPrefs.groupChannels]}</span>
          </div>
          <div className="sp-divider" />
          <div className="sp-group-title">Безопасность</div>
          <div
            className="sp-row sp-row--link"
            onClick={() => {
              // 2FA пока только UI: серверные endpoint'ы не добавляли в этом цикле.
              // Здесь мы просто оставляем настройку как "готовую точку расширения".
              alert('Двухэтапная аутентификация: интерфейс готов, серверная часть будет добавлена следующим пакетом.');
            }}
          >
            <span>Двухэтапная аутентификация</span>
            <ChevronRight size={16} />
          </div>

          <div className="sp-row sp-row--link" style={{ cursor: 'default' }}>
            <span>Активные сессии</span>
            <span className="sp-val">
              {sessionsLoading ? 'Загрузка...' : `${sessions.length} шт.`}
            </span>
          </div>

          {sessionsLoading ? (
            <div className="sp-row" style={{ cursor: 'default' }}>Получаем список...</div>
          ) : (
            <div className="sp-sessions">
              {sessions.length === 0 ? (
                <div className="sp-sessions-empty">Активных сессий нет</div>
              ) : (
                sessions.map((s) => (
                  <div key={s.id} className="sp-session-item">
                    <div className="sp-session-device">{s.device || 'Устройство'}</div>
                    <div className="sp-session-meta">{s.ip || '—'}</div>
                    <div className="sp-session-exp">
                      до {new Date(s.expires_at).toLocaleDateString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          <button
            className="sp-clear-btn"
            onClick={() => terminateAllSessions()}
            disabled={terminatingSessions}
            style={{ marginTop: 10 }}
          >
            {terminatingSessions ? 'Завершаем...' : 'Завершить все сессии'}
          </button>

          <div className="sp-row sp-row--link"><span>Заблокированные пользователи</span><span className="sp-val">0</span></div>
          <div className="sp-divider" />
          <div className="sp-row sp-row--danger"><span>Удалить аккаунт</span><Trash2 size={16} /></div>
        </div>
      </>}
      {section === 'friends' && <>{renderBack('Друзья')}
        <div className="sp-content">
          <p className="sp-hint" style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.45 }}>
            Истории в ленте видите <strong>только вы и принятые друзья</strong>. Без взаимного добавления в друзья чужие истории не отображаются.
          </p>
          {friendsLoading && <div className="sp-row">Загрузка…</div>}
          <div className="sp-group-title">Добавить по нику</div>
          <input
            className="sp-input"
            placeholder="Минимум 2 символа — поиск по имени/username"
            value={friendSearchQ}
            onChange={(e) => setFriendSearchQ(e.target.value)}
          />
          {friendSearchHits.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {friendSearchHits
                .filter((u) => u.id !== user?.id)
                .map((u) => {
                  const isFriend = friendsList.some((f) => f.id === u.id);
                  const pendingOut = friendsOutgoing.some((f) => f.id === u.id);
                  const pendingIn = friendsIncoming.some((f) => f.id === u.id);
                  return (
                    <div
                      key={u.id}
                      className="sp-row"
                      style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}
                    >
                      <Avatar
                        name={u.display_name}
                        size={36}
                        imageUrl={u.avatar_url ? normalizeMediaUrl(u.avatar_url) : undefined}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{u.display_name}</div>
                        {u.username ? <div style={{ fontSize: 12, opacity: 0.75 }}>@{u.username}</div> : null}
                      </div>
                      {isFriend ? (
                        <span className="sp-val">Уже в друзьях</span>
                      ) : pendingOut ? (
                        <span className="sp-val">Заявка отправлена</span>
                      ) : pendingIn ? (
                        <button
                          type="button"
                          className="sp-save"
                          onClick={async () => {
                            try {
                              await api.acceptFriendRequest(u.id);
                              window.dispatchEvent(new CustomEvent('dierchat:friends_changed'));
                              const [f, inc, out] = await Promise.all([
                                api.listFriends(),
                                api.listFriendRequestsIncoming(),
                                api.listFriendRequestsOutgoing(),
                              ]);
                              setFriendsList(f);
                              setFriendsIncoming(inc);
                              setFriendsOutgoing(out);
                            } catch (e) {
                              alert((e as Error).message || 'Ошибка');
                            }
                          }}
                        >
                          Принять заявку
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="sp-save"
                          onClick={async () => {
                            try {
                              await api.sendFriendRequest(u.id);
                              window.dispatchEvent(new CustomEvent('dierchat:friends_changed'));
                              const [f, inc, out] = await Promise.all([
                                api.listFriends(),
                                api.listFriendRequestsIncoming(),
                                api.listFriendRequestsOutgoing(),
                              ]);
                              setFriendsList(f);
                              setFriendsIncoming(inc);
                              setFriendsOutgoing(out);
                            } catch (e) {
                              alert((e as Error).message || 'Ошибка');
                            }
                          }}
                        >
                          В друзья
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
          <div className="sp-divider" style={{ margin: '16px 0' }} />
          <div className="sp-group-title">Входящие заявки</div>
          {friendsIncoming.length === 0 ? (
            <div className="sp-hint" style={{ fontSize: 13 }}>Нет заявок</div>
          ) : (
            friendsIncoming.map((p) => (
              <div key={p.id} className="sp-row" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <Avatar
                  name={p.display_name}
                  size={36}
                  imageUrl={p.avatar_url ? normalizeMediaUrl(p.avatar_url) : undefined}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{p.display_name}</div>
                  {p.username ? <div style={{ fontSize: 12, opacity: 0.75 }}>@{p.username}</div> : null}
                </div>
                <button
                  type="button"
                  className="sp-save"
                  onClick={async () => {
                    try {
                      await api.acceptFriendRequest(p.id);
                      window.dispatchEvent(new CustomEvent('dierchat:friends_changed'));
                      const [f, inc, out] = await Promise.all([
                        api.listFriends(),
                        api.listFriendRequestsIncoming(),
                        api.listFriendRequestsOutgoing(),
                      ]);
                      setFriendsList(f);
                      setFriendsIncoming(inc);
                      setFriendsOutgoing(out);
                    } catch (e) {
                      alert((e as Error).message || 'Ошибка');
                    }
                  }}
                >
                  Принять
                </button>
                <button
                  type="button"
                  className="sp-clear-btn"
                  onClick={async () => {
                    try {
                      await api.declineFriendRequest(p.id);
                      const [f, inc, out] = await Promise.all([
                        api.listFriends(),
                        api.listFriendRequestsIncoming(),
                        api.listFriendRequestsOutgoing(),
                      ]);
                      setFriendsList(f);
                      setFriendsIncoming(inc);
                      setFriendsOutgoing(out);
                    } catch (e) {
                      alert((e as Error).message || 'Ошибка');
                    }
                  }}
                >
                  Отклонить
                </button>
              </div>
            ))
          )}
          <div className="sp-group-title" style={{ marginTop: 16 }}>Исходящие</div>
          {friendsOutgoing.length === 0 ? (
            <div className="sp-hint" style={{ fontSize: 13 }}>Нет исходящих заявок</div>
          ) : (
            friendsOutgoing.map((p) => (
              <div key={p.id} className="sp-row" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <Avatar
                  name={p.display_name}
                  size={36}
                  imageUrl={p.avatar_url ? normalizeMediaUrl(p.avatar_url) : undefined}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{p.display_name}</div>
                  {p.username ? <div style={{ fontSize: 12, opacity: 0.75 }}>@{p.username}</div> : null}
                </div>
                <button
                  type="button"
                  className="sp-clear-btn"
                  onClick={async () => {
                    try {
                      await api.cancelFriendRequest(p.id);
                      const [f, inc, out] = await Promise.all([
                        api.listFriends(),
                        api.listFriendRequestsIncoming(),
                        api.listFriendRequestsOutgoing(),
                      ]);
                      setFriendsList(f);
                      setFriendsIncoming(inc);
                      setFriendsOutgoing(out);
                    } catch (e) {
                      alert((e as Error).message || 'Ошибка');
                    }
                  }}
                >
                  Отозвать
                </button>
              </div>
            ))
          )}
          <div className="sp-group-title" style={{ marginTop: 16 }}>Мои друзья</div>
          {friendsList.length === 0 ? (
            <div className="sp-hint" style={{ fontSize: 13 }}>Пока никого нет — отправьте заявку выше</div>
          ) : (
            friendsList.map((p) => (
              <div key={p.id} className="sp-row" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <Avatar
                  name={p.display_name}
                  size={36}
                  imageUrl={p.avatar_url ? normalizeMediaUrl(p.avatar_url) : undefined}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{p.display_name}</div>
                  {p.username ? <div style={{ fontSize: 12, opacity: 0.75 }}>@{p.username}</div> : null}
                </div>
                <button
                  type="button"
                  className="sp-clear-btn"
                  onClick={async () => {
                    try {
                      await api.removeFriend(p.id);
                      window.dispatchEvent(new CustomEvent('dierchat:friends_changed'));
                      const [f, inc, out] = await Promise.all([
                        api.listFriends(),
                        api.listFriendRequestsIncoming(),
                        api.listFriendRequestsOutgoing(),
                      ]);
                      setFriendsList(f);
                      setFriendsIncoming(inc);
                      setFriendsOutgoing(out);
                    } catch (e) {
                      alert((e as Error).message || 'Ошибка');
                    }
                  }}
                >
                  Удалить
                </button>
              </div>
            ))
          )}
        </div>
      </>}
      {section === 'appearance' && <>{renderBack('Оформление')}
        <div className="sp-content">
          <div className="sp-group-title">Тема</div>
          <div className="sp-row">
            <span>Как в системе (светлая/тёмная)</span>
            <div
              className={`sp-toggle ${followSystemTheme ? 'sp-toggle--on' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => setFollowSystemTheme(!followSystemTheme)}
            >
              <div className="sp-knob" />
            </div>
          </div>
          <div className="sp-theme-row">
            <button
              className={`sp-theme-btn ${theme === 'dark' ? 'sp-theme-btn--active' : ''}`}
              onClick={() => {
                setFollowSystemTheme(false);
                setTheme('dark');
              }}
            >
              <Moon size={20} /> Тёмная
            </button>
            <button
              className={`sp-theme-btn ${theme === 'light' ? 'sp-theme-btn--active' : ''}`}
              onClick={() => {
                setFollowSystemTheme(false);
                setTheme('light');
              }}
            >
              <Sun size={20} /> Светлая
            </button>
          </div>
          <div className="sp-group-title">Акцентный цвет</div>
          <div className="sp-colors">
            {ACCENT_COLORS.map(c => (
              <button key={c.value} className={`sp-color ${accentColor === c.value ? 'sp-color--active' : ''}`}
                style={{ background: c.value }} onClick={() => applyAccent(c.value)} title={c.name}>
                {accentColor === c.value && <Check size={16} color="#fff" />}
              </button>
            ))}
          </div>
          <div className="sp-group-title">Фон чата</div>
          <div className="sp-colors">
            {CHAT_BACKGROUNDS.map(b => (
              <button key={b.value || 'default'} className={`sp-color sp-color--bg ${chatBg === b.value ? 'sp-color--active' : ''}`}
                style={{ background: b.value || 'var(--bg-chat)' }} onClick={() => applyBg(b.value)} title={b.name}>
                {chatBg === b.value && <Check size={16} color="#fff" />}
              </button>
            ))}
          </div>
          <div className="sp-group-title">Размер шрифта</div>
          <div className="sp-font-sizes">
            {FONT_SIZES.map(s => (
              <button key={s} className={`sp-font-btn ${fontSize === s ? 'sp-font-btn--active' : ''}`}
                onClick={() => applyFontSize(s)}>{s}</button>
            ))}
          </div>

          <div className="sp-group-title">Скругление пузырей</div>
          <div className="sp-font-sizes">
            {BUBBLE_RADII.map((r) => (
              <button
                key={r}
                className={`sp-font-btn ${bubbleRadius === r ? 'sp-font-btn--active' : ''}`}
                onClick={() => setBubbleRadius(r)}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="sp-group-title">Энергосбережение</div>
          <div className="sp-row">
            <span>Жидкое стекло (Liquid Glass)</span>
            <div
              className={`sp-toggle ${liquidGlassEnabled ? 'sp-toggle--on' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => setLiquidGlassEnabled(!liquidGlassEnabled)}
            >
              <div className="sp-knob" />
            </div>
          </div>
          <div className="sp-row" style={{ cursor: 'default', opacity: 0.85, fontSize: 13, marginTop: -6 }}>
            <span>
              Размытие панелей (backdrop-filter). Выключите на слабом устройстве или чтобы снизить расход батареи.
            </span>
          </div>
          <div className="sp-group-title">Интерфейс</div>
          <div className="sp-row">
            <span>Компактный сайдбар</span>
            <div
              className={`sp-toggle ${compactSidebar ? 'sp-toggle--on' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => setCompactSidebar(!compactSidebar)}
            >
              <div className="sp-knob" />
            </div>
          </div>
          <div className="sp-row">
            <span>Звук при отправке</span>
            <div
              className={`sp-toggle ${sendSound ? 'sp-toggle--on' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => setSendSound(!sendSound)}
            >
              <div className="sp-knob" />
            </div>
          </div>
        </div>
      </>}
      {section === 'browser' && <>{renderBack('Браузер')}
        <div className="sp-content">
          <div className="sp-group-title">Ссылки из чата</div>
          <div className="sp-row">
            <span>Открывать во встроенном браузере</span>
            <div
              className={`sp-toggle ${inAppBrowserEnabled ? 'sp-toggle--on' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => setInAppBrowserEnabled(!inAppBrowserEnabled)}
            >
              <div className="sp-knob" />
            </div>
          </div>
          <div className="sp-row" style={{ cursor: 'default', opacity: 0.85, fontSize: 13, marginTop: -6 }}>
            <span>
              Если выключено — ссылки открываются в системном браузере (или во вкладке в веб-версии).
            </span>
          </div>
          <div className="sp-group-title">Дополнительно (§28.6)</div>
          <div className="sp-row" style={{ opacity: 0.65 }}>
            <span>Блокировка трекеров</span>
            <div
              className={`sp-toggle ${browserBlockTrackers ? 'sp-toggle--on' : ''}`}
              role="button"
              tabIndex={0}
              title="Скоро"
              onClick={() => setBrowserBlockTrackers(!browserBlockTrackers)}
            >
              <div className="sp-knob" />
            </div>
          </div>
          <div className="sp-row">
            <span>Очищать историю при закрытии</span>
            <div
              className={`sp-toggle ${browserClearHistoryOnClose ? 'sp-toggle--on' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => setBrowserClearHistoryOnClose(!browserClearHistoryOnClose)}
            >
              <div className="sp-knob" />
            </div>
          </div>
          <div className="sp-row" style={{ opacity: 0.65 }}>
            <span>Разрешить загрузки</span>
            <div
              className={`sp-toggle ${browserAllowDownloads ? 'sp-toggle--on' : ''}`}
              role="button"
              tabIndex={0}
              title="Скоро"
              onClick={() => setBrowserAllowDownloads(!browserAllowDownloads)}
            >
              <div className="sp-knob" />
            </div>
          </div>
          <div className="sp-row" style={{ cursor: 'default', opacity: 0.75, fontSize: 12 }}>
            <span>Блокировка трекеров и политика загрузок — в разработке; переключатели сохраняются для будущих версий.</span>
          </div>
        </div>
      </>}
      {section === 'language' && <>{renderBack('Язык')}
        <div className="sp-content">
          {[
            { code: 'ru' as const, flag: '🇷🇺', name: 'Русский' },
            { code: 'en' as const, flag: '🇬🇧', name: 'English' },
            { code: 'kk' as const, flag: '🇰🇿', name: 'Қазақ тілі' },
            { code: 'az' as const, flag: '🇦🇿', name: 'Azərbaycanca' },
            { code: 'hy' as const, flag: '🇦🇲', name: 'Հայերեն' },
            { code: 'tr' as const, flag: '🇹🇷', name: 'Türkçe' },
            { code: 'be' as const, flag: '🇧🇾', name: 'Беларуская' },
          ].map(l => (
            <div key={l.code} className={`sp-row sp-row--link ${language === l.code ? 'sp-row--active' : ''}`}
              onClick={() => setLanguage(l.code)}>
              <span>{l.flag} {l.name}</span>
              {language === l.code && <Check size={16} className="sp-check" />}
            </div>
          ))}
        </div>
      </>}
      {section === 'devices' && (
        <>
          <DevicesSection
            cameras={cameras}
            microphones={microphones}
            speakers={speakers}
            savedPrefs={devicePrefs}
            onApply={(prefs) => setDevicePrefs(prefs)}
            renderBack={renderBack}
            title={t('devices')}
          />
          <div className="sp-content" style={{ marginTop: 8 }}>
            <div className="sp-group-title">Звонки</div>
            <p className="sp-hint" style={{ margin: '0 0 12px', fontSize: 12, opacity: 0.8, lineHeight: 1.45 }}>
              Громкость собеседников в личных и групповых звонках — ползунки в окне звонка. Здесь — общие переключатели
              (обработка звука на стороне клиента дорабатывается).
            </p>
            <div
              className="sp-row sp-row--link"
              onClick={() =>
                setCallAudioPrefs({ normalizeVolume: !callAudioPrefs.normalizeVolume })
              }
            >
              <span>Нормализация громкости</span>
              <div className={`sp-toggle ${callAudioPrefs.normalizeVolume ? 'sp-toggle--on' : ''}`}>
                <div className="sp-knob" />
              </div>
            </div>
            <div
              className="sp-row sp-row--link"
              onClick={() =>
                setCallAudioPrefs({ prioritizeSpeaker: !callAudioPrefs.prioritizeSpeaker })
              }
            >
              <span>Приоритетный звук спикера</span>
              <div className={`sp-toggle ${callAudioPrefs.prioritizeSpeaker ? 'sp-toggle--on' : ''}`}>
                <div className="sp-knob" />
              </div>
            </div>
            <div
              className="sp-row sp-row--link"
              onClick={() =>
                setCallAudioPrefs({ noiseSuppressionCalls: !callAudioPrefs.noiseSuppressionCalls })
              }
            >
              <span>Шумоподавление в звонках</span>
              <div className={`sp-toggle ${callAudioPrefs.noiseSuppressionCalls ? 'sp-toggle--on' : ''}`}>
                <div className="sp-knob" />
              </div>
            </div>
          </div>
        </>
      )}
      {section === 'storage' && <>{renderBack('Данные и память')}
        <div className="sp-content">
          <div className="sp-group-title">Автозагрузка</div>
          <div className="sp-row"><span>Фото</span><div className="sp-toggle sp-toggle--on"><div className="sp-knob" /></div></div>
          <div className="sp-row"><span>Видео</span><div className="sp-toggle"><div className="sp-knob" /></div></div>
          <div className="sp-row"><span>Файлы</span><div className="sp-toggle"><div className="sp-knob" /></div></div>
          <div className="sp-divider" />
          <div className="sp-group-title">Хранилище</div>
          <div className="sp-row"><span>Размер кэша</span><span className="sp-val">~0 МБ</span></div>
          <button className="sp-clear-btn" onClick={clearClientCache} disabled={clearingCache}>
            {clearingCache ? 'Очистка...' : 'Очистить кэш'}
          </button>
        </div>
      </>}
      {section === 'about' && <>{renderBack('О программе')}
        <div className="sp-content sp-about">
          <div className="sp-about-logo">DierCHAT</div>
          <p className="sp-about-ver">Версия 1.0.0</p>
          <p className="sp-about-text">Свободный мессенджер для России</p>
          <p className="sp-about-text">Безопасный. Быстрый. Независимый.</p>
          <div className="sp-about-info">
            <p>Шифрование: E2E (AES-256 + X25519)</p>
            <p>Серверы: Россия (242-ФЗ)</p>
            <p>Без Google Services / Firebase</p>
            <p>Открытый протокол</p>
          </div>
        </div>
      </>}
      {section === 'support' && <>{renderBack('Поддержка')}
        <div className="sp-content sp-about">
          <p className="sp-about-text">По всем вопросам обращайтесь:</p>
          <p className="sp-about-text" style={{ marginTop: 12 }}>Почта: dier.groups@gmail.com</p>
          <p className="sp-about-text" style={{ marginTop: 4 }}>Telegram: dierstore</p>
          <p className="sp-about-text" style={{ marginTop: 8, fontSize: 13, color: 'var(--text-secondary)' }}>Ответ в течение 24 часов</p>
        </div>
      </>}
      {section === 'donations' && <>{renderBack('Пожертвования')}
        <div className="sp-content sp-about">
          <p className="sp-about-text">Поддержите развитие DierCHAT</p>
          <p className="sp-about-text" style={{ marginTop: 12 }}>Почта: dier.groups@gmail.com</p>
          <p className="sp-about-text" style={{ marginTop: 4 }}>Telegram: dierstore</p>
        </div>
      </>}
      {section === 'ideas' && <>{renderBack('Идеи')}
        <div className="sp-about-text" style={{ padding: 12 }}>
          <p>Предложите улучшение: dier.groups@gmail.com или @dierstore</p>
        </div>
      </>}
      {section === 'moderation' && <>{renderBack('Модерация')}
        <div className="sp-content">
          <div className="sp-group-title">Жалобы</div>
          {modLoading ? (
            <div className="sp-row" style={{ cursor: 'default' }}>Загрузка…</div>
          ) : modReports.length === 0 ? (
            <div className="sp-row" style={{ cursor: 'default', color: 'var(--text-secondary)' }}>
              Нет записей или нет доступа
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {modReports.map((r) => (
                <div
                  key={r.id}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: 'var(--bg-secondary)',
                    fontSize: 13,
                  }}
                >
                  <div className="sp-mono" style={{ fontSize: 12, marginBottom: 4 }}>
                    {r.target_type} · {r.target_id}
                  </div>
                  <div>{r.reason || '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {r.created_at}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </>}
      {section === 'broadcast' && <>{renderBack(t('broadcast'))}
        <div className="sp-content">
          <p className="sp-broadcast-desc">{t('broadcast_desc')}</p>
          <div className="sp-group-title">{t('broadcast_select_chats')}</div>
          {broadcastLoadingChats ? (
            <div className="sp-row" style={{ cursor: 'default' }}>{t('loading')}</div>
          ) : (
            <div className="sp-broadcast-chats">
              {broadcastChats.map((chat) => (
                <label key={chat.id} className="sp-broadcast-chat">
                  <input
                    type="checkbox"
                    checked={broadcastSelected.has(chat.id)}
                    onChange={() => toggleBroadcastChat(chat.id)}
                  />
                  <span>{getChatDisplayName(chat)}</span>
                </label>
              ))}
              {broadcastChats.length === 0 && (
                <div className="sp-broadcast-empty">{t('chats')}: 0</div>
              )}
            </div>
          )}
          <div className="sp-group-title">{t('broadcast_message')}</div>
          <textarea
            className="sp-textarea"
            value={broadcastText}
            onChange={(e) => setBroadcastText(e.target.value)}
            placeholder={t('broadcast_message')}
            rows={4}
          />
          <div className="sp-theme-row" style={{ marginTop: 8, marginBottom: 12 }}>
            <button
              className={`sp-theme-btn ${broadcastContentType === 'text' ? 'sp-theme-btn--active' : ''}`}
              onClick={() => setBroadcastContentType('text')}
            >
              {t('broadcast_content_text')}
            </button>
            <button
              className={`sp-theme-btn ${broadcastContentType === 'code' ? 'sp-theme-btn--active' : ''}`}
              onClick={() => setBroadcastContentType('code')}
            >
              {t('broadcast_content_code')}
            </button>
          </div>
          <button
            className="sp-save"
            onClick={sendBroadcast}
            disabled={broadcastSending || broadcastSelected.size === 0 || !broadcastText.trim()}
          >
            {broadcastSending ? t('broadcast_sending') : t('broadcast_send')}
          </button>
        </div>
      </>}
      <AvatarCropModal
        open={cropOpen}
        imageSrc={cropSrc}
        onClose={() => {
          setCropOpen(false);
          setCropSrc(null);
        }}
        onConfirm={(blob) => {
          setAvatarFile(new File([blob], 'avatar.png', { type: 'image/png' }));
          setAvatarPreview(URL.createObjectURL(blob));
          setCropOpen(false);
          setCropSrc(null);
        }}
      />
    </div>
  );

  const menuItems: { section: Section; icon: React.ReactNode; label: string }[] = [
    { section: 'profile', icon: <UserIcon size={20} />, label: t('profile') },
    { section: 'notifications', icon: <Bell size={20} />, label: t('notifications') },
    { section: 'privacy', icon: <Lock size={20} />, label: t('privacy') },
    { section: 'friends', icon: <UserPlus size={20} />, label: 'Друзья' },
    { section: 'appearance', icon: <Palette size={20} />, label: t('appearance') },
    { section: 'browser', icon: <AppWindow size={20} />, label: 'Браузер' },
    { section: 'storage', icon: <Monitor size={20} />, label: t('storage') },
    { section: 'devices', icon: <Video size={20} />, label: t('devices') },
    { section: 'language', icon: <Globe size={20} />, label: t('language_label') },
    { section: 'about', icon: <Info size={20} />, label: t('about') },
    { section: 'broadcast', icon: <Megaphone size={20} />, label: t('broadcast') },
    { section: 'moderation', icon: <Shield size={20} />, label: 'Модерация' },
    { section: 'support', icon: <HelpCircle size={20} />, label: t('support') },
    { section: 'donations', icon: <Heart size={20} />, label: t('donations') },
    { section: 'ideas', icon: <Lightbulb size={20} />, label: t('ideas') },
  ];
  const q = searchQuery.trim().toLowerCase();
  const filteredItems = q ? menuItems.filter((i) => i.label.toLowerCase().includes(q)) : menuItems;

  // Main menu
  return (
    <div className="sp">
      <div className="sp-header">
        <button className="sp-back" onClick={onClose}><ArrowLeft size={18} /> {t('back')}</button>
        <h2 className="sp-title">{t('settings')}</h2>
      </div>
      <div className="sp-content">
        <div className="sp-search-wrap">
          <input
            type="text"
            className="sp-input sp-search"
            placeholder={t('search_settings')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="sp-user-card" onClick={() => setSection('profile')}>
          <Avatar name={user?.display_name || 'U'} size={64} />
          <div className="sp-user-info">
            <div className="sp-user-name">{user?.display_name}</div>
            <div className="sp-user-phone">{user?.phone}</div>
            {user?.username && <div className="sp-user-uname">@{user.username}</div>}
          </div>
          <ChevronRight size={18} className="sp-chevron" />
        </div>
        <div className="sp-menu">
          {filteredItems.map((item) => (
            <div key={item.section} className="sp-menu-item" onClick={() => setSection(item.section)}>
              {item.icon} {item.label} <ChevronRight size={16} className="sp-chevron" />
            </div>
          ))}
          {filteredItems.length === 0 && <div className="sp-menu-item" style={{ cursor: 'default', color: 'var(--text-secondary)' }}>Ничего не найдено</div>}
          <div className="sp-divider" />
          <div className="sp-menu-item sp-menu-item--danger" onClick={logout}><LogOut size={20} /> {t('logout')}</div>
        </div>
      </div>
    </div>
  );
}

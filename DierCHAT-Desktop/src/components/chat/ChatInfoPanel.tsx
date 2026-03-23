import { useState, useEffect, useCallback } from 'react';
import { api } from '@/api/client';
import { useStore } from '@/store';
import type { User, Message } from '@/api/client';
import { Avatar } from '@/components/common/Avatar';
import {
  X, Bell, BellOff, Image, Link2, Mic, Search, MessageCircle,
  UserPlus, Shield, Crown, Users, Star, ExternalLink, Download, File, Pencil, Timer
} from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useOpenHttpLink } from '@/hooks/useOpenHttpLink';
import { normalizeMediaUrl } from '@/lib/publicApiUrl';
import './ChatInfoPanel.css';

type Tab = 'media' | 'favorites' | 'links' | 'voice' | 'members';
type ChatData = {
  id: string;
  type: number;
  title?: string;
  description?: string;
  owner_id: string;
  member_count: number;
  is_muted: boolean;
  slow_mode_seconds?: number;
  discussion_chat_id?: string;
  peer_user_id?: string;
  peer_display_name?: string;
  peer_avatar_url?: string;
};

export function ChatInfoPanel({
  chatId,
  onClose,
  onOpenChat,
  defaultTab,
}: {
  chatId: string;
  onClose: () => void;
  /** Открыть другой чат (например обсуждение канала) */
  onOpenChat?: (chatId: string) => void;
  defaultTab?: Tab;
}) {
  const openHttpLink = useOpenHttpLink();
  const user = useStore((s) => s.user);
  const [chat, setChat] = useState<ChatData | null>(null);
  const [chatLoading, setChatLoading] = useState(true);
  const [members, setMembers] = useState<{ user_id: string; role: number }[]>([]);
  const [memberUsers, setMemberUsers] = useState<Record<string, User>>({});
  const [tab, setTab] = useState<Tab>(defaultTab ?? 'media');
  const [mediaItems, setMediaItems] = useState<Message[]>([]);
  const [favorites, setFavorites] = useState<Message[]>([]);
  const [links, setLinks] = useState<Message[]>([]);
  const [voices, setVoices] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const [slowMode, setSlowMode] = useState(0);
  const [slowModeBusy, setSlowModeBusy] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [addMemberResults, setAddMemberResults] = useState<User[]>([]);
  const [showAddMember, setShowAddMember] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [discBusy, setDiscBusy] = useState(false);

  const toArr = (v: unknown): Message[] => (Array.isArray(v) ? v : []);

  const loadTabData = useCallback(async (t: Tab) => {
    if (!chatId) return;
    setLoading(true);
    try {
      if (t === 'media') {
        const data = await api.getChatMedia(chatId, '', 50);
        setMediaItems(toArr(data));
      } else if (t === 'favorites') {
        const data = await api.getChatFavorites(chatId, 50);
        setFavorites(toArr(data));
      } else if (t === 'links') {
        const data = await api.getChatLinks(chatId, 50);
        setLinks(toArr(data));
      } else if (t === 'voice') {
        const data = await api.getChatVoices(chatId, 50);
        setVoices(toArr(data));
      }
    } catch {
      if (t === 'media') setMediaItems([]);
      else if (t === 'favorites') setFavorites([]);
      else if (t === 'links') setLinks([]);
      else if (t === 'voice') setVoices([]);
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  useEffect(() => {
    if (!chatId) return;
    let cancelled = false;
    setChatLoading(true);
    setMemberUsers({});
    api.invalidateChatsCache();

    (async () => {
      let loaded: ChatData | null = null;
      try {
        const chats = await api.getChats();
        if (cancelled) return;
        const c = chats.find((ch: any) => ch.id === chatId) as ChatData | undefined;
        if (c) {
          loaded = c;
          setChat(c);
          setSlowMode(c.slow_mode_seconds ?? 0);
          setIsMuted(!!c.is_muted);
          if ((c as any).invite_link) setInviteLink((c as any).invite_link);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setChatLoading(false);
      }

      const resolveMembers = (raw: { user_id: string; role: number }[]) => {
        let list = raw.filter((m) => !!m?.user_id);
        if (
          list.length === 0 &&
          loaded &&
          loaded.type === 0 &&
          loaded.peer_user_id &&
          user?.id
        ) {
          list = [
            { user_id: user.id, role: 0 },
            { user_id: loaded.peer_user_id, role: 0 },
          ];
        }
        if (cancelled) return;
        setMembers(list);
        list.forEach((mem) => {
          api.getUser(mem.user_id).then((u: User) => {
            if (!cancelled) setMemberUsers((prev) => ({ ...prev, [u.id]: u }));
          }).catch(() => {});
        });
      };

      try {
        const m = await api.getMembers(chatId);
        if (cancelled) return;
        const list = Array.isArray(m) ? m : (m as any)?.data || [];
        resolveMembers(list);
      } catch {
        resolveMembers([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chatId, user?.id]);

  useEffect(() => {
    if (tab !== 'members') loadTabData(tab);
  }, [tab, loadTabData]);

  useEffect(() => {
    if (!showAddMember || addMemberSearch.length < 2) { setAddMemberResults([]); return; }
    const t = setTimeout(() => {
      api.searchUsers(addMemberSearch).then((u) => setAddMemberResults(u.slice(0, 10))).catch(() => setAddMemberResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [addMemberSearch, showAddMember]);

  if (chatLoading && !chat) {
    return (
      <div className="cip">
        <div className="cip-header">
          <h3>Информация</h3>
          <button className="cip-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="cip-content" style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>Загрузка...</div>
      </div>
    );
  }
  if (!chat) return null;

  const isGroup = chat.type === 1;
  const isChannel = chat.type === 2;
  const title =
    chat.type === 0 && chat.peer_display_name?.trim()
      ? chat.peer_display_name.trim()
      : chat.title || 'Личный чат';
  const myMember = members.find((m) => m?.user_id === user?.id);
  const canRename = (isGroup || isChannel) && myMember && (myMember.role === 2 || myMember.role === 1);

  const TABS: { key: Tab; label: string; icon: JSX.Element }[] = [
    { key: 'media', label: 'Медиа', icon: <Image size={16} /> },
    { key: 'favorites', label: 'Избранное', icon: <Star size={16} /> },
    { key: 'links', label: 'Ссылки', icon: <Link2 size={16} /> },
    { key: 'voice', label: 'Голосовые', icon: <Mic size={16} /> },
    { key: 'members', label: 'Участники', icon: <Users size={16} /> },
  ];

  return (
    <div className="cip">
      <div className="cip-header">
        <h3>Информация</h3>
        <button className="cip-close" onClick={onClose}><X size={18} /></button>
      </div>

      <div className="cip-content">
        <div className="cip-profile">
          <Avatar
            name={title}
            size={80}
            imageUrl={
              chat.type === 0 && chat.peer_avatar_url?.trim()
                ? normalizeMediaUrl(chat.peer_avatar_url.trim())
                : undefined
            }
          />
          {editingTitle ? (
            <div className="cip-rename-wrap">
              <input
                className="cip-rename-input"
                value={editTitleValue}
                onChange={(e) => setEditTitleValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (document.getElementById('cip-rename-save') as HTMLButtonElement)?.click()}
                autoFocus
              />
              <div className="cip-rename-actions">
                <button id="cip-rename-save" className="cip-rename-btn" disabled={renameBusy || !editTitleValue.trim()}
                  onClick={async () => {
                    if (!editTitleValue.trim()) return;
                    setRenameBusy(true);
                    try {
                      await api.updateChatTitle(chatId, editTitleValue.trim());
                      setChat((c) => (c ? { ...c, title: editTitleValue.trim() } : c));
                      setEditingTitle(false);
                      window.dispatchEvent(new CustomEvent('dierchat:chats_changed'));
                    } finally { setRenameBusy(false); }
                  }}>
                  Сохранить
                </button>
                <button className="cip-rename-btn cip-rename-cancel" onClick={() => { setEditingTitle(false); setEditTitleValue(title); }}>
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <h2 className="cip-name">
              {title}
              {canRename && (
                <button className="cip-edit-title" onClick={() => { setEditTitleValue(title); setEditingTitle(true); }} title="Переименовать">
                  <Pencil size={14} />
                </button>
              )}
            </h2>
          )}
          {chat.description && <p className="cip-desc">{chat.description}</p>}
          <p className="cip-meta">
            {isGroup && `${chat.member_count || members.length} участников`}
            {isChannel && `${chat.member_count || 0} подписчиков`}
            {!isGroup && !isChannel && 'Личные сообщения'}
          </p>
          {isChannel && onOpenChat && (
            <div className="cip-discussion-actions">
              {chat.discussion_chat_id ? (
                <button
                  type="button"
                  className="cip-discussion-btn"
                  onClick={() => onOpenChat(chat.discussion_chat_id!)}
                >
                  <MessageCircle size={18} />
                  Открыть обсуждение
                </button>
              ) : canRename ? (
                <button
                  type="button"
                  className="cip-discussion-btn"
                  disabled={discBusy}
                  onClick={async () => {
                    setDiscBusy(true);
                    try {
                      const r = await api.ensureChannelDiscussion(chatId);
                      setChat((c) => (c ? { ...c, discussion_chat_id: r.discussion_chat_id } : c));
                      window.dispatchEvent(new CustomEvent('dierchat:chats_changed'));
                    } catch {
                      /* ignore */
                    } finally {
                      setDiscBusy(false);
                    }
                  }}
                >
                  <MessageCircle size={18} />
                  {discBusy ? 'Создание…' : 'Создать чат обсуждения'}
                </button>
              ) : null}
            </div>
          )}
        </div>

        <div className="cip-actions">
          <button
            className="cip-action"
            onClick={async () => {
              try {
                await api.muteChat(chatId, !isMuted);
                setIsMuted(!isMuted);
                setChat((c) => c ? { ...c, is_muted: !isMuted } : c);
                window.dispatchEvent(new CustomEvent('dierchat:chats_changed'));
              } catch {}
            }}
          >
            {isMuted ? <BellOff size={18} /> : <Bell size={18} />}
            {isMuted ? 'Включить' : 'Без звука'}
          </button>
          <button className="cip-action" onClick={onClose}>
            <Search size={18} /> Поиск
          </button>
          {(isGroup || isChannel) && (
            <button className="cip-action" onClick={() => setShowAddMember(true)}>
              <UserPlus size={18} /> Добавить
            </button>
          )}
          {(isGroup || isChannel) && canRename && (
            <button
              className="cip-action"
              onClick={async () => {
                try {
                  const res = await api.generateInviteLink(chatId);
                  setInviteLink(res.invite_link);
                  navigator.clipboard.writeText(res.invite_link);
                  alert(`Ссылка скопирована: ${res.invite_link}`);
                } catch {}
              }}
            >
              <Link2 size={18} /> Ссылка
            </button>
          )}
        </div>

        {inviteLink && (isGroup || isChannel) && (
          <div className="cip-invite-link">
            <span className="cip-invite-label">Ссылка-приглашение:</span>
            <span className="cip-invite-code" onClick={() => { navigator.clipboard.writeText(inviteLink); }}>{inviteLink}</span>
          </div>
        )}

        {(isGroup || isChannel) && canRename && (
          <div className="cip-slow-mode">
            <div className="cip-slow-mode-header">
              <Timer size={16} />
              <span>Медленный режим</span>
            </div>
            <div className="cip-slow-mode-body">
              <select
                className="cip-slow-mode-select"
                value={slowMode}
                disabled={slowModeBusy}
                onChange={async (e) => {
                  const val = Number(e.target.value);
                  setSlowModeBusy(true);
                  try {
                    await api.setSlowMode(chatId, val);
                    setSlowMode(val);
                    setChat((c) => c ? { ...c, slow_mode_seconds: val } : c);
                  } catch { /* ignore */ }
                  finally { setSlowModeBusy(false); }
                }}
              >
                <option value={0}>Выключен</option>
                <option value={10}>10 секунд</option>
                <option value={30}>30 секунд</option>
                <option value={60}>1 минута</option>
                <option value={300}>5 минут</option>
                <option value={900}>15 минут</option>
                <option value={3600}>1 час</option>
              </select>
              <span className="cip-slow-mode-hint">
                {slowMode > 0
                  ? `Участники могут отправлять сообщение раз в ${slowMode >= 60 ? `${Math.floor(slowMode / 60)} мин` : `${slowMode} сек`}`
                  : 'Ограничений нет'}
              </span>
            </div>
          </div>
        )}

        <div className="cip-tabs">
          {TABS.map(t => (
            <button key={t.key} className={`cip-tab ${tab === t.key ? 'cip-tab--active' : ''}`}
              onClick={() => setTab(t.key)}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div className="cip-tab-content">
          {tab === 'members' && (
            <div className="cip-members">
              {members
                .filter((m) => !!m?.user_id)
                .map((m) => {
                const u = memberUsers[m.user_id];
                return (
                  <div key={m.user_id} className="cip-member">
                    <Avatar name={u?.display_name || '?'} size={40} />
                    <div className="cip-member-info">
                      <span className="cip-member-name">
                        {u?.display_name || m.user_id.slice(0, 8)}
                        {m.role === 2 && <Crown size={12} className="cip-member-badge" />}
                        {m.role === 1 && <Shield size={12} className="cip-member-badge" />}
                      </span>
                      <span className="cip-member-status">
                        {u?.online ? 'в сети' : u?.last_seen ? 'был(а) недавно' : 'не в сети'}
                      </span>
                    </div>
                    {myMember?.role === 2 && m.role !== 2 && (
                      <button
                        className="cip-member-role-btn"
                        title={m.role === 1 ? 'Снять админа' : 'Назначить админом'}
                        onClick={async () => {
                          const newRole = m.role === 1 ? 0 : 1;
                          try {
                            await api.setMemberRole(chatId, m.user_id, newRole);
                            setMembers(prev => prev.map(mm => mm.user_id === m.user_id ? { ...mm, role: newRole } : mm));
                          } catch { /* ignore */ }
                        }}
                      >
                        {m.role === 1 ? <Shield size={16} /> : <Shield size={16} style={{ opacity: 0.4 }} />}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {tab === 'media' && (
            <div className="cip-tab-body">
              {loading ? <div className="cip-empty">Загрузка...</div> : mediaItems.length === 0 ? (
                <div className="cip-empty">Фото, видео и файлы из этого чата появятся здесь.</div>
              ) : (
                <div className="cip-media-grid">
                  {mediaItems.map(m => (
                    <a
                      key={m.id}
                      href={m.text}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cip-media-item"
                      onClick={(e) => {
                        if (m.text && /^https?:\/\//i.test(m.text)) openHttpLink(m.text, e);
                      }}
                    >
                      {(m.type === 1 || m.type === 2) ? (
                        <img src={m.text} alt="" />
                      ) : (
                        <div className="cip-media-file"><File size={24} /><span>{m.text?.split('/').pop() || 'Файл'}</span></div>
                      )}
                      <span className="cip-media-time">{format(new Date(m.created_at), 'd MMM', { locale: ru })}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
          {tab === 'favorites' && (
            <div className="cip-tab-body">
              {loading ? <div className="cip-empty">Загрузка...</div> : favorites.length === 0 ? (
                <div className="cip-empty">Нажмите на сообщение и выберите «В избранное», чтобы сохранить его здесь.</div>
              ) : (
                <div className="cip-list">
                  {favorites.map(m => (
                    <div key={m.id} className="cip-fav-item">
                      <p>{m.text || '(медиа)'}</p>
                      <span className="cip-fav-time">{format(new Date(m.created_at), 'd MMM HH:mm', { locale: ru })}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {tab === 'links' && (
            <div className="cip-tab-body">
              {loading ? <div className="cip-empty">Загрузка...</div> : links.length === 0 ? (
                <div className="cip-empty">Ссылки из переписки появятся здесь.</div>
              ) : (
                <div className="cip-list">
                  {links.map(m => {
                    const urlMatch = m.text?.match(/https?:\/\/[^\s]+/);
                    const url = urlMatch ? urlMatch[0] : m.text;
                    return (
                      <a
                        key={m.id}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cip-link-item"
                        onClick={(e) => url && openHttpLink(url, e)}
                      >
                        <ExternalLink size={14} />
                        <span className="cip-link-url">{url?.slice(0, 50)}{(url?.length || 0) > 50 ? '...' : ''}</span>
                        <span className="cip-link-time">{format(new Date(m.created_at), 'd MMM', { locale: ru })}</span>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {tab === 'voice' && (
            <div className="cip-tab-body">
              {loading ? <div className="cip-empty">Загрузка...</div> : voices.length === 0 ? (
                <div className="cip-empty">Голосовые сообщения появятся здесь.</div>
              ) : (
                <div className="cip-list">
                  {voices.map(m => (
                    <div key={m.id} className="cip-voice-item">
                      <Mic size={18} />
                      <a
                        href={m.text}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => m.text && openHttpLink(m.text, e)}
                      >
                        Слушать
                      </a>
                      <span className="cip-voice-time">{format(new Date(m.created_at), 'd MMM HH:mm', { locale: ru })}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showAddMember && (
        <div className="cip-modal-overlay" onClick={() => { setShowAddMember(false); setAddMemberSearch(''); }}>
          <div className="cip-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cip-modal-header">
              <h3>Добавить участника</h3>
              <button className="cip-close" onClick={() => { setShowAddMember(false); setAddMemberSearch(''); }}><X size={18} /></button>
            </div>
            <input
              className="cip-modal-input"
              placeholder="Поиск по имени..."
              value={addMemberSearch}
              onChange={(e) => setAddMemberSearch(e.target.value)}
              autoFocus
            />
            <div className="cip-modal-list">
              {addMemberResults
                .filter((u) => !members.some((m) => m.user_id === u.id))
                .map((u) => (
                  <div
                    key={u.id}
                    className="cip-modal-user"
                    onClick={async () => {
                      try {
                        await api.addMember(chatId, u.id);
                        setMembers((prev) => [...prev, { user_id: u.id, role: 0 }]);
                        setMemberUsers((prev) => ({ ...prev, [u.id]: u }));
                        window.dispatchEvent(new CustomEvent('dierchat:chats_changed'));
                      } catch (err) {
                        alert((err as Error)?.message || 'Ошибка');
                      }
                    }}
                  >
                    <Avatar name={u.display_name || '?'} size={36} />
                    <div className="cip-modal-user-info">
                      <span className="cip-modal-user-name">{u.display_name}</span>
                      {u.username && <span className="cip-modal-user-sub">@{u.username}</span>}
                    </div>
                  </div>
                ))}
              {addMemberSearch.length >= 2 && addMemberResults.filter((u) => !members.some((m) => m.user_id === u.id)).length === 0 && (
                <div className="cip-empty">Никого не найдено</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

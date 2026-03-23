import { useEffect, useState, useMemo, useCallback, useRef, useLayoutEffect, type ReactNode } from 'react';
import { api } from '@/api/client';
import { useStore } from '@/store';
import { Avatar } from '@/components/common/Avatar';
import wsClient from '@/api/ws';
import {
  Menu, Search, SquarePen, Settings, Users, LogOut, Pin, BellOff, Bell,
  Check, CheckCheck, Trash2, Archive, X, UserPlus, Megaphone, Bookmark
} from 'lucide-react';
import { StoriesStrip } from '@/components/stories/StoriesStrip';
import { normalizeMediaUrl } from '@/lib/publicApiUrl';
import './DialogList.css';

type LastMsg = { id: string; sender_id: string; type: number; text?: string; created_at: string };
type ChatE = {
  id: string; type: number; title?: string; description?: string;
  avatar_url?: string; owner_id: string; is_public: boolean;
  created_at: string; updated_at: string;
  last_message?: LastMsg; unread_count: number;
  is_pinned: boolean; is_muted: boolean; is_archived: boolean; member_count: number;
  peer_display_name?: string;
  peer_user_id?: string;
  peer_avatar_url?: string;
};

type Props = {
  onOpenSettings: () => void;
  onOpenFavorites?: () => void;
  /** ТЗ §33: после выбора чата (закрыть настройки / анимация на ПК) */
  onAfterSelectChat?: () => void;
  compact?: boolean;
};
type Filter = 'all' | 'private' | 'group' | 'channel' | 'archive';
type FolderTab = '__all__' | '__private__' | '__group__' | '__channel__' | string;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'private', label: 'Личные' },
  { key: 'group', label: 'Группы' },
  { key: 'channel', label: 'Каналы' },
];

const DRAFT_KEY = (id: string) => `dierchat-draft:${id}`;

function getDraftPreview(chatId: string) {
  try {
    const d = localStorage.getItem(DRAFT_KEY(chatId))?.trim();
    return d ? (d.length > 40 ? d.slice(0, 40) + '…' : d) : null;
  } catch { return null; }
}

function formatTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const diff = (now.getTime() - d.getTime()) / 86400000;
  if (diff < 7) return days[d.getDay()];
  return d.toLocaleDateString('ru', { day: '2-digit', month: '2-digit' });
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Подсветка вхождения запроса (ТЗ §4) */
function highlightMatches(text: string, q: string): ReactNode {
  const needle = q.trim();
  if (!needle) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(needle)})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === needle.toLowerCase() ? (
      <mark key={i} className="dl-highlight">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function isPeerOnline(onlineUserIds: string[], peerId?: string) {
  if (!peerId) return false;
  const low = peerId.toLowerCase();
  return onlineUserIds.some((id) => id.toLowerCase() === low);
}

export function DialogList({ onOpenSettings, onOpenFavorites, onAfterSelectChat, compact = false }: Props) {
  const {
    currentChatId,
    setCurrentChatId,
    user,
    logout,
    onlineUserIds,
    setUserOnline,
    setUserOffline,
    setUserLastSeen,
    mergeOnlineUserIds,
    chatFolders,
    setChatFolders,
    setChatTypes,
  } = useStore();
  const [chats, setChats] = useState<ChatE[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatInitialTab, setNewChatInitialTab] = useState<'private' | 'group' | 'channel'>('private');
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; chat: ChatE } | null>(null);
  const [ctxPosition, setCtxPosition] = useState<{ left: number; top: number } | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);
  const [typingChats, setTypingChats] = useState<Record<string, string>>({});
  const [draftVersion, setDraftVersion] = useState(0);
  const [searchResults, setSearchResults] = useState<{ id: string; chat_id: string; text?: string; created_at: string }[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchMessageDate, setSearchMessageDate] = useState('');
  const [listRefreshing, setListRefreshing] = useState(false);
  const [activeFolder, setActiveFolder] = useState<FolderTab>('__all__');
  const [showFolderEditor, setShowFolderEditor] = useState(false);
  const [editFolder, setEditFolder] = useState<{ id?: string; name: string; types: number[]; chatIds: string[] }>({ name: '', types: [], chatIds: [] });

  const loadChats = useCallback(
    (opts?: { showSkeleton?: boolean }) => {
      const showSk = opts?.showSkeleton !== false;
      if (showSk) setLoading(true);
      return api
        .getChats()
        .then((list) => {
          const arr = Array.isArray(list) ? (list as ChatE[]) : [];
          setChats(arr);
          setChatTypes(Object.fromEntries(arr.map((c) => [c.id, c.type])));
          return api.getPeersPresence().then((p) => {
            mergeOnlineUserIds(p.online_user_ids || []);
          });
        })
        .catch(() => setChats([]))
        .finally(() => {
          if (showSk) setLoading(false);
        });
    },
    [setChatTypes, mergeOnlineUserIds]
  );

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  const listRef = useRef<HTMLDivElement>(null);
  const ptrRef = useRef({ startY: 0, active: false });
  const ptrPullRef = useRef(0);
  const [ptrPull, setPtrPull] = useState(0);

  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    if (!mq.matches) return;

    const onStart = (e: TouchEvent) => {
      if (el.scrollTop > 0) return;
      ptrRef.current = { startY: e.touches[0].clientY, active: true };
    };
    const onMove = (e: TouchEvent) => {
      if (!ptrRef.current.active || el.scrollTop > 0) return;
      const dy = e.touches[0].clientY - ptrRef.current.startY;
      if (dy > 0) {
        e.preventDefault();
        const v = Math.min(dy * 0.42, 56);
        ptrPullRef.current = v;
        setPtrPull(v);
      }
    };
    const onEnd = () => {
      if (!ptrRef.current.active) return;
      ptrRef.current.active = false;
      const pulled = ptrPullRef.current;
      ptrPullRef.current = 0;
      setPtrPull(0);
      if (pulled > 30) {
        setListRefreshing(true);
        loadChats({ showSkeleton: false }).finally(() => setListRefreshing(false));
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [loadChats]);

  useEffect(() => {
    const onTyping = (p: { chat_id: string; user_id: string; display_name?: string }) => {
      if (p.chat_id) {
        setTypingChats(prev => ({ ...prev, [p.chat_id]: p.display_name || 'Кто-то' }));
        setTimeout(() => setTypingChats(prev => { const n = { ...prev }; delete n[p.chat_id]; return n; }), 5000);
      }
    };
    wsClient.setCallbacks({
      onTyping,
      onOnline: (p) => setUserOnline(p.user_id),
      onOffline: (p) => {
        setUserOffline(p.user_id);
        if (p.last_seen) setUserLastSeen(p.user_id, p.last_seen);
      },
    });
    return () => wsClient.setCallbacks({ onTyping: undefined, onOnline: undefined, onOffline: undefined });
  }, [setUserOnline, setUserOffline, setUserLastSeen]);

  useEffect(() => {
    const handler = () => loadChats();
    window.addEventListener('dierchat:new_message', handler);
    window.addEventListener('dierchat:chats_changed', handler);
    return () => {
      window.removeEventListener('dierchat:new_message', handler);
      window.removeEventListener('dierchat:chats_changed', handler);
    };
  }, [loadChats]);

  useEffect(() => {
    const handler = () => setDraftVersion((v) => v + 1);
    window.addEventListener('dierchat:draft_updated', handler);
    return () => window.removeEventListener('dierchat:draft_updated', handler);
  }, []);

  useEffect(() => {
    if (!ctxMenu) setCtxPosition(null);
    const close = () => { setCtxMenu(null); setCtxPosition(null); };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [ctxMenu]);

  useLayoutEffect(() => {
    if (!ctxMenu || !ctxRef.current) return;
    const el = ctxRef.current;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let left = ctxMenu.x;
    let top = ctxMenu.y;
    if (left + rect.width > window.innerWidth - pad) left = window.innerWidth - rect.width - pad;
    if (left < pad) left = pad;
    if (top + rect.height > window.innerHeight - pad) top = ctxMenu.y - rect.height - 4;
    if (top < pad) top = pad;
    setCtxPosition({ left, top });
  }, [ctxMenu]);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 3) {
      setSearchResults([]);
      setSearchMessageDate('');
      return;
    }
    const t = setTimeout(() => {
      setSearchLoading(true);
      api.searchMessages(q)
        .then((msgs) => setSearchResults(msgs || []))
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const searchResultsFiltered = useMemo(() => {
    if (!searchMessageDate.trim()) return searchResults;
    const dayStart = new Date(`${searchMessageDate}T00:00:00`).getTime();
    const dayEnd = new Date(`${searchMessageDate}T23:59:59.999`).getTime();
    return searchResults.filter((m) => {
      const t = new Date(m.created_at).getTime();
      return t >= dayStart && t <= dayEnd;
    });
  }, [searchResults, searchMessageDate]);

  const filtered = useMemo(() => {
    let list = chats;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => (c.title || '').toLowerCase().includes(q) ||
        (c.peer_display_name || '').toLowerCase().includes(q));
    }
    if (filter === 'archive') {
      list = list.filter(c => c.is_archived);
    } else if (filter !== 'all') {
      const typeMap: Record<string, number> = { private: 0, group: 1, channel: 2 };
      list = list.filter(c => c.type === typeMap[filter]);
    }
    if (activeFolder !== '__all__' && !activeFolder.startsWith('__')) {
      const folder = chatFolders.find((f) => f.id === activeFolder);
      if (folder) {
        list = list.filter((c) =>
          folder.chatIds.includes(c.id) ||
          (folder.types.length > 0 && folder.types.includes(c.type))
        );
      }
    } else if (activeFolder === '__private__') {
      list = list.filter((c) => c.type === 0);
    } else if (activeFolder === '__group__') {
      list = list.filter((c) => c.type === 1);
    } else if (activeFolder === '__channel__') {
      list = list.filter((c) => c.type === 2);
    }
    const saved = (filter === 'all' && activeFolder === '__all__') ? list.filter(c => c.type === 3) : [];
    const rest = list.filter(c => c.type !== 3);
    const archived = rest.filter(c => c.is_archived);
    const active = rest.filter(c => !c.is_archived);
    const pinned = active.filter(c => c.is_pinned);
    const unpinned = active.filter(c => !c.is_pinned);
    return { saved, pinned, unpinned, archived };
  }, [chats, search, filter, activeFolder, chatFolders]);

  function handleCtxMenu(e: React.MouseEvent, chat: ChatE) {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, chat });
  }

  async function togglePin(chat: ChatE) {
    setCtxMenu(null);
    try {
      await api.pinChat(chat.id, !chat.is_pinned);
      loadChats();
    } catch {}
  }
  async function toggleMute(chat: ChatE) {
    setCtxMenu(null);
    try {
      await api.muteChat(chat.id, !chat.is_muted);
      loadChats();
    } catch {}
  }
  async function toggleArchive(chat: ChatE) {
    setCtxMenu(null);
    try {
      await api.archiveChat(chat.id, !chat.is_archived);
      loadChats();
    } catch {}
  }
  async function deleteChat(chat: ChatE) {
    setCtxMenu(null);
    if (!confirm('Удалить чат?')) return;
    try {
      await api.removeMember(chat.id, user?.id || '');
      loadChats();
    } catch {}
  }

  function renderChatItem(chat: ChatE) {
    const isTyping = !!typingChats[chat.id];
    const draftPreview = getDraftPreview(chat.id);
    const preview = isTyping
      ? typingChats[chat.id] + ' печатает...'
      : draftPreview
        ? `Черновик: ${draftPreview}`
        : chat.last_message?.text || (chat.type === 1 ? 'Группа' : chat.type === 2 ? 'Канал' : '');
    const displayName =
      chat.type === 0 && chat.peer_display_name ? chat.peer_display_name : chat.title || 'Личный чат';
    const q = search.trim();
    const nameContent = q.length >= 1 ? highlightMatches(displayName, q) : displayName;
    const previewContent =
      q.length >= 1 && preview && !isTyping && !draftPreview ? highlightMatches(preview, q) : preview;

    return (
      <div
        key={chat.id}
        className={`dl-item ${compact ? 'dl-item--compact' : ''} ${currentChatId === chat.id ? 'dl-item--active' : ''}`}
        onClick={() => {
          setCurrentChatId(chat.id);
          onAfterSelectChat?.();
        }}
        onContextMenu={e => handleCtxMenu(e, chat)}
        title={compact ? (chat.type === 0 && chat.peer_display_name ? chat.peer_display_name : chat.title || 'Личный чат') : undefined}
      >
        <div className="dl-item-avatar-wrap">
          <Avatar
            name={chat.type === 0 && chat.peer_display_name ? chat.peer_display_name : (chat.title || (chat.type === 0 ? 'Личный чат' : 'Чат'))}
            imageUrl={
              chat.type === 0 && chat.peer_avatar_url?.trim()
                ? normalizeMediaUrl(chat.peer_avatar_url.trim())
                : chat.avatar_url?.trim()
                  ? normalizeMediaUrl(chat.avatar_url.trim())
                  : undefined
            }
            size={compact ? 40 : 48}
          />
          {chat.type === 0 && chat.peer_user_id && isPeerOnline(onlineUserIds, chat.peer_user_id) && (
            <span className="dl-item-online" title="в сети" />
          )}
          {chat.unread_count > 0 && (
            <span className={`dl-item-badge dl-item-badge--dot ${chat.is_muted ? 'dl-item-badge--muted' : ''}`}>
              {!compact && (chat.unread_count > 99 ? '99+' : chat.unread_count)}
            </span>
          )}
        </div>
        {!compact && (
        <div className="dl-item-body">
          <div className="dl-item-top">
            <span className="dl-item-name">
              {chat.is_pinned && <Pin size={12} className="dl-item-pin" />}
              {nameContent}
            </span>
            <span className="dl-item-time">
              {chat.is_muted && <BellOff size={12} className="dl-item-mute-icon" />}
              {formatTime(chat.last_message?.created_at || chat.updated_at)}
            </span>
          </div>
          <div className="dl-item-bottom">
            <span className={`dl-item-preview ${isTyping ? 'dl-item-preview--typing' : ''}`}>
              {previewContent}
            </span>
            {chat.unread_count > 0 && (
              <span className={`dl-item-badge ${chat.is_muted ? 'dl-item-badge--muted' : ''}`}>
                {chat.unread_count > 99 ? '99+' : chat.unread_count}
              </span>
            )}
          </div>
        </div>
        )}
      </div>
    );
  }

  const skeletons = Array.from({ length: 8 }, (_, i) => (
    <div key={i} className="dl-skeleton">
      <div className="dl-skeleton-avatar" />
      <div className="dl-skeleton-lines">
        <div className="dl-skeleton-line dl-skeleton-line--short" />
        <div className="dl-skeleton-line" />
      </div>
    </div>
  ));

  return (
    <div className={`dl ${compact ? 'dl--compact' : ''}`}>
      <div className="dl-header">
        <div className="dl-header-top">
          <button className="dl-icon-btn" onClick={() => setShowMenu(!showMenu)} title="Меню"><Menu size={20} /></button>
          {!compact && (
            <div className="dl-search-wrap">
              <Search size={15} className="dl-search-icon" />
              <input className="dl-search" placeholder="Поиск" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          )}
          <button
            className="dl-icon-btn"
            onClick={() => {
              setNewChatInitialTab('private');
              setShowNewChat(true);
            }}
            title="Новый чат"
          >
            <SquarePen size={20} />
          </button>
        </div>
        {!compact && (
        <div className="dl-filters">
          <button className={`dl-filter ${activeFolder === '__all__' && filter === 'all' ? 'dl-filter--active' : ''}`}
            onClick={() => { setActiveFolder('__all__'); setFilter('all'); }}>Все</button>
          <button className={`dl-filter ${activeFolder === '__private__' ? 'dl-filter--active' : ''}`}
            onClick={() => { setActiveFolder('__private__'); setFilter('all'); }}>Личные</button>
          <button className={`dl-filter ${activeFolder === '__group__' ? 'dl-filter--active' : ''}`}
            onClick={() => { setActiveFolder('__group__'); setFilter('all'); }}>Группы</button>
          <button className={`dl-filter ${activeFolder === '__channel__' ? 'dl-filter--active' : ''}`}
            onClick={() => { setActiveFolder('__channel__'); setFilter('all'); }}>Каналы</button>
          {chatFolders.map((f) => (
            <button
              key={f.id}
              className={`dl-filter ${activeFolder === f.id ? 'dl-filter--active' : ''}`}
              onClick={() => { setActiveFolder(f.id); setFilter('all'); }}
              onContextMenu={(e) => {
                e.preventDefault();
                setEditFolder({ id: f.id, name: f.name, types: f.types, chatIds: f.chatIds });
                setShowFolderEditor(true);
              }}
            >
              {f.name}
            </button>
          ))}
          <button className="dl-filter dl-filter--add" onClick={() => {
            setEditFolder({ name: '', types: [], chatIds: [] });
            setShowFolderEditor(true);
          }}>+</button>
        </div>
        )}
      </div>

      {showMenu && (
        <>
          <div className="dl-overlay" onClick={() => setShowMenu(false)} />
          <div className="dl-dropdown">
            <button onClick={() => { setShowMenu(false); onOpenSettings(); }}><Settings size={18} /> Настройки</button>
            <button
              type="button"
              onClick={() => {
                setShowMenu(false);
                setNewChatInitialTab('group');
                setShowNewChat(true);
              }}
            >
              <Users size={18} /> Создать группу
            </button>
            <button
              type="button"
              onClick={() => {
                setShowMenu(false);
                setNewChatInitialTab('channel');
                setShowNewChat(true);
              }}
            >
              <Megaphone size={18} /> Создать канал
            </button>
            <button onClick={() => { setShowMenu(false); onOpenFavorites ? onOpenFavorites() : onOpenSettings(); }}><Bookmark size={18} /> Избранное</button>
            <div className="dl-dropdown-divider" />
            <button className="dl-dropdown-danger" onClick={() => { setShowMenu(false); logout(); }}><LogOut size={18} /> Выйти</button>
          </div>
        </>
      )}

      <div
        className="dl-list"
        ref={listRef}
        style={ptrPull > 0 ? { paddingTop: ptrPull } : undefined}
      >
        {listRefreshing && <div className="dl-ptr-banner">Обновление…</div>}
        {!compact && <StoriesStrip />}
        {search.trim().length >= 3 && (
          <div className="dl-search-results">
            <div className="dl-search-results-title">
              {searchLoading ? 'Поиск...' : `По сообщениям (${searchResultsFiltered.length}${searchMessageDate ? ` из ${searchResults.length}` : ''})`}
            </div>
            <div className="dl-search-date-row">
              <label className="dl-search-date-label">
                Дата сообщения
                <input
                  type="date"
                  className="dl-search-date-input"
                  value={searchMessageDate}
                  onChange={(e) => setSearchMessageDate(e.target.value)}
                />
              </label>
              {searchMessageDate && (
                <button type="button" className="dl-search-date-clear" onClick={() => setSearchMessageDate('')}>
                  Сброс
                </button>
              )}
            </div>
            {!searchLoading && searchResultsFiltered.slice(0, 15).map((m) => {
              const c = chats.find((ch) => ch.id === m.chat_id);
              const chatName = c
                ? (c.type === 0 && c.peer_display_name ? c.peer_display_name : c.title || (c.type === 0 ? 'Личный чат' : 'Чат'))
                : 'Чат';
              const previewRaw = (m.text || '(медиа)').slice(0, 50) + ((m.text?.length || 0) > 50 ? '…' : '');
              return (
                <div
                  key={m.id}
                  className="dl-search-item"
                  onClick={() => {
                    setCurrentChatId(m.chat_id);
                    onAfterSelectChat?.();
                    setSearch('');
                    setSearchResults([]);
                    setSearchMessageDate('');
                  }}
                >
                  <span className="dl-search-item-chat">{highlightMatches(chatName, search)}</span>
                  <span className="dl-search-item-preview">{highlightMatches(previewRaw, search)}</span>
                </div>
              );
            })}
          </div>
        )}
        {loading ? skeletons : filter === 'archive' ? (
          <>
            <button type="button" className="dl-archive-back" onClick={() => setFilter('all')}>
              ← Чаты
            </button>
            {filtered.archived.map(renderChatItem)}
            {filtered.archived.length === 0 && (
              <div className="dl-empty">
                <Archive size={40} strokeWidth={1.2} />
                <p>Нет архивированных чатов</p>
              </div>
            )}
          </>
        ) : (
          <>
            {filtered.archived.length > 0 && (
              <button type="button" className="dl-archive-header" onClick={() => setFilter('archive')}>
                <Archive size={16} /> Архив ({filtered.archived.length})
              </button>
            )}
            {filtered.saved.map(renderChatItem)}
            {filtered.saved.length > 0 && (filtered.pinned.length > 0 || filtered.unpinned.length > 0) && <div className="dl-separator" />}
            {filtered.pinned.map(renderChatItem)}
            {filtered.pinned.length > 0 && filtered.unpinned.length > 0 && <div className="dl-separator" />}
            {filtered.unpinned.map(renderChatItem)}
            {!loading && filtered.saved.length === 0 && filtered.pinned.length === 0 && filtered.unpinned.length === 0 && !search && (
              <div className="dl-empty">
                <SquarePen size={40} strokeWidth={1.2} />
                <p>Нет чатов</p>
                <p className="dl-empty-hint">Нажмите кнопку вверху чтобы начать</p>
              </div>
            )}
          </>
        )}
      </div>

      {ctxMenu && (
        <div
          ref={ctxRef}
          className="dl-ctx"
          style={{
            left: ctxPosition?.left ?? ctxMenu.x,
            top: ctxPosition?.top ?? ctxMenu.y,
            visibility: ctxPosition ? 'visible' : 'hidden',
          }}
        >
          <button onClick={() => togglePin(ctxMenu.chat)}>
            <Pin size={16} /> {ctxMenu.chat.is_pinned ? 'Открепить' : 'Закрепить'}
          </button>
          <button
            onClick={async () => {
              setCtxMenu(null);
              const lastId = ctxMenu.chat.last_message?.id;
              if (lastId) {
                try {
                  await api.markRead(ctxMenu.chat.id, lastId);
                  loadChats();
                } catch {}
              }
            }}
            disabled={!ctxMenu.chat.last_message?.id}
          >
            <CheckCheck size={16} /> Пометить прочитанным
          </button>
          <button onClick={() => toggleMute(ctxMenu.chat)}>
            {ctxMenu.chat.is_muted ? <Bell size={16} /> : <BellOff size={16} />}
            {ctxMenu.chat.is_muted ? 'Включить звук' : 'Без звука'}
          </button>
          <button onClick={() => toggleArchive(ctxMenu.chat)}>
            <Archive size={16} /> {ctxMenu.chat.is_archived ? 'Разархивировать' : 'Архивировать'}
          </button>
          <div className="dl-ctx-divider" />
          <button className="dl-ctx-danger" onClick={() => deleteChat(ctxMenu.chat)}>
            <Trash2 size={16} /> Удалить
          </button>
        </div>
      )}

      {showNewChat && (
        <NewChatModal
          key={newChatInitialTab}
          initialTab={newChatInitialTab}
          onClose={() => setShowNewChat(false)}
          onCreated={(c) => {
            loadChats();
            setCurrentChatId(c.id);
            onAfterSelectChat?.();
            setShowNewChat(false);
          }}
        />
      )}

      {showFolderEditor && (
        <div className="modal-overlay" onClick={() => setShowFolderEditor(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
            <div className="modal-header">
              <h3>{editFolder.id ? 'Редактировать папку' : 'Новая папка'}</h3>
              <button className="modal-close" onClick={() => setShowFolderEditor(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <input
                className="modal-input"
                placeholder="Название папки"
                value={editFolder.name}
                onChange={(e) => setEditFolder((p) => ({ ...p, name: e.target.value }))}
                autoFocus
              />
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>Типы чатов:</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {([{ t: 0, l: 'Личные' }, { t: 1, l: 'Группы' }, { t: 2, l: 'Каналы' }] as const).map(({ t, l }) => (
                  <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={editFolder.types.includes(t)}
                      onChange={(e) =>
                        setEditFolder((p) => ({
                          ...p,
                          types: e.target.checked ? [...p.types, t] : p.types.filter((x) => x !== t),
                        }))
                      }
                    />
                    {l}
                  </label>
                ))}
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>Или выберите конкретные чаты:</p>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {chats.filter((c) => c.type !== 3).map((c) => {
                  const name = c.type === 0 && c.peer_display_name ? c.peer_display_name : c.title || (c.type === 0 ? 'Личный чат' : 'Чат');
                  const checked = editFolder.chatIds.includes(c.id);
                  return (
                    <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 13, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setEditFolder((p) => ({
                            ...p,
                            chatIds: e.target.checked
                              ? [...p.chatIds, c.id]
                              : p.chatIds.filter((x) => x !== c.id),
                          }))
                        }
                      />
                      <Avatar name={name} size={28} />
                      {name}
                    </label>
                  );
                })}
              </div>
              <button
                className="modal-submit"
                disabled={!editFolder.name.trim()}
                onClick={() => {
                  const id = editFolder.id || crypto.randomUUID();
                  const updated = editFolder.id
                    ? chatFolders.map((f) => (f.id === editFolder.id ? { ...f, name: editFolder.name, types: editFolder.types, chatIds: editFolder.chatIds } : f))
                    : [...chatFolders, { id, name: editFolder.name, types: editFolder.types, chatIds: editFolder.chatIds }];
                  setChatFolders(updated);
                  setShowFolderEditor(false);
                  if (!editFolder.id) setActiveFolder(id);
                }}
              >
                {editFolder.id ? 'Сохранить' : 'Создать'}
              </button>
              {editFolder.id && (
                <button
                  className="modal-submit"
                  style={{ background: 'var(--danger)', marginTop: 8 }}
                  onClick={() => {
                    setChatFolders(chatFolders.filter((f) => f.id !== editFolder.id));
                    setShowFolderEditor(false);
                    if (activeFolder === editFolder.id) setActiveFolder('__all__');
                  }}
                >
                  Удалить папку
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NewChatModal({
  initialTab,
  onClose,
  onCreated,
}: {
  initialTab: 'private' | 'group' | 'channel';
  onClose: () => void;
  onCreated: (c: any) => void;
}) {
  const [tab, setTab] = useState<'private' | 'group' | 'channel'>(initialTab);
  const [sq, setSq] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [channelPublic, setChannelPublic] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (sq.length < 2) { setResults([]); return; }
    const t = setTimeout(() => { api.searchUsers(sq).then(setResults).catch(() => setResults([])); }, 300);
    return () => clearTimeout(t);
  }, [sq]);

  async function go(fn: () => Promise<any>) {
    setBusy(true);
    setError('');
    try {
      onCreated(await fn());
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Новый чат</h3>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-tabs">
          <button className={tab === 'private' ? 'active' : ''} onClick={() => setTab('private')}><UserPlus size={15} /> Личный</button>
          <button className={tab === 'group' ? 'active' : ''} onClick={() => setTab('group')}><Users size={15} /> Группа</button>
          <button className={tab === 'channel' ? 'active' : ''} onClick={() => setTab('channel')}><Megaphone size={15} /> Канал</button>
        </div>
        <div className="modal-body">
          {tab === 'private' && <>
            <input className="modal-input" placeholder="Поиск по имени или телефону..." value={sq} onChange={e => setSq(e.target.value)} autoFocus />
            <div className="modal-results">{results.map(u => (
              <div key={u.id} className="modal-user" onClick={() => go(() => api.createPrivateChat(u.id))}>
                <Avatar name={u.display_name} size={40} />
                <div><div className="modal-user-name">{u.display_name}</div><div className="modal-user-sub">{u.username ? `@${u.username}` : u.phone}</div></div>
              </div>
            ))}{sq.length >= 2 && results.length === 0 && <div className="modal-empty">Никого не найдено</div>}</div>
          </>}
          {(tab === 'group' || tab === 'channel') && <>
            <input className="modal-input" placeholder={tab === 'group' ? 'Название группы' : 'Название канала'} value={title} onChange={e => setTitle(e.target.value)} autoFocus />
            <input className="modal-input" placeholder="Описание" value={desc} onChange={e => setDesc(e.target.value)} />
            {tab === 'channel' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', marginBottom: 8 }}>
                <input type="checkbox" checked={channelPublic} onChange={(e) => setChannelPublic(e.target.checked)} />
                Публичный канал
              </label>
            )}
            {tab === 'group' && <>
              <input className="modal-input" placeholder="Добавить участников..." value={sq} onChange={e => setSq(e.target.value)} />
              {sel.length > 0 && <div className="modal-sel"><Check size={14} /> {sel.length} выбрано</div>}
              <div className="modal-results">{results.map(u => (
                <div key={u.id} className={`modal-user ${sel.includes(u.id) ? 'modal-user--sel' : ''}`}
                  onClick={() => setSel(p => p.includes(u.id) ? p.filter(x => x !== u.id) : [...p, u.id])}>
                  <Avatar name={u.display_name} size={40} />
                  <div><div className="modal-user-name">{u.display_name}</div><div className="modal-user-sub">{u.username ? `@${u.username}` : u.phone}</div></div>
                  {sel.includes(u.id) && <Check size={16} className="modal-check" />}
                </div>
              ))}</div>
            </>}
            {error ? <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 8 }}>{error}</p> : null}
            <button className="modal-submit" disabled={busy || !title.trim()}
              onClick={() => go(() => tab === 'group' ? api.createGroup(title, desc, sel) : api.createChannel(title, desc, channelPublic))}>
              {busy ? 'Создание...' : 'Создать'}
            </button>
          </>}
        </div>
      </div>
    </div>
  );
}

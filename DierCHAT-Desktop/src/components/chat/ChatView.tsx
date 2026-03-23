import { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { useStore } from '@/store';
import { api } from '@/api/client';
import { logOutgoingTextStructure, prepareOutgoingMessageText } from '@/lib/messageText';
import ws from '@/api/ws';
import type { Chat, ChatMember, Message } from '@/api/client';
import { MessageList } from './MessageList';
import { NowPlayingBar } from './NowPlayingBar';
import { MessageInput } from './MessageInput';
import { ChatInfoPanel } from './ChatInfoPanel';
import { UserProfilePanel } from './UserProfilePanel';
import {
  Search, Phone, Video, Info, MessageCircle, ArrowLeft, MoreVertical, LogOut, UserPlus, Timer, ChevronRight, ChevronUp, ChevronDown, Pin, X,
  Copy, Trash2, Forward, Bookmark, Reply,
} from 'lucide-react';
import { Avatar } from '@/components/common/Avatar';
import { enqueueOfflineMessage, flushOfflineQueue, requestOutboxSync } from '@/lib/offlineQueue';
import {
  MAX_MESSAGE_SELECTION,
  isMessageSelectable,
  sortedMessageIds,
  messageIdsBetween,
  messageCopyLine,
} from '@/lib/messageSelection';
import { normalizeMediaUrl } from '@/lib/publicApiUrl';
import { hydrateServerStickersFromMessages } from '@/lib/stickers';
import { chatDebug } from '@/lib/chatDebugLog';
import { sameChatId } from '@/lib/messageNormalize';
import { findChatById } from '@/lib/uuidCanonical';
import { GroupCallBanner } from './GroupCallBanner';
import './ChatView.css';

interface ChatViewProps {
  isMobile?: boolean;
  onBack?: () => void;
}

export function ChatView({ isMobile, onBack }: ChatViewProps = {}) {
  const { currentChatId, user, setActiveCall, setCurrentChatId, pendingInfoPanelTab, setPendingInfoPanelTab } =
    useStore();
  const lastSeenByUserId = useStore((s) => s.lastSeenByUserId);
  const [chat, setChat] = useState<Chat | null>(null);
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [memberUsernames, setMemberUsernames] = useState<Record<string, string>>({});
  const [peerUser, setPeerUser] = useState<{ online: boolean; last_seen: string } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [typingName, setTypingName] = useState<string | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerMemberRef = useRef<string | null>(null);

  const loadChat = useCallback(async (chatId: string) => {
    try {
      setPinnedBannerHidden(false);
      api.invalidateChatsCache();
      const chats = await api.getChats();
      const c = findChatById(chats, chatId) ?? null;
      setChat(c);
      let members = await api.getMembers(chatId);
      // Личка: если /members пуст (ошибка API / кэш), подставляем пару из объекта чата (§48.1)
      if (
        c?.type === 0 &&
        user?.id &&
        c.peer_user_id &&
        (!members.length || !members.some((m) => m.user_id === c.peer_user_id))
      ) {
        const hasSelf = members.some((m) => m.user_id === user.id);
        const base = hasSelf
          ? members.filter((m) => m.user_id === user.id)
          : [
              { chat_id: chatId, user_id: user.id, role: 0, joined_at: new Date().toISOString() },
            ];
        members = [
          ...base,
          { chat_id: chatId, user_id: c.peer_user_id, role: 0, joined_at: new Date().toISOString() },
        ];
      }
      setMembers(members);
      const names: Record<string, string> = {};
      const usernames: Record<string, string> = {};
      await Promise.all(
        members.map(async (m) => {
          try {
            const u = await api.getUser(m.user_id);
            names[u.id] = u.display_name || 'Пользователь';
            if (u.username) usernames[u.id] = u.username;
          } catch {
            names[m.user_id] = `Пользователь ${m.user_id.slice(0, 8)}`;
          }
        })
      );
      setMemberNames(names);
      setMemberUsernames(usernames);
      const peer = members.find((m) => m.user_id !== user?.id);
      peerMemberRef.current = peer?.user_id ?? null;
      if (c?.type === 0 && peer) {
        try {
          const pu = await api.getUser(peer.user_id);
          setPeerUser({ online: pu.online, last_seen: pu.last_seen });
        } catch { setPeerUser(null); }
      } else {
        setPeerUser(null);
      }
      const [msgs, pinned] = await Promise.all([
        api.getMessages(chatId),
        api.getPinnedMessages(chatId, 5),
      ]);
      chatDebug('open_chat', {
        chat_id: chatId,
        cache_chats_len: chats.length,
        members_len: members.length,
        messages_from_cache_idb: 0,
        messages_from_api: msgs.length,
        last_message_id: msgs[0]?.id ?? null,
      });
      setMessages(msgs);
      setPinnedMessages(pinned ?? []);
    } catch (e) {
      chatDebug('open_chat_error', { chat_id: chatId, error: String(e) });
      setChat(null);
      setMembers([]);
      setMemberNames({});
      setMemberUsernames({});
      setMessages([]);
      setPinnedMessages([]);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!currentChatId) {
      setChat(null);
      setMembers([]);
      setMemberNames({});
      setMemberUsernames({});
      setMessages([]);
      setTypingName(null);
      return;
    }
    loadChat(currentChatId);
  }, [currentChatId, loadChat]);

  useEffect(() => {
    void hydrateServerStickersFromMessages(messages);
  }, [messages]);

  /** §48.5: после reconnect WS перезагружаем чат (актуальные сообщения и шапка) */
  useEffect(() => {
    if (!currentChatId) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const onWs = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => void loadChat(currentChatId), 400);
    };
    window.addEventListener('dierchat:ws_connected', onWs);
    return () => {
      if (t) clearTimeout(t);
      window.removeEventListener('dierchat:ws_connected', onWs);
    };
  }, [currentChatId, loadChat]);

  const handleNewMessage = useCallback(
    (msg: { id: string; chat_id?: string; sender_id: string; type: number; text?: string; reply_to_id?: string; edited_at?: string; created_at: string }) => {
      if (!currentChatId || !sameChatId(msg.chat_id, currentChatId)) return;
      const norm = msg as Message;
      setMessages((prev) => {
        if (prev.some((m) => m.id === norm.id)) return prev;
        const myId = (user?.id ?? '').replace(/-/g, '').toLowerCase();
        const fromId = (norm.sender_id ?? '').replace(/-/g, '').toLowerCase();
        const isOwn = Boolean(myId && fromId && myId === fromId);
        const t = (norm.text ?? '').trim();
        let base = prev;
        if (isOwn && t) {
          base = prev.filter(
            (m) =>
              !(
                String(m.id).startsWith('pending-') &&
                (m.sender_id ?? '').replace(/-/g, '').toLowerCase() === fromId &&
                (m.text ?? '').trim() === t
              )
          );
        }
        return [...base, norm];
      });
    },
    [currentChatId, user?.id]
  );

  const handleMessageEdited = useCallback(
    (payload: { message_id: string; text: string }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === payload.message_id ? { ...m, text: payload.text, edited_at: new Date().toISOString() } : m
        )
      );
    },
    []
  );

  const handleMessageDeleted = useCallback((payload: { message_id: string }) => {
    setMessages((prev) => prev.filter((m) => m.id !== payload.message_id));
  }, []);

  const handleReactionUpdate = useCallback(
    (payload: { message_id: string; chat_id: string; reactions: { emoji: string; count: number; user_ids: string[] }[] }) => {
      if (!sameChatId(payload.chat_id, currentChatId)) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === payload.message_id ? { ...m, reactions: payload.reactions } : m
        )
      );
    },
    [currentChatId]
  );

  const handleReadReceipt = useCallback(
    (payload: { chat_id: string; user_id: string; message_id: string }) => {
      if (!sameChatId(payload.chat_id, currentChatId)) return;
      setMessages((prev) => {
        const targetMsg = prev.find((x) => x.id === payload.message_id);
        const targetTime = targetMsg ? new Date(targetMsg.created_at).getTime() : Infinity;
        return prev.map((m) => {
          const msgTime = new Date(m.created_at).getTime();
          if (msgTime <= targetTime) {
            const readBy = m.read_by ? [...m.read_by] : [];
            if (!readBy.includes(payload.user_id)) {
              readBy.push(payload.user_id);
              return { ...m, read_by: readBy };
            }
          }
          return m;
        });
      });
    },
    [currentChatId]
  );

  const handleTyping = useCallback(
    (p: { chat_id: string; user_id: string; display_name?: string }) => {
      if (!sameChatId(p.chat_id, currentChatId) || p.user_id === user?.id) return;
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      const name = p.display_name || memberNames[p.user_id] || 'Кто-то';
      setTypingName(name);
      typingTimeoutRef.current = setTimeout(() => {
        setTypingName(null);
        typingTimeoutRef.current = null;
      }, 5000);
    },
    [currentChatId, user?.id, memberNames]
  );

  useEffect(() => {
    ws.setCallbacks({
      onNewMessage: handleNewMessage,
      onMessageEdited: handleMessageEdited,
      onMessageDeleted: handleMessageDeleted,
      onTyping: handleTyping,
      onReactionUpdate: handleReactionUpdate,
      onReadReceipt: handleReadReceipt,
      onOnline: (p) => {
        if (peerUser && peerMemberRef.current && p.user_id === peerMemberRef.current)
          setPeerUser((prev) => prev ? { ...prev, online: true } : prev);
      },
      onOffline: (p) => {
        if (peerUser && peerMemberRef.current && p.user_id === peerMemberRef.current)
          setPeerUser((prev) =>
            prev ? { ...prev, online: false, last_seen: p.last_seen || prev.last_seen } : prev
          );
      },
    });
    return () =>
      ws.setCallbacks({
        onNewMessage: undefined,
        onMessageEdited: undefined,
        onMessageDeleted: undefined,
        onTyping: undefined,
        onReactionUpdate: undefined,
        onReadReceipt: undefined,
        onOnline: undefined,
        onOffline: undefined,
      });
  }, [handleNewMessage, handleMessageEdited, handleMessageDeleted, handleTyping, handleReactionUpdate, handleReadReceipt, peerUser]);

  useEffect(() => {
    if (!currentChatId || !messages.length) return;
    const sorted = [...messages].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const last = sorted[sorted.length - 1];
    if (last && last.sender_id !== user?.id) {
      ws.sendRead(currentChatId, last.id);
    }
  }, [currentChatId, messages, user?.id]);

  const handleSendMessage = useCallback(
    async (text: string, replyToId?: string, silent?: boolean) => {
      if (!currentChatId) return;
      const type = 0;
      const pendingId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const optimistic: Message = {
        id: pendingId,
        chat_id: currentChatId,
        sender_id: user?.id || '',
        type,
        text,
        reply_to_id: replyToId,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);
      try {
        chatDebug('send_start', {
          chat_id: currentChatId,
          pending_id: pendingId,
          text_len: text.length,
          text_raw: text,
        });
        const msg = await api.sendMessage(currentChatId, type, text, replyToId, silent);
        chatDebug('send_ok', {
          chat_id: currentChatId,
          local_id: pendingId,
          server_id: msg.id,
          status: 'sent',
        });
        ws.sendRead(currentChatId, msg.id);
        setMessages((prev) => {
          const withoutPending = prev.filter((m) => m.id !== pendingId);
          if (withoutPending.some((m) => m.id === msg.id)) return withoutPending;
          return [...withoutPending, msg];
        });
        window.dispatchEvent(new CustomEvent('dierchat:chats_changed'));
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== pendingId));
        chatDebug('send_error', { chat_id: currentChatId, pending_id: pendingId, error: String(err) });
        if (!navigator.onLine) {
          enqueueOfflineMessage({ chatId: currentChatId, type, text, replyToId, silent });
          requestOutboxSync();
          const fakeMsg: Message = {
            id: `offline-${Date.now()}`,
            chat_id: currentChatId,
            sender_id: user?.id || '',
            type,
            text,
            created_at: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, fakeMsg]);
          return;
        }
        alert((err as Error)?.message || 'Ошибка отправки сообщения');
      }
    },
    [currentChatId, user?.id]
  );

  const flushOffline = useCallback(async () => {
    await flushOfflineQueue(async (item) => {
      await api.sendMessage(item.chatId, item.type, item.text, item.replyToId, item.silent);
    });
  }, []);

  useEffect(() => {
    const run = () => {
      void flushOffline();
    };
    window.addEventListener('online', run);
    window.addEventListener('dierchat:ws_connected', run);
    window.addEventListener('dierchat:flush_outbox', run);
    return () => {
      window.removeEventListener('online', run);
      window.removeEventListener('dierchat:ws_connected', run);
      window.removeEventListener('dierchat:flush_outbox', run);
    };
  }, [flushOffline]);

  const handleLoadOlder = useCallback(
    async (beforeTimestamp: string) => {
      if (!currentChatId) return [];
      const older = await api.getMessages(currentChatId, beforeTimestamp, 30);
      setMessages((prev) => {
        const ids = new Set(prev.map((m) => m.id));
        const newMsgs = older.filter((m) => !ids.has(m.id));
        return [...newMsgs, ...prev];
      });
      return older;
    },
    [currentChatId]
  );

  const [replyingTo, setReplyingTo] = useState<{ id: string; text?: string } | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [forwardMessageIds, setForwardMessageIds] = useState<string[] | null>(null);
  /** ТЗ §48.4: переслать без подписи автора */
  const [forwardHideAuthor, setForwardHideAuthor] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectionShiftAnchorRef = useRef<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [searchResultIndex, setSearchResultIndex] = useState(0);
  const [scrollToMessageId, setScrollToMessageId] = useState<string | null>(null);
  const [scrollKey, setScrollKey] = useState(0);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [pinnedBannerHidden, setPinnedBannerHidden] = useState(false);
  const [showLiveStreamModal, setShowLiveStreamModal] = useState(false);

  // Открыть панель «Избранное» при переходе из FavoritesPanel
  useEffect(() => {
    if (currentChatId && pendingInfoPanelTab === 'favorites') {
      setShowInfo(true);
      setPendingInfoPanelTab(null);
    }
  }, [currentChatId, pendingInfoPanelTab, setPendingInfoPanelTab]);

  useEffect(() => {
    const onHash = (e: Event) => {
      const tag = (e as CustomEvent<{ tag?: string }>).detail?.tag;
      if (!tag || !currentChatId) return;
      setShowSearch(true);
      const q = tag.startsWith('#') ? tag.slice(1) : tag;
      setSearchQuery(q);
      setSearchResults([]);
      setSearchResultIndex(0);
    };
    window.addEventListener('dierchat:search_hashtag', onHash);
    return () => window.removeEventListener('dierchat:search_hashtag', onHash);
  }, [currentChatId]);

  const handleEdit = useCallback(
    async (messageId: string, text: string) => {
      try {
        const prepared = prepareOutgoingMessageText(text);
        logOutgoingTextStructure('edit', prepared);
        await api.editMessage(messageId, prepared);
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, text: prepared, edited_at: new Date().toISOString() } : m))
        );
      } catch {
        // error toast
      }
    },
    []
  );

  const handleDelete = useCallback(async (messageId: string) => {
    try {
      await api.deleteMessage(messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch {
      // error toast
    }
  }, []);

  const handleReply = useCallback((messageId: string) => {
    const msg = messages.find((m) => m.id === messageId);
    setReplyingTo(msg ? { id: msg.id, text: msg.text } : null);
  }, [messages]);

  const handleOpenDiscussionChat = useCallback(
    (discussionId: string) => {
      setCurrentChatId(discussionId);
      setShowInfo(false);
      window.dispatchEvent(new CustomEvent('dierchat:chats_changed'));
    },
    [setCurrentChatId]
  );

  const handleMessageSent = useCallback((msg: Message) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  }, []);

  const handleAddToFavorites = useCallback(async (messageId: string) => {
    try {
      await api.addBookmark(messageId);
    } catch {
      // ignore
    }
  }, []);

  const handleAddReaction = useCallback(async (messageId: string, emoji: string) => {
    try {
      await api.addReaction(messageId, emoji);
    } catch {
      // ignore
    }
  }, []);

  const handleRemoveReaction = useCallback(async (messageId: string) => {
    try {
      await api.removeReaction(messageId);
    } catch {
      // ignore
    }
  }, []);

  const handlePinMessage = useCallback(
    async (messageId: string, pinned: boolean) => {
      if (!currentChatId) return;
      try {
        await api.pinMessage(currentChatId, messageId, pinned);
        const fresh = await api.getPinnedMessages(currentChatId, 10);
        setPinnedMessages(fresh ?? []);
      } catch {
        // ignore
      }
    },
    [currentChatId]
  );

  const pinnedMessageIds = useMemo(() => new Set(pinnedMessages.map((m) => m.id)), [pinnedMessages]);

  const handleForward = useCallback((messageId: string) => {
    setForwardHideAuthor(false);
    setForwardMessageIds([messageId]);
  }, []);

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds([]);
    selectionShiftAnchorRef.current = null;
  }, []);

  const enterSelection = useCallback(
    (messageId: string) => {
      const m = messages.find((x) => x.id === messageId);
      if (!m || !isMessageSelectable(m)) return;
      setSelectionMode(true);
      setSelectedIds([messageId]);
      selectionShiftAnchorRef.current = messageId;
    },
    [messages]
  );

  const handleSelectionClick = useCallback(
    (messageId: string, e: React.MouseEvent) => {
      const m = messages.find((x) => x.id === messageId);
      if (!m || !isMessageSelectable(m)) return;
      if (e.shiftKey && selectionShiftAnchorRef.current) {
        const sorted = sortedMessageIds(messages);
        const range = messageIdsBetween(sorted, selectionShiftAnchorRef.current, messageId);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const rid of range) {
            const msg = messages.find((x) => x.id === rid);
            if (msg && isMessageSelectable(msg)) next.add(rid);
          }
          let arr = Array.from(next);
          if (arr.length > MAX_MESSAGE_SELECTION) {
            arr = arr.slice(0, MAX_MESSAGE_SELECTION);
          }
          return arr;
        });
      } else {
        setSelectedIds((prev) => {
          if (prev.includes(messageId)) {
            const next = prev.filter((x) => x !== messageId);
            return next;
          }
          if (prev.length >= MAX_MESSAGE_SELECTION) return prev;
          return [...prev, messageId];
        });
        selectionShiftAnchorRef.current = messageId;
      }
    },
    [messages]
  );

  useEffect(() => {
    if (selectionMode && selectedIds.length === 0) {
      setSelectionMode(false);
      selectionShiftAnchorRef.current = null;
    }
  }, [selectionMode, selectedIds.length]);

  useEffect(() => {
    exitSelection();
  }, [currentChatId, exitSelection]);

  useEffect(() => {
    if (!selectionMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectionMode, exitSelection]);

  const handleBatchDelete = useCallback(async () => {
    const own = selectedIds.filter((id) => messages.find((m) => m.id === id)?.sender_id === user?.id);
    if (own.length === 0) {
      alert('Можно удалить только свои сообщения');
      return;
    }
    if (!confirm(`Удалить ${own.length} сообщ.?`)) return;
    for (const id of own) {
      try {
        await api.deleteMessage(id);
      } catch {
        /* ignore */
      }
    }
    setMessages((prev) => prev.filter((m) => !own.includes(m.id)));
    exitSelection();
    window.dispatchEvent(new CustomEvent('dierchat:chats_changed'));
  }, [selectedIds, messages, user?.id, exitSelection]);

  const handleBatchCopy = useCallback(() => {
    const lines = selectedIds
      .map((id) => messages.find((m) => m.id === id))
      .filter(Boolean)
      .map((m) => messageCopyLine(m!));
    void navigator.clipboard.writeText(lines.join('\n\n'));
  }, [selectedIds, messages]);

  const handleBatchFavorites = useCallback(async () => {
    for (const id of selectedIds) {
      try {
        await api.addBookmark(id);
      } catch {
        /* ignore */
      }
    }
    exitSelection();
  }, [selectedIds, exitSelection]);

  const handleBatchForward = useCallback(() => {
    if (selectedIds.length === 0) return;
    setForwardHideAuthor(false);
    setForwardMessageIds([...selectedIds]);
    exitSelection();
  }, [selectedIds, exitSelection]);

  const [chats, setChats] = useState<Chat[]>([]);

  useEffect(() => {
    if (forwardMessageIds?.length) {
      api.getChats().then((list) => {
        const filtered = (list as Chat[]).filter((c) => c.id !== currentChatId);
        setChats(filtered);
      });
    }
  }, [forwardMessageIds, currentChatId]);

  const handleForwardToChat = useCallback(
    async (chatId: string) => {
      if (!forwardMessageIds?.length) return;
      try {
        for (const mid of forwardMessageIds) {
          await api.forwardMessage(mid, [chatId], { hideForwardAuthor: forwardHideAuthor });
        }
        setForwardMessageIds(null);
        setForwardHideAuthor(false);
        window.dispatchEvent(new CustomEvent('dierchat:chats_changed'));
      } catch (e) {
        alert((e as Error)?.message || 'Ошибка пересылки');
      }
    },
    [forwardMessageIds, forwardHideAuthor]
  );

  const forwardAuthorPreview = useMemo(() => {
    if (!forwardMessageIds?.length) return '';
    const m = messages.find((x) => x.id === forwardMessageIds[0]);
    if (!m) return 'автора';
    const n = memberNames[m.sender_id];
    return n || m.sender_id.slice(0, 8);
  }, [forwardMessageIds, messages, memberNames]);

  const handleSearchInChat = useCallback(
    async (q: string) => {
      if (!currentChatId || !q.trim()) { setSearchResults([]); return; }
      const msgs = await api.searchInChat(currentChatId, q.trim(), 30);
      setSearchResults(msgs);
      setSearchResultIndex(0);
      if (msgs.length > 0) setScrollToMessageId(msgs[0].id);
    },
    [currentChatId]
  );

  useEffect(() => {
    if (!showSearch || searchQuery.trim().length < 2) return;
    const t = setTimeout(() => handleSearchInChat(searchQuery), 400);
    return () => clearTimeout(t);
  }, [searchQuery, showSearch, handleSearchInChat]);

  const goToSearchResult = useCallback((index: number) => {
    if (searchResults.length === 0) return;
    const i = (index + searchResults.length) % searchResults.length;
    setSearchResultIndex(i);
    setScrollKey((k) => k + 1);
    setScrollToMessageId(searchResults[i].id);
  }, [searchResults]);

  const handleJumpToPlayingMessage = useCallback((messageId: string) => {
    setScrollToMessageId(messageId);
    setScrollKey((k) => k + 1);
  }, []);

  const handleLeaveChat = useCallback(async () => {
    if (!currentChatId || !user?.id) return;
    if (!confirm('Вы уверены, что хотите выйти из чата?')) return;
    try {
      await api.removeMember(currentChatId, user.id);
      setCurrentChatId(null);
      window.dispatchEvent(new CustomEvent('dierchat:chats_changed'));
    } catch (e) {
      alert((e as Error)?.message || 'Ошибка выхода');
    }
  }, [currentChatId, user?.id, setCurrentChatId]);

  const isPrivateChat = chat?.type === 0;
  const isChannel = chat?.type === 2;
  const isGroup = chat?.type === 1;
  const peerMember =
    isPrivateChat && user?.id
      ? members.find((m) => m.user_id !== user.id) ?? null
      : null;
  const privateNameBase =
    (chat?.peer_display_name && chat.peer_display_name.trim()) ||
    (peerMember ? (memberNames[peerMember.user_id] || 'Пользователь') : '') ||
    (chat?.title && chat.title.trim()) ||
    'Личный чат';
  const peerUsernameRaw = peerMember ? memberUsernames[peerMember.user_id] : undefined;
  const peerUsername = peerUsernameRaw?.replace(/^@/, '').trim();
  const title = isPrivateChat
    ? peerUsername
      ? `${privateNameBase} @${peerUsername}`
      : privateNameBase
    : isGroup
      ? (chat?.title?.trim() || 'Группа')
      : isChannel
        ? (chat?.title?.trim() || 'Канал')
        : (chat?.title ?? 'Чат');
  const myRole = members.find((m) => m.user_id === user?.id)?.role ?? 0;
  const canWriteInChannel = !isChannel || myRole >= 1;
  /** §48.1: если /members пуст, берём member_count с сервера из списка чатов */
  const headCount = Math.max(members.length, chat?.member_count ?? 0);
  const headCountFmt = headCount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  const subscriberText = isChannel
    ? `${headCountFmt} подписчик${headCount === 1 ? '' : headCount < 5 ? 'а' : 'ов'}`
    : `${headCountFmt} участник${headCount === 1 ? '' : headCount < 5 ? 'а' : 'ов'}`;
  const formatLastSeen = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'был(а) только что';
    if (diffMin < 60) return `был(а) ${diffMin} мин назад`;
    if (diffMin < 1440 && d.getDate() === now.getDate())
      return `был(а) в ${d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}`;
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.getDate() === yesterday.getDate() && d.getMonth() === yesterday.getMonth())
      return `был(а) вчера в ${d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}`;
    return `был(а) ${d.toLocaleDateString('ru', { day: 'numeric', month: 'short' })}`;
  };

  const privateSubtitle = (() => {
    if (!isPrivateChat) return '';
    if (peerUser?.online) return 'в сети';
    const peerId = peerMember?.user_id;
    const fromWs = peerId ? lastSeenByUserId[peerId.toLowerCase()] : undefined;
    const iso = fromWs || peerUser?.last_seen;
    if (iso) return formatLastSeen(iso);
    return 'был(а) недавно';
  })();

  const subtitle = isPrivateChat
    ? privateSubtitle
    : isChannel
      ? `Канал • ${subscriberText}`
      : isGroup
        ? chat?.description?.trim()
          ? `${chat.description.trim()} • ${subscriberText}`
          : `Группа • ${subscriberText}`
        : chat?.description?.trim() || subscriberText;

  const startCall = useCallback(
    (isVideo: boolean) => {
      if (!currentChatId || !user?.id) return;
      if (isPrivateChat && peerMember) {
        setActiveCall({
          peerUserId: peerMember.user_id,
          peerDisplayName: title,
          chatId: currentChatId,
          isVideo,
          isOutgoing: true,
        });
        return;
      }
      if (isGroup && !isChannel) {
        const myId = (user.id || '').trim().toLowerCase();
        const others = members
          .map((m) => m.user_id)
          .filter((id) => id && id.trim().toLowerCase() !== myId);
        if (others.length === 0) {
          alert(
            'В группе нет других участников для звонка. Добавьте людей в группу или дождитесь загрузки списка участников.'
          );
          return;
        }
        setActiveCall({
          peerUserId: others[0],
          peerDisplayName: title,
          chatId: currentChatId,
          isVideo,
          isOutgoing: true,
          isGroup: true,
          remotePeerIds: others,
          initiatorId: user.id,
        });
      }
    },
    [peerMember, currentChatId, title, setActiveCall, isPrivateChat, isGroup, isChannel, members, user?.id]
  );

  if (!currentChatId) {
    return (
      <div className="chat-view">
        <div className="chat-view__empty">
          <MessageCircle size={56} strokeWidth={1} />
          <span>Выберите чат для начала общения</span>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-view">
      <div className="chat-view__main">
        <div className={`chat-view__top-bar ${selectionMode ? 'chat-view__top-bar--selection' : ''}`}>
          {selectionMode ? (
            <>
              <div className="chat-view__top-bar-left chat-view__top-bar-left--selection">
                <button type="button" className="chat-view__back-btn" title="Отмена" onClick={exitSelection}>
                  <X size={22} />
                </button>
                <span className="chat-view__selection-count">{selectedIds.length} выбрано</span>
              </div>
              <div className="chat-view__selection-actions">
                <button
                  type="button"
                  className="chat-view__top-bar-btn"
                  title="Удалить"
                  onClick={() => void handleBatchDelete()}
                  disabled={!selectedIds.some((id) => messages.find((m) => m.id === id)?.sender_id === user?.id)}
                >
                  <Trash2 size={18} />
                </button>
                <button type="button" className="chat-view__top-bar-btn" title="Переслать" onClick={handleBatchForward} disabled={selectedIds.length === 0}>
                  <Forward size={18} />
                </button>
                <button type="button" className="chat-view__top-bar-btn" title="Копировать" onClick={handleBatchCopy} disabled={selectedIds.length === 0}>
                  <Copy size={18} />
                </button>
                <button type="button" className="chat-view__top-bar-btn" title="В избранное" onClick={() => void handleBatchFavorites()} disabled={selectedIds.length === 0}>
                  <Bookmark size={18} />
                </button>
                <button
                  type="button"
                  className="chat-view__top-bar-btn"
                  title="Закрепить"
                  onClick={() => {
                    if (selectedIds.length !== 1) return;
                    void handlePinMessage(selectedIds[0], true);
                    exitSelection();
                  }}
                  disabled={selectedIds.length !== 1}
                >
                  <Pin size={18} />
                </button>
                <button
                  type="button"
                  className="chat-view__top-bar-btn"
                  title="Ответить"
                  onClick={() => {
                    if (selectedIds.length !== 1) return;
                    handleReply(selectedIds[0]);
                    exitSelection();
                  }}
                  disabled={selectedIds.length !== 1}
                >
                  <Reply size={18} />
                </button>
              </div>
            </>
          ) : (
            <>
          <div className="chat-view__top-bar-left">
            {isMobile && onBack && (
              <button type="button" className="chat-view__back-btn" onClick={onBack}>
                <ArrowLeft size={20} />
              </button>
            )}
            <div className="chat-view__avatar-wrap" onClick={() => {
              if (isPrivateChat && peerMember) setProfileUserId(peerMember.user_id);
              else setShowInfo(true);
            }}>
              <Avatar
                name={title}
                size={40}
                style={{ cursor: 'pointer' }}
                imageUrl={
                  isPrivateChat && chat?.peer_avatar_url?.trim()
                    ? normalizeMediaUrl(chat.peer_avatar_url.trim())
                    : chat?.avatar_url?.trim()
                      ? normalizeMediaUrl(chat.avatar_url.trim())
                      : undefined
                }
              />
              {isPrivateChat && peerUser?.online && <span className="chat-view__online-dot" />}
            </div>
            <div
              className="chat-view__top-bar-text"
              style={{ cursor: 'pointer' }}
              onClick={() => {
                if (isPrivateChat && peerMember) setProfileUserId(peerMember.user_id);
                else setShowInfo(true);
              }}
            >
              <div className="chat-view__top-bar-title">{title}</div>
              <div className={`chat-view__top-bar-meta ${isPrivateChat && peerUser?.online ? 'chat-view__top-bar-meta--online' : ''}`}>
                {subtitle}
                {!isPrivateChat && onlineCount > 0 && ` • ${onlineCount} онлайн`}
              </div>
            </div>
          </div>
          <div className="chat-view__top-bar-actions">
            <button
              type="button"
              className="chat-view__top-bar-btn"
              title="Поиск по чату"
              onClick={() => setShowSearch(!showSearch)}
            >
              <Search size={18} />
            </button>
            {(isPrivateChat || (isGroup && !isChannel)) && (
              <>
                <button
                  type="button"
                  className="chat-view__top-bar-btn"
                  title={isGroup ? 'Групповой аудиозвонок' : 'Аудиозвонок'}
                  onClick={() => startCall(false)}
                >
                  <Phone size={18} />
                </button>
                <button
                  type="button"
                  className="chat-view__top-bar-btn"
                  title={isGroup ? 'Групповой видеозвонок' : 'Видеозвонок'}
                  onClick={() => startCall(true)}
                >
                  <Video size={18} />
                </button>
              </>
            )}
            <button
              type="button"
              className="chat-view__top-bar-btn"
              title="Информация"
              onClick={() => setShowInfo(!showInfo)}
            >
              <Info size={18} />
            </button>
            <div className="chat-view__top-bar-menu-wrap">
              <button
                type="button"
                className="chat-view__top-bar-btn"
                title="Меню"
                onClick={() => setShowMenu((v) => !v)}
              >
                <MoreVertical size={18} />
              </button>
              {showMenu && (
                <div className="chat-view__menu">
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                    }}
                  >
                    <Timer size={16} /> Автоудаление (в разработке)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      setShowInfo(true);
                    }}
                  >
                    <UserPlus size={16} /> Участники
                  </button>
                  {(isGroup || isChannel) && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowMenu(false);
                        setShowLiveStreamModal(true);
                      }}
                    >
                      <Video size={16} /> Начать трансляцию…
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                    }}
                  >
                    <ChevronRight size={16} /> Создать ярлык (в разработке)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLeaveChat()}
                  >
                    <LogOut size={16} /> Выйти из чата
                  </button>
                </div>
              )}
            </div>
          </div>
            </>
          )}
        </div>
        {isGroup && !isChannel && currentChatId && <GroupCallBanner chatId={currentChatId} />}
        <div className="chat-view__content">
          <div className="chat-view__message-area">
            {pinnedMessages.length > 0 && !pinnedBannerHidden && (
              <div
                className="chat-view__pinned-banner glass-panel"
                role="button"
                tabIndex={0}
                title="Перейти к закрепу"
                onClick={() => {
                  const id = pinnedMessages[0]?.id;
                  if (!id) return;
                  setScrollKey((k) => k + 1);
                  setScrollToMessageId(id);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const id = pinnedMessages[0]?.id;
                    if (!id) return;
                    setScrollKey((k) => k + 1);
                    setScrollToMessageId(id);
                  }
                }}
              >
                <Pin size={16} className="chat-view__pinned-icon" />
                <div className="chat-view__pinned-text">
                  {(pinnedMessages[0].type === 0 && pinnedMessages[0].text)
                    ? (pinnedMessages[0].text.slice(0, 80) + (pinnedMessages[0].text.length > 80 ? '…' : ''))
                    : 'Закреплённое сообщение'}
                </div>
                <button
                  type="button"
                  className="chat-view__pinned-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPinnedBannerHidden(true);
                  }}
                  title="Скрыть"
                >
                  <X size={16} />
                </button>
              </div>
            )}
            <NowPlayingBar currentChatId={currentChatId} onJumpToMessage={handleJumpToPlayingMessage} />
            {showSearch && (
              <div className="chat-view__search-panel">
                <div className="chat-view__search-bar">
                  <Search size={16} className="chat-view__search-bar-icon" />
                  <input
                    type="text"
                    className="chat-view__search-input"
                    placeholder="Поиск в чате..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchInChat(searchQuery)}
                    autoFocus
                  />
                  {searchResults.length > 0 && (
                    <div className="chat-view__search-nav">
                      <button type="button" className="chat-view__search-nav-btn" onClick={() => goToSearchResult(searchResultIndex - 1)} title="Предыдущий"><ChevronUp size={16} /></button>
                      <span className="chat-view__search-nav-count">{searchResultIndex + 1}/{searchResults.length}</span>
                      <button type="button" className="chat-view__search-nav-btn" onClick={() => goToSearchResult(searchResultIndex + 1)} title="Следующий"><ChevronDown size={16} /></button>
                    </div>
                  )}
                  <button
                    type="button"
                    className="chat-view__search-close"
                    onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); setScrollToMessageId(null); }}
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            )}
            <MessageList
              key={currentChatId || ''}
              messages={messages}
              currentUserId={user?.id}
              senderNames={memberNames}
              chatType={chat?.type ?? 0}
              discussionChatId={chat?.discussion_chat_id ?? null}
              onOpenDiscussionChat={handleOpenDiscussionChat}
              onLoadOlder={handleLoadOlder}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onAddReaction={handleAddReaction}
              onRemoveReaction={handleRemoveReaction}
              onReply={handleReply}
              onForward={handleForward}
              onAddToFavorites={handleAddToFavorites}
              onPinMessage={handlePinMessage}
              pinnedMessageIds={pinnedMessageIds}
              highlightQuery={
                showSearch && searchQuery.trim().length >= 2 ? searchQuery.trim() : undefined
              }
              scrollToMessageId={scrollToMessageId ?? undefined}
              scrollKey={scrollKey}
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              onSelectionClick={handleSelectionClick}
              onEnterSelection={enterSelection}
            />
          </div>
          {typingName && (
            <div className="chat-view__typing">
              {typingName} печатает...
            </div>
          )}
          <div className={selectionMode ? 'chat-view__input-wrap chat-view__input-wrap--selection' : 'chat-view__input-wrap'}>
          {canWriteInChannel ? (
            <MessageInput
              chatId={currentChatId}
              onSend={handleSendMessage}
              onMessageSent={(msg) => {
                ws.sendRead(currentChatId, msg.id);
                setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
                window.dispatchEvent(new CustomEvent('dierchat:chats_changed'));
              }}
              replyingTo={replyingTo}
              onClearReply={() => setReplyingTo(null)}
              mentionUsers={members.map((m) => ({
                user_id: m.user_id,
                display_name: memberNames[m.user_id] || 'Кто-то',
                username: memberUsernames[m.user_id],
              }))}
              currentUserId={user?.id}
            />
          ) : (
            <div className="chat-view__channel-bar">
              <span>Только администраторы могут публиковать</span>
            </div>
          )}
          </div>
        </div>
      </div>
      {showInfo && (
        <ChatInfoPanel
          chatId={currentChatId}
          onClose={() => setShowInfo(false)}
          onOpenChat={handleOpenDiscussionChat}
          defaultTab={pendingInfoPanelTab === 'favorites' ? 'favorites' : undefined}
        />
      )}
      {profileUserId && (
        <UserProfilePanel
          userId={profileUserId}
          onClose={() => setProfileUserId(null)}
          isMobile={isMobile}
        />
      )}
      {forwardMessageIds && forwardMessageIds.length > 0 && (
        <div
          className="chat-view__forward-overlay"
          onClick={() => {
            setForwardMessageIds(null);
            setForwardHideAuthor(false);
          }}
        >
          <div className="chat-view__forward-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Переслать {forwardMessageIds.length > 1 ? `(${forwardMessageIds.length})` : ''}</h3>
            {forwardMessageIds.length === 1 ? (
              <p className="chat-view__forward-hint">
                Сообщение от <strong>@{forwardAuthorPreview}</strong>
              </p>
            ) : null}
            <div className="chat-view__forward-mode" role="group" aria-label="Режим пересылки">
              <label className="chat-view__forward-radio">
                <input
                  type="radio"
                  name="fwd-mode"
                  checked={!forwardHideAuthor}
                  onChange={() => setForwardHideAuthor(false)}
                />
                С именем автора
              </label>
              <label className="chat-view__forward-radio">
                <input
                  type="radio"
                  name="fwd-mode"
                  checked={forwardHideAuthor}
                  onChange={() => setForwardHideAuthor(true)}
                />
                Без подписи (как своё)
              </label>
            </div>
            <div className="chat-view__forward-list">
              {chats.map((c) => (
                <button key={c.id} type="button" className="chat-view__forward-item" onClick={() => handleForwardToChat(c.id)}>
                  <Avatar name={c.title || 'Чат'} size={36} />
                  <span>{c.title || 'Чат'}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="mi-poll-cancel"
              onClick={() => {
                setForwardMessageIds(null);
                setForwardHideAuthor(false);
              }}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
      {showLiveStreamModal && currentChatId && (
        <div className="chat-view__forward-overlay" role="presentation" onClick={() => setShowLiveStreamModal(false)}>
          <div className="chat-view__forward-modal" role="dialog" aria-labelledby="live-stream-title" onClick={(e) => e.stopPropagation()}>
            <h3 id="live-stream-title">Трансляция (ТЗ §42)</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.45 }}>
              Полноценная трансляция (камера, экран, чат зрителей) требует серверной сигнализации и медиа-сервера.
              Заготовка WebSocket: <code>live_stream</code> / <code>live_stream_update</code>. Сейчас можно спланировать
              инфраструктуру; клиент отправляет тестовое действие на сервер.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="sp-save"
                onClick={() => {
                  ws.sendLiveStreamAction('ping', { chat_id: currentChatId });
                  setShowLiveStreamModal(false);
                }}
              >
                Отметить интерес
              </button>
              <button type="button" className="mi-poll-cancel" onClick={() => setShowLiveStreamModal(false)}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

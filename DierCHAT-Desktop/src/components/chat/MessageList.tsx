import { useEffect, useRef, useCallback, useMemo, useState, useLayoutEffect } from 'react';
import type { Message } from '@/api/client';
import { MessageBubble } from './MessageBubble';
import { ChevronDown } from 'lucide-react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import './MessageList.css';

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const key = formatDateKey(d);
  const todayKey = formatDateKey(today);
  const yesterdayKey = formatDateKey(yesterday);
  if (key === todayKey) return 'Сегодня';
  if (key === yesterdayKey) return 'Вчера';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

export interface MessageListProps {
  messages: Message[];
  currentUserId?: string;
  senderNames?: Record<string, string>;
  chatType?: number;
  /** Чат обсуждения для канала (§26.3) */
  discussionChatId?: string | null;
  onOpenDiscussionChat?: (discussionChatId: string) => void;
  onLoadOlder: (beforeTimestamp: string) => Promise<Message[]>;
  onEdit: (messageId: string, text: string) => void;
  onDelete: (messageId: string) => void;
  onReply: (messageId: string) => void;
  onForward?: (messageId: string) => void;
  onAddToFavorites?: (messageId: string) => void;
  onAddReaction?: (messageId: string, emoji: string) => void;
  onRemoveReaction?: (messageId: string) => void;
  onPinMessage?: (messageId: string, pinned: boolean) => void;
  pinnedMessageIds?: Set<string>;
  highlightQuery?: string;
  scrollToMessageId?: string;
  scrollKey?: number;
  /** ТЗ §25 — мультивыбор */
  selectionMode?: boolean;
  selectedIds?: string[];
  onSelectionClick?: (messageId: string, e: React.MouseEvent) => void;
  onEnterSelection?: (messageId: string) => void;
}

type FlatRow =
  | { kind: 'date'; key: string; label: string }
  | {
      kind: 'msg';
      key: string;
      msg: Message;
      showSender: boolean;
      showTail: boolean;
      replyToMessage?: Message;
    };

export function MessageList({
  messages,
  currentUserId,
  senderNames = {},
  chatType = 0,
  discussionChatId = null,
  onOpenDiscussionChat,
  onLoadOlder,
  onEdit,
  onDelete,
  onReply,
  onForward,
  onAddToFavorites,
  onAddReaction,
  onRemoveReaction,
  onPinMessage,
  pinnedMessageIds = new Set(),
  highlightQuery,
  scrollToMessageId,
  scrollKey,
  selectionMode = false,
  selectedIds = [],
  onSelectionClick,
  onEnterSelection,
}: MessageListProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const isLoadingRef = useRef(false);
  /** Нет более старых сообщений — не дёргать API по кругу (ТЗ §31) */
  const olderDoneRef = useRef(false);
  const prevMessagesLenRef = useRef(0);
  const userAtBottomRef = useRef(true);
  const [showJumpDown, setShowJumpDown] = useState(false);
  const [unreadBelow, setUnreadBelow] = useState(0);
  /** Прокрутка к сообщению по клику на превью ответа */
  const [replyScrollTarget, setReplyScrollTarget] = useState<string | null>(null);
  const [replyScrollNonce, setReplyScrollNonce] = useState(0);
  const [flashMessageId, setFlashMessageId] = useState<string | null>(null);

  const scrollToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({
      index: 'LAST',
      align: 'end',
      behavior: 'smooth',
    });
  }, []);

  const grouped = useMemo(() => {
    const groups: { dateKey: string; dateLabel: string; items: Message[] }[] = [];
    let currentDate = '';
    let currentLabel = '';
    let currentItems: Message[] = [];
    const sorted = [...messages].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    for (const msg of sorted) {
      const dateKey = formatDateKey(new Date(msg.created_at));
      const dateLabel = getDateLabel(msg.created_at);
      if (dateKey !== currentDate) {
        if (currentItems.length > 0) {
          groups.push({ dateKey: currentDate, dateLabel: currentLabel, items: currentItems });
        }
        currentDate = dateKey;
        currentLabel = dateLabel;
        currentItems = [msg];
      } else {
        currentItems.push(msg);
      }
    }
    if (currentItems.length > 0) {
      groups.push({ dateKey: currentDate, dateLabel: currentLabel, items: currentItems });
    }
    return groups;
  }, [messages]);

  const replyMap = useMemo(() => {
    const map = new Map<string, Message>();
    for (const m of messages) {
      map.set(m.id, m);
    }
    return map;
  }, [messages]);

  const flatRows = useMemo((): FlatRow[] => {
    const rows: FlatRow[] = [];
    const isGroupOrChannel = chatType === 1 || chatType === 2;
    for (const group of grouped) {
      rows.push({ kind: 'date', key: `d-${group.dateKey}`, label: group.dateLabel });
      for (let i = 0; i < group.items.length; i++) {
        const msg = group.items[i];
        const prev = group.items[i - 1];
        const next = group.items[i + 1];
        const isSameSender = prev?.sender_id === msg.sender_id;
        const nextIsSame = next?.sender_id === msg.sender_id;
        const showSender = isGroupOrChannel
          ? msg.sender_id !== currentUserId
          : !isSameSender;
        const showTail = !nextIsSame;
        const replyToMessage = msg.reply_to_id ? replyMap.get(msg.reply_to_id) : undefined;
        rows.push({
          kind: 'msg',
          key: msg.id,
          msg,
          showSender,
          showTail,
          replyToMessage,
        });
      }
    }
    return rows;
  }, [grouped, chatType, currentUserId, replyMap]);

  const senderMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of messages) {
      if (!map.has(m.sender_id)) {
        const name = senderNames[m.sender_id] ?? `Пользователь ${m.sender_id.slice(0, 8)}`;
        map.set(m.sender_id, m.sender_id === currentUserId ? 'Вы' : name);
      }
    }
    return map;
  }, [messages, senderNames, currentUserId]);

  useLayoutEffect(() => {
    if (!scrollToMessageId || !virtuosoRef.current) return;
    const idx = flatRows.findIndex(
      (r) => r.kind === 'msg' && r.msg.id === scrollToMessageId
    );
    if (idx >= 0) {
      virtuosoRef.current.scrollToIndex({ index: idx, align: 'center', behavior: 'smooth' });
    }
  }, [scrollToMessageId, scrollKey, flatRows]);

  useLayoutEffect(() => {
    if (!replyScrollTarget || !virtuosoRef.current) return;
    const idx = flatRows.findIndex(
      (r) => r.kind === 'msg' && r.msg.id === replyScrollTarget
    );
    if (idx >= 0) {
      virtuosoRef.current.scrollToIndex({ index: idx, align: 'center', behavior: 'smooth' });
      setFlashMessageId(replyScrollTarget);
    }
  }, [replyScrollTarget, replyScrollNonce, flatRows]);

  useEffect(() => {
    if (!flashMessageId) return;
    const t = window.setTimeout(() => setFlashMessageId(null), 1600);
    return () => window.clearTimeout(t);
  }, [flashMessageId]);

  const handleReplyPreviewClick = useCallback((messageId: string) => {
    setReplyScrollTarget(messageId);
    setReplyScrollNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    const isNewMessage = messages.length > prevMessagesLenRef.current;
    const lastMsg = messages[messages.length - 1];
    const isFromCurrentUser = lastMsg?.sender_id === currentUserId;
    if (isNewMessage && (userAtBottomRef.current || isFromCurrentUser)) {
      requestAnimationFrame(() => scrollToBottom());
    }
    if (isNewMessage && !userAtBottomRef.current) {
      setUnreadBelow((c) => c + 1);
    }
    prevMessagesLenRef.current = messages.length;
  }, [messages, currentUserId, scrollToBottom]);

  const tryLoadOlder = useCallback(async () => {
    if (olderDoneRef.current || isLoadingRef.current || messages.length === 0) return;
    const sorted = [...messages].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const oldest = sorted[0];
    if (!oldest) return;
    isLoadingRef.current = true;
    try {
      const batch = await onLoadOlder(oldest.created_at);
      if (!batch || batch.length === 0) {
        olderDoneRef.current = true;
      }
    } finally {
      isLoadingRef.current = false;
    }
  }, [messages, onLoadOlder]);

  const handleStartReached = useCallback(() => {
    void tryLoadOlder();
  }, [tryLoadOlder]);

  useEffect(() => {
    if (messages.length === 0) {
      setShowJumpDown(false);
      setUnreadBelow(0);
      olderDoneRef.current = false;
    }
  }, [messages.length]);

  return (
    <div className="message-list-outer">
    <Virtuoso
      ref={virtuosoRef}
      className="message-list message-list--virtuoso"
      style={{ flex: 1, minHeight: 0, width: '100%' }}
      data={flatRows}
      alignToBottom
      atBottomThreshold={48}
      atBottomStateChange={(atBottom) => {
        userAtBottomRef.current = atBottom;
        if (atBottom) {
          setUnreadBelow(0);
          setShowJumpDown(false);
        } else {
          /* Пролистали вверх — показать «в конец», даже без новых сообщений */
          setShowJumpDown(true);
        }
      }}
      followOutput={(isAtBottom) => (isAtBottom ? 'smooth' : false)}
      startReached={handleStartReached}
      increaseViewportBy={{ top: 400, bottom: 400 }}
      defaultItemHeight={64}
      itemContent={(_index, row) => {
        if (row.kind === 'date') {
          return (
            <div className="message-list__date-separator">
              <span className="message-list__date-label">{row.label}</span>
            </div>
          );
        }
        const { msg, showSender, showTail, replyToMessage } = row;
        return (
          <div
            data-message-id={msg.id}
            className={`message-list__group ${msg.sender_id === currentUserId ? 'message-list__group--own' : ''} ${flashMessageId === msg.id ? 'message-list__group--flash' : ''}`}
          >
            <MessageBubble
              message={msg}
              isOwn={msg.sender_id === currentUserId}
              showSender={showSender}
              showTail={showTail}
              senderName={senderMap.get(msg.sender_id)}
              replyToMessage={replyToMessage}
              isPinned={pinnedMessageIds.has(msg.id)}
              chatType={chatType}
              discussionChatId={discussionChatId ?? undefined}
              onOpenDiscussionChat={onOpenDiscussionChat}
              onReplyPreviewClick={handleReplyPreviewClick}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
              onForward={onForward}
              onAddToFavorites={onAddToFavorites}
              onAddReaction={onAddReaction}
              onRemoveReaction={onRemoveReaction}
              onPinMessage={onPinMessage}
              senderNames={senderNames}
              currentUserId={currentUserId}
              highlightQuery={highlightQuery}
              selectionMode={selectionMode}
              isSelected={selectedIds.includes(msg.id)}
              onSelectionClick={onSelectionClick}
              onEnterSelection={onEnterSelection}
            />
          </div>
        );
      }}
    />
      {showJumpDown && (
        <button
          type="button"
          className="message-list__jump-down message-list__jump-down--float"
          onClick={() => {
            scrollToBottom();
            setShowJumpDown(false);
            setUnreadBelow(0);
          }}
          title="К последним сообщениям"
          aria-label="Перейти к концу переписки"
        >
          {unreadBelow > 0 && (
            <span className="message-list__jump-badge">
              {unreadBelow > 99 ? '99+' : unreadBelow}
            </span>
          )}
          <ChevronDown size={20} />
        </button>
      )}
    </div>
  );
}

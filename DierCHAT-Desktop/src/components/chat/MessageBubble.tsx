import React, { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { Message, ReactionInfo } from '@/api/client';
import {
  Reply, Pencil, Copy, Trash2, Forward, Pin, Check, CheckCheck, SmilePlus, Bookmark, Timer, Square, CheckSquare, Maximize2,
  MessageCircle,
} from 'lucide-react';
import { api } from '@/api/client';
import { PollBubble } from './PollBubble';
import { VideoNotePlayer } from './VideoNotePlayer';
import { LinkPreview, useLinkPreview } from './LinkPreview';
import { VoiceBubblePlayer } from './VoiceBubblePlayer';
import { MusicBubblePlayer } from './MusicBubblePlayer';
import { MediaLightbox, type LightboxMedia } from './MediaLightbox';
import { Avatar } from '@/components/common/Avatar';
import { useStickerGlyph, decodeServerStickerId } from '@/lib/stickers';
import { UserStickerPackModal } from '@/components/stickers/UserStickerPackModal';
import { isMessageSelectable } from '@/lib/messageSelection';
import { normalizeMediaUrl } from '@/lib/publicApiUrl';
import { useOpenHttpLink } from '@/hooks/useOpenHttpLink';
import { useStore } from '@/store';
import './MessageBubble.css';

const SENDER_COLORS = [
  '#E57373', '#F06292', '#BA68C8', '#7986CB',
  '#64B5F6', '#4DB6AC', '#81C784', '#FFB74D',
];
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👎'];
const LONG_MSG_LIMIT = 400;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
  return Math.abs(h);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

type HttpLinkOpts = {
  onHttpLink?: (url: string, e: React.MouseEvent) => void;
  /** Без markdown — только подсветка поиска (настройка «авто-разметка» выкл.) */
  plainText?: boolean;
};

function renderWithHighlight(text: string, query: string, linkOpts?: HttpLinkOpts): React.ReactNode {
  const plain = Boolean(linkOpts?.plainText);
  const markdownOpts = plain ? undefined : linkOpts;

  if (plain) {
    if (!query || !query.trim()) return text;
    const esc = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(${esc})`, 'gi');
    const parts = text.split(re);
    const out: React.ReactNode[] = [];
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].length === 0) continue;
      if (i % 2 === 1) {
        out.push(<mark key={i} className="mb-search-highlight">{parts[i]}</mark>);
      } else {
        out.push(<span key={i}>{parts[i]}</span>);
      }
    }
    return out.length ? out : text;
  }

  if (!query || !query.trim()) return renderMarkdown(text, markdownOpts);
  const esc = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${esc})`, 'gi');
  const parts = text.split(re);
  const out: React.ReactNode[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].length === 0) continue;
    if (i % 2 === 1) {
      out.push(<mark key={i} className="mb-search-highlight">{parts[i]}</mark>);
    } else {
      out.push(...renderMarkdown(parts[i], markdownOpts).map((el, j) => React.cloneElement(el, { key: `${i}-${j}` })));
    }
  }
  return out.length ? out : renderMarkdown(text, markdownOpts);
}

function renderMarkdown(text: string, linkOpts?: HttpLinkOpts): React.ReactElement[] {
  const onHttp = linkOpts?.onHttpLink;
  const parts: React.ReactElement[] = [];
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|(\[(.+?)\]\((.+?)\))|(https?:\/\/[^\s]+)|(@\w+)|(#[\w\u0400-\u04FF]+)|(~~(.+?)~~)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    if (match[2]) parts.push(<strong key={key++}>{match[2]}</strong>);
    else if (match[4]) parts.push(<em key={key++}>{match[4]}</em>);
    else if (match[6]) parts.push(<code key={key++} className="mb-code">{match[6]}</code>);
    else if (match[8]) {
      const href = match[9];
      parts.push(
        <a
          key={key++}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-link"
          onClick={onHttp ? (e) => onHttp(href, e) : undefined}
        >
          {match[8]}
        </a>
      );
    }
    else if (match[10]) {
      const href = match[10];
      parts.push(
        <a
          key={key++}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-link"
          onClick={onHttp ? (e) => onHttp(href, e) : undefined}
        >
          {match[10]}
        </a>
      );
    }
    else if (match[11]) parts.push(<span key={key++} className="mb-mention">{match[11]}</span>);
    else if (match[12]) parts.push(<span key={key++} className="mb-hashtag" onClick={() => {
      const tag = match![12];
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('dierchat:search_hashtag', { detail: { tag } }));
    }}>{match[12]}</span>);
    else if (match[14]) parts.push(<del key={key++}>{match[14]}</del>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  return parts.length ? parts : [<span key={0}>{text}</span>];
}

function isProbablyUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

function fixMediaUrl(raw: string): string {
  return normalizeMediaUrl(raw);
}

function isAudioFileUrl(url: string): boolean {
  const path = url.split('?')[0].toLowerCase();
  return /\.(mp3|m4a|aac|ogg|opus|wav|flac)$/i.test(path);
}

function isVideoFileUrl(url: string): boolean {
  const path = url.split('?')[0].toLowerCase();
  return /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(path);
}

export interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showSender: boolean;
  showTail: boolean;
  senderName?: string;
  replyToMessage?: Message | null;
  isPinned?: boolean;
  onReply?: (messageId: string) => void;
  onEdit?: (messageId: string, text: string) => void;
  onDelete?: (messageId: string) => void;
  onForward?: (messageId: string) => void;
  onAddToFavorites?: (messageId: string) => void;
  onAddReaction?: (messageId: string, emoji: string) => void;
  onRemoveReaction?: (messageId: string) => void;
  onPinMessage?: (messageId: string, pinned: boolean) => void;
  senderNames?: Record<string, string>;
  currentUserId?: string;
  highlightQuery?: string;
  /** ТЗ §25 — мультивыбор */
  selectionMode?: boolean;
  isSelected?: boolean;
  onSelectionClick?: (messageId: string, e: React.MouseEvent) => void;
  onEnterSelection?: (messageId: string) => void;
  /** 0 личка, 1 группа, 2 канал — для попапа «кто прочитал» (ТЗ §32) */
  chatType?: number;
  /** Чат обсуждения канала (§26.3) */
  discussionChatId?: string;
  onOpenDiscussionChat?: (discussionChatId: string) => void;
  /** Клик по «островку» ответа — прокрутка к исходному сообщению */
  onReplyPreviewClick?: (repliedMessageId: string) => void;
}

export function MessageBubble({
  message, isOwn, showSender, showTail, senderName = '', replyToMessage,
  isPinned = false, onReply, onEdit, onDelete, onForward, onAddToFavorites, onAddReaction, onRemoveReaction, onPinMessage,
  senderNames = {}, currentUserId, highlightQuery,
  selectionMode = false,
  isSelected = false,
  onSelectionClick,
  onEnterSelection,
  chatType = 0,
  discussionChatId,
  onOpenDiscussionChat,
  onReplyPreviewClick,
}: MessageBubbleProps) {
  const messageMarkdownEnabled = useStore((s) => s.messageMarkdownEnabled);
  const openHttpLink = useOpenHttpLink();
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);
  const [ctxPosition, setCtxPosition] = useState<{ left: number; top: number } | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLButtonElement>(null);
  const readPopoverRef = useRef<HTMLDivElement>(null);
  const [readPopoverOpen, setReadPopoverOpen] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [reactionPopover, setReactionPopover] = useState<{ emoji: string; anchor: HTMLElement } | null>(null);
  const [localReactions, setLocalReactions] = useState<Record<string, number>>({});
  const [textExpanded, setTextExpanded] = useState(false);
  const [previewHidden, setPreviewHidden] = useState(false);
  const [mediaLightbox, setMediaLightbox] = useState<LightboxMedia | null>(null);
  const [packModalOpen, setPackModalOpen] = useState(false);
  useEffect(() => {
    if (message.reactions?.length) setLocalReactions({});
  }, [message.reactions]);
  const reactionsWithUsers = useMemo((): ReactionInfo[] => {
    const fromMsg = (message.reactions ?? []).map((r) => ({ emoji: r.emoji, count: r.count, user_ids: r.user_ids ?? [] }));
    const merged = new Map<string, ReactionInfo>();
    for (const r of fromMsg) {
      merged.set(r.emoji, { ...r });
    }
    for (const [emoji, delta] of Object.entries(localReactions)) {
      const cur = merged.get(emoji);
      const count = Math.max(0, (cur?.count ?? 0) + delta);
      let uids = cur?.user_ids ?? [];
      if (currentUserId && delta > 0 && !uids.includes(currentUserId)) uids = [...uids, currentUserId];
      if (currentUserId && delta < 0) uids = uids.filter((id) => id !== currentUserId);
      merged.set(emoji, { emoji, count, user_ids: uids });
    }
    return Array.from(merged.values()).filter((r) => r.count > 0);
  }, [message.reactions, localReactions, currentUserId]);

  const senderColor = useMemo(() => SENDER_COLORS[hash(message.sender_id) % SENDER_COLORS.length], [message.sender_id]);
  const isDeleted = !!message.deleted_at;

  const handleCtx = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setReadPopoverOpen(false);
    setCtx({ x: e.clientX, y: e.clientY });
  }, []);

  useEffect(() => {
    if (!ctx) {
      setCtxPosition(null);
      return;
    }
    const close = () => { setCtx(null); setCtxPosition(null); };
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true); };
  }, [ctx]);

  useLayoutEffect(() => {
    if (!ctx || !ctxRef.current) return;
    const el = ctxRef.current;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let left = ctx.x;
    let top = ctx.y;
    if (left + rect.width > window.innerWidth - pad) left = window.innerWidth - rect.width - pad;
    if (left < pad) left = pad;
    if (top + rect.height > window.innerHeight - pad) top = ctx.y - rect.height - 4;
    if (top < pad) top = pad;
    setCtxPosition({ left, top });
  }, [ctx]);

  useEffect(() => {
    if (!reactionPopover) return;
    const close = () => setReactionPopover(null);
    const t = setTimeout(() => window.addEventListener('click', close), 0);
    return () => { clearTimeout(t); window.removeEventListener('click', close); };
  }, [reactionPopover]);

  useEffect(() => {
    if (!readPopoverOpen) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (readPopoverRef.current?.contains(t)) return;
      if (statusRef.current?.contains(t)) return;
      setReadPopoverOpen(false);
    };
    document.addEventListener('mousedown', close, true);
    return () => document.removeEventListener('mousedown', close, true);
  }, [readPopoverOpen]);

  useEffect(() => {
    if (selectionMode) setReadPopoverOpen(false);
  }, [selectionMode]);

  function addReaction(emoji: string) {
    setLocalReactions(prev => ({ ...prev, [emoji]: (prev[emoji] || 0) + 1 }));
    setShowReactions(false);
    onAddReaction?.(message.id, emoji);
  }

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const [swipeOffset, setSwipeOffset] = useState(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.touches[0].clientY - touchStartY.current);
    if (dy > 30) return;
    if (dx > 0 && dx < 100) setSwipeOffset(dx);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (swipeOffset > 60) onReply?.(message.id);
    setSwipeOffset(0);
  }, [swipeOffset, onReply, message.id]);

  const lastTapRef = useRef<number>(0);
  const selectable = isMessageSelectable(message);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
  }, []);

  const handlePointerDownBubble = useCallback(
    (e: React.PointerEvent) => {
      if (selectionMode || isDeleted || !selectable || e.button !== 0) return;
      longPressStartRef.current = { x: e.clientX, y: e.clientY };
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        onEnterSelection?.(message.id);
      }, 480);
    },
    [selectionMode, isDeleted, selectable, message.id, onEnterSelection]
  );

  const handlePointerMoveBubble = useCallback(
    (e: React.PointerEvent) => {
      if (!longPressStartRef.current) return;
      const dx = Math.abs(e.clientX - longPressStartRef.current.x);
      const dy = Math.abs(e.clientY - longPressStartRef.current.y);
      if (dx > 14 || dy > 14) cancelLongPress();
    },
    [cancelLongPress]
  );

  const handlePointerUpBubble = useCallback(() => {
    cancelLongPress();
  }, [cancelLongPress]);

  const handleDoubleTap = useCallback(() => {
    if (selectionMode || isDeleted) return;
    const now = Date.now();
    if (now - lastTapRef.current < 400) {
      addReaction('👍');
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  }, [isDeleted, selectionMode]);

  const rawText = message.text || '';
  const displayText = isDeleted ? 'Сообщение удалено' : rawText;
  const isLong = !isDeleted && rawText.length > LONG_MSG_LIMIT;
  const showTruncated = isLong && !textExpanded;
  const readByOthers = (message.read_by || []).filter((id) => id !== message.sender_id);
  const isRead = readByOthers.length > 0;
  const isPendingSend = message.id.startsWith('offline-');
  const isGroupish = chatType === 1 || chatType === 2;

  const media = useMemo(() => {
    if (isDeleted) return null;
    const rawUrl = (message.text || '').trim();
    if (!rawUrl || !isProbablyUrl(rawUrl)) return null;
    const url = fixMediaUrl(rawUrl);

    if (message.type === 1) {
      return (
        <button
          type="button"
          className="mb-media-trigger"
          onClick={(e) => {
            e.stopPropagation();
            setMediaLightbox({ kind: 'image', url });
          }}
          aria-label="Открыть фото"
        >
          <img className="mb-media-img" src={url} alt="" loading="lazy" decoding="async" />
        </button>
      );
    }
    if (message.type === 2) {
      return (
        <div className="mb-media mb-media--video-inline">
          <div className="mb-media-wrap mb-media-wrap--video-regular mb-media-wrap--with-expand">
            <video className="mb-media-video mb-media-video--regular" src={url} controls preload="metadata" playsInline />
            <button
              type="button"
              className="mb-media-expand"
              onClick={(e) => {
                e.stopPropagation();
                setMediaLightbox({ kind: 'video', url });
              }}
              title="На весь экран"
            >
              <Maximize2 size={18} />
            </button>
          </div>
        </div>
      );
    }
    if (message.type === 9) {
      return (
        <div className="mb-media mb-media--video-inline mb-media--video-note">
          <VideoNotePlayer
            url={url}
            onExpand={() => setMediaLightbox({ kind: 'video', url })}
            chatId={message.chat_id}
            messageId={message.id}
            label="Видеокружок"
          />
        </div>
      );
    }
    if (message.type === 3) {
      const name = decodeURIComponent(url.split('/').pop() || 'file');
      if (isAudioFileUrl(url)) {
        return <MusicBubblePlayer src={url} isOwn={isOwn} />;
      }
      if (isVideoFileUrl(url)) {
        return (
          <div className="mb-media mb-media--video-inline">
            <div className="mb-media-wrap mb-media-wrap--video-regular mb-media-wrap--with-expand">
              <video className="mb-media-video mb-media-video--regular" src={url} controls preload="metadata" playsInline />
              <button
                type="button"
                className="mb-media-expand"
                onClick={(e) => {
                  e.stopPropagation();
                  setMediaLightbox({ kind: 'video', url });
                }}
                title="На весь экран"
              >
                <Maximize2 size={18} />
              </button>
            </div>
            <div className="mb-file-caption">{name}</div>
          </div>
        );
      }
      return (
        <a
          className="mb-file"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => openHttpLink(url, e)}
        >
          <div className="mb-file-name">{name}</div>
          <div className="mb-file-sub">Скачать / открыть</div>
        </a>
      );
    }
    if (message.type === 4) {
      return (
        <VoiceBubblePlayer
          src={url}
          isOwn={isOwn}
          label={decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'Голосовое')}
          chatId={message.chat_id}
          messageId={message.id}
        />
      );
    }
    if (message.type === 10) {
      return <MusicBubblePlayer src={url} isOwn={isOwn} />;
    }
    return null;
  }, [message, isDeleted, isOwn, openHttpLink]);

  const previewUrl = useLinkPreview(message.text || '');
  const sticker = useStickerGlyph(rawText, isDeleted, message.type);
  const isStickerMsg = !!(sticker.char || sticker.imgSrc || sticker.pendingServer);

  const handleWrapClick = useCallback(
    (e: React.MouseEvent) => {
      if (!selectionMode || !selectable) return;
      e.stopPropagation();
      onSelectionClick?.(message.id, e);
    },
    [selectionMode, selectable, message.id, onSelectionClick]
  );

  return (
    <div
      className={`mb-wrap mb-wrap--${isOwn ? 'own' : 'other'} ${selectionMode ? 'mb-wrap--selection' : ''} ${isSelected ? 'mb-wrap--selected' : ''}`}
      style={swipeOffset > 0 ? { transform: `translateX(${swipeOffset}px)`, transition: swipeOffset === 0 ? 'transform 0.2s' : 'none' } : undefined}
      onMouseEnter={() => !selectionMode && setShowReactions(true)}
      onMouseLeave={() => setShowReactions(false)}
      onTouchStart={selectionMode ? undefined : handleTouchStart}
      onTouchMove={selectionMode ? undefined : handleTouchMove}
      onTouchEnd={selectionMode ? undefined : handleTouchEnd}
      onClick={handleWrapClick}
    >

      {swipeOffset > 30 && (
        <div className="mb-swipe-reply" style={{ opacity: Math.min(1, (swipeOffset - 30) / 30) }}>
          <Reply size={20} />
        </div>
      )}

      {/* Quick reactions bar on hover */}
      {showReactions && !isDeleted && !selectionMode && (
        <div className={`mb-reactions-bar mb-reactions-bar--${isOwn ? 'own' : 'other'}`}>
          {QUICK_REACTIONS.map(e => (
            <button key={e} className="mb-reaction-btn" onClick={() => addReaction(e)}>{e}</button>
          ))}
          <button className="mb-reaction-btn mb-reaction-more"><SmilePlus size={16} /></button>
        </div>
      )}

      <div className="mb-row">
      {selectionMode && selectable && !isOwn && (
        <div className="mb-select-gutter mb-select-gutter--other" aria-hidden>
          <span className="mb-select-icon">{isSelected ? <CheckSquare size={22} /> : <Square size={22} />}</span>
        </div>
      )}

      <div
        className={`mb ${isOwn ? 'mb--own' : 'mb--other'} ${showTail ? 'mb--tail' : ''} ${isDeleted ? 'mb--deleted' : ''}`}
        onContextMenu={selectionMode ? (e) => e.preventDefault() : handleCtx}
        onClick={selectionMode ? undefined : handleDoubleTap}
        onPointerDown={handlePointerDownBubble}
        onPointerMove={handlePointerMoveBubble}
        onPointerUp={handlePointerUpBubble}
        onPointerCancel={handlePointerUpBubble}
      >

        {showSender && !isOwn && senderName && (
          <div className="mb-sender" style={{ color: senderColor }}>{senderName}</div>
        )}

        {message.forward_id && (
          <div className="mb-forward">
            Переслано
            {message.forward_from_name ? (
              <>
                {' '}
                от <strong>{message.forward_from_name}</strong>
              </>
            ) : null}
          </div>
        )}

        {replyToMessage && (
          <button
            type="button"
            className="mb-reply"
            title="Перейти к сообщению"
            onClick={(e) => {
              e.stopPropagation();
              onReplyPreviewClick?.(replyToMessage.id);
            }}
          >
            <div className="mb-reply-name">{replyToMessage.sender_id === message.sender_id ? 'Вы' : 'Сообщение'}</div>
            <div className="mb-reply-text">{replyToMessage.text || '(медиа)'}</div>
          </button>
        )}

        {message.type === 8 ? (
          <PollBubble message={message} isOwn={isOwn} />
        ) : isStickerMsg ? (
          <div
            className={`mb-sticker ${decodeServerStickerId(rawText) && sticker.imgSrc ? 'mb-sticker--clickable' : ''}`}
            onClick={(e) => {
              if (selectionMode) return;
              const sid = decodeServerStickerId(rawText);
              if (!sid || !sticker.imgSrc) return;
              e.stopPropagation();
              setPackModalOpen(true);
            }}
            title={decodeServerStickerId(rawText) && sticker.imgSrc ? 'Открыть набор стикеров' : undefined}
            role={decodeServerStickerId(rawText) && sticker.imgSrc ? 'button' : undefined}
          >
            {sticker.imgSrc ? (
              <img src={sticker.imgSrc} alt="" className="mb-sticker-img" draggable={false} />
            ) : sticker.char ? (
              <span className="mb-sticker-emoji" aria-hidden>{sticker.char}</span>
            ) : (
              <div className="mb-sticker-placeholder" aria-hidden title="Загрузка стикера" />
            )}
          </div>
        ) : media ? (
          <>{media}</>
        ) : (
          <>
            <div className={`mb-text ${isDeleted ? 'mb-text--deleted' : ''}`}>
              {isDeleted ? (
                <em>{displayText}</em>
              ) : (
                renderWithHighlight(showTruncated ? rawText.slice(0, LONG_MSG_LIMIT) + '…' : displayText, highlightQuery || '', {
                  onHttpLink: openHttpLink,
                  plainText: !messageMarkdownEnabled,
                })
              )}
            </div>
            {showTruncated && (
              <button
                type="button"
                className="mb-expand-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!selectionMode) setTextExpanded(true);
                }}
              >
                ещё
              </button>
            )}
            {previewUrl && !isDeleted && message.type === 0 && !previewHidden && (
              <LinkPreview url={previewUrl} onRemove={() => setPreviewHidden(true)} onOpenLink={openHttpLink} />
            )}
          </>
        )}

        <div className="mb-meta">
          {message.edited_at && <span className="mb-edited">изм.</span>}
          <span className="mb-time">{formatTime(message.created_at)}</span>
          {isOwn && (
            <span className="mb-status-wrap">
              <button
                type="button"
                ref={statusRef}
                className={`mb-status ${isPendingSend ? 'mb-status--pending' : isRead ? 'mb-status--read' : 'mb-status--delivered'}`}
                title={
                  isPendingSend
                    ? 'Отправка…'
                    : readByOthers.length > 0
                      ? `Прочитали: ${readByOthers.map((id) => senderNames[id] || id.slice(0, 6)).join(', ')}`
                      : isGroupish
                        ? 'Нажмите — кто прочитал'
                        : 'Доставлено'
                }
                aria-expanded={readPopoverOpen}
                aria-label="Статус сообщения"
                disabled={isPendingSend || selectionMode}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isPendingSend || selectionMode) return;
                  setReadPopoverOpen((o) => !o);
                }}
              >
                {isPendingSend ? <Check size={14} /> : <CheckCheck size={14} />}
              </button>
              {readPopoverOpen && (
                <div
                  ref={readPopoverRef}
                  className="mb-read-popover"
                  role="dialog"
                  aria-label="Кто прочитал"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="mb-read-popover-title">
                    {isGroupish ? 'Прочитали' : 'Прочитано'}
                  </div>
                  {readByOthers.length === 0 ? (
                    <div className="mb-read-popover-empty">
                      {isGroupish ? 'Пока никто не открыл чат до этого места' : 'Собеседник ещё не видел сообщение'}
                    </div>
                  ) : (
                    <ul className="mb-read-popover-list">
                      {readByOthers.map((uid) => (
                        <li key={uid} className="mb-read-popover-user">
                          <Avatar name={senderNames[uid] || '?'} size={28} />
                          <span>{uid === currentUserId ? 'Вы' : (senderNames[uid] || uid.slice(0, 8))}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </span>
          )}
        </div>
      </div>

      {selectionMode && selectable && isOwn && (
        <div className="mb-select-gutter mb-select-gutter--own" aria-hidden>
          <span className="mb-select-icon">{isSelected ? <CheckSquare size={22} /> : <Square size={22} />}</span>
        </div>
      )}
      </div>

      {chatType === 2 &&
        discussionChatId &&
        onOpenDiscussionChat &&
        !isDeleted &&
        message.type !== 6 &&
        message.type !== 8 && (
          <div className={`mb-discussion-row mb-discussion-row--${isOwn ? 'own' : 'other'}`}>
            <button
              type="button"
              className="mb-discussion-btn"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDiscussionChat(discussionChatId);
              }}
            >
              <MessageCircle size={16} aria-hidden />
              Обсуждение
            </button>
          </div>
        )}

      {/* Reactions display */}
      {reactionsWithUsers.length > 0 && (
        <div
          className={`mb-reactions mb-reactions--${isOwn ? 'own' : 'other'}`}
          onClick={selectionMode ? (e) => e.stopPropagation() : undefined}
        >
          {reactionsWithUsers.map((r) => (
            <div key={r.emoji} className="mb-reaction-chip-wrap">
              <button
                className="mb-reaction-chip"
                onClick={(e) => {
                  e.stopPropagation();
                  setReactionPopover((prev) =>
                    prev?.emoji === r.emoji ? null : { emoji: r.emoji, anchor: e.currentTarget }
                  );
                }}
              >
                {r.emoji} {r.count > 1 && <span>{r.count}</span>}
              </button>
              {reactionPopover?.emoji === r.emoji && (
                <div className="mb-reaction-popover" onClick={(e) => e.stopPropagation()}>
                  <div className="mb-reaction-popover-title">{r.emoji} — кто поставил</div>
                  <div className="mb-reaction-popover-avatars">
                    {r.user_ids.map((uid) => (
                      <div key={uid} className="mb-reaction-popover-user" title={senderNames[uid] || uid.slice(0, 8)}>
                        <Avatar name={senderNames[uid] || '?'} size={28} />
                        <span>{uid === currentUserId ? 'Вы' : (senderNames[uid] || uid.slice(0, 8))}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    className="mb-reaction-popover-add"
                    onClick={() => {
                      const hasMine = currentUserId && r.user_ids.includes(currentUserId);
                      if (hasMine) {
                        setLocalReactions((p) => ({ ...p, [r.emoji]: (p[r.emoji] ?? 0) - 1 }));
                        onRemoveReaction?.(message.id);
                      } else {
                        addReaction(r.emoji);
                      }
                      setReactionPopover(null);
                    }}
                  >
                    {currentUserId && r.user_ids.includes(currentUserId) ? `Убрать ${r.emoji}` : `Добавить ${r.emoji}`}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Context menu */}
      {ctx && (
        <div
          ref={ctxRef}
          className="mb-ctx"
          style={{
            left: ctxPosition?.left ?? ctx.x,
            top: ctxPosition?.top ?? ctx.y,
            visibility: ctxPosition ? 'visible' : 'hidden',
          }}
        >
          {selectable && (
            <button
              onClick={() => {
                onEnterSelection?.(message.id);
                setCtx(null);
              }}
            >
              <CheckSquare size={16} /> Выбрать
            </button>
          )}
          <button onClick={() => { onReply?.(message.id); setCtx(null); }}><Reply size={16} /> Ответить</button>
          <button onClick={() => { onAddToFavorites?.(message.id); setCtx(null); }}><Bookmark size={16} /> В избранное</button>
          <button onClick={() => { onForward?.(message.id); setCtx(null); }}><Forward size={16} /> Переслать</button>
          {isOwn && <button onClick={() => {
            const t = prompt('Редактировать:', message.text || '');
            if (t !== null) onEdit?.(message.id, t);
            setCtx(null);
          }}><Pencil size={16} /> Редактировать</button>}
          {isOwn && <button onClick={() => {
            const sec = prompt('Удалить через (секунд):', '60');
            if (sec && parseInt(sec) > 0) {
              api.setSelfDestruct(message.id, parseInt(sec)).catch(() => {});
            }
            setCtx(null);
          }}><Timer size={16} /> Автоудаление</button>}
          <button onClick={() => { navigator.clipboard.writeText(message.text || ''); setCtx(null); }}>
            <Copy size={16} /> Копировать
          </button>
          {onPinMessage && (
            <button onClick={() => { onPinMessage(message.id, !isPinned); setCtx(null); }}>
              <Pin size={16} /> {isPinned ? 'Открепить' : 'Закрепить'}
            </button>
          )}
          {isOwn && <>
            <div className="mb-ctx-div" />
            <button className="mb-ctx-danger" onClick={() => { if (confirm('Удалить сообщение?')) onDelete?.(message.id); setCtx(null); }}>
              <Trash2 size={16} /> Удалить
            </button>
          </>}
        </div>
      )}

      {mediaLightbox && (
        <MediaLightbox media={mediaLightbox} onClose={() => setMediaLightbox(null)} />
      )}

      {packModalOpen && (
        <UserStickerPackModal
          onClose={() => setPackModalOpen(false)}
          userId={message.sender_id}
          displayName={senderName || senderNames[message.sender_id] || ''}
          highlightStickerId={decodeServerStickerId(rawText) ?? undefined}
          isOwn={isOwn}
        />
      )}
    </div>
  );
}

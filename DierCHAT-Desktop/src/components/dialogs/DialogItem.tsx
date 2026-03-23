import { Avatar } from '@/components/common/Avatar';
import type { Chat } from '@/api/client';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

export interface DialogItemProps {
  chat: Chat;
  lastMessagePreview?: string;
  lastMessageAt?: string;
  unreadCount?: number;
  isActive: boolean;
  onClick: () => void;
}

const MAX_PREVIEW_LENGTH = 45;

function truncate(text: string): string {
  if (!text || !text.trim()) return 'Нет сообщений';
  const trimmed = text.trim();
  if (trimmed.length <= MAX_PREVIEW_LENGTH) return trimmed;
  return trimmed.slice(0, MAX_PREVIEW_LENGTH) + '…';
}

function getChatDisplayName(chat: Chat): string {
  if (chat.title && chat.title.trim()) return chat.title;
  return 'Без названия';
}

export function DialogItem({
  chat,
  lastMessagePreview,
  lastMessageAt,
  unreadCount = 0,
  isActive,
  onClick,
}: DialogItemProps) {
  const displayName = getChatDisplayName(chat);
  const preview = truncate(lastMessagePreview || '');
  const timeStr = lastMessageAt
    ? format(new Date(lastMessageAt), 'HH:mm', { locale: ru })
    : '';

  return (
    <button
      type="button"
      className={`dialogItem ${isActive ? 'active' : ''}`}
      onClick={onClick}
    >
      <Avatar
        name={displayName}
        imageUrl={chat.avatar_url}
        size={48}
      />
      <div className="dialogContent">
        <div className="dialogHeader">
          <span className="dialogName">{displayName}</span>
          {timeStr && <span className="dialogTime">{timeStr}</span>}
        </div>
        <div className="dialogFooter">
          <span className="dialogPreview">{preview}</span>
          {unreadCount > 0 && (
            <span className="unreadBadge">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

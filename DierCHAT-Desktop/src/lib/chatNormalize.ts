import type { Chat } from '@/api/client';
import { canonicalUuid } from './uuidCanonical';

/** Нормализация чата с API: UUID + числовой type (P0 шапка / счётчики). */
export function normalizeChatFromApi(raw: unknown): Chat {
  const o = raw as Record<string, unknown>;
  const id = String(o.id ?? '');
  const typeRaw = o.type;
  const typeNum =
    typeof typeRaw === 'number' && !Number.isNaN(typeRaw)
      ? typeRaw
      : Number(typeRaw);
  const type = Number.isFinite(typeNum) ? typeNum : 0;

  const ownerRaw = o.owner_id ?? o.ownerId;
  const peerRaw = o.peer_user_id ?? o.peerUserId;
  const discRaw = o.discussion_chat_id ?? o.discussionChatId;

  const memberRaw = o.member_count ?? o.memberCount;
  const unreadRaw = o.unread_count ?? o.unreadCount;

  return {
    id: id ? canonicalUuid(id) : id,
    type,
    title: o.title != null ? String(o.title) : undefined,
    description: o.description != null ? String(o.description) : undefined,
    avatar_url: o.avatar_url != null ? String(o.avatar_url) : undefined,
    owner_id: ownerRaw != null && String(ownerRaw).trim() ? canonicalUuid(String(ownerRaw)) : '',
    is_public: Boolean(o.is_public ?? o.isPublic),
    invite_link: o.invite_link != null ? String(o.invite_link) : undefined,
    discussion_chat_id:
      discRaw != null && String(discRaw).trim() ? canonicalUuid(String(discRaw)) : undefined,
    created_at: String(o.created_at ?? ''),
    updated_at: String(o.updated_at ?? ''),
    deleted_at: o.deleted_at != null ? String(o.deleted_at) : undefined,
    slow_mode_seconds:
      typeof o.slow_mode_seconds === 'number'
        ? o.slow_mode_seconds
        : Number(o.slow_mode_seconds) || undefined,
    peer_display_name:
      o.peer_display_name != null ? String(o.peer_display_name) : undefined,
    peer_user_id:
      peerRaw != null && String(peerRaw).trim() ? canonicalUuid(String(peerRaw)) : undefined,
    peer_avatar_url:
      o.peer_avatar_url != null ? String(o.peer_avatar_url) : undefined,
    member_count:
      typeof memberRaw === 'number' ? memberRaw : Number(memberRaw) || undefined,
    unread_count:
      typeof unreadRaw === 'number' ? unreadRaw : Number(unreadRaw) || undefined,
    is_pinned: Boolean(o.is_pinned ?? o.isPinned),
    is_muted: Boolean(o.is_muted ?? o.isMuted),
    is_archived: Boolean(o.is_archived ?? o.isArchived),
  };
}

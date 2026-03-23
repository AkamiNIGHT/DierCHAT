import type { Message } from '@/api/client';
import { canonicalUuid } from './uuidCanonical';

/** Сравнение UUID без учёта регистра и дефисов (WS / REST) */
export function sameChatId(a: unknown, b: unknown): boolean {
  const x = String(a ?? '')
    .replace(/-/g, '')
    .toLowerCase();
  const y = String(b ?? '')
    .replace(/-/g, '')
    .toLowerCase();
  return Boolean(x && y && x === y);
}

function canonMsgId(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return canonicalUuid(t);
}

/** Приводит ответ API/WS к сообщению с строковыми id и chat_id (§48) */
export function normalizeMessageFromApi(raw: unknown): Message {
  const m = raw as Record<string, unknown>;
  const id = canonMsgId(String(m.id ?? ''));
  const chat_id = canonMsgId(String(m.chat_id ?? m.chatId ?? '').trim());
  const sender_id = canonMsgId(String(m.sender_id ?? m.senderId ?? '').trim());
  const reply_to_id =
    m.reply_to_id != null && String(m.reply_to_id).trim()
      ? canonMsgId(String(m.reply_to_id))
      : undefined;
  const forward_id =
    m.forward_id != null && String(m.forward_id).trim()
      ? canonMsgId(String(m.forward_id))
      : undefined;
  const forward_from_name =
    m.forward_from_name != null ? String(m.forward_from_name) : undefined;
  const created_at = String(m.created_at ?? new Date().toISOString());
  const edited_at = m.edited_at != null ? String(m.edited_at) : undefined;
  const deleted_at = m.deleted_at != null ? String(m.deleted_at) : undefined;
  const text = m.text != null ? String(m.text) : undefined;
  const type = typeof m.type === 'number' ? m.type : Number(m.type) || 0;
  return {
    id,
    chat_id,
    sender_id,
    type,
    text,
    reply_to_id,
    forward_id,
    forward_from_name,
    edited_at,
    created_at,
    deleted_at,
    attachments: (m.attachments as Message['attachments']) ?? undefined,
    read_by: Array.isArray(m.read_by)
      ? (m.read_by as unknown[]).map((x) => canonMsgId(String(x))).filter(Boolean)
      : undefined,
    reactions: (m.reactions as Message['reactions']) ?? undefined,
    poll: (m.poll as Message['poll']) ?? undefined,
  };
}

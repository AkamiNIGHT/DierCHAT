/**
 * Единый формат UUID для сравнения и API (§P0: «Чат / 0 участников» из‑за рассинхрона id).
 * Поддерживает верхний/нижний регистр и вариант без дефисов.
 */
export function canonicalUuid(id: string): string {
  const s = String(id).trim();
  if (!s) return s;
  const raw = s.replace(/-/g, '').toLowerCase();
  if (raw.length === 32 && /^[0-9a-f]+$/.test(raw)) {
    return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
  }
  return s.toLowerCase();
}

/** Найти чат в списке независимо от регистра UUID и дефисов */
export function findChatById<T extends { id: string }>(chats: T[], chatId: string): T | undefined {
  const key = canonicalUuid(chatId);
  return chats.find((ch) => canonicalUuid(ch.id) === key);
}

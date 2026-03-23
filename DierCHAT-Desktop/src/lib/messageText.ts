/**
 * ТЗ §46: текст сообщений — raw UTF-8, без trim/normalize при отправке и хранении на клиенте.
 *
 * ВАЖНО: НЕ ПРИМЕНЯТЬ trim(), String.prototype.normalize('NFKC') ради «чистоты»,
 * replace(/\s+/g, ' ') и т.п. к телу сообщения при записи/отправке.
 * Отображение: CSS white-space: pre-wrap (см. MessageBubble.css).
 */

/** Символы-мусор (§46.10): ZWSP, BOM, word joiner и т.п. — убираем только их, не трогая \n \t и обычные пробелы */
const INVISIBLE_GARBAGE_RE = /[\uFEFF\u200B-\u200D\u2060\u00AD]/g;

export function stripInvisibleMessageGarbage(text: string): string {
  return text.replace(INVISIBLE_GARBAGE_RE, '');
}

/** Строка перед отправкой в API: без «невидимого мусора», иначе без изменений */
export function prepareOutgoingMessageText(text: string): string {
  return stripInvisibleMessageGarbage(text);
}

/** Пустое ли сообщение после подготовки (не отправлять) */
export function isOutgoingMessageEmpty(prepared: string): boolean {
  return prepared.length === 0;
}

/** §46.13: отладка — длина и число переносов строк */
export function logOutgoingTextStructure(label: string, text: string): void {
  if (!import.meta.env.DEV) return;
  const n = (text.match(/\n/g) || []).length;
  console.debug(`[dierchat:text] ${label} len=${text.length} newlines=${n}`);
}

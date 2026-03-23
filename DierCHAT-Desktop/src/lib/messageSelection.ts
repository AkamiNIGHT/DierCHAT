import type { Message } from '@/api/client';

/** ТЗ §25: не более 100 сообщений */
export const MAX_MESSAGE_SELECTION = 100;

/** Служебные сообщения (сервер: MessageTypeSystem) */
export const MESSAGE_TYPE_SYSTEM = 6;

export function isMessageSelectable(m: Message): boolean {
  if (m.deleted_at) return false;
  if (m.type === MESSAGE_TYPE_SYSTEM) return false;
  return true;
}

/** Порядок сообщений по времени (как в ленте) */
export function sortedMessageIds(messages: Message[]): string[] {
  return [...messages]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((m) => m.id);
}

/** Диапазон id между двумя сообщениями (включительно) */
export function messageIdsBetween(sortedIds: string[], idA: string, idB: string): string[] {
  const i = sortedIds.indexOf(idA);
  const j = sortedIds.indexOf(idB);
  if (i < 0 || j < 0) return [];
  const [from, to] = i <= j ? [i, j] : [j, i];
  return sortedIds.slice(from, to + 1);
}

export function messageCopyLine(m: Message): string {
  const t = (m.text || '').trim();
  if (t) return t;
  const labels: Record<number, string> = {
    1: '[Фото]',
    2: '[Видео]',
    3: '[Файл]',
    4: '[Голосовое]',
    5: '[Стикер]',
    8: '[Опрос]',
    9: '[Видеосообщение]',
  };
  return labels[m.type] ?? '[Сообщение]';
}

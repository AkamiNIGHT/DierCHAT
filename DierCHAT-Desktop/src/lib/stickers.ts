/** Формат сообщения: sticker://<packId>/<index> — как в ТЗ (WebP/эмодзи-наборы). */
/** Серверные стикеры: sticker://u/<uuid> — id из таблицы user_stickers (§26.6). */

import { useMemo, useSyncExternalStore } from 'react';
import { api } from '@/api/client';
import type { ServerSticker, ServerStickerPackWithStickers } from '@/api/client';
import { normalizeMediaUrl } from '@/lib/publicApiUrl';

export const STICKER_PREFIX = 'sticker://';

export type StickerPackDef = {
  id: string;
  name: string;
  /** Эмодзи как «статичные стикеры» (без CDN); для WebP можно заменить на url[] */
  items: string[];
};

export const DEFAULT_STICKER_PACKS: StickerPackDef[] = [
  {
    id: 'classic',
    name: 'Классика',
    items: ['😀', '😂', '🥰', '😎', '🤔', '👍', '❤️', '🔥', '✨', '🎉', '👋', '🙏', '💯', '🤝', '👀', '😴', '🤝', '😇', '🥳', '😤', '🤡', '💀', '👻', '🐱', '🐶', '🦊', '🐻', '🐼', '🐸', '🐵', '🐧', '🐝', '🌸', '🌈', '⚡', '🍕', '🍺', '☕'],
  },
  {
    id: 'cats',
    name: 'Коты',
    items: ['🐱', '😺', '😸', '😹', '😻', '😼', '🙀', '😿', '😾', '🐈', '🐈‍⬛', '🐾', '🐭', '🐁', '🐀', '🐹', '🐰', '🐇', '🦦', '🦫'],
  },
  {
    id: 'hearts',
    name: 'Сердечки',
    items: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '♥️'],
  },
];

const CUSTOM_KEY = 'dierchat-custom-stickers';

export type CustomSticker = { id: string; dataUrl: string; tag?: string };

export function loadCustomStickers(): CustomSticker[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as CustomSticker[];
    return Array.isArray(arr) ? arr.slice(0, 48) : [];
  } catch {
    return [];
  }
}

export function saveCustomStickers(list: CustomSticker[]): void {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(list.slice(0, 48)));
  } catch { /* quota */ }
}

export function encodeSticker(packId: string, index: number): string {
  return `${STICKER_PREFIX}${packId}/${index}`;
}

export function decodeSticker(text: string): { packId: string; index: number } | null {
  const t = text.trim();
  if (!t.startsWith(STICKER_PREFIX)) return null;
  const rest = t.slice(STICKER_PREFIX.length);
  const slash = rest.indexOf('/');
  if (slash < 0) return null;
  const packId = rest.slice(0, slash);
  const idx = parseInt(rest.slice(slash + 1), 10);
  if (Number.isNaN(idx) || idx < 0) return null;
  return { packId, index: idx };
}

/** Серверный стикер: sticker://u/<uuid> */
const SERVER_STICKER_RE = /^sticker:\/\/u\/([a-f0-9-]{36})$/i;

export function encodeServerSticker(stickerId: string): string {
  return `${STICKER_PREFIX}u/${stickerId.trim()}`;
}

export function decodeServerStickerId(text: string): string | null {
  const m = SERVER_STICKER_RE.exec(text.trim());
  return m ? m[1].toLowerCase() : null;
}

const serverStickerUrls: Record<string, string> = {};
let stickerCacheVersion = 0;
const stickerListeners = new Set<() => void>();

function bumpStickerCache(): void {
  stickerCacheVersion++;
  stickerListeners.forEach((l) => l());
}

export function subscribeStickerCache(onStoreChange: () => void): () => void {
  stickerListeners.add(onStoreChange);
  return () => stickerListeners.delete(onStoreChange);
}

/** Подписка для пузырей: после resolve картинка подставляется без перезагрузки чата. */
export function useStickerCacheVersion(): number {
  return useSyncExternalStore(
    subscribeStickerCache,
    () => stickerCacheVersion,
    () => 0
  );
}

/** Резолв стикера в пузыре с ре-рендером после подгрузки URL с сервера. */
export function useStickerGlyph(
  rawText: string,
  isDeleted: boolean,
  type: number
): { char: string | null; imgSrc: string | null; pendingServer: boolean } {
  const v = useStickerCacheVersion();
  return useMemo(() => {
    void v;
    if (isDeleted || type !== 0) {
      return { char: null, imgSrc: null, pendingServer: false };
    }
    const g = resolveStickerGlyph(rawText);
    const sid = decodeServerStickerId(rawText);
    const pendingServer = sid !== null && !g.imgSrc;
    return { ...g, pendingServer };
  }, [rawText, isDeleted, type, v]);
}

function normStickerUrl(url: string): string {
  const t = url.trim();
  return normalizeMediaUrl(t) || t;
}

/** Обновить кэш URL по id (нижний регистр uuid). */
export function mergeServerStickers(list: ServerSticker[]): void {
  let changed = false;
  for (const s of list) {
    const k = String(s.id).toLowerCase();
    const n = normStickerUrl(s.media_url);
    if (serverStickerUrls[k] !== n) {
      serverStickerUrls[k] = n;
      changed = true;
    }
  }
  if (changed) bumpStickerCache();
}

/** Все стикеры из ответа библиотеки (несколько наборов). */
export function flattenStickersFromLibrary(packs: ServerStickerPackWithStickers[]): ServerSticker[] {
  const out: ServerSticker[] = [];
  for (const p of packs) {
    for (const s of p.stickers ?? []) out.push(s);
  }
  return out;
}

/** Загрузить «мои» стикеры с сервера в кэш (после входа). */
export async function preloadMyStickers(): Promise<void> {
  try {
    const lib = await api.getMyStickerLibrary();
    mergeServerStickers(flattenStickersFromLibrary(lib.packs ?? []));
  } catch {
    /* offline / 503 */
  }
}

/** После DELETE на сервере — убрать из кэша (опционально). */
export function removeServerStickerFromCache(stickerId: string): void {
  const k = String(stickerId).toLowerCase();
  if (serverStickerUrls[k]) {
    delete serverStickerUrls[k];
    bumpStickerCache();
  }
}

/**
 * Для отображения чужих сообщений: по тексту sticker://u/<uuid> подтянуть media_url.
 */
export async function hydrateServerStickersFromMessages(messages: { text?: string }[]): Promise<void> {
  const ids = new Set<string>();
  for (const m of messages) {
    const id = decodeServerStickerId(m.text?.trim() || '');
    if (id) ids.add(id);
  }
  const missing = [...ids].filter((id) => !serverStickerUrls[id]);
  if (missing.length === 0) return;
  try {
    const list = await api.resolveStickers(missing);
    mergeServerStickers(list);
  } catch {
    /* offline */
  }
}

export function resolveStickerGlyph(text: string): { char: string | null; imgSrc: string | null } {
  const t = text.trim();
  const sid = decodeServerStickerId(t);
  if (sid) {
    const url = serverStickerUrls[sid];
    if (url) return { char: null, imgSrc: url };
    return { char: null, imgSrc: null };
  }

  const d = decodeSticker(t);
  if (!d) return { char: null, imgSrc: null };
  if (d.packId === 'custom') {
    const list = loadCustomStickers();
    const item = list[d.index];
    if (!item?.dataUrl) return { char: null, imgSrc: null };
    return { char: null, imgSrc: item.dataUrl };
  }
  const pack = DEFAULT_STICKER_PACKS.find((p) => p.id === d.packId);
  if (pack && pack.items[d.index]) {
    return { char: pack.items[d.index], imgSrc: null };
  }
  return { char: null, imgSrc: null };
}

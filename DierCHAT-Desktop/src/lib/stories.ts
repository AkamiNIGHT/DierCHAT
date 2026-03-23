/** Истории: сервер (§26.2) + локальный fallback (offline / legacy `s_*`) */

import { normalizeMediaUrl } from '@/lib/publicApiUrl';

const KEY = 'dierchat-stories-v1';
const RX_KEY = 'dierchat-story-reactions-v1';
const DAY = 24 * 60 * 60 * 1000;

export type StoryItem = {
  id: string;
  userId: string;
  authorName: string;
  /** Аватар автора (с сервера) */
  authorAvatarUrl?: string;
  mediaUrl: string;
  mediaKind: 'image' | 'video' | 'emoji';
  caption?: string;
  createdAt: number;
  expiresAt: number;
  reactions: Record<string, number>;
  /** id пользователей, открывших историю */
  viewers: string[];
};

export type ApiStoryRow = {
  id: string;
  user_id: string;
  author_name: string;
  author_avatar_url?: string;
  media_url: string;
  media_kind: number;
  caption?: string;
  created_at: string;
  expires_at: string;
  view_count: number;
  viewer_ids?: string[];
};

export function storyFromApi(row: ApiStoryRow): StoryItem {
  return {
    id: row.id,
    userId: row.user_id,
    authorName: row.author_name || 'Пользователь',
    authorAvatarUrl: row.author_avatar_url?.trim()
      ? normalizeMediaUrl(row.author_avatar_url.trim())
      : undefined,
    mediaUrl: normalizeMediaUrl(row.media_url) || row.media_url,
    mediaKind: row.media_kind === 1 ? 'video' : 'image',
    caption: row.caption?.trim() || undefined,
    createdAt: new Date(row.created_at).getTime(),
    expiresAt: new Date(row.expires_at).getTime(),
    reactions: {},
    viewers: row.viewer_ids ?? [],
  };
}

/** Серверные истории + локальные только с префиксом `s_`, если у пользователя ещё нет серверных. */
export function mergeServerAndLocal(server: StoryItem[], local: StoryItem[]): StoryItem[] {
  const serverByUser = new Set(server.map((s) => s.userId));
  const legacy = local.filter((s) => s.id.startsWith('s_') && !serverByUser.has(s.userId));
  return [...legacy, ...server];
}

function loadReactionMap(): Record<string, Record<string, number>> {
  try {
    const raw = localStorage.getItem(RX_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, Record<string, number>>;
  } catch {
    return {};
  }
}

function saveReactionMap(m: Record<string, Record<string, number>>): void {
  try {
    localStorage.setItem(RX_KEY, JSON.stringify(m));
  } catch {
    /* quota */
  }
}

/** Доп. реакции для серверных историй (локально). */
export function loadStoryReactions(storyId: string): Record<string, number> {
  const m = loadReactionMap();
  return m[storyId] ? { ...m[storyId] } : {};
}

export function bumpStoryReaction(storyId: string, emoji: string): void {
  const all = loadReactionMap();
  const cur = { ...(all[storyId] || {}) };
  cur[emoji] = (cur[emoji] || 0) + 1;
  all[storyId] = cur;
  saveReactionMap(all);
}

export function mergeDisplayReactions(
  base: Record<string, number>,
  storyId: string,
  isLocalLegacy: boolean
): Record<string, number> {
  if (isLocalLegacy) return { ...base };
  const extra = loadStoryReactions(storyId);
  const out = { ...base };
  for (const [k, v] of Object.entries(extra)) {
    out[k] = (out[k] || 0) + v;
  }
  return out;
}

export function loadStories(): StoryItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as StoryItem[];
    const now = Date.now();
    const alive = list.filter((s) => s.expiresAt > now);
    if (alive.length !== list.length) saveStories(alive);
    return alive;
  } catch {
    return [];
  }
}

export function saveStories(items: StoryItem[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch { /* quota */ }
}

export function addStory(item: Omit<StoryItem, 'expiresAt' | 'reactions' | 'viewers'>): StoryItem {
  const full: StoryItem = {
    ...item,
    expiresAt: item.createdAt + DAY,
    reactions: {},
    viewers: [],
  };
  const cur = loadStories().filter((s) => s.userId !== item.userId || s.id !== item.id);
  saveStories([...cur, full]);
  return full;
}

export function recordStoryView(storyId: string, viewerUserId: string): void {
  const all = loadStories();
  const i = all.findIndex((s) => s.id === storyId);
  if (i < 0) return;
  const story = all[i];
  if (story.userId === viewerUserId) return;
  if (story.viewers.includes(viewerUserId)) return;
  all[i] = { ...story, viewers: [...story.viewers, viewerUserId] };
  saveStories(all);
}

export function storiesByUser(
  stories: StoryItem[]
): { userId: string; authorName: string; authorAvatarUrl?: string; items: StoryItem[] }[] {
  const map = new Map<string, { authorName: string; authorAvatarUrl?: string; items: StoryItem[] }>();
  for (const s of stories) {
    const g = map.get(s.userId) || { authorName: s.authorName, authorAvatarUrl: s.authorAvatarUrl, items: [] };
    g.items.push(s);
    g.authorName = s.authorName;
    if (s.authorAvatarUrl) g.authorAvatarUrl = s.authorAvatarUrl;
    map.set(s.userId, g);
  }
  return Array.from(map.entries()).map(([userId, v]) => ({
    userId,
    authorName: v.authorName,
    authorAvatarUrl: v.authorAvatarUrl,
    items: v.items.sort((a, b) => b.createdAt - a.createdAt),
  }));
}

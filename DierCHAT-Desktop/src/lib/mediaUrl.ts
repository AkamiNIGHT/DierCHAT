import { normalizeMediaUrl } from '@/lib/publicApiUrl';

/** URL аватарки/медиа для уведомлений и Electron (как fixMediaUrl в пузырях). */
export function notificationIconUrl(avatarUrl?: string | null): string {
  if (!avatarUrl?.trim()) return '/icon.png';
  const u = avatarUrl.trim();
  if (u.startsWith('/')) return u;
  return normalizeMediaUrl(u) || '/icon.png';
}

import { useEffect, useState, useRef } from 'react';
import { avatarCacheGet, avatarCacheSet, avatarCacheInvalidate } from '@/lib/avatarCache';

/**
 * ТЗ §35: URL аватарки через IndexedDB; при сбросе — перезагрузка.
 */
export function useAvatarCachedUrl(imageUrl: string | null | undefined, enableCache = true): string | null | undefined {
  const [display, setDisplay] = useState<string | null | undefined>(imageUrl || undefined);
  const [reloadToken, setReloadToken] = useState(0);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!imageUrl?.trim()) {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setDisplay(undefined);
      return;
    }
    const key = imageUrl.trim();
    let cancelled = false;

    const revoke = () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };

    (async () => {
      if (!enableCache) {
        setDisplay(key);
        return;
      }
      const cached = await avatarCacheGet(key);
      if (cancelled) return;
      if (cached) {
        revoke();
        objectUrlRef.current = URL.createObjectURL(cached);
        setDisplay(objectUrlRef.current);
        return;
      }
      try {
        const res = await fetch(key, { mode: 'cors', credentials: 'omit' });
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (cancelled) return;
        await avatarCacheSet(key, blob);
        revoke();
        objectUrlRef.current = URL.createObjectURL(blob);
        setDisplay(objectUrlRef.current);
      } catch {
        setDisplay(key);
      }
    })();

    const onBust = (ev: Event) => {
      const d = (ev as CustomEvent<{ url?: string; userId?: string }>).detail;
      if (!d) return;
      const hit =
        (d.url && (d.url === key || key.includes(d.url))) ||
        (d.userId && key.toLowerCase().includes(d.userId.toLowerCase()));
      if (hit) {
        void avatarCacheInvalidate(d.userId || key.slice(0, 64));
        setReloadToken((t) => t + 1);
      }
    };
    window.addEventListener('dierchat:avatar_cache_bust', onBust);

    return () => {
      cancelled = true;
      window.removeEventListener('dierchat:avatar_cache_bust', onBust);
      revoke();
    };
  }, [imageUrl, enableCache, reloadToken]);

  return display;
}

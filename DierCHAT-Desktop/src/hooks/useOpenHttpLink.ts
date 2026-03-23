import { useCallback } from 'react';
import { useStore } from '@/store';

/**
 * ТЗ §28: открытие http(s) ссылок во встроенном браузере или в системном / новой вкладке.
 * Ctrl/Cmd/Shift+клик и средняя кнопка — стандартное поведение (новая вкладка), без перехвата.
 */
export function useOpenHttpLink() {
  const inAppBrowserEnabled = useStore((s) => s.inAppBrowserEnabled);
  const setInAppBrowserUrl = useStore((s) => s.setInAppBrowserUrl);

  return useCallback(
    (rawUrl: string, e?: React.MouseEvent) => {
      const url = rawUrl.trim();
      if (!/^https?:\/\//i.test(url)) return;
      if (e && (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1)) return;
      e?.preventDefault();
      if (inAppBrowserEnabled) {
        setInAppBrowserUrl(url);
      } else if (typeof window !== 'undefined' && window.dierchat?.openExternalUrl) {
        void window.dierchat.openExternalUrl(url);
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    },
    [inAppBrowserEnabled, setInAppBrowserUrl]
  );
}

/** ТЗ §30 — вкладка встроенного браузера */
export type InAppBrowserTab = {
  id: string;
  url: string;
  /** Заголовок (если доступен same-origin или задан вручную) */
  title?: string;
  /** URL иконки (часто через favicon-сервис) */
  favicon?: string;
};

export const BROWSER_MAX_TABS = 10;

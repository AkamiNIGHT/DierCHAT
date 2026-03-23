/// <reference types="vite/client" />
/// <reference types="react" />

declare module 'jsmediatags' {
  const jsmediatags: {
    read: (
      url: string,
      callbacks: { onSuccess: (tag: { tags: Record<string, unknown> }) => void; onError: (e: unknown) => void }
    ) => void;
  };
  export default jsmediatags;
}

interface Window {
  dierchat: {
    platform: string;
    version: string;
    getDesktopSources?: (kind: 'screen' | 'window') => Promise<
      { id: string; name: string; thumbnail: string }[]
    >;
    openExternalUrl?: (url: string) => Promise<{ ok: boolean }>;
    openDierBrowser?: (url: string) => Promise<{ ok: boolean; method?: 'dierbrowser' | 'system' | 'none' }>;
  };
}

/** Electron `<webview>` (рендерер) */
interface HTMLWebviewElement extends HTMLElement {
  src: string;
  getURL(): string;
  canGoBack(): boolean;
  canGoForward(): boolean;
  goBack(): void;
  goForward(): void;
  reload(): void;
  /** Масштаб страницы (как в Chrome), 1.0 = 100% */
  getZoomFactor(): number;
  setZoomFactor(factor: number): void;
  /** Chromium DevTools для страницы во вкладке (Console, Elements, CSS, Network…) */
  openDevTools(): void;
  isDevToolsOpened(): boolean;
  closeDevTools(): void;
  executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>;
  addEventListener(
    type:
      | 'did-navigate'
      | 'did-navigate-in-page'
      | 'did-start-loading'
      | 'did-stop-loading'
      | 'did-finish-load'
      | 'dom-ready',
    listener: (ev: Event) => void
  ): void;
  removeEventListener(
    type:
      | 'did-navigate'
      | 'did-navigate-in-page'
      | 'did-start-loading'
      | 'did-stop-loading'
      | 'did-finish-load'
      | 'dom-ready',
    listener: (ev: Event) => void
  ): void;
  addEventListener(
    type: 'context-menu',
    listener: (ev: ElectronWebviewContextMenuEvent) => void,
    useCapture?: boolean
  ): void;
  removeEventListener(type: 'context-menu', listener: (ev: ElectronWebviewContextMenuEvent) => void): void;
}

/** Событие ПКМ / long-press в `<webview>` (Electron) */
interface ElectronWebviewContextMenuEvent extends Event {
  params: {
    x: number;
    y: number;
    linkURL?: string;
    pageURL?: string;
    selectionText?: string;
  };
}

declare namespace JSX {
  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<
      Omit<React.HTMLAttributes<HTMLElement>, 'allowpopups'> & {
        src?: string;
        /** Electron: разрешить window.open во вложенной странице */
        allowpopups?: string | boolean;
        nodeintegration?: string;
        /** Мобильный Chrome UA — сайты отдают мобильную вёрстку */
        useragent?: string;
      },
      HTMLElement
    >;
  }
}

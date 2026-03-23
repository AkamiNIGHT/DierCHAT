import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('dierchat', {
  platform: process.platform,
  version: '1.0.0',
  /** Список экранов или окон для демонстрации (§24, только Electron) */
  getDesktopSources: (kind: 'screen' | 'window') =>
    ipcRenderer.invoke('dierchat:getDesktopSources', kind) as Promise<
      { id: string; name: string; thumbnail: string }[]
    >,
  /** §28 — открыть URL в системном браузере */
  openExternalUrl: (url: string) =>
    ipcRenderer.invoke('dierchat:open-external-url', url) as Promise<{ ok: boolean }>,
  /** DIERbrowser — отдельный полноценный браузер (см. docs/DIERbrowser_PLAN.md) */
  openDierBrowser: (url: string) =>
    ipcRenderer.invoke('dierchat:open-dier-browser', url) as Promise<{
      ok: boolean;
      method?: 'dierbrowser' | 'system' | 'none';
    }>,
});

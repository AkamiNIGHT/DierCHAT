import { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain, desktopCapturer, protocol, session } from 'electron';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

/**
 * file:// не даёт secure context → нет audiooutput / часть Web API.
 * Кастомная схема app:// с privileges.secure = true.
 *
 * Важно: protocol.handle + readFile/Response на части сборок давал «Not Found».
 * registerFileProtocol({ path }) — нативная отдача из app.asar (как раньше в Electron).
 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
/** ТЗ §48.6: закрытие из трея — полный выход; крестик — только скрыть окно */
let isAppQuitting = false;

const isDev = !app.isPackaged;

/** Путь к dist/renderer: из корня приложения (asar), не от __dirname — надёжнее при любой упаковке. */
function getRendererRoot(): string {
  return path.join(app.getAppPath(), 'dist', 'renderer');
}

/**
 * app://host/path → безопасный путь внутри rendererRoot.
 * Пустой pathname → index.html.
 */
function resolveAppUrlToFile(requestUrl: string, rendererRoot: string): string | null {
  const u = new URL(requestUrl);
  const raw = (u.pathname || '').replace(/\\/g, '/');
  const segments = raw.split('/').filter((s) => s.length > 0);
  if (segments.some((s) => s === '..')) {
    return null;
  }
  let parts: string[];
  try {
    parts = segments.length > 0 ? segments.map((s) => decodeURIComponent(s)) : ['index.html'];
  } catch {
    return null;
  }
  const fullPath = path.normalize(path.join(rendererRoot, ...parts));
  const rootLow = rendererRoot.toLowerCase();
  const fullLow = fullPath.toLowerCase();
  const sep = path.sep;
  if (!fullLow.startsWith(rootLow + sep) && fullLow !== rootLow) {
    return null;
  }
  if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
    return null;
  }
  return fullPath;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'DierCHAT',
    /** Иконка окна (корень репозитория: icon.jpg → public/icon.jpg) */
    icon: path.join(__dirname, '../public/icon.jpg'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      /** §28 — встроенный браузер `<webview>` */
      webviewTag: true,
    },
    frame: true,
    show: false,
  });

  if (isDev) {
    const devPort = process.env.VITE_DEV_PORT || '5173';
    mainWindow.loadURL(`http://localhost:${devPort}`);
    mainWindow.webContents.openDevTools();
  } else {
    const rendererRoot = getRendererRoot();
    const indexFs = path.join(rendererRoot, 'index.html');
    if (!fs.existsSync(indexFs)) {
      // eslint-disable-next-line no-console
      console.error('[DierCHAT] Нет сборки renderer:', indexFs, 'getAppPath=', app.getAppPath());
    }
    if (process.env.DIERCHAT_DEBUG_ELECTRON === '1') {
      mainWindow.webContents.openDevTools();
    }
    mainWindow.loadURL('app://bundle/index.html');
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('close', (e) => {
    if (isAppQuitting) return;
    if (process.platform === 'darwin') return;
    e.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const iconPath = path.join(__dirname, '../public/icon.jpg');
  const loaded = nativeImage.createFromPath(iconPath);
  const icon =
    loaded.isEmpty() ? nativeImage.createEmpty() : loaded.resize({ width: 16, height: 16 });
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Открыть DierCHAT', click: () => mainWindow?.show() },
    { type: 'separator' },
    {
      label: 'Завершить приложение',
      click: () => {
        isAppQuitting = true;
        tray?.destroy();
        tray = null;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('DierCHAT');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => mainWindow?.show());
}

app.whenReady().then(() => {
  /** Иначе getUserMedia / WebRTC в окне с app:// могут не получать доступ к камере/микрофону */
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (
      permission === 'media' ||
      permission === 'display-capture' ||
      permission === 'fullscreen' ||
      permission === 'speaker-selection'
    ) {
      callback(true);
      return;
    }
    callback(false);
  });

  if (!isDev) {
    const rendererRoot = getRendererRoot();

    protocol.registerFileProtocol('app', (request, callback) => {
      const filePath = resolveAppUrlToFile(request.url, rendererRoot);
      if (!filePath) {
        callback({ error: -6 /* net::ERR_FILE_NOT_FOUND */ });
        return;
      }
      callback({ path: filePath });
    });
  }

  ipcMain.handle('dierchat:open-external-url', async (_e, url: string) => {
    const u = String(url || '').trim();
    if (!/^https?:\/\//i.test(u)) return { ok: false as const };
    try {
      await shell.openExternal(u);
      return { ok: true as const };
    } catch {
      return { ok: false as const };
    }
  });

  /** Отдельный клиент DIERbrowser (Chromium-class); см. docs/DIERbrowser_PLAN.md */
  ipcMain.handle('dierchat:open-dier-browser', async (_e, url: string) => {
    let u = String(url || '').trim();
    if (!u) u = 'about:blank';
    if (!/^https?:\/\//i.test(u) && !u.startsWith('about:')) {
      u = `https://${u}`;
    }
    const fromEnv = process.env.DIERBROWSER_PATH?.trim();
    const besideMessenger = path.join(path.dirname(process.execPath), 'DIERbrowser.exe');
    const candidates = [fromEnv, besideMessenger].filter(Boolean) as string[];
    for (const exe of candidates) {
      if (exe && fs.existsSync(exe)) {
        try {
          const child = spawn(exe, [u], { detached: true, stdio: 'ignore' });
          child.unref();
          return { ok: true as const, method: 'dierbrowser' as const };
        } catch {
          /* fall through */
        }
      }
    }
    try {
      if (/^https?:\/\//i.test(u)) await shell.openExternal(u);
      return { ok: true as const, method: 'system' as const };
    } catch {
      return { ok: false as const, method: 'none' as const };
    }
  });

  ipcMain.handle(
    'dierchat:getDesktopSources',
    async (_event, kind: 'screen' | 'window') => {
      const types = kind === 'screen' ? (['screen'] as const) : (['window'] as const);
      const sources = await desktopCapturer.getSources({
        types: [...types],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true,
      });
      return sources.map((s) => ({
        id: s.id,
        name: s.name,
        thumbnail: s.thumbnail.toDataURL(),
      }));
    }
  );

  createWindow();
  createTray();
});

app.on('before-quit', () => {
  isAppQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && isAppQuitting) app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
});

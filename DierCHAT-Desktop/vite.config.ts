import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/** Local Go API (config.local.json server.port). Override: DIERCHAT_DEV_API_PORT in .env.development.local */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const raw = (env.DIERCHAT_DEV_API_PORT || process.env.DIERCHAT_DEV_API_PORT || '19080').trim();
  const apiPort = /^\d+$/.test(raw) ? raw : '19080';
  const apiTarget = `http://127.0.0.1:${apiPort}`;
  const wsTarget = `ws://127.0.0.1:${apiPort}`;

  /** GitHub Pages: VITE_BASE_PATH=/имя-репо/ (со слэшами). Локально: ./ */
  const baseRaw = (env.VITE_BASE_PATH || process.env.VITE_BASE_PATH || './').trim();
  const base =
    baseRaw === './' || baseRaw === '.'
      ? './'
      : baseRaw.startsWith('/')
        ? baseRaw.endsWith('/')
          ? baseRaw
          : `${baseRaw}/`
        : `./${baseRaw.replace(/^\.\//, '').replace(/\/$/, '')}/`;

  return {
    plugins: [react()],
    base,
    root: '.',
    build: {
      outDir: 'dist/renderer',
      emptyOutDir: true,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        jsmediatags: path.resolve(__dirname, 'node_modules/jsmediatags/dist/jsmediatags.min.js'),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      /** Иначе setSinkId (выбор динамика) в Chromium может молча не применяться */
      headers: {
        'Permissions-Policy':
          'speaker-selection=(self), microphone=(self), camera=(self), display-capture=(self)',
      },
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/ws': { target: wsTarget, ws: true },
        '/media': { target: apiTarget, changeOrigin: true },
      },
    },
  };
});

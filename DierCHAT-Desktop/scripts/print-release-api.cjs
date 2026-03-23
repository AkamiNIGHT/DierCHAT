/**
 * Печатает URL API из .env.production (для контроля перед сборкой APK/EXE).
 * Запуск: node scripts/print-release-api.cjs
 */
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.production');
if (!fs.existsSync(envPath)) {
  console.error('[release] Нет файла .env.production — клиент может уйти на fallback из publicApiUrl.ts');
  process.exit(0);
}
const text = fs.readFileSync(envPath, 'utf8');
const m = text.match(/^\s*VITE_API_BASE_URL\s*=\s*(\S+)/m);
if (m) {
  console.log('[release] VITE_API_BASE_URL из .env.production →', m[1].trim());
} else {
  console.log('[release] В .env.production не найдена строка VITE_API_BASE_URL — используется кодовый fallback (см. publicApiUrl.ts)');
}
const ws = text.match(/^\s*VITE_WS_URL\s*=\s*(\S+)/m);
if (ws) console.log('[release] VITE_WS_URL →', ws[1].trim());
const wsp = text.match(/^\s*VITE_WS_PORT\s*=\s*(\S+)/m);
if (wsp) console.log('[release] VITE_WS_PORT →', wsp[1].trim());

/**
 * Перед сборкой под удалённый хост: проверяет .env.production.
 * Пропуск проверки: set SKIP_HOST_ENV_CHECK=1
 */
const fs = require('fs');
const path = require('path');

if (process.env.SKIP_HOST_ENV_CHECK === '1') {
  console.log('[host-build] SKIP_HOST_ENV_CHECK=1 — проверка .env пропущена');
  process.exit(0);
}

const envPath = path.join(__dirname, '..', '.env.production');
if (!fs.existsSync(envPath)) {
  console.warn(
    '[host-build] Нет .env.production — Vite подставит значения из кода (см. publicApiUrl.ts PRODUCTION_API_BASE_DEFAULT).'
  );
  console.warn('[host-build] Для явного хоста скопируйте .env.production.example → .env.production');
  process.exit(0);
}

const text = fs.readFileSync(envPath, 'utf8');
const api = text.match(/^\s*VITE_API_BASE_URL\s*=\s*(\S+)/m);
const url = api ? api[1].trim() : '';
const local = /localhost|127\.0\.0\.1/i;

if (url && local.test(url)) {
  console.error('[host-build] VITE_API_BASE_URL указывает на localhost — это не «сборка под хост».');
  console.error('[host-build] Укажите URL сервера или задайте SKIP_HOST_ENV_CHECK=1 для осознанной локальной сборки.');
  process.exit(1);
}

if (!url) {
  console.warn('[host-build] В .env.production не задан VITE_API_BASE_URL — сработает fallback из кода.');
}

process.exit(0);

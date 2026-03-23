# DierCHAT — выкладка на хост (продакшен)

Краткий чеклист: **бэкенд**, **reverse proxy (nginx)**, **клиенты** (сайт / Electron / Android) с одним и тем же публичным URL API.

---

## 1. Сервер (DierCHAT-Server)

### Вариант A: Docker (рекомендуется на VPS)

```bash
cd DierCHAT-Server
cp config.deploy.example.json config.json
# Отредактируйте config.json: пароли БД, jwt.secret, media.cdn_base_url
docker compose up -d --build
```

- Порт **9000** наружу лучше не открывать напрямую — только за **nginx** (или firewall `allow 80,443`).
- Папка **`./media`** на хосте монтируется в контейнер — бэкапьте её.
- На проде задайте сильный **`jwt.secret`** (длинная случайная строка).

### Вариант B: бинарник без Docker

1. Установите PostgreSQL 16+ и Redis 7+.
2. Примените миграции из `DierCHAT-Server/migrations/` (или дайте серверу подняться — он подтянет SQL-файлы).
3. `go build -o dierchat-server ./cmd/server` из каталога `DierCHAT-Server`.
4. `DIERCHAT_CONFIG=/path/to/config.json ./dierchat-server`

### Обязательно в `config.json`

| Поле | Значение |
|------|----------|
| `server.host` | `0.0.0.0` |
| `media.cdn_base_url` | Публичный URL до медиа, например `https://ваш-домен.ru/media` |
| `database.*` | Хост/порт/пользователь/пароль продакшен-БД |
| `redis.*` | Продакшен Redis |
| `jwt.secret` | Уникальный секрет, не из примера |

WebSocket и REST идут **с одного порта** (маршрут `GET /ws` на том же HTTP-сервере).

---

## 2. Nginx + HTTPS

Пример конфигурации: **`deploy/nginx-dierchat.example.conf`**.

1. Установите сертификат (Let’s Encrypt / certbot).
2. Проксируйте `/api`, `/ws`, `/media` на `http://127.0.0.1:9000`.
3. Для **веб-версии** раздайте статику из `DierCHAT-Desktop/dist/renderer` (после `npm run build:web:host`) или отдельный `root`.

Если сайт и API на **одном домене**, браузерный клиент сам возьмёт API с `window.location.origin` — удобно для PWA/веба.

---

## 2.1 GitHub Pages (бесплатный фронт)

- В репозитории включите **Pages** с источником **GitHub Actions**.
- Workflow: **`.github/workflows/gh-pages.yml`** (сборка из `DierCHAT-Desktop`).
- Секреты Actions: минимум **`VITE_API_BASE_URL`**; при необходимости `VITE_WS_URL`, `VITE_TURN_*`.
- **`VITE_BASE_PATH`**: в workflow подставляется `/<имя-репозитория>/` (как в URL `https://user.github.io/repo/`). Если сегмент URL другой — задайте переменную репозитория **`VITE_BASE_PATH`** (например `/my-app/`, со слэшами).
- После `vite build` в артефакт копируется **`404.html`** = `index.html`, чтобы прямые ссылки на подпути не ломались.
- Service Worker и PWA-пути учитывают подкаталог (GitHub Pages project site).
- Подробнее: **`GITHUB.md`**.

## 3. Клиент DierCHAT-Desktop (Electron + веб + Android)

### Файл `.env.production`

В каталоге **`DierCHAT-Desktop/`** (не коммитьте реальные секреты в публичный git):

```env
# Публичный URL API (без завершающего /)
VITE_API_BASE_URL=https://ваш-домен.ru
# Если WS на том же хосте что и API — строку можно не задавать.
# Отдельный порт или поддомен:
# VITE_WS_URL=wss://ваш-домен.ru
# или только другой порт на том же хосте, что и VITE_API_BASE_URL:
# VITE_WS_PORT=8081
```

Шаблоны: **`.env.production.example`**, **`.env.production.https.example`**.

### Команды сборки «под хост»

| Задача | Команда (из `DierCHAT-Desktop`) |
|--------|----------------------------------|
| Проверка `.env.production` (не localhost) | `npm run verify:host-env` |
| Печать URL из `.env.production` | `node scripts/print-release-api.cjs` |
| Electron (tsc + vite + упаковка) | `npm run package:host` |
| Только билд Electron без упаковки | `npm run build:host` |
| Статика для сайта (`dist/renderer`) | `npm run build:web:host` |
| Android: синхронизация после веб-билда | `npm run cap:sync:host` |
| Android APK для телефона (подписанный debug) | `npm run android:build:release:host` |
| Android release для Play (нужен keystore) | `npm run android:build:store:host` |
| Подпись keystore | см. **`DierCHAT-Desktop/android/APK-BUILD.md`** |
| **Всё сразу:** Windows + Android | `npm run release:host:all` |

Локальная сборка с `localhost` в `VITE_API_BASE_URL` **намеренно блокируется** скриптом `verify-prod-env.cjs`. Обход только осознанно: `set SKIP_HOST_ENV_CHECK=1` (Windows) перед командой.

### Windows PowerShell (важно)

- В **Windows PowerShell 5.1** (встроенная в Windows) **нет** оператора `&&`. Пишите **две строки** или используйте **`;`**:
  ```powershell
  cd DierCHAT-Desktop
  npm run build:web:host
  ```
  ```powershell
  cd DierCHAT-Desktop; npm run build:web:host
  ```
- Команда перехода в папку — **`cd`**, не `d`.
- **`npm run ...`** нужно запускать из папки **`DierCHAT-Desktop`**, где лежит `package.json`. Из корня `DierCHAT` npm выдаст `ENOENT`.
- В **PowerShell 7+** (`pwsh`) уже есть `&&`: `cd DierCHAT-Desktop && npm run build:web:host`
- Из **корня репозитория** можно без `cd`: `.\build-web-host.ps1` (веб под хост).

```powershell
cd DierCHAT-Desktop
.\scripts\build-host.ps1
# Только portable:
.\scripts\build-host.ps1 -Portable
# Android release под хост:
.\scripts\build-host.ps1 -AndroidRelease
```

---

## 4. Порядок выкладки обновления

1. Деплой **сервера** (новый бинарник/образ + миграции при необходимости).
2. Проверка **nginx** и `cdn_base_url` / доступность `/media`.
3. Сборка **клиентов** с актуальным `.env.production`.
4. Публикация **сайта** (если есть), **EXE/Portable**, **APK** в магазин/сайт.

---

## 5. Firewall (кратко)

- Открыть: **80**, **443** (nginx).
- **5432** (Postgres) и **6379** (Redis) — только `127.0.0.1` или приватная сеть, не в интернет.

---

## 6. Проверка после выкладки

- Логин / код на почту (если SMTP настроен).
- Список чатов, открытие чата (шапка, не «Чат / 0 участников»).
- Отправка сообщения, перезаход — история на месте.
- WebSocket: индикатор онлайн / новые сообщения без перезагрузки.

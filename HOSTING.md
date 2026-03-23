# DierCHAT — выкладка на хост (продакшен)

Краткий чеклист: **бэкенд**, **reverse proxy (nginx)**, **веб-клиент** (статика Vite) с тем же публичным URL API.

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
3. Для **веб-версии** раздайте статику из `DierCHAT-Desktop/dist/renderer` (после `npm run build:web` из каталога `DierCHAT-Desktop` или `.\build-web-host.ps1` из корня) либо отдельный `root`.

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

## 3. Веб-клиент (`DierCHAT-Desktop`)

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

### Сборка статики (`dist/renderer`)

| Задача | Команда |
|--------|---------|
| Статика для сайта | из **`DierCHAT-Desktop`**: `npm run build:web` (или `npm run build`) |
| То же из корня репозитория | `.\build-web-host.ps1` (ожидает `DierCHAT-Desktop\.env.production`) |
| Скопировать в `DierCHAT-Server/web/` | `.\scripts\sync-web-to-server.ps1` или `.\build-web.bat` |

Перед прод-сборкой убедитесь, что в `.env.production` указан **реальный** хост API (не `localhost`), иначе клиент не сможет достучаться до сервера у пользователей.

### Windows PowerShell (важно)

- В **Windows PowerShell 5.1** **нет** оператора `&&`. Пишите **две строки** или **`;`**:
  ```powershell
  cd DierCHAT-Desktop
  npm run build:web
  ```
  ```powershell
  cd DierCHAT-Desktop; npm run build:web
  ```
- **`npm run ...`** запускайте из папки **`DierCHAT-Desktop`**, где лежит `package.json`.
- В **PowerShell 7+**: `cd DierCHAT-Desktop && npm run build:web`
- Из **корня**: `.\build-web-host.ps1`

---

## 4. Порядок выкладки обновления

1. Деплой **сервера** (новый бинарник/образ + миграции при необходимости).
2. Проверка **nginx** и `cdn_base_url` / доступность `/media`.
3. Сборка **клиентов** с актуальным `.env.production`.
4. Публикация **сайта** (статика в nginx / `DierCHAT-Server/web` / GitHub Pages).

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

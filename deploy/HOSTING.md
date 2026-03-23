# DierCHAT — хостинг сайта и API

Сайт — это **SPA** (сборка Vite), бэкенд — **один HTTP-сервер на Go**: он отдаёт статику из папки **`./web`**, API по **`/api/*`**, файлы по **`/media/*`**, WebSocket по **`/ws`**.

Рекомендуемый вариант: **один домен** (`https://dier-chat.ru`). Тогда фронт сам подставит `window.location.origin` как базу API — **дополнительные `VITE_*` при сборке не нужны**.

Чеклист под прод-домен и VDS: **`deploy/dier-chat.ru.md`**.

---

## 1. Собрать веб-клиент и положить в `DierCHAT-Server/web`

Из папки **`DierCHAT-Desktop`**:

```powershell
npm run build:web
```

Скопировать результат в сервер (из **корня репозитория**):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/sync-web-to-server.ps1
```

Вручную: содержимое **`DierCHAT-Desktop/dist/renderer/`** → **`DierCHAT-Server/web/`** (рядом с бинарником на сервере папка должна называться **`web`**).

Архив **`release-dist/dierchat-web-hosting.zip`** (если собирали `scripts/package-release.ps1`) — то же самое: распаковать в `web/`.

---

## 2. Настроить `config.json` на сервере

Обязательно проверьте:

| Поле | Зачем |
|------|--------|
| **`server.port`** | Порт, на котором слушает Go (например `9000`). За Nginx/Caddy проксируйте на него. |
| **`jwt.secret`** | Уникальный длинный секрет в продакшене. |
| **`media.cdn_base_url`** | Публичный URL медиа, **с вашим доменом и HTTPS**, например `https://dier-chat.ru/media` (без завершающего `/` кроме как в примере — см. ваш текущий формат в конфиге). |
| **`database`**, **`redis`** | Хосты паролей БД и Redis на проде. |

Переменные окружения (удобно для Docker) см. в коде: `DIERCHAT_CONFIG`, `DB_*`, `REDIS_*`, `JWT_SECRET`, `CDN_BASE_URL` — см. `pkg/config/config.go` → `ApplyEnvOverrides`.

---

## 3. TLS и reverse proxy

Go может работать по HTTP за прокси — TLS делают **Nginx** или **Caddy**.

### Nginx

Пример готового фрагмента: **`deploy/nginx/dierchat.conf`**.

- Замените `your-domain.ru` и при необходимости порт в `upstream` (если не `9000`).
- Установите сертификат, например: `certbot --nginx -d your-domain.ru`
- Важно: **один** `location /` с проксированием на Go и поддержкой WebSocket (`Upgrade` / `Connection`) — в примере это уже учтено.
- Для больших файлов в конфиге задано **`client_max_body_size 2048M`** (как лимит в конфиге сервера).

### Caddy

Пример: **`deploy/caddy/Caddyfile.example`** — замените домен и порт бэкенда.

---

## 4. Когда нужны `VITE_*` при сборке

Если сайт на **одном домене** с API — **ничего не задаёте**, достаточно шага 1.

Задайте переменные **только если** API на **другом origin** (другой поддомен/порт):

| Переменная | Пример |
|------------|--------|
| `VITE_API_BASE_URL` | `https://api.example.com` |
| `VITE_WS_URL` | `wss://api.example.com/ws` или отдельный порт через `VITE_WS_PORT` |

Пример (PowerShell) перед `npm run build:web`:

```powershell
$env:VITE_API_BASE_URL = "https://api.example.com"
$env:VITE_WS_URL = "wss://api.example.com/ws"
npm run build:web
```

Шаблон: **`DierCHAT-Desktop/.env.production.example`**.

---

## 5. Docker

`DierCHAT-Server/docker-compose.yml`: порт **`9000:9000`** должен совпадать с **`server.port`** в `config.json`.

Соберите образ так, чтобы внутри образа была актуальная папка **`web/`** (скопируйте фронт перед `docker build` или смонтируйте volume на `./web`).

---

## 6. Проверка

- Откройте в браузере `https://ваш-домен/` — должна загрузиться SPA.
- `GET https://ваш-домен/api/health` — ответ от API.
- Вход в приложение и чаты — WebSocket должен подключаться к **`/ws`** на том же хосте.

На **VDS по SSH** (если снаружи «не открывается»):

```bash
systemctl status dierchat --no-pager
curl -sS http://127.0.0.1:9000/api/health
```

- Порт **80** (Nginx → Go): `sudo ufw allow 80/tcp && sudo ufw allow 'Nginx Full'`
- Прямой **:9000** с интернета: в `config.json` уже `server.host: 0.0.0.0` и порт `9000`, нужно **`ufw allow 9000/tcp`** (см. `deploy/set-direct-ip-9000.sh`).

Страница браузера вроде «Страница не найдена» у Яндекса при обращении к IP часто означает **обрыв TCP** (порт закрыт фаерволом / сервис не слушает), а не 404 от приложения.

---

## 7. Systemd (VPS без Docker)

Пример юнита: **`deploy/systemd/dierchat.service.example`** — положите бинарник и `config.json` в `WorkingDirectory`, выставьте пользователя и путь к `DIERCHAT_CONFIG`.

---

## Файлы в репозитории

| Путь | Назначение |
|------|------------|
| `deploy/nginx/dierchat.conf` | Пример Nginx |
| `deploy/caddy/Caddyfile.example` | Пример Caddy |
| `deploy/systemd/dierchat.service.example` | Пример systemd |
| `scripts/sync-web-to-server.ps1` | Копирование сборки в `DierCHAT-Server/web` |
| `deploy-auto.bat` (корень репо) | Windows: `build:web` → `dierchat-deploy.zip` → `scp` → `update-on-server.sh` на сервере |
| `deploy-host.env.example` | Шаблон `DEPLOY_HOST` / `DEPLOY_USER` / `USE_SSH_KEY` для `deploy-auto.bat` |

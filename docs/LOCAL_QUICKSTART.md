# Локальный запуск за 1–2 минуты

## Один терминал (Docker + API)

Из корня репозитория:

- **`ЗАПУСК-ЛОКАЛЬНО-ВСЕ.bat`** (рекомендуется)  
- или **`LocalDev-Stack.bat`** / `powershell -ExecutionPolicy Bypass -File scripts\local-stack.ps1`

Скрипт: при необходимости **запускает Docker Desktop** → `docker compose up -d` → ждёт Postgres/Redis → освобождает **:19080** (или API на **:19081** и строка **`DIERCHAT_DEV_API_PORT`** в **`DierCHAT-Desktop/.env.development.local`** для Vite) → `go run` с **`config.local.json`**.

Сервер **до ~2 минут** повторяет подключение к PostgreSQL и **~1 минуту** к Redis.

Сервер сам подхватывает **`config.local.json`**, если не задан **`DIERCHAT_CONFIG`**.

## Второй терминал (клиент)

```powershell
cd DierCHAT-Desktop
npm run dev
```

Либо только браузер (меньше RAM): `npm run dev:web` → http://127.0.0.1:5173/

Если **`npm run dev`** падает с **heap out of memory** / **esbuild spawn UNKNOWN**: сначала только Vite — **`npm run dev:vite-only`**, затем в другом окне **`npm run dev:main`**; либо закройте лишние программы. Конфиг Vite **без `fs`** — только `loadEnv` (стабильнее на Windows).

## Порты

| Сервис   | Хост |
|----------|------|
| Postgres | **5435** |
| Redis    | **6380** |
| API (локально) | **19080** (запасной **19081** → `.env.development.local`) |

Продакшен на VDS по-прежнему часто **:9000** за Nginx — это **другой** конфиг (`config.json` на сервере), не `config.local.json`.

## Проверка API

```powershell
powershell -ExecutionPolicy Bypass -File scripts\local-test-health.ps1
```

Ожидается JSON с `"ok":true`.

## Если порт API занят

1. **`scripts/local-free-api-port.ps1 -Port 19080`** — два раунда `taskkill` для LISTEN на этом порту.
2. Если не помогло — **`local-stack.ps1`** выставит **`DIERCHAT_HTTP_PORT=19081`** и обновит **`DierCHAT-Desktop/.env.development.local`** → перезапустите **`npm run dev`**.
3. Вручную: **`DIERCHAT_HTTP_PORT=19081`** перед `go run`.

## Полный сброс локальной БД (пересоздать с нуля)

Если **«База данных недоступна»**, битая схема или не тот пароль:

1. Остановите окно с **`go run`** (Ctrl+C).
2. Запустите **`LocalDev-DockerReset.bat`** или **`СБРОС-ЛОКАЛЬНОЙ-БД.bat`** (или `scripts\local-docker-reset.ps1`).
3. Скрипт делает **`docker compose down -v`**, удаляет оставшиеся тома `dierchat*pgdata*` / `*redis*`, снова **`up -d --force-recreate`**, ждёт готовности Postgres/Redis.
4. Снова запустите **`ЗАПУСК-ЛОКАЛЬНО-ВСЕ.bat`** (или `local-server.ps1`).

Учётные данные после сброса: пользователь **`dierchat`**, пароль **`dierchat_secure_pass`**, порт с хоста **`5435`** (см. `config.local.json`).

Подробности: **`docs/LOCAL-SETUP.md`**.

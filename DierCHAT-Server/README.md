# DierCHAT-Server (Go)

API и WebSocket для DierCHAT.

## Текст сообщений (ТЗ §46)

- Поле `messages.text` и тело запросов отправки/редактирования **не** обрабатываются `strings.TrimSpace` и не схлопываются пробелы.
- Общий слой `internal/messagetext` удаляет только невидимые символы-мусор (BOM, ZWSP и т.д.), в одном стиле с клиентом `DierCHAT-Desktop/src/lib/messageText.ts`.
- Подписи к историям (`stories.caption`) также без `TrimSpace`.

Сборка: `go build -o server ./cmd/server`

### Полный сброс локальной БД в Docker

Все данные PostgreSQL/Redis проекта будут удалены:

1. Остановите сервер (`go run` → Ctrl+C).
2. Из корня репозитория: **`LocalDev-DockerReset.bat`** или **`scripts/local-docker-reset.ps1`**.
3. Снова поднимите стек и сервер: **`ЗАПУСК-ЛОКАЛЬНО-ВСЕ.bat`** или **`LocalDev-Stack.bat`**.

### Один клик: Docker + API

Из **корня репозитория** запустите **`ЗАПУСК-ЛОКАЛЬНО-ВСЕ.bat`**: при необходимости стартует Docker Desktop, поднимаются Postgres/Redis, затем сервер. HTTP для локалки — **`:19080`** (`config.local.json`), запасной **`:19081`** + **`DierCHAT-Desktop/.env.development.local`** (`DIERCHAT_DEV_API_PORT`) для прокси Vite. Сервис **до ~2 минут** ждёт PostgreSQL и Redis.

Клиент: **`DierCHAT-Desktop`** → **`npm run dev`** (прокси Vite на тот же порт).

## Локальный запуск (PostgreSQL + Redis)

Без PostgreSQL сервер стартует в урезанном режиме: **вход по коду из email не сработает** (ошибка «База данных недоступна»).

1. Поднять БД и Redis — из **корня** репозитория (`DierCHAT`) или из этой папки:

   ```bash
   # из C:\...\DierCHAT
   docker compose -f docker-compose.local.yml up -d

   # или из C:\...\DierCHAT\DierCHAT-Server
   docker compose -f docker-compose.local.yml up -d
   ```

2. Запускать сервер с конфигом **`config.local.json`** (Postgres на хосте **5435**, Redis **6380**, пароль **`dierchat_secure_pass`**) или скорректировать свой `config.json` под `docker-compose.local.yml`:

   ```bash
   set DIERCHAT_CONFIG=config.local.json   # Windows CMD
   go run ./cmd/server
   ```

3. Убедиться в логе: **«PostgreSQL подключен»**, **«Redis подключен»**, **«HTTP сервер запущен на 0.0.0.0:19080»** (порт из `config.local.json`).

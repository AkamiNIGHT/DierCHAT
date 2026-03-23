# Локальный запуск DierCHAT (сервер + клиент)

## Частые ошибки (PowerShell / Docker)

1. **`open ... docker-compose.local.yml: The system cannot find the file`**  
   Команда запущена не из папки проекта (например из `C:\WINDOWS\system32`). Сначала:
   `cd C:\Users\User\Desktop\DierCHAT`  
   Либо дважды **`LocalDev-DockerUp.bat`** в корне репозитория.

2. **Сначала `up -d`, потом сразу `down`**  
   `down` **останавливает и удаляет контейнеры**. Нужен только **`up -d`**, если хотите работать.  
   Остановить в конце дня: `docker compose -f docker-compose.local.yml down` (без `-v`, если не сбрасываете БД).

3. **`$env:DIERCHAT_CONFIG` после `go run`**  
   Переменная должна быть задана **до** запуска, на **одной вкладке** перед `go run`:
   ```powershell
   cd C:\Users\User\Desktop\DierCHAT\DierCHAT-Server
   $env:DIERCHAT_CONFIG = "config.local.json"
   go run ./cmd/server
   ```
   Проще: **`LocalDev-Server.bat`** или `powershell -File scripts\local-server.ps1`.

4. **`password authentication failed for user "dierchat"`**  
   Том Postgres создан **со старым паролем**. Сброс (удалит данные БД):
   ```powershell
   cd C:\Users\User\Desktop\DierCHAT
   docker compose -f docker-compose.local.yml down -v
   docker compose -f docker-compose.local.yml up -d
   ```
   Или **`LocalDev-DockerReset.bat`**.

5. **`connectex ... 6380: actively refused`**  
   Redis не запущен (часто после п.2 или если `up` не выполнялся). Снова **`local-docker-up.ps1`** / **`LocalDev-DockerUp.bat`**.

6. **`listen tcp ... bind: Only one usage...`**  
   Порт из **`config.local.json`** (локально **19080**) занят. Закройте второй сервер или выполните:
   `powershell -ExecutionPolicy Bypass -File scripts\local-free-api-port.ps1 -Port 19080`

7. **`cd DierCHAT-Server` из уже открытой папки `DierCHAT-Server`**  
   Путь станет `DierCHAT-Server\DierCHAT-Server` — не делайте второй `cd`. Уже находясь в `DierCHAT-Server`, сразу задавайте `$env:` и `go run`.

### Быстрый путь без ручного ввода

Из корня **`DierCHAT`**:

1. `LocalDev-DockerUp.bat` (или `scripts\local-docker-up.ps1`)
2. `LocalDev-Server.bat` (или `scripts\local-server.ps1`)
3. В другом окне: `cd DierCHAT-Desktop` → `npm run dev`

---

## Симптомы: `503` на `/api/auth/verify`, «База данных недоступна»

В режиме **`npm run dev`** (порт **5173**) запросы к `/api` идут через прокси Vite на **`http://127.0.0.1:19080`** (как в `config.local.json` и `vite.config.ts`). Ошибка **503** на **`/api/auth/verify`** почти всегда значит одно из двух:

1. **Go-сервер не запущен** (локально ожидается **:19080**), или  
2. Сервер запущен **без PostgreSQL** (в логе было: *«PostgreSQL недоступен… урезанный режим»*) — тогда вход по коду из письма **невозможен**, пока не поднимете БД и не перезапустите сервер с правильным `config`.

Нужны **три шага**: Docker (Postgres+Redis) → сервер Go с **`config.local.json`** → `npm run dev`. См. раздел «Полный стек» ниже.

---

## Быстрый клиент без локальной БД

Если **Docker Desktop не запущен**, в `DierCHAT-Desktop/.env` можно задать:

```env
VITE_API_BASE_URL=http://ВАШ_СЕРВЕР:9000
```

Перезапустите `npm run dev` (Vite читает `.env` при старте).

Медиа (`/media/...`) в коде разрешаются через `normalizeMediaUrl` на тот же хост, что и `VITE_API_BASE_URL`, чтобы не уходить на прокси Vite → `localhost:9000` без файлов.

### WebSocket

Если REST доступен, а в консоли ошибка `WebSocket ... failed` на `ws://<хост>:9000`, часто **WS вынесен на другой порт** (в `config.json` сервера есть `ws_port`, по умолчанию 8081). В `.env` добавьте, например:

```env
VITE_WS_PORT=8081
```

или полный `VITE_WS_URL=ws://ВАШ_ХОСТ:8081`. Перезапустите `npm run dev`.

## Полный стек на своей машине

1. **Запустите Docker Desktop** (иначе `docker compose` не поднимет контейнеры).

2. **PostgreSQL + Redis** (из корня репозитория или из папки сервера — где лежит ваш `docker-compose.local.yml`):

```powershell
# вариант А — из корня репозитория DierCHAT
cd <путь-к-DierCHAT>
docker compose -f docker-compose.local.yml up -d

# вариант Б — из DierCHAT-Server
cd DierCHAT-Server
docker compose -f docker-compose.local.yml up -d
```

Порты: Postgres на хосте **5435**, Redis на хосте **6380** (часто **5433** и **6379** уже заняты другими сервисами на ПК).

3. **API (обязательно конфиг под Docker):**

```powershell
cd DierCHAT-Server
$env:DIERCHAT_CONFIG = "config.local.json"
go run ./cmd/server
```

Либо после `go build`: запускайте бинарник из этой же папки с **`DIERCHAT_CONFIG=config.local.json`**.  
В логе должно быть: **`PostgreSQL подключен`**, **`HTTP сервер запущен на 0.0.0.0:19080`** (порт из `config.local.json`).  
Если видите только предупреждение про недоступный Postgres — проверьте шаг 2 и переменную **`DIERCHAT_CONFIG`**.

4. **Клиент (Electron + Vite):**

```powershell
cd DierCHAT-Desktop
# В .env не задавайте VITE_API_BASE_URL для локального API (Electron+Vite ходят на прокси :5173 → :19080)
npm run dev
```

Если **`JavaScript heap out of memory`** / падает esbuild: закройте лишние приложения, либо откройте **только браузер** без Electron:

```powershell
npm run dev:web
```

(тот же Vite на **5173**, API через прокси на **127.0.0.1:19080** — сервер Go должен быть запущен).

Скрипты **`scripts/local-*.ps1`**: в `Write-Host` используется **только ASCII**, чтобы Windows PowerShell 5.1 не ломался на кодировке UTF-8 без BOM.

## Смена пароля Postgres в Docker

Если контейнер уже создавался со **старым** паролем, смена `POSTGRES_PASSWORD` в compose не поможет — удалите том:

```powershell
docker compose -f docker-compose.local.yml down -v
docker compose -f docker-compose.local.yml up -d
```

*(Все данные БД в этом томе будут удалены.)*

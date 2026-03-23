# Структура репозитория (веб + сервер)

Репозиторий сфокусирован на **развёртывании сайта** и **backend API**.

| Путь | Назначение |
|------|------------|
| `DierCHAT-Server/` | Backend (Go): HTTP API, WebSocket, миграции БД, встроенная раздача статики из `web/`. |
| `DierCHAT-Desktop/` | **Веб-клиент** (React + Vite): собирается в `dist/renderer`, копируется в `DierCHAT-Server/web` (`build-web.bat` или `scripts/sync-web-to-server.ps1`). |
| `deploy/` | Скрипты и примеры конфигов для продакшн-сервера (nginx, systemd и т.д.). |
| `.github/workflows/` | CI: сборка веб-клиента и `go build` сервера; при необходимости GitHub Pages. |

Десктоп (Electron), Android (Capacitor) и отдельный **DIERbrowser** из репозитория убраны — только цепочка «фронт → `web/` → Go-сервер».

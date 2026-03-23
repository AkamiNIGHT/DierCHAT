# Структура репозитория (ТЗ §45)

Целевая схема модулей (постепенный рефакторинг):

| Путь | Назначение |
|------|------------|
| `DierCHAT-Desktop/` | Клиент мессенджера (React + Electron + Capacitor Android). |
| `DierCHAT-Server/` | Backend API + WebSocket (Go). |
| `docs/DIERbrowser_PLAN.md` | План отдельного **DIERbrowser** (Chromium-class, tooling C#). |
| `firefox-main/` | Reference / будущая интеграция; не обязателен для сборки мессенджера. |

Общий код (WebRTC, auth helpers) пока живёт в `DierCHAT-Desktop/src`; выделение в `shared/` — по мере необходимости.

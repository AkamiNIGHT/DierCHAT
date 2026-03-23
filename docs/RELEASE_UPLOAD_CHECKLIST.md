# Чеклист выгрузки (хост + клиенты)

Собрать всё локально (Windows, из корня репозитория):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-upload-bundle.ps1
```

Артефакты появятся в **`release-dist/`**. Ниже — куда что обычно кладут.

---

## 1. Сервер (VDS / хост)

| Файл | Назначение |
|------|------------|
| **`dierchat-deploy.zip`** | Распаковать на сервере: Go-сборка бинарника, `config.json`, nginx/Caddy, systemd. Скрипты: `install.sh`, `update-on-server.sh`, см. `HOSTING.md` внутри архива. |
| **`dierchat-web-hosting.zip`** | Только SPA, если фронт отдаёте **отдельно** от Go (редко; чаще `web/` уже внутри deploy zip). |

Перед выкладкой:

- Прописать прод **`config.json`** (Postgres, Redis, SMTP, JWT, домены).
- Собрать бинарник под Linux на сервере или в CI:  
  `cd deploy-package && go build -o dierchat-server ./cmd/server`  
  (или копировать исходники из zip и собирать там).

Подробнее: **`deploy/HOSTING.md`**, **`deploy/dier-chat.ru.md`**, **`DEPLOY-TIMEHOST.md`**.

---

## 2. Мессенджер Windows

| Файл | Назначение |
|------|------------|
| **`dierchat-desktop-windows.zip`** | Распаковать пользователю: **portable** `.exe` и/или **NSIS** `DierCHAT Setup …exe`. |

---

## 3. Мессенджер Android (APK)

| Файл | Назначение |
|------|------------|
| **`dierchat-android-debug.apk`** | Копия debug-сборки (источник: **`DierCHAT-Desktop/release/dier-chat.apk`**). Для **Google Play** нужен **release** с подписью — см. **`deploy/ANDROID.md`**, `assembleRelease` + keystore. |

Перед сборкой задайте **`VITE_API_BASE_URL`** / **`VITE_WS_URL`** (или `VITE_WS_PORT`) под ваш прод, затем снова `npm run build:web` и пересоберите пакет.

---

## 4. DIERbrowser (только Windows)

| Файл | Назначение |
|------|------------|
| **`dierbrowser-windows-net8-webview2.zip`** | Меньший размер; на ПК должны быть **.NET 8** и **WebView2 Runtime**. |
| **`dierbrowser-windows-self-contained-x64.zip`** | Один основной `.exe` + распаковка; удобнее раздавать пользователям без .NET (если сборка в скрипте прошла). |

**Отдельного нативного DIERbrowser под Android в репозитории нет** — см. **`DIERbrowser_ANDROID.md`** в этой же папке `release-dist/` после сборки.

---

## 5. Именование версий

Рекомендуется перед выгрузкой переименовать файлы с версией/датой, например:

`dierchat-deploy-1.0.0-20260322.zip`

---

## Быстрые команды без Android / без браузера

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-upload-bundle.ps1 -SkipAndroid
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-upload-bundle.ps1 -SkipBrowser
```

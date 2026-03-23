# Браузер в сборках EXE и APK

## Windows (Electron + DIERbrowser.exe)

Мессенджер ищет отдельный браузер **`DIERbrowser.exe` в той же папке, что и `DierCHAT.exe`** (см. `electron/main.ts`, переменная `DIERBROWSER_PATH` — опциональный путь).

### Как вшить браузер в portable / установщик

1. Установите [.NET SDK 8](https://dotnet.microsoft.com/download).
2. Из папки **`DierCHAT-Desktop`**:
   ```powershell
   npm run browser:pack-win
   ```
   Появится **`browser-bundle/DIERbrowser.exe`** (в git не кладётся).
3. Соберите клиент как обычно:
   ```powershell
   $env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
   npm run package:win
   ```
   Хук **`afterPack`** (`scripts/electron-after-pack.cjs`) скопирует `DIERbrowser.exe` в каталог приложения рядом с exe.

**Одной командой:** `npm run package:win:with-browser` (сборка .NET + Electron).

Из корня репозитория: **`build-messenger-windows-with-browser.bat`** или **`build-messenger-all-with-browser.bat`**.

Если **`browser-bundle/DIERbrowser.exe` нет**, сборка Electron **всё равно пройдёт**; кнопка «DIERbrowser» откроет ссылку в **системном** браузере.

---

## Android (APK)

Отдельного APK **DIERbrowser** в репозитории нет — на телефоне работает **встроенный браузер** в том же приложении (`BrowserPanel.tsx`: iframe в WebView Capacitor).

Подготовка для выгрузки:

1. Обычная сборка: `npm run android:build:debug` (или release) — в пакет попадает весь фронт, включая панель браузера.
2. В **`capacitor.config.json`** задано **`server.allowNavigation`** — разрешена навигация по `http(s)://…` из приложения (нужно для ссылок и части сценариев WebView).
3. В **`MainActivity`** включены **DOM Storage** и **third-party cookies** в WebView — удобнее для сайтов во встроенном браузере (логины во iframe).

Ограничение: многие сайты **запрещают отображение в iframe** (X-Frame-Options / CSP) — тогда используйте кнопку **«В системном браузере»** в панели браузера. Отдельный нативный DIERbrowser под Android — см. **`docs/DIERbrowser_ANDROID.md`**.

---

## Полный пакет выгрузки (веб + exe + zip браузера + apk)

Скрипт **`scripts/build-upload-bundle.ps1`** по-прежнему собирает zip’ы **`dierbrowser-windows-*.zip`** для раздачи отдельно. Вшитие в EXE — это шаг **`npm run browser:pack-win`** + **`package:win`** выше.

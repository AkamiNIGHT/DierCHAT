# DierCHAT — подготовка и сборка APK + Windows EXE

Всё делается из папки **`DierCHAT-Desktop`** (в корне репозитория).

---

## 1. Один раз на машине сборки

| Что | APK (Android) | EXE (Windows) |
|-----|----------------|-----------------|
| **Node.js** | LTS 18+ / 20+ | То же |
| **Зависимости** | `npm install` в `DierCHAT-Desktop` | То же |
| **Дополнительно** | [Android Studio](https://developer.android.com/studio) (SDK), в `android/local.properties` строка `sdk.dir=...` или переменная **`ANDROID_HOME`** | Ничего, кроме Node |
| **Java** | **JDK 17+** (удобно JBR из Android Studio). Если Gradle ругается на Java 8 — скрипт сборки сам ищет JBR; при необходимости: `set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr` (PowerShell) | Не нужен |
| **Иконка** | Берётся из Android-ресурсов / Capacitor | Файл **`public/icon.jpg`** (для установщика желательно позже `.ico`) |

---

## 2. Продакшен-URL API

По умолчанию в репозитории лежит **`DierCHAT-Desktop/.env.production`** (вшивается в `npm run build` / `build:web`): API **`http://31.148.99.40:9000`**. Electron и APK после **пересборки** ходят туда, а не на `localhost:9000`.

Сменить сервер: отредактируйте `.env.production`, затем пересоберите клиент.

Альтернатива — переменные перед сборкой (**PowerShell**):

```powershell
cd DierCHAT-Desktop
$env:VITE_API_BASE_URL = "https://dier-chat.ru"
$env:VITE_WS_URL = "wss://dier-chat.ru"
npm run build:web
```

(`VITE_WS_URL` **без** суффикса `/ws` — клиент добавит сам.)

Для **APK** после смены URL снова `npm run android:build:debug`. Для **EXE** — `npm run package:win`.

Шаблон и комментарии: **`.env.production.example`**.

### Версия релиза (EXE и отображаемое имя в APK)

- **`DierCHAT-Desktop/package.json`** → поле **`version`** (имена артефактов Electron: `dier-chat-1.1.2-Portable.exe` и т.д.).
- **`DierCHAT-Desktop/android/app/build.gradle`** → **`versionCode`** (целое, +1 на каждый выпуск в Play) и **`versionName`** (строка, обычно как в `package.json`).

После смены версии: снова **`build-messenger-all.bat`** / **`npm run release:all`** или отдельно EXE и APK.

---

## 3. Команды сборки

### Всё сразу (из корня репозитория)

- **`deploy-auto.bat`** (в корне) — `npm install` → **`build:web`** → **`pack-deploy.ps1`** → `scp` → **`update-on-server.sh`** на VDS (см. комментарии в `.bat`).
- **`build-messenger-all.bat`** — `npm install` → **EXE** (portable + NSIS) → **debug APK** → **`release\dier-chat.apk`**. Перед сборкой выводит версию и URL из `.env.production`.
- В **`DierCHAT-Desktop`**: `npm run release:all` — то же без `npm install` (печать API → `package:win` → `android:build:debug`). Проверка URL: `npm run release:print-api`.

Открой **PowerShell** или **cmd**, перейди в проект:

```powershell
cd C:\Users\User\Desktop\DierCHAT\DierCHAT-Desktop
npm install
```

### Windows: portable EXE + установщик NSIS

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npm run package:win
```

**Результат:** папка **`DierCHAT-Desktop\release\`**

- `dier-chat-<версия>-Portable.exe`
- `dier-chat-<версия>-Setup.exe`

Только установщик:

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npm run package:win:installer
```

### Android: debug APK (установка на телефон для теста)

```powershell
npm run android:build:debug
```

**Результат:**

- **`release\dier-chat.apk`** — удобное имя для копирования
- `android\app\build\outputs\apk\debug\app-debug.apk` — артефакт Gradle

### Android: release APK (магазин — нужна подпись)

```powershell
npm run android:build:release
```

Без настроенного keystore сборка может завершиться ошибкой. См. **`deploy/ANDROID.md`**.

---

## 4. Быстрый запуск из корня репозитория (Windows)

| Задача | Файл |
|--------|------|
| APK debug | Двойной щелчок **`build-android-apk.bat`** или из cmd: `build-android-apk.bat` |
| Windows EXE | **`build-messenger-windows.bat`** (в корне репо) |

---

## 5. Версия приложения

- **Desktop / установщик:** `DierCHAT-Desktop\package.json` → поле **`version`**
- **Android:** `DierCHAT-Desktop\android\app\build.gradle` → **`versionCode`** и **`versionName`**

После смены версии снова выполни нужные команды из раздела 3.

---

## 6. Проверка

- **EXE:** запустить `*-Setup.exe` или portable, открыть приложение, проверить вход.
- **APK:** установить `dier-chat.apk`, проверить API (сеть/сертификат на HTTPS).

Подробнее по Android: **`deploy/ANDROID.md`**, по Windows: **`deploy/BUILD-WINDOWS.md`**.

---

## 7. Браузер (DIERbrowser + встроенная панель)

- **EXE с отдельным DIERbrowser рядом:** `npm run browser:pack-win` затем `npm run package:win`, или **`npm run package:win:with-browser`**. Батники: **`build-messenger-windows-with-browser.bat`**, **`build-messenger-all-with-browser.bat`**. Описание: **`docs/BROWSER-BUNDLE-EXE-APK.md`**.
- **APK:** встроенный браузер уже в веб-сборке; после `cap sync` в Android подтягиваются настройки из `capacitor.config.json` (`allowNavigation`) и `MainActivity` (WebView).

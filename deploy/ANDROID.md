# DierCHAT — сборка Android (Capacitor)

В **`DierCHAT-Desktop`** добавлен нативный проект **`android/`** (Capacitor 8).

## Требования

- [Node.js](https://nodejs.org/) (как для десктопа)
- [Android Studio](https://developer.android.com/studio) с **Android SDK** (в комплекте **JBR** — JDK 17+ для Gradle)
- **`ANDROID_HOME`** или файл **`android/local.properties`** с `sdk.dir=...` (путь к Android SDK)

Если Gradle пишет **«This build uses a Java 8 JVM»**: в системе по умолчанию старая Java. Скрипт `npm run android:build:debug` сам подставляет **JBR из Android Studio** (`…\Android Studio\jbr`), если найдёт его. Вручную:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
```

После установки Studio выполните один раз открытие проекта:

```bash
cd DierCHAT-Desktop
npm run android:open
```

Studio подтянет Gradle и при необходимости предложит установить недостающие компоненты.

## Сборка debug APK (командная строка)

**Быстрый способ из корня репозитория** (Windows): двойной щелчок или `build-android-apk.bat` — внутри вызывается `npm run android:build:debug`.

Из папки **`DierCHAT-Desktop`**:

**Windows (cmd / PowerShell):**

```powershell
npm run android:build:debug
```

**macOS / Linux** — та же команда (внутри вызывается `./gradlew` с подходящим `JAVA_HOME`):

```bash
npm run android:build:debug
```

Готовый APK (после `npm run android:build:debug`):

- **`DierCHAT-Desktop/release/dier-chat.apk`** — копия с понятным именем (скрипт `scripts/copy-android-apk.cjs`)
- Исходный Gradle-артефакт: `android/app/build/outputs/apk/debug/app-debug.apk`

Для **release** то же имя **`release/dier-chat.apk`** (перезаписывается при каждой сборке).

### В составе полной выгрузки

Из корня репозитория скрипт **`scripts/build-upload-bundle.ps1`** (или **`BUILD-UPLOAD-ALL.bat`**) копирует debug APK в **`release-dist/dierchat-android-debug.apk`**, если Gradle успешно отработал.

Релизный APK для магазина:

```powershell
cd DierCHAT-Desktop
npm run android:build:release
```

Нужна **подпись** (keystore в `android/app` или настройки Studio). Без подписи `assembleRelease` может завершиться ошибкой.

## Что делает `cap:sync`

1. `vite build` → **`dist/renderer`**
2. `npx cap sync android` — копирует веб-ресурсы в Android-проект

Папка **`android/app/src/main/assets/public`** генерируется при sync и в `.gitignore` — перед сборкой всегда запускайте `npm run cap:sync` или скрипты выше.

## API и HTTP

Для подключения к серверу по **HTTP** (например `http://192.168.0.5:9000`) в манифесте включён **cleartext** и `network_security_config`. Для продакшена с **HTTPS** можно ужесточить конфиг в `android/app/src/main/res/xml/network_security_config.xml`.

Переменные **`VITE_API_BASE_URL`**, **`VITE_WS_URL`** задаются **на этапе** `npm run build:web` (см. `deploy/HOSTING.md`).

## Иконка лаунчера

Сейчас используются стандартные mipmaps Capacitor. Чтобы подставить ваш **`public/icon.jpg`**:

1. Android Studio → **File → New → Image Asset**
2. Или пакет `@capacitor/assets` + конфиг ресурсов (см. [Capacitor Assets](https://capacitorjs.com/docs/guides/splash-screens-and-icons))

## Звонки / камера / микрофон

В манифесте уже есть `RECORD_AUDIO`, `CAMERA` и др.; в `MainActivity` включено `setMediaPlaybackRequiresUserGesture(false)` — иначе WebView часто **не воспроизводит** удалённый звук в WebRTC.

**Демонстрация экрана** в нативном приложении **отключена** (в WebView нет нормальной поддержки `getDisplayMedia`, как на ПК). Для демонстрации используйте **десктоп** или Electron.

Если в **браузере** на телефоне тоже тишина в звонке — после деплоя обновите сайт: для аудиозвонка удалённый поток воспроизводится через **`<video playsInline>`**, не через `<audio>`.

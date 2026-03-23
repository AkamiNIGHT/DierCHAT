DierCHAT — Android (Capacitor)

В репозитории есть проект DierCHAT-Desktop/android/ (Capacitor 8).

Сборка debug APK:
  npm run android:build:debug        (Windows)
  npm run android:build:debug:unix   (macOS / Linux)

Нужны: JDK 17+ (лучше JBR из Android Studio), ANDROID_HOME или файл android/local.properties (sdk.dir=...).

Полная инструкция: deploy/ANDROID.md (также в архиве dierchat-android-debug.zip).

Иконка лаунчера: замените mipmaps в Android Studio (Image Asset) или используйте @capacitor/assets.

Веб-хостинг и переменные VITE_*: см. dierchat-web-hosting.zip (HOSTING.md).

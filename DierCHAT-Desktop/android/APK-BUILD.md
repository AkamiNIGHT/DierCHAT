# Сборка подписанного APK (DierCHAT)

## 1. URL API (вшивается в веб-сборку)

В корне **`DierCHAT-Desktop`** файл **`.env.production`**:

```env
VITE_API_BASE_URL=https://ваш-сервер.ru
```

### Сборка APK для установки с телефона (рекомендуется)

Команда **`npm run android:build:release:host`** собирает **`assembleDebug`**: APK **всегда подписан** отладочным ключом Gradle — такой файл **нормально ставится** с файламенеджера / «Загрузок». Раньше использовался `release` без keystore → получался **unsigned** → ошибка «пакет недействителен».

```powershell
cd DierCHAT-Desktop
npm run android:build:release:host
```

Готовый файл: **`release\dier-chat.apk`** (это debug-сборка с вашим `.env.production`).

### Google Play / свой release-ключ

Тогда: **`npm run android:build:store:host`** (после настройки `keystore.properties` + `release.keystore`). См. раздел 2.

### «Пакет недействителен» / мессенджер «не качает» APK

- Убедитесь, что ставите **`dier-chat.apk`** после команды выше (не старый файл из кэша).
- Часть мессенджеров **режет** `.apk` — копируйте через **USB**, **Google Drive**, **прямую ссылку** в браузере телефона.
- Если на телефоне уже стоял DierCHAT с **другой подписью** — **удалите приложение**, затем установите снова.

### Почему APK стал меньше на ~1 МБ

Обычно это нормально: другой **хэш/содержимое** веб-бандла после `vite build` (другой split чанков), сборка **release** без отладочного мусора по сравнению с **debug** APK, или прошлый файл был **debug**. Не означает «обрезали функции», если `npm run cap:sync` прошёл до `assembleRelease`.

## 2. Своя подпись (Play Market и «боевой» релиз)

1. Перейдите в каталог **`android`**:

   ```powershell
   cd DierCHAT-Desktop\android
   ```

2. Создайте keystore (сохраните пароли в менеджере):

   ```powershell
   cd DierCHAT-Desktop
   .\scripts\android-init-keystore.ps1
   ```

   Или вручную из каталога **`android`**:

   ```powershell
   keytool -genkeypair -v -storetype PKCS12 -keystore release.keystore -alias dierchat -keyalg RSA -keysize 2048 -validity 10000
   ```

3. Скопируйте **`keystore.properties.example`** → **`keystore.properties`** и пропишите `storePassword`, `keyPassword`, `keyAlias`, `storeFile` (как в примере).

4. Соберите снова:

   ```powershell
   cd ..
   npm run android:build:release:host
   ```

Gradle подхватит **`android/keystore.properties`** и соберёт **`app-release.apk`** (подписанный). Скрипт копирования отдаёт предпочтение APK **без** `unsigned` в имени.

## 3. Готовый файл

- **`DierCHAT-Desktop/release/dier-chat.apk`**

Если раньше стояла другая сборка (другой ключ подписи), сначала **удалите** приложение DierCHAT с телефона, затем установите новый APK — иначе Android может отказать в обновлении.

## Capacitor

Исходный конфиг: **`DierCHAT-Desktop/capacitor.config.json`** (`webDir`, `appId`, `allowMixedContent`, схема `https` для WebView).

После смены **`capacitor.config.json`** выполните `npx cap sync android`.

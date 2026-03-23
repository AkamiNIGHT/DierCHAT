# DierCHAT — порядок «по старинке»

## Один скрипт: всё для выгрузки (рекомендуется)

Из **корня репозитория** (Windows, PowerShell):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-upload-bundle.ps1
```

или двойной щелчок **`BUILD-UPLOAD-ALL.bat`**.

В папке **`release-dist/`** появятся:

- `dierchat-web-hosting.zip`, `dierchat-deploy.zip`, `dierchat-desktop-windows.zip` (как в `build-all-release.ps1`)
- `dierbrowser-windows-net8-webview2.zip` и `dierbrowser-windows-self-contained-x64.zip` — два варианта DIERbrowser для ПК
- `dierchat-android-debug.apk` — если собрался Gradle (иначе см. лог и `deploy/ANDROID.md`)
- `README-UPLOAD.txt`, `RELEASE_UPLOAD_CHECKLIST.md`, `DIERbrowser_ANDROID.md`

Чеклист выгрузки: **`docs/RELEASE_UPLOAD_CHECKLIST.md`**.

---

Три **отдельных** действия (вручную): сначала деплой на хост, потом при необходимости APK в Android Studio, потом установщик Windows.

---

## 1) Деплой на сервер (сайт + бэкенд из zip)

Из **корня репозитория** запустите:

```bat
deploy-auto.bat
```

Что делает скрипт:

1. `npm run build:web` в `DierCHAT-Desktop`
2. `pack-deploy.ps1` → `dierchat-deploy.zip` в корне
3. `scp` архива на VDS
4. по `ssh` — `update-on-server.sh` (или `--first` / `--fresh`)

Настройки хоста: файл **`deploy-host.env`** рядом с `deploy-auto.bat` (см. комментарии в начале `deploy-auto.bat`).

Подробнее: **`deploy/HOSTING.md`**, **`deploy/dier-chat.ru.md`**.

**Этот шаг не собирает APK и не собирает EXE.**

---

## 2) APK (Android) — вручную в Android Studio

1. Один раз: в `DierCHAT-Desktop` при необходимости `npm install`, синхронизация веба в нативный проект уже описана в **`deploy/ANDROID.md`**.
2. Откройте проект **`DierCHAT-Desktop/android`** в **Android Studio**.
3. Сборка: меню **Build → Build Bundle(s) / APK(s) → Build APK(s)** или в терминале Studio:

   ```text
   gradlew assembleDebug
   ```

   (или `assembleRelease` для релиза, с подписью).

Готовый debug APK обычно:

`DierCHAT-Desktop/android/app/build/outputs/apk/debug/app-debug.apk`

---

## 3) Установщик Windows (EXE + NSIS) — отдельно

Из **корня репозитория** (нужны Node, `npm install` в `DierCHAT-Desktop`, файл `public/icon.jpg`):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-desktop-windows.ps1
```

Результат:

- **`DierCHAT-Desktop/release/`** — portable **`dier-chat-*-Portable.exe`** и установщик **`dier-chat-*-Setup.exe`**
- **`release-dist/dierchat-desktop-windows.zip`** — архив содержимого `release/`

Документация: **`deploy/BUILD-WINDOWS.md`**.

---

## Дополнительно (не обязательно)

| Скрипт | Зачем |
|--------|--------|
| `scripts/build-all-release.ps1` | Собрать за раз **веб-zip + dierchat-deploy.zip копия в release-dist + Windows zip** (без Android). Удобно сложить артефакты в `release-dist/` без деплоя по SSH. |
| `pack-deploy.ps1` | Только собрать `dierchat-deploy.zip` без `deploy-auto` (ручная выкладка). |

Если нужен только архив для сервера без scp/ssh — достаточно после `npm run build:web` запустить `pack-deploy.ps1` вручную.

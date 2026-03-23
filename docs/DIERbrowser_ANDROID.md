# DIERbrowser на Android (отдельно от ПК)

Встроенная панель браузера в **APK мессенджера** и настройки WebView: **`docs/BROWSER-BUNDLE-EXE-APK.md`**.

## Текущее состояние репозитория

**DIERbrowser** в каталоге `DIERbrowser/` — это **Windows-приложение** (.NET 8 + **WebView2**).  
WebView2 существует **только для Windows** (и частично для WinApp SDK); **готового APK DIERbrowser в проекте нет**.

Мессенджер **DierCHAT** на Android — это **Capacitor + WebView** в `DierCHAT-Desktop/android/` (отдельное приложение, не DIERbrowser).

---

## Варианты «браузера» на телефоне для пользователей

1. **Веб-версия**  
   Открыть ваш сайт в **Chrome / Edge на Android** — тот же фронт, если вы его хостите (из `dierchat-web-hosting.zip` или в составе сервера).

2. **Встроить оболочку «браузер» в Capacitor (отдельная задача)**  
   Новый модуль или отдельное приложение: одна `Activity` с `WebView`, адресная строка, вкладки — по ТЗ можно повторить UX DIERbrowser, но это **другой код** (Kotlin/Java), не копия `MainForm.cs`.

3. **Custom Tabs**  
   Из мессенджера открывать ссылки во внешнем браузере или Chrome Custom Tabs — уже может быть в настройках клиента.

---

## Если решите делать нативный Android «DIERbrowser»

Краткий план:

- Создать проект **Empty Activity** (Android Studio) или модуль в монорепо.
- `WebView` + `WebViewClient` / `WebChromeClient`, разрешения интернета, HTTPS.
- Опционально: `SwipeRefreshLayout`, панель URL, история в `SharedPreferences`, отдельный APK в маркет.

Сборка и подпись — как для обычного release APK (аналогично **`deploy/ANDROID.md`** для мессенджера).

---

## Что отдавать заказчику сейчас

Для выгрузки с ПК используйте артефакты из **`release-dist/`** после:

`scripts/build-upload-bundle.ps1`

- Браузер для ПК: **`dierbrowser-windows-*.zip`**
- Для Android в этом репозитории — **мессенджер APK**, не DIERbrowser, если не делали отдельный проект.

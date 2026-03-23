# DIERbrowser

Отдельный браузер на **.NET 8 + WebView2**. Внутри — **Chromium** тот же класс, что в Microsoft Edge (рантайм WebView2), без сборки `chromium/src` у себя. См. `docs/DIERbrowser_ENGINES.md`.

## Возможности (ТЗ §47)

- Несколько **вкладок** в стиле **Edge**: скруглённые плитки, активная с синей полосой, **крестик** на вкладке, **перетаскивание** порядка, **ПКМ** — меню вкладки; **долгое нажатие** (~0,5 с) — то же для сенсора. Прокрутка полосы вкладок, **+** в конце.
- **Режимы:** ширина окна **&lt; 720 px** — компакт («телефон»): крупнее вкладки и адресная строка, в тулбаре скрыты «Закладки»/«История»/«Перейти». **≥ 720 px** — полный ПК-вид.
- Общий профиль WebView2: **куки между вкладками**.
- **Назад / вперёд / обновить / домой**, строка адреса, открытие в новой вкладке по `target=_blank`.
- **Закладки** и **история** (JSON в `%LocalAppData%\DIERbrowser\`).
- **Настройки** (как `chrome://settings`): в адресной строке `dierbrowser://settings` или `chrome://settings` → окно настроек; JSON `browser_settings.json` в `%LocalAppData%\DIERbrowser\`.
- **История загрузок**: `dierbrowser://downloads` / `chrome://downloads`, журнал `downloads.json`, папка из настроек.
- **Инкогнито**: отдельное временное хранилище профиля, при закрытии окна удаляется; без записи истории и без предложения сохранить пароль.
- **Инструменты разработчика**: **F12** или **Ctrl+Shift+I** (`OpenDevToolsWindow`).
- **Автозаполнение паролей** (опционально): после отправки формы — диалог **Сохранить / Никогда / Не сейчас**; хранение через **DPAPI** (Windows). Автозаполнение адресов в настройках — заготовка под будущее.
- **Расширения Chrome**: WebView2 **не** поддерживает установку расширений из Chrome Web Store «как в Chrome»; в настройках — пояснение и кнопка открытия магазина во **внешнем** браузере.
- Горячие клавиши: **Ctrl+T** / **Ctrl+W** / **Ctrl+L**, **Ctrl+Shift+N** (новое окно инкогнито), **F5**, **Alt+←/→**, **F12** / **Ctrl+Shift+I**.

## Сборка (Windows)

Нужны [.NET 8 SDK](https://dotnet.microsoft.com/download) и [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/).

```powershell
cd DIERbrowser
dotnet build -c Release
```

`DIERbrowser.exe`: `bin\Release\net8.0-windows\` (рядом с `DIERbrowser.dll` при не-single-file).

### Два варианта для раздачи пользователям (из корня репозитория)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-upload-bundle.ps1 -SkipAndroid -SkipHostZip
```

Или только браузер вручную:

1. **С установленным .NET 8** (меньше размер):  
   `dotnet publish -c Release -r win-x64 --self-contained false -o ./out-fd`
2. **Self-contained, один exe** (без установки .NET):  
   `dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o ./out-sc`

**Android:** отдельного APK DIERbrowser в проекте нет (WebView2 — Windows); см. **`docs/DIERbrowser_ANDROID.md`**.

Скопируйте `DIERbrowser.exe` + зависимости в каталог с мессенджером или задайте `DIERBROWSER_PATH`.

## Запуск

```text
DIERbrowser.exe https://example.com
```

## Нужен ли сервер DierCHAT (мессенджер) для работы браузера?

**Нет.** Для открытия сайтов в интернете сервер **DierCHAT-Server** не используется: браузер сам ходит на выбранные вами URL по HTTPS.

**Опционально позже:** единый вход с мессенджером (передача токена при старте, своя страница на вашем хосте, синхронизация закладок через API) — отдельная доработка, не обязательна для «просто браузер».

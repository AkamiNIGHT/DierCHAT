# DIERbrowser для сборки DierCHAT (Windows)

Сюда кладётся **`DIERbrowser.exe`** скриптом:

```bash
npm run browser:pack-win
```

Файл **не коммитится** (см. корневой `.gitignore`). После сборки запускайте **`npm run package:win`** — `electron-after-pack` скопирует exe **рядом с `DierCHAT.exe`** в portable и установщике.

Требования: [.NET SDK 8](https://dotnet.microsoft.com/download), проект `DIERbrowser/DIERbrowser.csproj` в корне репозитория.

Подробнее: **`docs/BROWSER-BUNDLE-EXE-APK.md`**.

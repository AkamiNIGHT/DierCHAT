# Сборка Windows (EXE portable + установщик NSIS)

## Подготовка (один раз)

1. **Node.js** LTS установлен.
2. В папке **`DierCHAT-Desktop`**:
   ```powershell
   npm install
   ```
3. Файл **`DierCHAT-Desktop/public/icon.jpg`** — иконка приложения (для установщика лучше позже заменить на `.ico`).

## Сборка

Из **корня репозитория**:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-desktop-windows.ps1
```

Или вручную из **`DierCHAT-Desktop`**:

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npm run build
npx electron-builder --win portable nsis --x64
```

## Результат

| Где | Что |
|-----|-----|
| **`DierCHAT-Desktop/release/`** | `dier-chat-1.1.0-Portable.exe`, `dier-chat-1.1.0-Setup.exe` (установщик NSIS), `win-unpacked/` |
| **`release-dist/dierchat-desktop-windows.zip`** | Всё содержимое `release/` (создаёт скрипт выше) |

В `package.json` задано **`win.signAndEditExecutable: false`**, чтобы сборка не требовала winCodeSign/symlink на части машин.

## Полный релиз (веб + десктоп + android readme)

```powershell
powershell -ExecutionPolicy Bypass -File scripts/package-release.ps1
```

@echo off
chcp 65001 >nul
setlocal
rem DierCHAT — сборка Windows: portable + NSIS (electron-builder), версия из package.json
rem Подробности: docs\BUILD-Messenger-APK-EXE.md и deploy\BUILD-WINDOWS.md
set "ROOT=%~dp0"
set "DESKTOP=%ROOT%DierCHAT-Desktop"
cd /d "%DESKTOP%" || (echo ERROR: нет папки DierCHAT-Desktop & pause & exit /b 1)
if not exist "package.json" (echo ERROR: нет package.json & pause & exit /b 1)
if not exist "public\icon.jpg" (echo WARN: нет public\icon.jpg — установщик может быть без иконки & echo.)

for /f "delims=" %%V in ('node -e "console.log(require('./package.json').version)" 2^>nul') do set "APP_VER=%%V"
echo === DierCHAT v%APP_VER% — API (должен быть ваш хост, не localhost) ===
node scripts\print-release-api.cjs 2>nul
if exist .env.production (findstr /B "VITE_API" .env.production) else (echo WARN: нет .env.production)
echo.

echo == npm install ==
call npm install
if errorlevel 1 (echo ERROR: npm install & pause & exit /b 1)

set CSC_IDENTITY_AUTO_DISCOVERY=false
echo == electron-builder: portable + NSIS ==
call npm run package:win
if errorlevel 1 (
  echo ERROR: сборка EXE не удалась
  pause
  exit /b 1
)
echo.
echo Готово. Артефакты:
echo   %DESKTOP%\release\dier-chat-*-Portable.exe
echo   %DESKTOP%\release\dier-chat-*-Setup.exe
echo.
pause

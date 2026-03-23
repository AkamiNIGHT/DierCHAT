@echo off
chcp 65001 >nul
setlocal
rem EXE (с DIERbrowser.exe) + debug APK — API из .env.production
set "ROOT=%~dp0"
set "DESKTOP=%ROOT%DierCHAT-Desktop"
cd /d "%DESKTOP%" || (echo ERROR: нет DierCHAT-Desktop & pause & exit /b 1)
for /f "delims=" %%V in ('node -e "console.log(require('./package.json').version)" 2^>nul') do set "APP_VER=%%V"

echo === DierCHAT v%APP_VER% — API для прод-сборки ===
node scripts\print-release-api.cjs
echo.

call npm install
if errorlevel 1 (echo ERROR: npm install & pause & exit /b 1)

set CSC_IDENTITY_AUTO_DISCOVERY=false
call npm run package:win:with-browser
if errorlevel 1 (echo ERROR: package:win:with-browser & pause & exit /b 1)

call npm run android:build:debug
if errorlevel 1 (echo ERROR: android:build:debug & pause & exit /b 1)

echo.
echo === Готово (EXE с браузером + APK) ===
echo EXE:  %DESKTOP%\release\dier-chat-*-Portable.exe
echo APK:  %DESKTOP%\release\dier-chat.apk
pause

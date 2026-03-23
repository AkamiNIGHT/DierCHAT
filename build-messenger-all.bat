@echo off
chcp 65001 >nul
setlocal
rem DierCHAT — одна команда: Windows EXE + debug APK (версия: package.json + android\app\build.gradle)
rem Нужны: Node, Android Studio/SDK, JDK 17+ (JBR)
set "ROOT=%~dp0"
set "DESKTOP=%ROOT%DierCHAT-Desktop"
cd /d "%DESKTOP%" || (echo ERROR: нет DierCHAT-Desktop & pause & exit /b 1)
for /f "delims=" %%V in ('node -e "console.log(require('./package.json').version)" 2^>nul') do set "APP_VER=%%V"

echo === DierCHAT v%APP_VER% — EXE + APK (прод API, не localhost) ===
node scripts\print-release-api.cjs
if exist .env.production (type .env.production | findstr /V "^#" | findstr "=") else (echo WARN: нет .env.production)
echo.

echo == npm install ==
call npm install
if errorlevel 1 (echo ERROR: npm install & pause & exit /b 1)

set CSC_IDENTITY_AUTO_DISCOVERY=false
echo == Windows: portable + NSIS ==
call npm run package:win
if errorlevel 1 (echo ERROR: package:win & pause & exit /b 1)

echo == Android: sync + debug APK + release\dier-chat.apk ==
call npm run android:build:debug
if errorlevel 1 (echo ERROR: android:build:debug & pause & exit /b 1)

echo.
echo === Готово ===
echo EXE:  %DESKTOP%\release\dier-chat-*-Portable.exe
echo       %DESKTOP%\release\dier-chat-*-Setup.exe
echo APK:  %DESKTOP%\release\dier-chat.apk
echo.
pause

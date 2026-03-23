@echo off
chcp 65001 >nul
setlocal
rem DierCHAT — пересборка debug APK (Capacitor). Подробности: deploy\ANDROID.md
set "ROOT=%~dp0"
set "DESKTOP=%ROOT%DierCHAT-Desktop"
cd /d "%DESKTOP%" || (echo ERROR: нет папки DierCHAT-Desktop & pause & exit /b 1)
if not exist "package.json" (echo ERROR: нет package.json & pause & exit /b 1)
for /f "delims=" %%V in ('node -e "console.log(require('./package.json').version)" 2^>nul') do set "APP_VER=%%V"
echo === DierCHAT v%APP_VER% — APK (versionCode в android\app\build.gradle) ===
echo === API вшивается из .env.production при cap:sync ===
node scripts\print-release-api.cjs 2>nul
call npm run android:build:debug
if errorlevel 1 (
  echo ERROR: сборка APK не удалась
  pause
  exit /b 1
)
echo.
echo Готово:
echo   %DESKTOP%\release\dier-chat.apk   ^(удобная копия^)
echo   %DESKTOP%\android\app\build\outputs\apk\debug\app-debug.apk
echo.
pause

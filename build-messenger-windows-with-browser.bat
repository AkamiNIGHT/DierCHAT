@echo off
chcp 65001 >nul
setlocal
rem DierCHAT Windows: DIERbrowser.exe + portable + NSIS (версия в package.json)
rem Нужны: Node, .NET SDK 8, (опционально) WebView2 Runtime на целевых ПК для самого DIERbrowser
set "ROOT=%~dp0"
set "DESKTOP=%ROOT%DierCHAT-Desktop"
cd /d "%DESKTOP%" || (echo ERROR: нет DierCHAT-Desktop & pause & exit /b 1)
for /f "delims=" %%V in ('node -e "console.log(require('./package.json').version)" 2^>nul') do set "APP_VER=%%V"
echo === DierCHAT v%APP_VER% — API ===
node scripts\print-release-api.cjs 2>nul
echo.

echo == npm install ==
call npm install
if errorlevel 1 (echo ERROR: npm install & pause & exit /b 1)

echo == DIERbrowser (.NET) + Electron ==
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npm run package:win:with-browser
if errorlevel 1 (echo ERROR: package:win:with-browser & pause & exit /b 1)

echo.
echo Готово: %DESKTOP%\release\
pause

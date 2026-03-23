@echo off
chcp 65001 >nul
setlocal
set "ROOT=%~dp0"
echo [1/2] npm run build...
cd /d "%ROOT%DierCHAT-Desktop"
call npm run build
if errorlevel 1 exit /b 1
echo [2/2] dierchat-deploy.zip...
cd /d "%ROOT%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%pack-deploy.ps1"
if errorlevel 1 exit /b 1
echo.
echo Готово: %ROOT%dierchat-deploy.zip
echo Выгрузка на сервер: deploy-auto.bat
endlocal

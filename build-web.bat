@echo off
chcp 65001 > nul
echo ========================================
echo    DierCHAT - Сборка веб-версии
echo ========================================
echo.

set ROOT=%~dp0
set DESKTOP=%ROOT%DierCHAT-Desktop
set SERVER=%ROOT%DierCHAT-Server

REM 1. Сборка фронтенда
echo [1/2] Сборка фронтенда...
cd /d "%DESKTOP%"
call npm run build:web
if %errorlevel% neq 0 (
  echo [ОШИБКА] Не удалось собрать фронтенд
  pause
  exit /b 1
)

REM 2. Копирование в web сервера
echo [2/2] Копирование в DierCHAT-Server\web...
if not exist "%SERVER%\web" mkdir "%SERVER%\web"
xcopy /E /Y /Q "%DESKTOP%\dist\renderer\*" "%SERVER%\web\"

echo.
echo Готово! Фронтенд собран и скопирован в web.
echo Запустите сервер из папки DierCHAT-Server.
pause

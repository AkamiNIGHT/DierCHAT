@echo off
chcp 65001 > nul
echo ========================================
echo    DierCHAT - Запуск
echo ========================================
echo.

REM Проверка Go
where go >nul 2>&1
if %errorlevel% neq 0 (
    echo [ОШИБКА] Go не найден. Установите Go: https://go.dev/dl/
    pause
    exit /b 1
)

REM Проверка Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ОШИБКА] Node.js не найден. Установите: https://nodejs.org/
    pause
    exit /b 1
)

echo [1/2] Запуск сервера (порт 9000)...
start "DierCHAT Server" cmd /k "cd /d %~dp0DierCHAT-Server && go run ./cmd/server"

timeout /t 3 /nobreak > nul

echo [2/2] Запуск приложения...
start "DierCHAT Desktop" cmd /k "cd /d %~dp0DierCHAT-Desktop && npm run dev"

echo.
echo Готово! Должно открыться окно приложения.
echo Сервер: http://localhost:9000
echo.
echo Закройте окна "DierCHAT Server" и "DierCHAT Desktop" для остановки.
pause

@echo off
chcp 65001 > nul
echo ========================================
echo    DierCHAT - Сборка веб-приложения
echo ========================================
echo.

set ROOT=%~dp0
set DESKTOP=%ROOT%DierCHAT-Desktop
set SERVER=%ROOT%DierCHAT-Server

echo [1/2] Сборка frontend...
cd /d "%DESKTOP%"
call npm run build
if %errorlevel% neq 0 (
    echo [ОШИБКА] Ошибка сборки frontend
    pause
    exit /b 1
)

echo [2/2] Копирование в DierCHAT-Server\web...
if not exist "%SERVER%\web" mkdir "%SERVER%\web"
if not exist "%SERVER%\web\assets" mkdir "%SERVER%\web\assets"

REM Очистка старых файлов (кроме sw.js если есть)
del /q "%SERVER%\web\*.html" 2>nul
del /q "%SERVER%\web\assets\*" 2>nul
del /q "%SERVER%\web\*.js" 2>nul

REM Копирование новых
xcopy /E /I /Y "%DESKTOP%\dist\renderer\*" "%SERVER%\web\" > nul

echo.
echo Готово! Собранный сайт в DierCHAT-Server\web\
echo Запустите сервер для проверки.
echo.
pause

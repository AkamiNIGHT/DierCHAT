@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Первая установка на сервер (долго: apt, БД, nginx^)...
echo Пароль root спросят 2 раза (scp и ssh^).
echo.
call deploy-auto.bat --first

@echo off
chcp 65001 >nul
cd /d "%~dp0"
title DierCHAT — Docker + API (не закрывайте окно)
echo.
echo  Запуск: Docker ^> Postgres/Redis ^> API :19080 (запасной :19081)
echo  Клиент отдельно: папка DierCHAT-Desktop ^> npm run dev
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\local-stack.ps1"
echo.
pause

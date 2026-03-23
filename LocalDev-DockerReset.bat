@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ============================================================
echo  ПОЛНЫЙ СБРОС локальной БД DierCHAT (Docker)
echo  - Удалятся тома PostgreSQL и Redis (все данные чатов/пользователей).
echo  - После скрипта заново запустите сервер: LocalDev-Stack.bat
echo ============================================================
echo.
pause
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\local-docker-reset.ps1"
echo.
pause

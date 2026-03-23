@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ============================================================
echo  ПОЛНЫЙ СБРОС локальной базы DierCHAT (Docker: Postgres + Redis)
echo  Все данные будут удалены. Затем снова запустите LocalDev-Stack.bat
echo ============================================================
echo.
pause
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\local-docker-reset.ps1"
echo.
pause

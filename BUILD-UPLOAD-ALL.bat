@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo DierCHAT: полная сборка в release-dist\ ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-upload-bundle.ps1"
if errorlevel 1 (
  echo.
  echo Сборка завершилась с ошибкой.
  pause
  exit /b 1
)
echo.
echo Готово: release-dist\
pause

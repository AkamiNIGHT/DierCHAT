@echo off
REM Same as ZAPUSK-LOCAL-ALL — Docker + DB + Go API
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\local-stack.ps1"
pause

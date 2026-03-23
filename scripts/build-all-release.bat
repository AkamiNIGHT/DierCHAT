@echo off
setlocal
cd /d "%~dp0.."
echo.
echo DierCHAT build-all-release (see RELEASE-ALL.md)
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-all-release.ps1" %*
set ERR=%ERRORLEVEL%
if not "%ERR%"=="0" (
  echo.
  echo FAILED with code %ERR%
  pause
  exit /b %ERR%
)
echo.
pause
endlocal
exit /b 0

@echo off
setlocal EnableDelayedExpansion

set "ROOT=%~dp0"
set "DESKTOP=%ROOT%DierCHAT-Desktop"
set "SERVER=%ROOT%DierCHAT-Server"
set "DEPLOY=%ROOT%deploy-package"

echo ========================================
echo    DierCHAT - Deploy package (build on host)
echo ========================================
echo.

echo [1/3] Creating deploy package...
if exist "%DEPLOY%" rmdir /s /q "%DEPLOY%"
mkdir "%DEPLOY%"

echo [2/3] Copying sources (Desktop + Server)...
:: Desktop — исходники без node_modules, dist, release
robocopy "%DESKTOP%" "%DEPLOY%\DierCHAT-Desktop" /E /XD node_modules dist release .git /NFL /NDL /NJH /NJS /nc /ns /np
if errorlevel 8 (
  echo ERROR: robocopy failed
  pause
  exit /b 1
)

:: Server
xcopy /E /I /Y "%SERVER%\migrations" "%DEPLOY%\DierCHAT-Server\migrations\" >nul
copy /Y "%SERVER%\go.mod" "%DEPLOY%\DierCHAT-Server\" >nul
copy /Y "%SERVER%\go.sum" "%DEPLOY%\DierCHAT-Server\" >nul
xcopy /E /I /Y "%SERVER%\cmd" "%DEPLOY%\DierCHAT-Server\cmd\" >nul
xcopy /E /I /Y "%SERVER%\internal" "%DEPLOY%\DierCHAT-Server\internal\" >nul
xcopy /E /I /Y "%SERVER%\pkg" "%DEPLOY%\DierCHAT-Server\pkg\" >nul

echo [3/3] Copying deploy scripts...
copy /Y "%ROOT%deploy\config.production.json" "%DEPLOY%\config.production.json" >nul
copy /Y "%ROOT%deploy\deploy-on-host.sh" "%DEPLOY%\" >nul
copy /Y "%ROOT%deploy\update-on-server.sh" "%DEPLOY%\" >nul
copy /Y "%ROOT%deploy\full-update-on-server.sh" "%DEPLOY%\" >nul
copy /Y "%ROOT%deploy\setup-server.sh" "%DEPLOY%\" >nul
copy /Y "%ROOT%deploy\install.sh" "%DEPLOY%\" >nul
copy /Y "%ROOT%deploy\nginx-dierchat.conf" "%DEPLOY%\" >nul
copy /Y "%ROOT%deploy\dierchat.service" "%DEPLOY%\" >nul
copy /Y "%ROOT%deploy\set-direct-ip-9000.sh" "%DEPLOY%\" >nul
copy /Y "%ROOT%deploy\fresh-deploy-on-server.sh" "%DEPLOY%\" >nul

cd /d "%ROOT%"
powershell -NoProfile -Command "Compress-Archive -Path 'deploy-package' -DestinationPath 'dierchat-deploy.zip' -Force"

echo.
echo Done! dierchat-deploy.zip
echo.
echo Upload: scp dierchat-deploy.zip root@31.148.99.40:/root/
echo On host: cd /root ^&^& unzip -o dierchat-deploy.zip ^&^& bash deploy-package/deploy-on-host.sh
echo.
pause
endlocal

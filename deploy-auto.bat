@echo off
setlocal EnableDelayedExpansion

rem ========================================================================
rem  DierCHAT — автодеплой: build:web → dierchat-deploy.zip → scp → update
rem
rem  Хост по умолчанию ниже. Переопределение: файл deploy-host.env рядом:
rem    DEPLOY_HOST=31.148.99.40
rem    DEPLOY_USER=root
rem    USE_SSH_KEY=1   — только если нужен вход по ключу (пароль не спрашивается)
rem  Файл deploy-host.env: UTF-8 без BOM, одна пара ключ=значение на строку.
rem  По умолчанию: пароль — scp и ssh запросят его в консоли (ключи не используются).
rem ========================================================================

set "ROOT=%~dp0"
set "DEPLOY_HOST=31.148.99.40"
set "DEPLOY_USER=root"
set "USE_SSH_KEY="

if exist "%ROOT%deploy-host.env" (
  for /f "usebackq eol=# tokens=1* delims==" %%a in ("%ROOT%deploy-host.env") do (
    set "LINE=%%a"
    if not "!LINE!"=="" if not "!LINE:~0,1!"=="#" (
      set "%%a=%%b"
    )
  )
)

rem Пароль в консоли: не брать ключи из agent, только password / keyboard-interactive
set "SSH_EXTRA=-o StrictHostKeyChecking=no -o BatchMode=no -o PubkeyAuthentication=no -o PreferredAuthentications=password,keyboard-interactive -o KbdInteractiveAuthentication=yes"
if /i "!USE_SSH_KEY!"=="1" set "SSH_EXTRA=-o StrictHostKeyChecking=no -o BatchMode=no"

set "DESKTOP=%ROOT%DierCHAT-Desktop"

set "MODE=update"
if /i "%~1"=="--first" set "MODE=first"
if /i "%~1"=="first" set "MODE=first"
if /i "%~1"=="--fresh" set "MODE=fresh"
if /i "%~1"=="fresh" set "MODE=fresh"

echo ========================================
echo DierCHAT — деплой на сервер
echo   !DEPLOY_USER!@!DEPLOY_HOST!
echo   Режим: !MODE!   (update ^| --first ^| --fresh^)
echo   Сайт: http://!DEPLOY_HOST!/  и  http://!DEPLOY_HOST!:9000/
echo ========================================
echo.

echo [1/4] Веб-клиент: npm run build:web ...
cd /d "%DESKTOP%"
if not exist "package.json" (
  echo ERROR: нет DierCHAT-Desktop\package.json
  pause
  exit /b 1
)
call npm run build:web
if errorlevel 1 (
  echo ERROR: сборка веба не удалась
  pause
  exit /b 1
)

echo [2/4] Архив: pack-deploy.ps1 -^> dierchat-deploy.zip
cd /d "%ROOT%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%pack-deploy.ps1"
if errorlevel 1 (
  echo ERROR: pack-deploy.ps1
  pause
  exit /b 1
)

echo [3/4] scp на сервер ...
scp !SSH_EXTRA! "%ROOT%dierchat-deploy.zip" !DEPLOY_USER!@!DEPLOY_HOST!:/root/
if errorlevel 1 (
  echo ERROR: scp. Проверьте SSH, пароль или USE_SSH_KEY=1 для ключа.
  pause
  exit /b 1
)

echo Пауза 3 сек ...
timeout /t 3 /nobreak >nul

echo [4/4] Установка по ssh ...
if /i "!MODE!"=="first" (
  ssh !SSH_EXTRA! !DEPLOY_USER!@!DEPLOY_HOST! "cd /root && unzip -o dierchat-deploy.zip && cd deploy-package && chmod +x *.sh && bash setup-server.sh && bash install.sh"
  goto _ssh_done
)
if /i "!MODE!"=="fresh" (
  ssh !SSH_EXTRA! !DEPLOY_USER!@!DEPLOY_HOST! "cd /root && unzip -o dierchat-deploy.zip && cd deploy-package && chmod +x *.sh && bash fresh-deploy-on-server.sh"
  goto _ssh_done
)
ssh !SSH_EXTRA! !DEPLOY_USER!@!DEPLOY_HOST! "cd /root && unzip -o dierchat-deploy.zip && cd deploy-package && chmod +x *.sh && bash update-on-server.sh"

:_ssh_done
if errorlevel 1 (
  echo.
  echo ERROR: ssh. Архив на сервере — вручную:
  echo   ssh !DEPLOY_USER!@!DEPLOY_HOST! "cd /root ^&^& unzip -o dierchat-deploy.zip ^&^& cd deploy-package ^&^& chmod +x *.sh ^&^& bash update-on-server.sh"
  pause
  exit /b 1
)

echo.
echo ========================================
echo Готово. Проверка на VDS: curl -sS http://127.0.0.1:9000/api/health
echo   https://dier-chat.ru/   или   http://!DEPLOY_HOST!:9000/
echo ========================================
pause
endlocal
exit /b 0

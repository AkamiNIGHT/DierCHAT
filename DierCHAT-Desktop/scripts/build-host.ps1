# Сборка Electron под удалённый API (не localhost).
# 1) Скопируйте .env.production.example в .env.production и укажите VITE_API_BASE_URL / при необходимости VITE_WS_URL.
# 2) Запуск: .\scripts\build-host.ps1
# Опционально:
#   .\scripts\build-host.ps1 -Portable
#   .\scripts\build-host.ps1 -AndroidRelease

param([switch]$Portable, [switch]$AndroidRelease)

$ErrorActionPreference = "Stop"
# Корень DierCHAT-Desktop (папка с package.json)
Set-Location (Split-Path $PSScriptRoot)

npm run verify:host-env
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

node scripts/print-release-api.cjs
if ($AndroidRelease) {
  npm run android:build:release:host
  exit $LASTEXITCODE
}
if ($Portable) {
  npm run build
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  npx electron-builder --win portable --x64
} else {
  npm run package:host
}

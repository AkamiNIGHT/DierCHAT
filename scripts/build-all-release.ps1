# Сборка артефактов в release-dist/ (без деплоя по SSH; APK — в build-upload-bundle.ps1):
#   - dierchat-web-hosting.zip     — только SPA
#   - dierchat-deploy.zip          — копия полного пакета для VDS (pack-deploy.ps1)
#   - dierchat-desktop-windows.zip — portable + NSIS (Electron)
# APK собирают вручную в Android Studio (deploy/ANDROID.md).
#
# Запуск из корня репозитория:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-all-release.ps1
#
# Параметры:
#   -SkipHostZip — не собирать dierchat-deploy.zip (только веб-zip + Windows)

param(
  [switch]$SkipHostZip
)

$ErrorActionPreference = "Stop"
# Скрипт лежит в scripts/ → корень репозитория на уровень выше
$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $RepoRoot "DierCHAT-Desktop/package.json"))) {
  Write-Error "Запустите скрипт из репозитория DierCHAT (ожидается DierCHAT-Desktop рядом с папкой scripts). Текущий RepoRoot=$RepoRoot"
}

$Desktop = Join-Path $RepoRoot "DierCHAT-Desktop"
$Server = Join-Path $RepoRoot "DierCHAT-Server"
$OutDir = Join-Path $RepoRoot "release-dist"
$icon = Join-Path $Desktop "public\icon.jpg"
$pkgPath = Join-Path $Desktop "package.json"
$appVer = "?"
if (Test-Path $pkgPath) {
  try {
    $appVer = (Get-Content $pkgPath -Raw | ConvertFrom-Json).version
  } catch { }
}

Write-Host ""
Write-Host "========================================"  -ForegroundColor Cyan
Write-Host " DierCHAT — полная сборка релиза" -ForegroundColor Cyan
Write-Host " Версия (package.json): $appVer" -ForegroundColor DarkGray
Write-Host " Корень: $RepoRoot" -ForegroundColor DarkGray
Write-Host " Выход:  $OutDir" -ForegroundColor DarkGray
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $icon)) {
  Write-Error "Нужен файл: DierCHAT-Desktop/public/icon.jpg"
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# --- 1) Electron + Vite: main + renderer ---
Write-Host "==> [1/4] DierCHAT-Desktop: npm install + npm run build (main + renderer)" -ForegroundColor Cyan
Push-Location $Desktop
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npm install
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Error "npm install failed" }
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Error "npm run build failed" }

if (-not (Test-Path "dist/renderer/index.html")) {
  Pop-Location
  Write-Error "Нет dist/renderer/index.html после сборки"
}

# --- 2) Синхрон SPA в DierCHAT-Server/web ---
if (Test-Path $Server) {
  $ServerWeb = Join-Path $Server "web"
  Write-Host "==> [2/4] Копирование dist/renderer -> DierCHAT-Server/web" -ForegroundColor Cyan
  if (Test-Path $ServerWeb) {
    Get-ChildItem -Path $ServerWeb -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  }
  New-Item -ItemType Directory -Force -Path $ServerWeb | Out-Null
  Copy-Item -Path (Join-Path $Desktop "dist/renderer/*") -Destination $ServerWeb -Recurse -Force
  Write-Host "    OK: DierCHAT-Server/web обновлён" -ForegroundColor Green
} else {
  Write-Host "==> [2/4] Пропуск: нет папки DierCHAT-Server" -ForegroundColor Yellow
}

# --- 3) Архив только веба (хостинг) ---
Write-Host "==> [3/4] dierchat-web-hosting.zip (только фронт)" -ForegroundColor Cyan
$WebStage = Join-Path $env:TEMP "dierchat-web-hosting-stage-$([Guid]::NewGuid().ToString('N'))"
Remove-Item $WebStage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $WebStage | Out-Null
Copy-Item -Path (Join-Path $Desktop "dist/renderer/*") -Destination $WebStage -Recurse -Force
$HostingMd = Join-Path $RepoRoot "deploy/HOSTING.md"
if (Test-Path $HostingMd) { Copy-Item $HostingMd (Join-Path $WebStage "HOSTING.md") -Force }

$WebZip = Join-Path $OutDir "dierchat-web-hosting.zip"
if (Test-Path $WebZip) { Remove-Item $WebZip -Force }
Compress-Archive -Path (Join-Path $WebStage "*") -DestinationPath $WebZip -CompressionLevel Optimal -Force
Remove-Item $WebStage -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "    -> $WebZip" -ForegroundColor Green

Pop-Location

# --- 4) Полный zip для сервера (pack-deploy) ---
if (-not $SkipHostZip) {
  Write-Host "==> [4/4] pack-deploy.ps1 -> dierchat-deploy.zip" -ForegroundColor Cyan
  $packScript = Join-Path $RepoRoot "pack-deploy.ps1"
  if (-not (Test-Path $packScript)) {
    Write-Error "Не найден pack-deploy.ps1 в корне репозитория"
  }
  & powershell -NoProfile -ExecutionPolicy Bypass -File $packScript
  if ($LASTEXITCODE -ne 0) { Write-Error "pack-deploy.ps1 failed" }

  $DeployZipRoot = Join-Path $RepoRoot "dierchat-deploy.zip"
  $DeployZipOut = Join-Path $OutDir "dierchat-deploy.zip"
  if (-not (Test-Path $DeployZipRoot)) {
    Write-Error "Не создан $DeployZipRoot"
  }
  Copy-Item $DeployZipRoot $DeployZipOut -Force
  Write-Host "    -> $DeployZipOut" -ForegroundColor Green
} else {
  Write-Host "==> [4/4] Пропуск pack-deploy (--SkipHostZip)" -ForegroundColor Yellow
}

# --- Windows: Electron portable + NSIS ---
Write-Host "==> Electron: electron-builder (Windows x64)" -ForegroundColor Cyan
Push-Location $Desktop
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npx electron-builder --win portable nsis --x64
if ($LASTEXITCODE -ne 0) {
  Pop-Location
  Write-Error "electron-builder failed (exit $LASTEXITCODE)"
}
$ReleaseDir = Join-Path $Desktop "release"
if (-not (Test-Path $ReleaseDir)) {
  Pop-Location
  Write-Error "Нет папки DierCHAT-Desktop/release"
}

$DeskZip = Join-Path $OutDir "dierchat-desktop-windows.zip"
if (Test-Path $DeskZip) { Remove-Item $DeskZip -Force }
Compress-Archive -Path (Join-Path $ReleaseDir "*") -DestinationPath $DeskZip -CompressionLevel Optimal -Force
Write-Host "    -> $DeskZip" -ForegroundColor Green
Pop-Location

# Манифест
$manifest = @()
Get-ChildItem $OutDir -File | Sort-Object Name | ForEach-Object {
  $mb = [math]::Round($_.Length / 1MB, 2)
  $manifest += "$($_.Name)`t$mb MB"
}
$manifestPath = Join-Path $OutDir "RELEASE-MANIFEST.txt"
Set-Content -Path $manifestPath -Value (@(
  "DierCHAT — сборка $(Get-Date -Format 'yyyy-MM-dd HH:mm')",
  "Корень репозитория: $RepoRoot",
  "",
  "Файлы:",
  $manifest,
  "",
  "Подробности: RELEASE-ALL.md в корне репозитория."
) -join "`n") -Encoding UTF8
Write-Host ""
Write-Host "Манифест: $manifestPath" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Готово. Все артефакты в: $OutDir" -ForegroundColor Green
Write-Host ""

# УСТАРЕЛО: для полной сборки (веб + dierchat-deploy.zip + Windows + APK) используйте:
#   scripts/build-all-release.ps1
#   см. RELEASE-ALL.md
#
# Этот скрипт по-прежнему собирает в release-dist/:
# 1) dierchat-web-hosting.zip - Vite static + deploy/HOSTING.md
# 2) dierchat-desktop-windows.zip - DierCHAT-Desktop/release (portable + NSIS)
# 3) dierchat-android-README.zip - README + icon.jpg (заглушка, не APK)
#
# Run from repo root:
#   powershell -ExecutionPolicy Bypass -File scripts/package-release.ps1

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $RepoRoot "DierCHAT-Desktop/package.json"))) {
  Write-Error "Expected DierCHAT/DierCHAT-Desktop layout. RepoRoot=$RepoRoot"
}

$Desktop = Join-Path $RepoRoot "DierCHAT-Desktop"
$OutDir = Join-Path $RepoRoot "release-dist"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Write-Host "==> Vite: web build (dist/renderer)" -ForegroundColor Cyan
Push-Location $Desktop
npm run build:web
if (-not (Test-Path "dist/renderer/index.html")) { Write-Error "Missing dist/renderer/index.html" }

$ServerWeb = Join-Path $RepoRoot "DierCHAT-Server/web"
if (Test-Path $ServerWeb) {
  Write-Host "    Sync to DierCHAT-Server/web ..." -ForegroundColor DarkGray
  Get-ChildItem -Path $ServerWeb -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  Copy-Item -Path (Join-Path $Desktop "dist/renderer/*") -Destination $ServerWeb -Recurse -Force
}

$WebStage = Join-Path $env:TEMP "dierchat-web-hosting-stage"
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

Write-Host "==> Electron: portable + NSIS (electron-builder)" -ForegroundColor Cyan
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npm run build
npx electron-builder --win portable nsis --x64
if ($LASTEXITCODE -ne 0) { Write-Error "electron-builder failed (exit $LASTEXITCODE). On Windows without symlink rights, package.json uses win.signAndEditExecutable=false." }
$ReleaseDir = Join-Path $Desktop "release"
if (-not (Test-Path $ReleaseDir)) { Write-Error "Missing release/ after electron-builder" }

$DeskZip = Join-Path $OutDir "dierchat-desktop-windows.zip"
if (Test-Path $DeskZip) { Remove-Item $DeskZip -Force }
Compress-Archive -Path (Join-Path $ReleaseDir "*") -DestinationPath $DeskZip -CompressionLevel Optimal -Force
Write-Host "    -> $DeskZip" -ForegroundColor Green

Pop-Location

Write-Host "==> Android: README + icon (no Gradle in repo)" -ForegroundColor Yellow
$NoteDir = Join-Path $env:TEMP "dierchat-apk-note"
Remove-Item $NoteDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $NoteDir | Out-Null
$ReadmeSrc = Join-Path $RepoRoot "deploy/android-readme.txt"
if (Test-Path $ReadmeSrc) {
  Copy-Item $ReadmeSrc (Join-Path $NoteDir "README.txt") -Force
} else {
  Set-Content -Path (Join-Path $NoteDir "README.txt") -Value "See deploy/android-readme.txt" -Encoding UTF8
}
$IconSrc = Join-Path $Desktop "public/icon.jpg"
if (Test-Path $IconSrc) { Copy-Item $IconSrc (Join-Path $NoteDir "icon.jpg") -Force }
$ApkZip = Join-Path $OutDir "dierchat-android-README.zip"
if (Test-Path $ApkZip) { Remove-Item $ApkZip -Force }
$toZip = @( (Join-Path $NoteDir "README.txt") )
if (Test-Path (Join-Path $NoteDir "icon.jpg")) { $toZip += (Join-Path $NoteDir "icon.jpg") }
Compress-Archive -Path $toZip -DestinationPath $ApkZip -Force
Write-Host "    -> $ApkZip" -ForegroundColor Green

Write-Host ""
Write-Host "Done. Archives: $OutDir" -ForegroundColor Cyan

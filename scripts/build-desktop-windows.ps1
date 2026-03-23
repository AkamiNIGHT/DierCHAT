# Windows: portable EXE + NSIS installer, then dierchat-desktop-windows.zip in release-dist/
# Prerequisites: Node.js, npm install in DierCHAT-Desktop, public/icon.jpg
# Run from repo root:
#   powershell -ExecutionPolicy Bypass -File scripts/build-desktop-windows.ps1

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Desktop = Join-Path $RepoRoot "DierCHAT-Desktop"
$OutDir = Join-Path $RepoRoot "release-dist"

if (-not (Test-Path (Join-Path $Desktop "package.json"))) {
  Write-Error "DierCHAT-Desktop not found. RepoRoot=$RepoRoot"
}
$icon = Join-Path $Desktop "public\icon.jpg"
if (-not (Test-Path $icon)) {
  Write-Error "Missing icon: public/icon.jpg (needed for electron-builder)"
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Write-Host "==> Electron: npm install + build + electron-builder (portable + NSIS x64)" -ForegroundColor Cyan
Push-Location $Desktop
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npm install
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Error "npm install failed" }
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Error "npm run build failed" }
npx electron-builder --win portable nsis --x64
if ($LASTEXITCODE -ne 0) {
  Pop-Location
  Write-Error "electron-builder failed (exit $LASTEXITCODE)"
}
$ReleaseDir = Join-Path $Desktop "release"
if (-not (Test-Path $ReleaseDir)) { Pop-Location; Write-Error "Missing DierCHAT-Desktop/release" }

$DeskZip = Join-Path $OutDir "dierchat-desktop-windows.zip"
if (Test-Path $DeskZip) { Remove-Item $DeskZip -Force }
Compress-Archive -Path (Join-Path $ReleaseDir "*") -DestinationPath $DeskZip -CompressionLevel Optimal -Force
Write-Host "    -> $DeskZip" -ForegroundColor Green
Pop-Location

Write-Host ""
Write-Host "Artifacts in DierCHAT-Desktop/release/:" -ForegroundColor Cyan
Write-Host "  - dier-chat-*-Portable.exe  (portable)"
Write-Host "  - dier-chat-*-Setup.exe  (установщик NSIS)"
Write-Host "Zip: $DeskZip"
Write-Host "Done."

# Copies Vite build into DierCHAT-Server/web (for Go to serve SPA from ./web).
# Run from repo root after: cd DierCHAT-Desktop && npm run build:web
#
#   powershell -ExecutionPolicy Bypass -File scripts/sync-web-to-server.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Src = Join-Path $Root "DierCHAT-Desktop\dist\renderer"
$Dst = Join-Path $Root "DierCHAT-Server\web"

if (-not (Test-Path (Join-Path $Src "index.html"))) {
  Write-Error "No DierCHAT-Desktop/dist/renderer/index.html — run: cd DierCHAT-Desktop; npm run build:web"
}

New-Item -ItemType Directory -Force -Path $Dst | Out-Null
Get-ChildItem -Path $Dst -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
Copy-Item -Path (Join-Path $Src "*") -Destination $Dst -Recurse -Force
Write-Host "OK: copied to $Dst" -ForegroundColor Green

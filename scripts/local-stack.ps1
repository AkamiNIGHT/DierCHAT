# One command: docker up + wait for DB + go run (blocks). From repo root via bat or -File.

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

Write-Host "=== Ensure Docker is running ===" -ForegroundColor Cyan
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'ensure-docker.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "=== docker compose up -d ===" -ForegroundColor Cyan
docker compose -f docker-compose.local.yml up -d
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'local-wait-databases.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$ServerDir = Join-Path $RepoRoot 'DierCHAT-Server'
$DesktopDir = Join-Path $RepoRoot 'DierCHAT-Desktop'
# Local API: config.local.json port 19080; fallback 19081 -> DierCHAT-Desktop/.env.development.local for Vite
$PrimaryApiPort = 19080
$FallbackApiPort = 19081
Set-Location $ServerDir
$env:DIERCHAT_CONFIG = 'config.local.json'

powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot 'scripts\local-free-api-port.ps1') -Port $PrimaryApiPort
if ($LASTEXITCODE -ne 0) {
    $env:DIERCHAT_HTTP_PORT = "$FallbackApiPort"
    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot 'scripts\set-desktop-vite-api-port.ps1') -Port $FallbackApiPort
    Write-Host "Port $PrimaryApiPort busy -> API $FallbackApiPort. Run: set-desktop-vite-api-port.ps1 (restart npm run dev)." -ForegroundColor Yellow
} else {
    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot 'scripts\set-desktop-vite-api-port.ps1')
}

Write-Host "=== go run ./cmd/server (Ctrl+C to stop) ===" -ForegroundColor Cyan
go run ./cmd/server

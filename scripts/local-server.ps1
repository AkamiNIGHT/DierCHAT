# Run Go API with config.local.json. Run local-docker-up.ps1 first.

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$ServerDir = Join-Path $RepoRoot 'DierCHAT-Server'
if (-not (Test-Path (Join-Path $ServerDir 'go.mod'))) {
    Write-Error "Missing DierCHAT-Server\go.mod"
    exit 1
}
Set-Location $ServerDir
$env:DIERCHAT_CONFIG = 'config.local.json'
Write-Host "Dir: $ServerDir" -ForegroundColor Cyan
Write-Host "DIERCHAT_CONFIG=$env:DIERCHAT_CONFIG" -ForegroundColor Cyan
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot 'scripts\local-wait-databases.ps1')
if ($LASTEXITCODE -ne 0) {
    Write-Host "Start Docker first: scripts\local-docker-up.ps1" -ForegroundColor Yellow
    exit 1
}
$PrimaryApiPort = 19080
$FallbackApiPort = 19081
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot 'scripts\local-free-api-port.ps1') -Port $PrimaryApiPort
if ($LASTEXITCODE -ne 0) {
    $env:DIERCHAT_HTTP_PORT = "$FallbackApiPort"
    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot 'scripts\set-desktop-vite-api-port.ps1') -Port $FallbackApiPort
    Write-Host "Port $PrimaryApiPort busy -> API $FallbackApiPort. Restart npm run dev." -ForegroundColor Yellow
} else {
    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot 'scripts\set-desktop-vite-api-port.ps1')
}
go run ./cmd/server

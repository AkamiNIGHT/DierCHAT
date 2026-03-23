# Start PostgreSQL + Redis (repo root). Run: powershell -ExecutionPolicy Bypass -File scripts\local-docker-up.ps1

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Compose = Join-Path $RepoRoot 'docker-compose.local.yml'
if (-not (Test-Path $Compose)) {
    Write-Error "Missing docker-compose.local.yml under repo root."
    exit 1
}
Set-Location $RepoRoot
Write-Host "=== docker compose up -d ===" -ForegroundColor Cyan
Write-Host $RepoRoot
docker compose -f docker-compose.local.yml up -d
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host ""
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'local-wait-databases.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "OK: Postgres host port 5435, Redis host port 6380" -ForegroundColor Green
Write-Host "Next: powershell -ExecutionPolicy Bypass -File scripts\local-server.ps1" -ForegroundColor Gray

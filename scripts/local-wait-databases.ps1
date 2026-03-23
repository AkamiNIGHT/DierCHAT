# Wait until Postgres and Redis in docker-compose.local.yml accept work.

param(
    [int]$TimeoutSec = 120
)

$ErrorActionPreference = 'Continue'
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot
$deadline = (Get-Date).AddSeconds($TimeoutSec)

Write-Host "Waiting for Postgres + Redis in Docker (timeout ${TimeoutSec}s)..." -ForegroundColor Cyan

while ((Get-Date) -lt $deadline) {
    docker compose -f docker-compose.local.yml exec -T postgres pg_isready -U dierchat -d dierchat 2>$null | Out-Null
    $pgOk = ($LASTEXITCODE -eq 0)
    if ($pgOk) {
        docker compose -f docker-compose.local.yml exec -T redis redis-cli ping 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "OK: Postgres and Redis are ready." -ForegroundColor Green
            exit 0
        }
    }
    Start-Sleep -Seconds 2
}

Write-Host "ERROR: Timeout. Start stack: docker compose -f docker-compose.local.yml up -d" -ForegroundColor Red
exit 1

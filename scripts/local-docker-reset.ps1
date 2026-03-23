# Full wipe of local Postgres + Redis data for DierCHAT (Docker).
# After this: restart API (LocalDev-Stack.bat or local-server.ps1).

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

Write-Host "=== docker compose down -v --remove-orphans ===" -ForegroundColor Yellow
docker compose -f docker-compose.local.yml down -v --remove-orphans
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "=== Remove leftover dierchat *pgdata* / *redis* volumes (if any) ===" -ForegroundColor Yellow
$all = docker volume ls -q 2>$null
if ($all) {
    foreach ($v in $all) {
        if ($v -match 'dierchat' -and ($v -match 'pgdata' -or $v -match 'redis')) {
            Write-Host "  docker volume rm $v"
            docker volume rm $v 2>$null | Out-Null
        }
    }
}

Write-Host "=== docker compose up -d --force-recreate ===" -ForegroundColor Cyan
docker compose -f docker-compose.local.yml up -d --force-recreate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'local-wait-databases.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "OK: New empty Postgres + Redis. User dierchat / pass dierchat_secure_pass / port 5435" -ForegroundColor Green
Write-Host "Next: restart server (LocalDev-Stack.bat or scripts\local-server.ps1)" -ForegroundColor Gray

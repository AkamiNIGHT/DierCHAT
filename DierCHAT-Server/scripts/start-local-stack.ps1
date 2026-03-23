# Запуск PostgreSQL + Redis (Docker), затем server.exe
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "==> Docker: postgres + redis (docker-compose.local.yml)"
docker compose -f docker-compose.local.yml up -d

if ($LASTEXITCODE -ne 0) {
  Write-Error "Docker Compose failed. Установите Docker Desktop и повторите."
  exit 1
}

Write-Host "==> Ожидание PostgreSQL (до 60 с)..."
$ok = $false
for ($i = 0; $i -lt 60; $i++) {
  docker compose -f docker-compose.local.yml exec -T postgres pg_isready -U dierchat -d dierchat 2>$null
  if ($LASTEXITCODE -eq 0) { $ok = $true; break }
  Start-Sleep -Seconds 1
}
if (-not $ok) {
  Write-Warning "pg_isready не ответил — всё равно пробуем запустить сервер."
}

Write-Host "==> Запуск DierCHAT API (server.exe) в фоне..."
$logFile = Join-Path $Root "server.local.log"
$proc = Start-Process -FilePath (Join-Path $Root "server.exe") -WorkingDirectory $Root -WindowStyle Hidden -PassThru -RedirectStandardOutput $logFile -RedirectStandardError $logFile
Write-Host "PID сервера: $($proc.Id). Лог: $logFile"
Write-Host "API: http://127.0.0.1:9000  WS: ws://127.0.0.1:8081"
exit 0

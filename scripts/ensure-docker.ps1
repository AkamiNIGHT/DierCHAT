# Start Docker Desktop if needed, wait until docker CLI works (up to ~8 min).

$ErrorActionPreference = 'Continue'
docker info 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Docker OK." -ForegroundColor Green
    exit 0
}

$candidates = @(
    "${env:ProgramFiles}\Docker\Docker\Docker Desktop.exe",
    "${env:ProgramFiles(x86)}\Docker\Docker\Docker Desktop.exe"
)
$exe = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $exe) {
    Write-Host "ERROR: Docker Desktop not installed (expected under Program Files)." -ForegroundColor Red
    exit 1
}

Write-Host "Starting Docker Desktop: $exe" -ForegroundColor Yellow
Start-Process -FilePath $exe

$deadline = (Get-Date).AddMinutes(8)
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 5
    docker info 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Docker is ready." -ForegroundColor Green
        exit 0
    }
    Write-Host "  waiting for Docker engine..."
}

Write-Host "ERROR: Docker did not start in time. Open Docker Desktop manually." -ForegroundColor Red
exit 1

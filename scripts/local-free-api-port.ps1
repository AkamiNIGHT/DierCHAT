# Free TCP port $Port (LISTENING). Exit 0 if free after kill attempts, else 1.

param(
    [int]$Port = 19080
)

$ErrorActionPreference = 'SilentlyContinue'

function Get-ListenPids([int]$P) {
    $pids = @{}
    $pat = "TCP\s+[^\s]+:$P\s"
    foreach ($line in (netstat -ano)) {
        if ($line -notmatch 'LISTENING') { continue }
        if ($line -notmatch $pat) { continue }
        if ($line -match 'LISTENING\s+(\d+)\s*$') {
            $pids[[int]$Matches[1]] = $true
        }
    }
    return @($pids.Keys)
}

function Test-Listen([int]$P) {
    $pat = "TCP\s+[^\s]+:$P\s"
    foreach ($line in (netstat -ano)) {
        if ($line -match 'LISTENING' -and $line -match $pat) { return $true }
    }
    return $false
}

$pids = Get-ListenPids $Port
if ($pids.Count -eq 0) {
    Write-Host "Port $Port is free." -ForegroundColor Green
    exit 0
}

foreach ($round in 1..2) {
    foreach ($pid in (Get-ListenPids $Port)) {
        Write-Host "Stopping PID $pid (LISTEN on :$Port, round $round)..." -ForegroundColor Yellow
        & taskkill.exe /PID $pid /F 2>&1 | Out-Null
    }
    Start-Sleep -Seconds 2
    if (-not (Test-Listen $Port)) {
        Write-Host "Port $Port is free." -ForegroundColor Green
        exit 0
    }
}

Write-Host "ERROR: port $Port still in use. Close app in Task Manager or run as Administrator." -ForegroundColor Red
exit 1

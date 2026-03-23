# GET /api/health (default port 19080; DIERCHAT_DEV_API_PORT in .env.development.local)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $RepoRoot 'DierCHAT-Desktop\.env.development.local'
$port = 19080
if (Test-Path -LiteralPath $envFile) {
    foreach ($line in Get-Content -LiteralPath $envFile) {
        if ($line -match '^\s*DIERCHAT_DEV_API_PORT\s*=\s*(\d+)\s*$') {
            $port = [int]$Matches[1]
            break
        }
    }
}
$uri = "http://127.0.0.1:$port/api/health"

try {
    $r = Invoke-RestMethod -Uri $uri -TimeoutSec 5
    if ($r.ok -eq $true) {
        Write-Host "OK ($uri):" ($r | ConvertTo-Json -Compress) -ForegroundColor Green
        exit 0
    }
} catch {
    Write-Host "FAIL $uri :" $_.Exception.Message -ForegroundColor Red
}
exit 1

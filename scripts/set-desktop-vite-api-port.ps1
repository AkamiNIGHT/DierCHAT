# Sync DierCHAT-Desktop/.env.development.local DIERCHAT_DEV_API_PORT for Vite proxy.
# Usage: -Port 19081  (fallback)  |  no -Port / -Port ''  (default 19080, line removed)

param(
    [string]$Port = ''
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Desktop = Join-Path $RepoRoot 'DierCHAT-Desktop'
$f = Join-Path $Desktop '.env.development.local'
$utf8NoBom = New-Object System.Text.UTF8Encoding $false

$lines = [System.Collections.ArrayList]@()
if (Test-Path -LiteralPath $f) {
    foreach ($line in Get-Content -LiteralPath $f) {
        if ($line -match '^\s*DIERCHAT_DEV_API_PORT\s*=') { continue }
        [void]$lines.Add($line)
    }
}

$portTrim = $Port.Trim()
if ($portTrim -match '^\d+$' -and [int]$portTrim -ne 19080) {
    [void]$lines.Add("DIERCHAT_DEV_API_PORT=$portTrim")
}

if ($lines.Count -eq 0) {
    Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue
    Write-Host "Vite API port: default 19080 (.env.development.local cleared)" -ForegroundColor Gray
} else {
    $text = ($lines -join "`n").TrimEnd() + "`n"
    [System.IO.File]::WriteAllText($f, $text, $utf8NoBom)
    Write-Host "Updated $f" -ForegroundColor Gray
}

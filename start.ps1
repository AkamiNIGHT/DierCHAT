# DierCHAT Launcher
$base = $PSScriptRoot

Write-Host "DierCHAT - Starting..." -ForegroundColor Cyan

if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Go not found. Install from https://go.dev/dl/" -ForegroundColor Red
    exit 1
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Node.js not found. Install from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

Write-Host "[1/2] Starting server on port 9000..."
Start-Process cmd -ArgumentList '/k', "cd /d `"$base\DierCHAT-Server`" && go run ./cmd/server"

Start-Sleep -Seconds 3

Write-Host "[2/2] Starting Vite dev server (web client)..."
Start-Process cmd -ArgumentList '/k', "cd /d `"$base\DierCHAT-Desktop`" && npm run dev"

Write-Host "Done. Open the Vite URL in browser (usually http://localhost:5173)."
Write-Host "Server: see DierCHAT-Server config for port."

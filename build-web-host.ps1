# Сборка веб-клиента под хост (из корня репозитория DierCHAT).
# Запуск: .\build-web-host.ps1
# Требуется: DierCHAT-Desktop\.env.production

$ErrorActionPreference = "Stop"
$desktop = Join-Path $PSScriptRoot "DierCHAT-Desktop"
if (-not (Test-Path (Join-Path $desktop "package.json"))) {
    Write-Error "Не найден DierCHAT-Desktop\package.json. Запускайте скрипт из корня папки DierCHAT."
}
Set-Location $desktop
npm run build:web:host

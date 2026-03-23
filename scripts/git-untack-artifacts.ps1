# Убрать из git (не с диска) сборки и медиа — см. корневой .gitignore.
# Запуск из корня:  powershell -ExecutionPolicy Bypass -File scripts\git-untack-artifacts.ps1

$ErrorActionPreference = 'Continue'
Set-Location (Split-Path $PSScriptRoot -Parent)

$dirs = @(
  'DIERbrowser/bin',
  'DIERbrowser/obj',
  'DierCHAT-Desktop/release',
  'DierCHAT-Server/media'
)
foreach ($p in $dirs) {
  git rm -r --cached --ignore-unmatch $p
}

$files = @(
  'DierCHAT-Server/dierchat.exe',
  'DierCHAT-Server/server.exe',
  'DierCHAT-Server/aqtinstall.log',
  'DierCHAT-Server/config.local.json'
)
foreach ($p in $files) {
  git rm --cached --ignore-unmatch $p
}

Write-Host 'OK. Далее: git add .gitignore; git status; git commit; git push'

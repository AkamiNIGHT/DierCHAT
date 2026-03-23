# Сборка dierchat-deploy.zip (как в deploy-auto.bat, без scp)
# — чистый web/ (без старых хэшей), LF в .sh, ZIP с прямыми слешами (tar.exe)
$ErrorActionPreference = 'Stop'
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
$DESKTOP = Join-Path $ROOT 'DierCHAT-Desktop'
$SERVER = Join-Path $ROOT 'DierCHAT-Server'
$DEPLOY = Join-Path $ROOT 'deploy-package'

$webDest = Join-Path $SERVER 'web'
if (Test-Path $webDest) { Remove-Item $webDest -Recurse -Force }
New-Item -ItemType Directory -Force -Path $webDest | Out-Null
Copy-Item (Join-Path $DESKTOP 'dist\renderer\*') -Destination $webDest -Recurse -Force

if (Test-Path $DEPLOY) { Remove-Item $DEPLOY -Recurse -Force }
New-Item -ItemType Directory -Force -Path $DEPLOY | Out-Null

Copy-Item (Join-Path $SERVER 'web') (Join-Path $DEPLOY 'web') -Recurse -Force
Copy-Item (Join-Path $SERVER 'migrations') (Join-Path $DEPLOY 'migrations') -Recurse -Force
Copy-Item (Join-Path $SERVER 'go.mod') $DEPLOY -Force
Copy-Item (Join-Path $SERVER 'go.sum') $DEPLOY -Force
Copy-Item (Join-Path $SERVER 'cmd') (Join-Path $DEPLOY 'cmd') -Recurse -Force
Copy-Item (Join-Path $SERVER 'internal') (Join-Path $DEPLOY 'internal') -Recurse -Force
Copy-Item (Join-Path $SERVER 'pkg') (Join-Path $DEPLOY 'pkg') -Recurse -Force

$secrets = Join-Path $ROOT 'deploy\secrets.local.json'
$cfgServer = Join-Path $SERVER 'config.json'
$cfgProd = Join-Path $ROOT 'deploy\config.production.json'
if (Test-Path $secrets) {
  Copy-Item $secrets (Join-Path $DEPLOY 'config.json') -Force
  Write-Host "OK: config.json from deploy/secrets.local.json"
} elseif (Test-Path $cfgServer) {
  Copy-Item $cfgServer (Join-Path $DEPLOY 'config.json') -Force
  Write-Host "OK: config.json copied as-is from DierCHAT-Server/config.json"
} else {
  Copy-Item $cfgProd (Join-Path $DEPLOY 'config.json') -Force
  Write-Host "OK: config.json from deploy/config.production.json (no DierCHAT-Server/config.json)"
}

# UTF-8 BOM ломает json.Unmarshal на Linux ("invalid character...")
$deployCfg = Join-Path $DEPLOY 'config.json'
$utf8NoBomEnc = New-Object System.Text.UTF8Encoding $false
$bytes = [System.IO.File]::ReadAllBytes($deployCfg)
if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
  $bytes = $bytes[3..($bytes.Length - 1)]
}
$rawCfg = [System.Text.Encoding]::UTF8.GetString($bytes).Trim()
try {
  $null = $rawCfg | ConvertFrom-Json
} catch {
  throw "config.json is not valid JSON: $_"
}
[System.IO.File]::WriteAllText($deployCfg, $rawCfg + "`n", $utf8NoBomEnc)
Write-Host "OK: config.json UTF-8 no BOM + JSON validated"

Copy-Item (Join-Path $ROOT 'deploy\setup-server.sh') $DEPLOY -Force
Copy-Item (Join-Path $ROOT 'deploy\install.sh') $DEPLOY -Force
Copy-Item (Join-Path $ROOT 'deploy\update-on-server.sh') $DEPLOY -Force
Copy-Item (Join-Path $ROOT 'deploy\full-update-on-server.sh') $DEPLOY -Force
Copy-Item (Join-Path $ROOT 'deploy\deploy-on-host.sh') $DEPLOY -Force
Copy-Item (Join-Path $ROOT 'deploy\nginx-dierchat.conf') $DEPLOY -Force
Copy-Item (Join-Path $ROOT 'deploy\dierchat.service') $DEPLOY -Force
Copy-Item (Join-Path $ROOT 'deploy\set-direct-ip-9000.sh') $DEPLOY -Force
Copy-Item (Join-Path $ROOT 'deploy\fresh-deploy-on-server.sh') $DEPLOY -Force
Copy-Item (Join-Path $ROOT 'deploy\recreate-db-preserve-data.sh') $DEPLOY -Force
$fixSsl = Join-Path $ROOT 'deploy\fix-ssl.sh'
if (Test-Path $fixSsl) {
  Copy-Item $fixSsl $DEPLOY -Force
}

# Документация под текущий прод (домен / VDS)
$docFiles = @(
  'deploy\dier-chat.ru.md',
  'deploy\HOSTING.md',
  'deploy\DB-RECREATE.md',
  'deploy-host.env.example'
)
foreach ($rel in $docFiles) {
  $src = Join-Path $ROOT $rel
  if (Test-Path $src) {
    Copy-Item $src $DEPLOY -Force
  }
}
$caddyEx = Join-Path $ROOT 'deploy\caddy\Caddyfile.example'
if (Test-Path $caddyEx) {
  Copy-Item $caddyEx (Join-Path $DEPLOY 'Caddyfile.example') -Force
}

# Unix line endings в shell-скриптах (иначе bash на Linux: $'\r': command not found)
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
Get-ChildItem $DEPLOY -Filter *.sh -File -Recurse | ForEach-Object {
  $t = [System.IO.File]::ReadAllText($_.FullName) -replace "`r`n", "`n" -replace "`r", ""
  [System.IO.File]::WriteAllText($_.FullName, $t, $utf8NoBom)
}

$zip = Join-Path $ROOT 'dierchat-deploy.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
# Compress-Archive даёт обратные слеши → unzip на Linux ругается и может ломать пути; tar -a создаёт нормальный ZIP
Push-Location $ROOT
try {
  $tar = Get-Command tar -ErrorAction SilentlyContinue
  if ($tar) {
    & tar -a -c -f $zip 'deploy-package'
    if ($LASTEXITCODE -ne 0) { throw "tar exit $LASTEXITCODE" }
  } else {
    Compress-Archive -Path $DEPLOY -DestinationPath $zip -Force
    Write-Host "WARN: использован Compress-Archive (лучше Windows 10+ с tar для ZIP без backslash)."
  }
} finally {
  Pop-Location
}

$item = Get-Item $zip
Write-Host "OK: $($item.FullName) ($([math]::Round($item.Length/1MB, 2)) MB)"

# Полная сборка артефактов для выгрузки на хост и клиентам:
#   • Веб + dierchat-deploy.zip + Windows (Electron) — через build-all-release.ps1
#   • DIERbrowser: 2 варианта для Windows (с .NET 8 на ПК / self-contained один exe)
#   • Android: debug APK (assembleRelease без подписи часто падает — см. deploy/ANDROID.md)
#   • В release-dist/ кладутся README выгрузки и чеклист
#
# Требования: Node, npm install в DierCHAT-Desktop, Go не обязателен (pack-deploy только копирует исходники).
# Для APK: Android SDK, JDK 11+ (скрипт android-gradle.cjs найдёт JBR Studio).
#
# Запуск из корня репозитория:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-upload-bundle.ps1
#
# Параметры:
#   -SkipHostZip   — как в build-all-release
#   -SkipBrowser   — не собирать DIERbrowser
#   -SkipAndroid   — не собирать APK

param(
  [switch]$SkipHostZip,
  [switch]$SkipBrowser,
  [switch]$SkipAndroid
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$OutDir = Join-Path $RepoRoot "release-dist"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$pkgPath = Join-Path $RepoRoot "DierCHAT-Desktop\package.json"
$appVer = "?"
if (Test-Path $pkgPath) {
  try { $appVer = (Get-Content $pkgPath -Raw | ConvertFrom-Json).version } catch { }
}
Write-Host ""
Write-Host "========================================"  -ForegroundColor Magenta
Write-Host " DierCHAT — полный пакет для выгрузки" -ForegroundColor Magenta
Write-Host " Версия клиента: $appVer" -ForegroundColor DarkGray
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""

# --- Базовая сборка (веб, deploy zip, Electron zip) ---
& (Join-Path $PSScriptRoot "build-all-release.ps1") -SkipHostZip:$SkipHostZip
if ($LASTEXITCODE -ne 0) { Write-Error "build-all-release.ps1 failed" }

# --- DIERbrowser: вариант A — нужен установленный .NET 8 + WebView2 Runtime ---
if (-not $SkipBrowser) {
  $BrowserProj = Join-Path $RepoRoot "DIERbrowser\DIERbrowser.csproj"
  if (Test-Path $BrowserProj) {
    Write-Host "==> DIERbrowser [1/2]: framework-dependent (нужны .NET 8 + WebView2 Runtime)" -ForegroundColor Cyan
    $stageFd = Join-Path $env:TEMP "dierbrowser-fd-$([Guid]::NewGuid().ToString('N'))"
    Remove-Item $stageFd -Recurse -Force -ErrorAction SilentlyContinue
    dotnet publish $BrowserProj -c Release -r win-x64 --self-contained false -o $stageFd
    if ($LASTEXITCODE -ne 0) { Remove-Item $stageFd -Recurse -Force -ErrorAction SilentlyContinue; Write-Error "DIERbrowser publish (framework-dependent) failed" }
    $zipFd = Join-Path $OutDir "dierbrowser-windows-net8-webview2.zip"
    if (Test-Path $zipFd) { Remove-Item $zipFd -Force }
    Compress-Archive -Path (Join-Path $stageFd "*") -DestinationPath $zipFd -CompressionLevel Optimal -Force
    Remove-Item $stageFd -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "    -> $zipFd" -ForegroundColor Green

    Write-Host "==> DIERbrowser [2/2]: self-contained single-file (только Windows x64)" -ForegroundColor Cyan
    $stageSc = Join-Path $env:TEMP "dierbrowser-sc-$([Guid]::NewGuid().ToString('N'))"
    Remove-Item $stageSc -Recurse -Force -ErrorAction SilentlyContinue
    dotnet publish $BrowserProj -c Release -r win-x64 `
      --self-contained true `
      -p:PublishSingleFile=true `
      -p:IncludeNativeLibrariesForSelfExtract=true `
      -o $stageSc
    if ($LASTEXITCODE -ne 0) {
      Write-Host "    WARN: self-contained publish failed (можно использовать только net8 zip). Код: $LASTEXITCODE" -ForegroundColor Yellow
      Remove-Item $stageSc -Recurse -Force -ErrorAction SilentlyContinue
    } else {
      $zipSc = Join-Path $OutDir "dierbrowser-windows-self-contained-x64.zip"
      if (Test-Path $zipSc) { Remove-Item $zipSc -Force }
      Compress-Archive -Path (Join-Path $stageSc "*") -DestinationPath $zipSc -CompressionLevel Optimal -Force
      Remove-Item $stageSc -Recurse -Force -ErrorAction SilentlyContinue
      Write-Host "    -> $zipSc" -ForegroundColor Green
    }
  } else {
    Write-Host "==> DIERbrowser: пропуск (нет DIERbrowser/DIERbrowser.csproj)" -ForegroundColor Yellow
  }
}

# --- Android debug APK ---
if (-not $SkipAndroid) {
  $Desktop = Join-Path $RepoRoot "DierCHAT-Desktop"
  $ApkOut = Join-Path $OutDir "dierchat-android-debug.apk"
  if (-not (Test-Path (Join-Path $Desktop "android\gradlew.bat"))) {
    Write-Host "==> Android: нет android/ — пропуск APK" -ForegroundColor Yellow
  } else {
    Write-Host "==> Android: cap:sync + assembleDebug -> $ApkOut" -ForegroundColor Cyan
    Push-Location $Desktop
    try {
      npm run android:build:debug
      if ($LASTEXITCODE -ne 0) { throw "android:build:debug exit $LASTEXITCODE" }
      $renamed = Join-Path $Desktop "release\dier-chat.apk"
      $built = Join-Path $Desktop "android\app\build\outputs\apk\debug\app-debug.apk"
      $src = if (Test-Path $renamed) { $renamed } elseif (Test-Path $built) { $built } else { $null }
      if (-not $src) { throw "APK not found (expected release\dier-chat.apk or app-debug.apk)" }
      Copy-Item $src $ApkOut -Force
      Write-Host "    -> $ApkOut" -ForegroundColor Green
    } catch {
      Write-Host "    WARN: Android APK не собран: $_" -ForegroundColor Yellow
      Write-Host "    См. deploy/ANDROID.md (JDK, ANDROID_HOME, SDK)." -ForegroundColor DarkGray
    } finally {
      Pop-Location
    }
  }
}

# --- Документы для выгрузки в release-dist ---
$uploadReadme = Join-Path $OutDir "README-UPLOAD.txt"
$checklistSrc = Join-Path $RepoRoot "docs\RELEASE_UPLOAD_CHECKLIST.md"
$checklistDst = Join-Path $OutDir "RELEASE_UPLOAD_CHECKLIST.md"
if (Test-Path $checklistSrc) {
  Copy-Item $checklistSrc $checklistDst -Force
}
$dierAndroidSrc = Join-Path $RepoRoot "docs\DIERbrowser_ANDROID.md"
$dierAndroidDst = Join-Path $OutDir "DIERbrowser_ANDROID.md"
if (Test-Path $dierAndroidSrc) {
  Copy-Item $dierAndroidSrc $dierAndroidDst -Force
}

Set-Content -Path $uploadReadme -Encoding UTF8 -Value @"
DierCHAT — пакет для выгрузки ($(Get-Date -Format 'yyyy-MM-dd HH:mm'))

Содержимое release-dist/:
  • dierchat-web-hosting.zip      — только фронт (статика на nginx/Caddy)
  • dierchat-deploy.zip           — бэкенд Go + web + миграции + скрипты (корень репо или release-dist копия)
  • dierchat-desktop-windows.zip  — Electron: portable + NSIS установщик
  • dierbrowser-windows-net8-webview2.zip     — браузер DIERbrowser (нужны .NET 8 + WebView2)
  • dierbrowser-windows-self-contained-x64.zip — браузер один exe (если сборка прошла)
  • dierchat-android-debug.apk    — мессенджер Android (debug), если Gradle успешен
  • RELEASE_UPLOAD_CHECKLIST.md   — куда что заливать
  • DIERbrowser_ANDROID.md        — про Android-версию браузера (отдельно от ПК)

Сборка: scripts/build-upload-bundle.ps1
"@

# Обновить манифест размеров
$manifest = @()
Get-ChildItem $OutDir -File | Sort-Object Name | ForEach-Object {
  $mb = [math]::Round($_.Length / 1MB, 2)
  $manifest += "$($_.Name)`t$mb MB"
}
$manifestPath = Join-Path $OutDir "RELEASE-MANIFEST.txt"
Set-Content -Path $manifestPath -Value (@(
  "DierCHAT — полный пакет $(Get-Date -Format 'yyyy-MM-dd HH:mm')",
  "Корень: $RepoRoot",
  "",
  "Файлы:",
  $manifest,
  "",
  "Подробности: RELEASE-ALL.md, docs/RELEASE_UPLOAD_CHECKLIST.md"
) -join "`n") -Encoding UTF8

Write-Host ""
Write-Host "Готово. Папка выгрузки: $OutDir" -ForegroundColor Green
Write-Host "Чеклист: $checklistDst" -ForegroundColor DarkGray
Write-Host ""

# Создаёт android/release.keystore и напоминает про keystore.properties
# Запуск из DierCHAT-Desktop: .\scripts\android-init-keystore.ps1
# Требуется keytool (JDK / Android Studio jbr\bin)

$ErrorActionPreference = "Stop"
$android = (Join-Path (Split-Path $PSScriptRoot -Parent) "android" | Resolve-Path).Path
$ks = Join-Path $android "release.keystore"
if (Test-Path $ks) {
    Write-Host "Уже есть: $ks" -ForegroundColor Yellow
    exit 0
}
$keytool = $null
foreach ($c in @(
        "$env:JAVA_HOME\bin\keytool.exe",
        "${env:ProgramFiles}\Android\Android Studio\jbr\bin\keytool.exe",
        "${env:ProgramFiles}\Android\Android Studio1\jbr\bin\keytool.exe"
    )) {
    if ($c -and (Test-Path $c)) { $keytool = $c; break }
}
if (-not $keytool) {
    Write-Error "Не найден keytool. Задайте JAVA_HOME или установите Android Studio (JBR)."
}
Set-Location $android
Write-Host "Создание keystore: $ks" -ForegroundColor Cyan
Write-Host "Alias по умолчанию: dierchat (как в keystore.properties.example)" -ForegroundColor Cyan
& $keytool -genkeypair -v -storetype PKCS12 -keystore release.keystore -alias dierchat -keyalg RSA -keysize 2048 -validity 10000
Write-Host ""
Write-Host "Дальше: скопируйте android\keystore.properties.example -> android\keystore.properties и укажите пароли." -ForegroundColor Green
Write-Host "Сборка: npm run android:build:release:host" -ForegroundColor Green

# Сборка DIERbrowser (Release)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
dotnet build -c Release
Write-Host "OK: .\bin\Release\net8.0-windows\DIERbrowser.exe"

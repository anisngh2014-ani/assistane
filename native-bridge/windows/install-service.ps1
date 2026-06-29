param(
  [string]$InstallDir = "$PSScriptRoot"
)

$serviceName = "AssistaneNativeBridge"
$exePath = Join-Path $InstallDir "AssistaneNativeBridge.exe"

if (-not (Test-Path -LiteralPath $exePath)) {
  Write-Host "Assistane Native Bridge executable not found. Skipping service install."
  exit 0
}

$existing = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "Assistane Native Bridge service already exists."
  exit 0
}

New-Service `
  -Name $serviceName `
  -BinaryPathName "`"$exePath`" --service" `
  -DisplayName "Assistane Native Bridge" `
  -Description "Assistane visible native helper for signed remote-support capture/input integration." `
  -StartupType Automatic

sc.exe failure $serviceName reset= 86400 actions= restart/60000/restart/60000/""/60000 | Out-Null
Start-Service -Name $serviceName

Write-Host "Assistane Native Bridge service installed."

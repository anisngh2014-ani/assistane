$serviceName = "AssistaneNativeBridge"
$existing = Get-Service -Name $serviceName -ErrorAction SilentlyContinue

if (-not $existing) {
  Write-Host "Assistane Native Bridge service is not installed."
  exit 0
}

Stop-Service -Name $serviceName -ErrorAction SilentlyContinue
sc.exe delete $serviceName | Out-Null

Write-Host "Assistane Native Bridge service removed."

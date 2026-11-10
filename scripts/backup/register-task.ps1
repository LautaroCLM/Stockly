# Crea la tarea programada de Windows que ejecuta el respaldo todos los dias.
# Uso (PowerShell, sin permisos de administrador): .\scripts\backup\register-task.ps1 -Hora 23:00
param([string]$Hora = '23:00')

$script = Join-Path $PSScriptRoot 'backup.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
$trigger = New-ScheduledTaskTrigger -Daily -At $Hora
# Si la PC estaba apagada a esa hora, corre el respaldo apenas se prende
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'Stockly - Respaldo diario' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Output "Tarea creada: respaldo todos los dias a las $Hora."

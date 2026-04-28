param(
  [string]$TaskName = "NapCatQqSkillBot",
  [string]$WorkDir = ""
)

$ErrorActionPreference = "Stop"

if (-not $WorkDir) {
  $WorkDir = Split-Path -Parent $PSScriptRoot
}

$runScript = Join-Path $WorkDir "run.cmd"
if (-not (Test-Path $runScript)) {
  throw "run.cmd not found in $WorkDir"
}

$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$runScript`"" -WorkingDirectory $WorkDir
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -StartWhenAvailable

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Force | Out-Null

Write-Host "Scheduled task registered:"
Write-Host "  TaskName: $TaskName"
Write-Host "  WorkDir:  $WorkDir"

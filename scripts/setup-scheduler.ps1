#Requires -Version 5.1
# ============================================================
# FixITPro -- Task Scheduler Setup
#
# Run ONCE as Administrator to register the daily backup task.
#
# Usage (right-click PowerShell -> Run as Administrator):
#   powershell -ExecutionPolicy Bypass -File "D:\FixITPro\scripts\setup-scheduler.ps1"
#
# To remove the task later:
#   Unregister-ScheduledTask -TaskName 'FixITPro Daily Backup' -Confirm:$false
# ============================================================
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$TaskName   = 'FixITPro Daily Backup'
$ScriptPath = 'D:\FixITPro\scripts\backup-local.ps1'
$RunAt      = '02:00'    # Change to suit shop opening hours (backup runs before shop opens)

# -- Verify running as Administrator --------------------------
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
           ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host ''
    Write-Host '  ERROR: This script must be run as Administrator.' -ForegroundColor Red
    Write-Host '  Right-click PowerShell and choose "Run as Administrator".' -ForegroundColor Yellow
    Write-Host ''
    exit 1
}

# -- Verify backup script exists ------------------------------
if (-not (Test-Path $ScriptPath)) {
    Write-Host "ERROR: Backup script not found: $ScriptPath" -ForegroundColor Red
    exit 1
}

Write-Host ''
Write-Host '  FixITPro -- Task Scheduler Setup' -ForegroundColor Cyan
Write-Host '  ================================' -ForegroundColor Cyan
Write-Host "  Task name:   $TaskName"
Write-Host "  Script:      $ScriptPath"
Write-Host "  Schedule:    Daily at $RunAt"
Write-Host "  Runs as:     $env:USERDOMAIN\$env:USERNAME"
Write-Host ''

# -- Remove existing task if present --------------------------
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "  Removing existing task '$TaskName'..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

# -- Build task components ------------------------------------
$action = New-ScheduledTaskAction `
    -Execute   'powershell.exe' `
    -Argument  "-NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ScriptPath`""

$trigger = New-ScheduledTaskTrigger -Daily -At $RunAt

# StartWhenAvailable: if PC was off at 2 AM, run the missed backup on next startup
$settings = New-ScheduledTaskSettingsSet `
    -RunOnlyIfNetworkAvailable:$false `
    -StartWhenAvailable `
    -WakeToRun:$false `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
    -MultipleInstances IgnoreNew

# Run as current user at highest privilege (needs PostgreSQL and file access)
$principal = New-ScheduledTaskPrincipal `
    -UserId    "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive `
    -RunLevel  Highest

# -- Register the task ----------------------------------------
Register-ScheduledTask `
    -TaskName  $TaskName `
    -Action    $action `
    -Trigger   $trigger `
    -Settings  $settings `
    -Principal $principal `
    -Force | Out-Null

Write-Host "  Task '$TaskName' registered." -ForegroundColor Green
Write-Host ''

# -- Verify task was created ----------------------------------
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
    $nextRun = (Get-ScheduledTaskInfo -TaskName $TaskName).NextRunTime
    Write-Host "  Status:   $($task.State)" -ForegroundColor Green
    Write-Host "  Next run: $nextRun" -ForegroundColor Green
} else {
    Write-Host '  WARNING: Could not verify task was created.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host '  Setup complete.' -ForegroundColor Green
Write-Host ''
Write-Host '  To run a backup NOW to verify it works:' -ForegroundColor Cyan
Write-Host "    powershell -ExecutionPolicy Bypass -File `"$ScriptPath`""
Write-Host ''
Write-Host '  To view backup logs:' -ForegroundColor Cyan
Write-Host '    notepad D:\FixITPro_Backup\backup.log'
Write-Host ''
Write-Host '  To view task in Task Scheduler:' -ForegroundColor Cyan
Write-Host '    taskschd.msc  (look in Task Scheduler Library)'
Write-Host ''

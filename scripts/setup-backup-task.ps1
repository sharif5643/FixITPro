# FixITPro — Register Daily Backup as Windows Task Scheduler Task
# Run once as Administrator to set up the scheduled task.
#
# Usage (as Administrator):
#   powershell -ExecutionPolicy Bypass -File "D:\FixITPro\scripts\setup-backup-task.ps1"

$TASK_NAME   = "FixITPro_DailyBackup"
$SCRIPT_PATH = "D:\FixITPro\scripts\backup.ps1"
$RUN_AT      = "02:00"   # 2 AM daily

# ── Set your DB credentials here (or use environment variables) ───────────────
$env:PGHOST      = "localhost"
$env:PGPORT      = "5432"
$env:PGUSER      = "postgres"
$env:PGPASSWORD  = "YOUR_DB_PASSWORD"   # <-- edit before running
$env:PGDATABASE  = "fixitpro_db"
$env:BACKUP_DIR  = "D:\FixITPro_Backups"
$env:RETENTION_DAYS = "30"

# ── Build the action ──────────────────────────────────────────────────────────
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NonInteractive -ExecutionPolicy Bypass -File `"$SCRIPT_PATH`""

# ── Build the trigger (daily at $RUN_AT) ──────────────────────────────────────
$trigger = New-ScheduledTaskTrigger -Daily -At $RUN_AT

# ── Settings ──────────────────────────────────────────────────────────────────
$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable:$false

# ── Register (or update) task ─────────────────────────────────────────────────
$existing = Get-ScheduledTask -TaskName $TASK_NAME -ErrorAction SilentlyContinue
if ($existing) {
    Set-ScheduledTask -TaskName $TASK_NAME -Action $action -Trigger $trigger -Settings $settings
    Write-Host "[Setup] Updated existing task: $TASK_NAME"
} else {
    Register-ScheduledTask `
        -TaskName $TASK_NAME `
        -Action   $action `
        -Trigger  $trigger `
        -Settings $settings `
        -RunLevel Highest `
        -Force
    Write-Host "[Setup] Registered new task: $TASK_NAME (runs daily at $RUN_AT)"
}

Write-Host "[Setup] Done. Test with: Start-ScheduledTask -TaskName '$TASK_NAME'"

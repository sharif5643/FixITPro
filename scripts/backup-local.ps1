#Requires -Version 5.1
# ============================================================
# FixITPro -- Local Daily Backup (Windows)
#
# Backs up:
#   1. PostgreSQL database  (pg_dump, compressed)
#   2. Repair images        (backend\uploads\)
#   3. Config files         (backend\.env)
#
# Run manually:
#   powershell -ExecutionPolicy Bypass -File "D:\FixITPro\scripts\backup-local.ps1"
#
# PROD backup (reads .env.production):
#   powershell -ExecutionPolicy Bypass -File "D:\FixITPro\scripts\backup-local.ps1" -ConfigEnvFile "D:\FixITPro\backend\.env.production" -UploadsOverride "D:\FixITPro_Prod_Uploads"
#
# Scheduled automatically by setup-scheduler.ps1 (runs at 2 AM daily).
# ============================================================
param(
    [string]$ConfigEnvFile   = '',   # Override which .env file to read DB config from
    [string]$UploadsOverride = ''    # Override uploads directory to backup
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ============================================================
#  CONFIGURATION -- edit this block to match your setup
# ============================================================
$Cfg = @{
    # Paths
    EnvFile    = if ($ConfigEnvFile -ne '') { $ConfigEnvFile } else { 'D:\FixITPro\backend\.env' }
    UploadsDir = if ($UploadsOverride -ne '') { $UploadsOverride } else { 'D:\FixITPro\backend\uploads' }
    ProjectDir = 'D:\FixITPro'

    # Primary backup destination
    BackupRoot = 'D:\FixITPro_Backup'

    # Retention: how many days to keep old backups
    KeepDays   = 30

    # Optional: External HDD drive letter.
    # Set to drive letter like 'E:' to copy backup there if the drive is connected.
    # Leave as '' to skip.
    ExtDrive   = ''

    # Optional: Cloud sync folder (Google Drive / OneDrive).
    # Path must already exist and be synced by the cloud app.
    # Example: 'C:\Users\Shop\Google Drive\FixITPro Backup'
    # Leave as '' to skip.
    CloudDir   = ''
}
# ============================================================

# Runtime state
$RunDate  = Get-Date -Format 'yyyy-MM-dd'
$RunTime  = Get-Date -Format 'HH-mm-ss'
$TempDir  = Join-Path $Cfg.BackupRoot "_tmp_${RunDate}_${RunTime}"
$FinalDir = Join-Path $Cfg.BackupRoot $RunDate
$LogFile  = Join-Path $Cfg.BackupRoot 'backup.log'

# Ensure backup root exists
if (-not (Test-Path $Cfg.BackupRoot)) {
    New-Item -ItemType Directory -Path $Cfg.BackupRoot -Force | Out-Null
}

# ---- Logging ------------------------------------------------
function Write-Log {
    param(
        [string]$Msg,
        [ValidateSet('INFO','OK','WARN','ERROR')]$Level = 'INFO'
    )
    $ts   = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $line = "[$ts][$Level] $Msg"
    Add-Content -Path $LogFile -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
    $color = switch ($Level) {
        'OK'    { 'Green'  }
        'WARN'  { 'Yellow' }
        'ERROR' { 'Red'    }
        default { 'Cyan'   }
    }
    Write-Host $line -ForegroundColor $color
}

# ---- Windows desktop notification ---------------------------
function Send-Alert {
    param([string]$Title, [string]$Body)
    try {
        Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
        $n         = New-Object System.Windows.Forms.NotifyIcon
        $n.Icon    = [System.Drawing.SystemIcons]::Warning
        $n.Visible = $true
        $n.ShowBalloonTip(8000, $Title, $Body, 'Warning')
        Start-Sleep -Seconds 1
        $n.Dispose()
    } catch { }
}

# ---- Find pg_dump.exe ---------------------------------------
function Find-PgDump {
    # 1. Already in PATH?
    $found = Get-Command 'pg_dump' -ErrorAction SilentlyContinue
    if ($found) { return $found.Source }

    # 2. Read base directory from Windows registry (works for any version/drive)
    try {
        $regBase = 'HKLM:\SOFTWARE\PostgreSQL\Installations'
        $installs = Get-ChildItem $regBase -ErrorAction SilentlyContinue
        foreach ($inst in $installs) {
            $dir = (Get-ItemProperty $inst.PSPath -ErrorAction SilentlyContinue).Base_Directory
            if ($dir) {
                $p = Join-Path $dir 'bin\pg_dump.exe'
                if (Test-Path $p) { return $p }
            }
        }
    } catch { }

    # 3. Common installation paths (fallback)
    $versions = 18, 17, 16, 15, 14, 13
    $bases = @(
        'C:\Program Files\PostgreSQL',
        'C:\Program Files (x86)\PostgreSQL',
        'D:\PostgreSQL', 'D:\DB', 'E:\PostgreSQL'
    )
    foreach ($base in $bases) {
        foreach ($v in $versions) {
            $p = "$base\$v\bin\pg_dump.exe"
            if (Test-Path $p) { return $p }
        }
        # Also try base directly (non-versioned install like D:\DB)
        $p = "$base\bin\pg_dump.exe"
        if (Test-Path $p) { return $p }
    }
    return $null
}

# ---- Parse DATABASE_URL from .env ---------------------------
function Read-DbConfig {
    param([string]$EnvPath)
    if (-not (Test-Path $EnvPath)) { return $null }
    $c = Get-Content $EnvPath -Raw -Encoding UTF8
    if ($c -match 'DATABASE_URL\s*=\s*"?postgresql://([^:]+):([^@]+)@([^:/]+):?(\d*)/?([^?"?\s]+)') {
        return @{
            User     = $Matches[1]
            Password = $Matches[2]
            Host     = $Matches[3]
            Port     = if ($Matches[4]) { $Matches[4] } else { '5432' }
            Database = $Matches[5]
        }
    }
    # Fallback: individual DB_* vars
    $u = if ($c -match 'DB_USER\s*=\s*(.+)')     { $Matches[1].Trim() } else { 'postgres' }
    $p = if ($c -match 'DB_PASSWORD\s*=\s*(.+)') { $Matches[1].Trim() } else { '' }
    $h = if ($c -match 'DB_HOST\s*=\s*(.+)')     { $Matches[1].Trim() } else { 'localhost' }
    $o = if ($c -match 'DB_PORT\s*=\s*(.+)')     { $Matches[1].Trim() } else { '5432' }
    $n = if ($c -match 'DB_NAME\s*=\s*(.+)')     { $Matches[1].Trim() } else { 'fixitpro' }
    return @{ User = $u; Password = $p; Host = $h; Port = $o; Database = $n }
}

# ---- Copy directory recursively -----------------------------
function Copy-Dir {
    param([string]$Source, [string]$Dest)
    if (-not (Test-Path $Source)) {
        Write-Log "Source not found, skipping: $Source" 'WARN'
        return 0
    }
    New-Item -ItemType Directory -Path $Dest -Force | Out-Null
    $files = Get-ChildItem $Source -Recurse -File
    $count = 0
    foreach ($f in $files) {
        $rel  = $f.FullName.Substring($Source.Length).TrimStart('\')
        $dst  = Join-Path $Dest $rel
        $dDir = Split-Path $dst -Parent
        if (-not (Test-Path $dDir)) {
            New-Item -ItemType Directory -Path $dDir -Force | Out-Null
        }
        Copy-Item $f.FullName -Destination $dst -Force
        $count++
    }
    return $count
}

# ============================================================
#  MAIN
# ============================================================
Write-Log '================================================' 'INFO'
Write-Log "FixITPro Backup started -- $RunDate $RunTime"
Write-Log "Destination: $TempDir"

try {
    # -- Prepare temp working directory -----------------------
    New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

    # ======================
    #  STEP 1: DATABASE
    # ======================
    Write-Log '--- Step 1/3: PostgreSQL backup ---'

    $pgDump = Find-PgDump
    if (-not $pgDump) {
        throw "pg_dump.exe not found. Install PostgreSQL or add its bin folder to PATH. Common path: C:\Program Files\PostgreSQL\16\bin"
    }
    Write-Log "pg_dump: $pgDump"

    $db = Read-DbConfig -EnvPath $Cfg.EnvFile
    if (-not $db) {
        throw "Could not read database config from: $($Cfg.EnvFile)"
    }
    Write-Log "Database: $($db.Database) @ $($db.Host):$($db.Port) (user: $($db.User))"

    $DbBackupDir  = Join-Path $TempDir 'database'
    $DbBackupFile = Join-Path $DbBackupDir "fixitpro_${RunDate}_${RunTime}.dump"
    New-Item -ItemType Directory -Path $DbBackupDir -Force | Out-Null

    # Pass password via environment variable (no plaintext in command line)
    $env:PGPASSWORD = $db.Password
    try {
        & $pgDump `
            "--host=$($db.Host)" `
            "--port=$($db.Port)" `
            "--username=$($db.User)" `
            "--dbname=$($db.Database)" `
            '--format=custom' `
            '--compress=9' `
            "--file=$DbBackupFile"
        if ($LASTEXITCODE -ne 0) {
            throw "pg_dump exited with code $LASTEXITCODE"
        }
    } finally {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    }

    $DbSize = (Get-Item $DbBackupFile).Length
    Write-Log "Database backup OK -- $([math]::Round($DbSize/1KB, 1)) KB" 'OK'

    # ======================
    #  STEP 2: UPLOADS
    # ======================
    Write-Log '--- Step 2/3: Uploads backup ---'

    $UploadsBackupDir = Join-Path $TempDir 'uploads'
    $count = Copy-Dir -Source $Cfg.UploadsDir -Dest $UploadsBackupDir
    Write-Log "Uploads backup OK -- $count file(s) copied" 'OK'

    # ======================
    #  STEP 3: CONFIG
    # ======================
    Write-Log '--- Step 3/3: Config backup ---'

    $ConfigBackupDir = Join-Path $TempDir 'config'
    New-Item -ItemType Directory -Path $ConfigBackupDir -Force | Out-Null

    if (Test-Path $Cfg.EnvFile) {
        Copy-Item $Cfg.EnvFile -Destination (Join-Path $ConfigBackupDir 'backend.env') -Force
        Write-Log 'backend.env copied'
    }

    $WebEnv = Join-Path $Cfg.ProjectDir 'web-app\.env.local'
    if (Test-Path $WebEnv) {
        Copy-Item $WebEnv -Destination (Join-Path $ConfigBackupDir 'webapp.env.local') -Force
        Write-Log 'webapp.env.local copied'
    }

    # Write manifest file
    $manifestLines = @(
        'FixITPro Backup Manifest',
        '========================',
        "Date:     $RunDate $RunTime",
        "Host:     $env:COMPUTERNAME",
        "Database: $($db.Database) @ $($db.Host):$($db.Port)",
        'Contents:',
        "  database\fixitpro_${RunDate}_${RunTime}.dump   PostgreSQL dump (restore with pg_restore)",
        '  uploads\                                       Repair images',
        '  config\backend.env                             DB credentials / config'
    )
    Set-Content -Path (Join-Path $TempDir 'MANIFEST.txt') -Value ($manifestLines -join "`r`n") -Encoding UTF8

    Write-Log 'Config backup OK' 'OK'

    # -- Promote temp -> final (atomic-ish) -------------------
    if (Test-Path $FinalDir) {
        Remove-Item $FinalDir -Recurse -Force
        Write-Log "Replaced existing backup for $RunDate" 'WARN'
    }
    Rename-Item -Path $TempDir -NewName $RunDate
    Write-Log "Backup saved to: $FinalDir" 'OK'

    # ======================
    #  OPTIONAL: External drive
    # ======================
    if ($Cfg.ExtDrive -ne '') {
        $extRoot = "$($Cfg.ExtDrive)\"
        if (Test-Path $extRoot) {
            $extPath = Join-Path $Cfg.ExtDrive 'FixITPro_Backup'
            $extDest = Join-Path $extPath $RunDate
            Write-Log "Copying to external drive: $extDest"
            Copy-Dir -Source $FinalDir -Dest $extDest | Out-Null
            Write-Log "External drive backup OK: $extDest" 'OK'
        } else {
            Write-Log "External drive $($Cfg.ExtDrive) not connected -- skipping" 'WARN'
        }
    }

    # ======================
    #  OPTIONAL: Cloud sync folder
    # ======================
    if ($Cfg.CloudDir -ne '') {
        if (Test-Path $Cfg.CloudDir) {
            $cloudDest = Join-Path $Cfg.CloudDir $RunDate
            Write-Log "Copying to cloud sync folder: $cloudDest"
            Copy-Dir -Source $FinalDir -Dest $cloudDest | Out-Null
            Write-Log "Cloud sync copy OK: $cloudDest" 'OK'
        } else {
            Write-Log "Cloud sync folder not found: $($Cfg.CloudDir)" 'WARN'
        }
    }

    # ======================
    #  CLEANUP (only on success -- failure-safe)
    # ======================
    Write-Log "--- Cleanup: removing backups older than $($Cfg.KeepDays) days ---"
    $cutoff  = (Get-Date).AddDays(-$Cfg.KeepDays)
    $removed = 0
    Get-ChildItem $Cfg.BackupRoot -Directory |
        Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}$' -and $_.LastWriteTime -lt $cutoff } |
        ForEach-Object {
            Remove-Item $_.FullName -Recurse -Force
            Write-Log "Deleted old backup: $($_.Name)"
            $removed++
        }
    if ($removed -eq 0) {
        Write-Log 'No old backups to clean up'
    } else {
        Write-Log "Removed $removed old backup(s)" 'OK'
    }

    Write-Log '================================================'
    Write-Log "BACKUP COMPLETE -- $FinalDir" 'OK'
    Write-Log '================================================'

} catch {
    $errMsg = $_.Exception.Message

    # Remove temp folder on failure (don't leave half-finished garbage)
    if (Test-Path $TempDir) {
        Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue
    }

    Write-Log "BACKUP FAILED: $errMsg" 'ERROR'
    Write-Log 'Old backups were NOT deleted (failure-safe).' 'WARN'
    Write-Log '================================================'

    Send-Alert -Title 'FixITPro Backup FAILED' -Body $errMsg

    exit 1
}

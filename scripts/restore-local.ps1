#Requires -Version 5.1
# ============================================================
# FixITPro -- Restore Helper (Interactive)
#
# Use this in an emergency to restore database, images, or config
# from a backup created by backup-local.ps1.
#
# Usage (interactive, pick date from menu):
#   powershell -ExecutionPolicy Bypass -File "D:\FixITPro\scripts\restore-local.ps1"
#
# Usage (specify date directly):
#   powershell -ExecutionPolicy Bypass -File "D:\FixITPro\scripts\restore-local.ps1" -Date 2026-05-12
# ============================================================
param(
    [string]$Date = ''
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$BackupRoot = 'D:\FixITPro_Backup'
$EnvFile    = 'D:\FixITPro\backend\.env'
$UploadsDir = 'D:\FixITPro\backend\uploads'

# ---- Helpers ------------------------------------------------
function Write-Section { param([string]$T)
    Write-Host ''
    Write-Host "  -- $T --" -ForegroundColor Cyan
}

function Get-YesNo { param([string]$Prompt)
    Write-Host ''
    Write-Host "  $Prompt" -ForegroundColor Yellow
    $ans = Read-Host '  Type YES to continue, anything else to skip'
    return ($ans -eq 'YES')
}

function Find-PgRestore {
    $found = Get-Command 'pg_restore' -ErrorAction SilentlyContinue
    if ($found) { return $found.Source }
    # Registry lookup (authoritative — works for any version/drive)
    try {
        $regBase = 'HKLM:\SOFTWARE\PostgreSQL\Installations'
        $installs = Get-ChildItem $regBase -ErrorAction SilentlyContinue
        foreach ($inst in $installs) {
            $dir = (Get-ItemProperty $inst.PSPath -ErrorAction SilentlyContinue).Base_Directory
            if ($dir) {
                $p = Join-Path $dir 'bin\pg_restore.exe'
                if (Test-Path $p) { return $p }
            }
        }
    } catch { }
    # Fallback paths
    $versions = 18, 17, 16, 15, 14, 13
    $bases = @('C:\Program Files\PostgreSQL', 'C:\Program Files (x86)\PostgreSQL', 'D:\PostgreSQL', 'D:\DB', 'E:\PostgreSQL')
    foreach ($base in $bases) {
        foreach ($v in $versions) {
            $p = "$base\$v\bin\pg_restore.exe"
            if (Test-Path $p) { return $p }
        }
        $p = "$base\bin\pg_restore.exe"
        if (Test-Path $p) { return $p }
    }
    return $null
}

function Read-DbConfig {
    param([string]$EnvPath)
    if (-not (Test-Path $EnvPath)) { return $null }
    $c = Get-Content $EnvPath -Raw -Encoding UTF8
    if ($c -match 'DATABASE_URL\s*=\s*"?postgresql://([^:]+):([^@]+)@([^:/]+):?(\d*)/?([^?"?\s]+)') {
        return @{
            User = $Matches[1]; Password = $Matches[2]; Host = $Matches[3]
            Port = if ($Matches[4]) { $Matches[4] } else { '5432' }; Database = $Matches[5]
        }
    }
    $u = if ($c -match 'DB_USER\s*=\s*(.+)')     { $Matches[1].Trim() } else { 'postgres' }
    $p = if ($c -match 'DB_PASSWORD\s*=\s*(.+)') { $Matches[1].Trim() } else { '' }
    $h = if ($c -match 'DB_HOST\s*=\s*(.+)')     { $Matches[1].Trim() } else { 'localhost' }
    $o = if ($c -match 'DB_PORT\s*=\s*(.+)')     { $Matches[1].Trim() } else { '5432' }
    $n = if ($c -match 'DB_NAME\s*=\s*(.+)')     { $Matches[1].Trim() } else { 'fixitpro' }
    return @{ User = $u; Password = $p; Host = $h; Port = $o; Database = $n }
}

# ---- Banner -------------------------------------------------
Clear-Host
Write-Host ''
Write-Host '  +==========================================+' -ForegroundColor Red
Write-Host '  |   FixITPro -- Emergency Restore Tool     |' -ForegroundColor Red
Write-Host '  +==========================================+' -ForegroundColor Red
Write-Host ''
Write-Host '  This tool restores your database and/or repair images.'
Write-Host '  Nothing is overwritten without your confirmation.'
Write-Host ''

# -- Verify backup root exists --------------------------------
if (-not (Test-Path $BackupRoot)) {
    Write-Host "  ERROR: Backup folder not found: $BackupRoot" -ForegroundColor Red
    Write-Host '  Has backup-local.ps1 run at least once successfully?' -ForegroundColor Yellow
    exit 1
}

# -- List available backups -----------------------------------
$available = Get-ChildItem $BackupRoot -Directory |
    Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}$' } |
    Sort-Object Name -Descending

if ($available.Count -eq 0) {
    Write-Host "  ERROR: No backups found in $BackupRoot" -ForegroundColor Red
    exit 1
}

Write-Section 'Available Backups'
Write-Host ''
$i = 1
foreach ($b in $available) {
    $dbFile   = Get-ChildItem (Join-Path $b.FullName 'database') -Filter '*.dump' -ErrorAction SilentlyContinue | Select-Object -First 1
    $dbSize   = if ($dbFile) { "$([math]::Round($dbFile.Length/1KB))KB" } else { 'NO DB' }
    $imgCount = (Get-ChildItem (Join-Path $b.FullName 'uploads') -Recurse -File -ErrorAction SilentlyContinue).Count
    Write-Host "    [$i] $($b.Name)   DB: $dbSize   Images: $imgCount"
    $i++
}

# -- Pick a backup date ---------------------------------------
Write-Host ''
if ($Date -ne '') {
    $chosenDir = Join-Path $BackupRoot $Date
    if (-not (Test-Path $chosenDir)) {
        Write-Host "  ERROR: No backup found for date: $Date" -ForegroundColor Red
        exit 1
    }
} else {
    $choice = Read-Host '  Enter number (from list above) or a date like 2026-05-12'
    if ($choice -match '^\d+$') {
        $idx = [int]$choice - 1
        if ($idx -lt 0 -or $idx -ge $available.Count) {
            Write-Host '  Invalid selection.' -ForegroundColor Red
            exit 1
        }
        $chosenDir = $available[$idx].FullName
        $Date = $available[$idx].Name
    } else {
        $Date = $choice.Trim()
        $chosenDir = Join-Path $BackupRoot $Date
        if (-not (Test-Path $chosenDir)) {
            Write-Host "  Backup not found: $chosenDir" -ForegroundColor Red
            exit 1
        }
    }
}

Write-Host ''
Write-Host "  Selected backup: $Date" -ForegroundColor Green

# Show manifest if present
$manifest = Join-Path $chosenDir 'MANIFEST.txt'
if (Test-Path $manifest) {
    Write-Host ''
    Get-Content $manifest | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
}

# ============================================================
#  RESTORE DATABASE
# ============================================================
Write-Section 'Restore Database'

$dbFile = Get-ChildItem (Join-Path $chosenDir 'database') -Filter '*.dump' -ErrorAction SilentlyContinue |
    Select-Object -First 1

if (-not $dbFile) {
    Write-Host '  No database backup file found in this snapshot.' -ForegroundColor Yellow
} else {
    Write-Host "  Source: $($dbFile.FullName)"
    Write-Host "  Size:   $([math]::Round($dbFile.Length/1KB)) KB"
    Write-Host ''
    Write-Host '  WARNING: This will REPLACE the current database with the backup.' -ForegroundColor Red
    Write-Host '  All data created AFTER this backup will be lost.' -ForegroundColor Red

    if (Get-YesNo 'Restore database from this backup?') {
        $pgRestore = Find-PgRestore
        if (-not $pgRestore) {
            Write-Host '  ERROR: pg_restore.exe not found. Install PostgreSQL or add its bin folder to PATH.' -ForegroundColor Red
        } else {
            $db = Read-DbConfig -EnvPath $EnvFile
            if (-not $db) {
                Write-Host "  ERROR: Could not read DB config from $EnvFile" -ForegroundColor Red
            } else {
                Write-Host "  Restoring '$($db.Database)'..." -ForegroundColor Cyan
                $env:PGPASSWORD = $db.Password
                try {
                    & $pgRestore `
                        "--host=$($db.Host)" `
                        "--port=$($db.Port)" `
                        "--username=$($db.User)" `
                        "--dbname=$($db.Database)" `
                        '--clean' '--if-exists' '--no-owner' '--no-privileges' `
                        $dbFile.FullName
                    if ($LASTEXITCODE -eq 0) {
                        Write-Host '  Database restore COMPLETE.' -ForegroundColor Green
                    } else {
                        Write-Host "  pg_restore exit code: $LASTEXITCODE -- check output above." -ForegroundColor Yellow
                        Write-Host '  Some non-fatal errors (e.g. missing extension) can be ignored.' -ForegroundColor Yellow
                    }
                } finally {
                    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
                }
            }
        }
    } else {
        Write-Host '  Skipped database restore.' -ForegroundColor Yellow
    }
}

# ============================================================
#  RESTORE UPLOADS
# ============================================================
Write-Section 'Restore Repair Images'

$uploadsBackup = Join-Path $chosenDir 'uploads'
if (-not (Test-Path $uploadsBackup)) {
    Write-Host '  No uploads backup found in this snapshot.' -ForegroundColor Yellow
} else {
    $imgCount = (Get-ChildItem $uploadsBackup -Recurse -File -ErrorAction SilentlyContinue).Count
    Write-Host "  Source: $uploadsBackup  ($imgCount files)"
    Write-Host "  Destination: $UploadsDir"
    Write-Host ''
    Write-Host '  WARNING: Files in the current uploads folder will be overwritten.' -ForegroundColor Red

    if (Get-YesNo 'Restore repair images from this backup?') {
        Write-Host '  Copying...' -ForegroundColor Cyan
        $files  = Get-ChildItem $uploadsBackup -Recurse -File
        $copied = 0
        foreach ($f in $files) {
            $rel  = $f.FullName.Substring($uploadsBackup.Length).TrimStart('\')
            $dst  = Join-Path $UploadsDir $rel
            $dDir = Split-Path $dst -Parent
            if (-not (Test-Path $dDir)) {
                New-Item -ItemType Directory -Path $dDir -Force | Out-Null
            }
            Copy-Item $f.FullName -Destination $dst -Force
            $copied++
        }
        Write-Host "  Uploads restore COMPLETE -- $copied file(s) copied." -ForegroundColor Green
    } else {
        Write-Host '  Skipped uploads restore.' -ForegroundColor Yellow
    }
}

# ============================================================
#  RESTORE CONFIG
# ============================================================
Write-Section 'Restore Config Files'

$backupEnv = Join-Path $chosenDir 'config\backend.env'
if (-not (Test-Path $backupEnv)) {
    Write-Host '  No config backup found in this snapshot.' -ForegroundColor Yellow
} else {
    Write-Host '  Found: backend.env'
    Write-Host '  NOTE: Only restore config if the current .env is missing or corrupted.' -ForegroundColor Yellow
    Write-Host "  Destination: $EnvFile"

    if (Get-YesNo 'Overwrite backend .env with the backed-up version?') {
        Copy-Item $backupEnv -Destination $EnvFile -Force
        Write-Host '  backend.env restored.' -ForegroundColor Green
    } else {
        Write-Host '  Skipped config restore.' -ForegroundColor Yellow
    }
}

# ============================================================
#  DONE
# ============================================================
Write-Host ''
Write-Host '  ========================================' -ForegroundColor Green
Write-Host '  Restore process finished.' -ForegroundColor Green
Write-Host ''
Write-Host '  Next steps:' -ForegroundColor Cyan
Write-Host '    1. Restart the FixITPro backend (stop Node.js, run npm run start:prod)'
Write-Host '    2. Open the web dashboard and check data looks correct'
Write-Host '    3. Test the SUNMI POS can connect and list repairs'
Write-Host ''

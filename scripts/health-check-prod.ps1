#Requires -Version 5.1
# ============================================================
# FixITPro -- PROD Health Check
# Run this every morning before opening shop.
# ============================================================
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

# PROD host/port ตายตัว (DEV ใช้ :4000/:4001)
$BackendUrl  = 'http://192.168.1.171:3000/api/v1/health'
$FrontendUrl = 'http://192.168.1.171:3001'
$BackupRoot  = 'D:\FixITPro_Backup'
$ProdUploads = 'D:\FixITPro_Prod_Uploads'
$BackupLog   = 'D:\FixITPro_Backup\backup.log'

$pass = 0
$fail = 0
$warn = 0

function Write-Check {
    param([string]$Label, [string]$Status, [string]$Detail = '')
    $width = 36
    $pad = ' ' * [math]::Max(0, $width - $Label.Length)
    switch ($Status) {
        'OK'   { Write-Host "  $Label$pad" -NoNewline; Write-Host 'OK' -ForegroundColor Green -NoNewline; if ($Detail) { Write-Host "  $Detail" -ForegroundColor DarkGray } else { Write-Host '' }; $script:pass++ }
        'FAIL' { Write-Host "  $Label$pad" -NoNewline; Write-Host 'FAIL' -ForegroundColor Red -NoNewline; if ($Detail) { Write-Host "  $Detail" -ForegroundColor Red } else { Write-Host '' }; $script:fail++ }
        'WARN' { Write-Host "  $Label$pad" -NoNewline; Write-Host 'WARN' -ForegroundColor Yellow -NoNewline; if ($Detail) { Write-Host "  $Detail" -ForegroundColor Yellow } else { Write-Host '' }; $script:warn++ }
    }
}

# ---- Banner -------------------------------------------------
Write-Host ''
Write-Host '  +==========================================+' -ForegroundColor Cyan
Write-Host '  |   FixITPro  --  PROD Health Check        |' -ForegroundColor Cyan
Write-Host '  +==========================================+' -ForegroundColor Cyan
Write-Host ''

# ---- 1. PostgreSQL ------------------------------------------
Write-Host '  [1] Database' -ForegroundColor Cyan
try {
    $null = Get-Command 'psql' -ErrorAction Stop
    $result = & psql -U postgres -c "SELECT 1 FROM pg_database WHERE datname='fixitpro_prod'" -t 2>$null
    if ($result -match '1') {
        Write-Check -Label 'PostgreSQL running' -Status 'OK'
        Write-Check -Label 'fixitpro_prod exists' -Status 'OK'
    } else {
        Write-Check -Label 'fixitpro_prod exists' -Status 'FAIL' -Detail 'Database missing -- run setup first'
    }
} catch {
    Write-Check -Label 'PostgreSQL (psql in PATH)' -Status 'WARN' -Detail 'psql not found; add PostgreSQL bin to PATH for DB check'
}

# Check if PostgreSQL service is running
$pgService = Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Running' }
if ($pgService) {
    Write-Check -Label 'PostgreSQL service' -Status 'OK' -Detail $pgService.Name
} else {
    $pgProc = Get-Process -Name 'postgres' -ErrorAction SilentlyContinue
    if ($pgProc) {
        Write-Check -Label 'PostgreSQL process' -Status 'OK'
    } else {
        Write-Check -Label 'PostgreSQL service' -Status 'FAIL' -Detail 'Not running -- start PostgreSQL'
    }
}

# ---- 2. Backend API -----------------------------------------
Write-Host ''
Write-Host '  [2] Backend API' -ForegroundColor Cyan
try {
    $resp = Invoke-WebRequest -Uri $BackendUrl -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    if ($resp.StatusCode -eq 200) {
        $json = $resp.Content | ConvertFrom-Json
        Write-Check -Label 'Backend health (:3000)' -Status 'OK' -Detail "status=$($json.status)"
    } else {
        Write-Check -Label 'Backend health (:3000)' -Status 'FAIL' -Detail "HTTP $($resp.StatusCode)"
    }
} catch {
    Write-Check -Label 'Backend health (:3000)' -Status 'FAIL' -Detail 'Not responding -- run deploy-prod.ps1 or start-prod.ps1'
}

# ---- 3. Frontend --------------------------------------------
Write-Host ''
Write-Host '  [3] Frontend' -ForegroundColor Cyan
try {
    $resp = Invoke-WebRequest -Uri $FrontendUrl -UseBasicParsing -TimeoutSec 8 -ErrorAction Stop
    if ($resp.StatusCode -eq 200) {
        Write-Check -Label 'Frontend (:3001)' -Status 'OK'
    } else {
        Write-Check -Label 'Frontend (:3001)' -Status 'FAIL' -Detail "HTTP $($resp.StatusCode)"
    }
} catch {
    Write-Check -Label 'Frontend (:3001)' -Status 'FAIL' -Detail 'Not responding -- run start-prod.ps1'
}

# ---- 4. Ports -----------------------------------------------
Write-Host ''
Write-Host '  [4] Ports' -ForegroundColor Cyan
foreach ($port in @(3000, 3001)) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        $procName = (Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue).ProcessName
        Write-Check -Label "Port $port listening" -Status 'OK' -Detail $procName
    } else {
        Write-Check -Label "Port $port listening" -Status 'FAIL' -Detail 'Nothing on this port'
    }
}

# ---- 5. Backup folder ---------------------------------------
Write-Host ''
Write-Host '  [5] Backups' -ForegroundColor Cyan
if (Test-Path $BackupRoot) {
    Write-Check -Label 'Backup folder exists' -Status 'OK' -Detail $BackupRoot

    # Check latest backup date
    $latestBackup = Get-ChildItem $BackupRoot -Directory |
        Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}$' } |
        Sort-Object Name -Descending |
        Select-Object -First 1

    if ($latestBackup) {
        $backupDate  = [datetime]::ParseExact($latestBackup.Name, 'yyyy-MM-dd', $null)
        $daysSince   = ([datetime]::Today - $backupDate).Days
        if ($daysSince -eq 0) {
            Write-Check -Label 'Last backup' -Status 'OK' -Detail "Today ($($latestBackup.Name))"
        } elseif ($daysSince -le 1) {
            Write-Check -Label 'Last backup' -Status 'WARN' -Detail "Yesterday ($($latestBackup.Name))"
        } else {
            Write-Check -Label 'Last backup' -Status 'FAIL' -Detail "$daysSince days ago ($($latestBackup.Name)) -- run backup-prod-now.ps1"
        }
    } else {
        Write-Check -Label 'Last backup' -Status 'WARN' -Detail 'No backups found -- run backup-prod-now.ps1'
    }

    # Check backup log for recent errors
    if (Test-Path $BackupLog) {
        $lastLines = Get-Content $BackupLog -Tail 5
        $hasError  = $lastLines | Where-Object { $_ -match '\[ERROR\]' }
        if ($hasError) {
            Write-Check -Label 'Backup log' -Status 'WARN' -Detail 'Recent errors in backup.log -- check D:\FixITPro_Backup\backup.log'
        } else {
            Write-Check -Label 'Backup log' -Status 'OK' -Detail 'No recent errors'
        }
    }
} else {
    Write-Check -Label 'Backup folder' -Status 'WARN' -Detail 'Not found -- run backup-prod-now.ps1 first'
}

# ---- 6. Uploads folder --------------------------------------
Write-Host ''
Write-Host '  [6] Uploads' -ForegroundColor Cyan
if (Test-Path $ProdUploads) {
    $fileCount = @(Get-ChildItem $ProdUploads -Recurse -File -ErrorAction SilentlyContinue).Count
    Write-Check -Label 'PROD uploads folder' -Status 'OK' -Detail "$fileCount file(s)"
} else {
    Write-Check -Label 'PROD uploads folder' -Status 'WARN' -Detail 'Not created yet (created on first image upload)'
}

# ---- Summary ------------------------------------------------
Write-Host ''
Write-Host '  ========================================' -ForegroundColor Cyan
$totalColor = if ($fail -gt 0) { 'Red' } elseif ($warn -gt 0) { 'Yellow' } else { 'Green' }
Write-Host "  Results:  OK=$pass  WARN=$warn  FAIL=$fail" -ForegroundColor $totalColor

if ($fail -gt 0) {
    Write-Host ''
    Write-Host '  PROD IS NOT READY -- fix FAIL items above.' -ForegroundColor Red
} elseif ($warn -gt 0) {
    Write-Host ''
    Write-Host '  PROD is running with warnings. Review WARN items.' -ForegroundColor Yellow
} else {
    Write-Host ''
    Write-Host '  PROD is healthy. Ready for shop use.' -ForegroundColor Green
}
Write-Host ''

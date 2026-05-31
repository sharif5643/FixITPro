#Requires -Version 5.1
# ============================================================
# FixITPro -- Rollback PROD (Build เท่านั้น)
#
# สิ่งที่สคริปต์นี้ทำ:
#   1. ตรวจสอบว่ามี rollback builds อยู่ (dist-rollback, .next-rollback)
#   2. ยืนยันจากผู้ใช้ก่อนดำเนินการ
#   3. หยุด PROD services (kill port 3000, 3001)
#   4. กู้คืน backend:  dist-rollback -> dist
#   5. กู้คืน frontend: .next-rollback -> .next
#   6. เปิด PROD services ใหม่
#   7. ตรวจสอบสุขภาพระบบ
#
# ข้อสำคัญ:
#   - สคริปต์นี้กู้คืน BUILD เท่านั้น (code + compiled assets)
#   - ไม่กู้คืน database โดยอัตโนมัติ
#   - หาก migration ใหม่ถูก apply ไปแล้ว ให้ตรวจสอบผลกระทบด้วยตนเอง
#     ก่อนตัดสินใจว่าต้องกู้คืน DB ด้วย pg_restore หรือไม่
#   - rollback builds ถูกสร้างโดย deploy-prod.ps1 ขั้น [4] โดยอัตโนมัติ
#
# Port:
#   DEV  -- backend 4000,  frontend 4001
#   PROD -- backend 3000,  frontend 3001  (สคริปต์นี้ใช้ PROD เสมอ)
#
# ใช้งาน:
#   powershell -ExecutionPolicy Bypass -File "D:\FixITPro\scripts\rollback-prod.ps1"
# ============================================================
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

# ---- ค่าคงที่ -----------------------------------------------
$BackendDir       = 'D:\FixITPro\backend'
$WebAppDir        = 'D:\FixITPro\web-app'
$EnvFile          = 'D:\FixITPro\backend\.env.production'
$LogDir           = 'D:\FixITPro\logs'
$RollbackMeta     = Join-Path $LogDir 'rollback-meta.json'
$RollbackLog      = Join-Path $LogDir 'rollback.log'

# PROD ports (ห้ามเปลี่ยนเป็น DEV ports 4000/4001)
$PROD_BACKEND_PORT  = 3000
$PROD_FRONTEND_PORT = 3001
$PROD_HOST          = '192.168.1.171'

# สร้างโฟลเดอร์ logs ถ้ายังไม่มี
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

# ============================================================
#  ฟังก์ชันช่วย
# ============================================================

function Write-Log {
    param(
        [string]$Msg,
        [ValidateSet('INFO','OK','WARN','ERROR','STEP')]
        [string]$Level = 'INFO'
    )
    $ts    = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $line  = "[$ts][$Level] $Msg"
    Add-Content -Path $RollbackLog -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
    $color = switch ($Level) {
        'OK'    { 'Green'  }
        'WARN'  { 'Yellow' }
        'ERROR' { 'Red'    }
        'STEP'  { 'Cyan'   }
        default { 'White'  }
    }
    Write-Host "  $line" -ForegroundColor $color
}

# หยุด process ที่ใช้ port 3000 (backend) และ 3001 (frontend)
function Stop-ProdServices {
    Write-Log 'หยุด PROD services...' 'STEP'
    foreach ($port in @($PROD_BACKEND_PORT, $PROD_FRONTEND_PORT)) {
        $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        if ($conns) {
            foreach ($conn in $conns) {
                $pid  = $conn.OwningProcess
                $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
                if ($proc) {
                    Write-Log "  หยุด $($proc.ProcessName) (PID $pid) บน port $port" 'WARN'
                    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                }
            }
        } else {
            Write-Log "  port ${port}: ไม่มี service ทำงานอยู่" 'INFO'
        }
    }
    Start-Sleep -Seconds 3
    Write-Log 'Services หยุดแล้ว' 'OK'
}

# เปิด PROD services จาก build ที่กู้คืนมา (launcher อ่าน .env.production เอง)
function Start-ProdServices {
    Write-Log 'เปิด PROD services จาก build ที่กู้คืน...' 'STEP'

    # Backend launcher
    $backendLauncher = Join-Path $LogDir '_launch-backend.ps1'
    @"
Get-Content '$EnvFile' | ForEach-Object {
    if (`$_ -notmatch '^\s*#' -and `$_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?([^"#\r\n]*)"?') {
        `$k = `$Matches[1].Trim(); `$v = `$Matches[2].Trim()
        if (`$k -and `$v) { Set-Item -Path "Env:`$k" -Value `$v -ErrorAction SilentlyContinue }
    }
}
`$env:PORT     = '$PROD_BACKEND_PORT'
`$env:NODE_ENV = 'production'
Write-Host ''
Write-Host '  [PROD Backend :$PROD_BACKEND_PORT] (ROLLBACK)' -ForegroundColor Yellow
Set-Location '$BackendDir'
node dist/src/main
"@ | Set-Content -Path $backendLauncher -Encoding UTF8

    # Frontend launcher
    $frontendLauncher = Join-Path $LogDir '_launch-frontend.ps1'
    @"
`$env:NODE_ENV = 'production'
`$env:PORT     = '$PROD_FRONTEND_PORT'
Write-Host ''
Write-Host '  [PROD Frontend :$PROD_FRONTEND_PORT] (ROLLBACK)' -ForegroundColor Yellow
Set-Location '$WebAppDir'
npm run start
"@ | Set-Content -Path $frontendLauncher -Encoding UTF8

    Start-Process powershell.exe `
        -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-File', $backendLauncher) `
        -WindowStyle Normal
    Write-Log "  Backend (rollback) เปิดแล้วบน port $PROD_BACKEND_PORT" 'OK'

    Start-Sleep -Seconds 8

    Start-Process powershell.exe `
        -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-File', $frontendLauncher) `
        -WindowStyle Normal
    Write-Log "  Frontend (rollback) เปิดแล้วบน port $PROD_FRONTEND_PORT" 'OK'

    Write-Log '  รอ services เริ่มทำงาน (15 วินาที)...' 'INFO'
    Start-Sleep -Seconds 15
}

# ตรวจสอบสุขภาพระบบหลัง rollback
function Test-ProdHealth {
    Write-Log 'ตรวจสอบสุขภาพระบบ...' 'STEP'
    $allOk = $true

    $backendUrl = "http://${PROD_HOST}:${PROD_BACKEND_PORT}/api/v1/health"
    try {
        $resp = Invoke-WebRequest -Uri $backendUrl -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        if ($resp.StatusCode -eq 200) {
            Write-Log "  Backend OK: $backendUrl" 'OK'
        } else {
            Write-Log "  Backend HTTP $($resp.StatusCode): $backendUrl" 'WARN'
            $allOk = $false
        }
    } catch {
        Write-Log "  Backend ไม่ตอบสนอง: $backendUrl" 'ERROR'
        $allOk = $false
    }

    $frontendUrl = "http://${PROD_HOST}:${PROD_FRONTEND_PORT}"
    try {
        $resp = Invoke-WebRequest -Uri $frontendUrl -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        if ($resp.StatusCode -eq 200) {
            Write-Log "  Frontend OK: $frontendUrl" 'OK'
        } else {
            Write-Log "  Frontend HTTP $($resp.StatusCode): $frontendUrl" 'WARN'
            $allOk = $false
        }
    } catch {
        Write-Log "  Frontend ไม่ตอบสนอง: $frontendUrl" 'ERROR'
        $allOk = $false
    }

    return $allOk
}

# ============================================================
#  MAIN -- เริ่มกระบวนการ rollback
# ============================================================
Write-Host ''
Write-Host '  ╔══════════════════════════════════════════════╗' -ForegroundColor Yellow
Write-Host '  ║   FixITPro  --  PROD Rollback                ║' -ForegroundColor Yellow
Write-Host '  ║   คืน build ก่อนหน้า (ไม่กู้คืน database)   ║' -ForegroundColor Yellow
Write-Host '  ╚══════════════════════════════════════════════╝' -ForegroundColor Yellow
Write-Host ''

Write-Log '============================================================' 'STEP'
Write-Log "FixITPro PROD Rollback เริ่ม -- $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" 'STEP'
Write-Log '============================================================' 'STEP'

# ============================================================
#  [1] ตรวจสอบ rollback builds
# ============================================================
Write-Host ''
Write-Host '  [1/5] ตรวจสอบ rollback builds' -ForegroundColor Yellow
Write-Log 'ตรวจสอบ rollback builds...' 'STEP'

$backendRollback  = Join-Path $BackendDir 'dist-rollback'
$frontendRollback = Join-Path $WebAppDir  '.next-rollback'
$hasBackend  = Test-Path $backendRollback
$hasFrontend = Test-Path $frontendRollback

if (-not $hasBackend -and -not $hasFrontend) {
    Write-Log 'ไม่พบ rollback builds (dist-rollback และ .next-rollback)' 'ERROR'
    Write-Host ''
    Write-Host '  rollback builds ถูกสร้างโดย deploy-prod.ps1 ขั้น [4] โดยอัตโนมัติ' -ForegroundColor Yellow
    Write-Host '  หากยังไม่เคย deploy ผ่าน deploy-prod.ps1 จะไม่มีข้อมูลสำหรับ rollback' -ForegroundColor Yellow
    Write-Host ''
    exit 1
}

# แสดงข้อมูล rollback ที่มีอยู่
if (Test-Path $RollbackMeta) {
    try {
        $meta = Get-Content $RollbackMeta -Raw -Encoding UTF8 | ConvertFrom-Json
        Write-Log "  Archived เมื่อ: $($meta.ArchivedAt)" 'INFO'
    } catch { }
}

if ($hasBackend) {
    $sz = [math]::Round((Get-ChildItem $backendRollback -Recurse -File -ErrorAction SilentlyContinue |
        Measure-Object -Property Length -Sum).Sum / 1MB, 1)
    Write-Log "  Backend rollback: dist-rollback/ (${sz} MB)" 'OK'
} else {
    Write-Log '  Backend rollback: ไม่พบ (จะข้ามการกู้คืน backend)' 'WARN'
}

if ($hasFrontend) {
    $sz = [math]::Round((Get-ChildItem $frontendRollback -Recurse -File -ErrorAction SilentlyContinue |
        Measure-Object -Property Length -Sum).Sum / 1MB, 1)
    Write-Log "  Frontend rollback: .next-rollback/ (${sz} MB)" 'OK'
} else {
    Write-Log '  Frontend rollback: ไม่พบ (จะข้ามการกู้คืน frontend)' 'WARN'
}

# ============================================================
#  [2] ยืนยันก่อนดำเนินการ
# ============================================================
Write-Host ''
Write-Host '  ╔══════════════════════════════════════════════════════════╗' -ForegroundColor Red
Write-Host '  ║  คำเตือน: Rollback จะหยุด PROD และกู้คืน build เก่า      ║' -ForegroundColor Red
Write-Host '  ║  database ไม่ถูกเปลี่ยนแปลง -- ตรวจสอบ migration ด้วย    ║' -ForegroundColor Red
Write-Host '  ╚══════════════════════════════════════════════════════════╝' -ForegroundColor Red
Write-Host ''

# แสดงเตือนเรื่อง migration
Write-Host '  *** หมายเหตุเรื่อง Database Migration ***' -ForegroundColor Yellow
Write-Host '  หาก deploy ที่ล้มเหลวได้รัน prisma migrate deploy ไปแล้ว' -ForegroundColor Yellow
Write-Host '  schema ของ DB อาจใหม่กว่า code ที่จะ rollback กลับไป' -ForegroundColor Yellow
Write-Host '  ตรวจสอบ D:\FixITPro\logs\deploy.log ว่า migration สำเร็จหรือไม่' -ForegroundColor Yellow
Write-Host '  หากต้องการกู้คืน DB ด้วย: ใช้ pg_restore จาก D:\FixITPro_Backup ด้วยตนเอง' -ForegroundColor Yellow
Write-Host ''

$confirm = Read-Host '  พิมพ์ "ROLLBACK" (ตัวใหญ่) เพื่อยืนยัน หรืออื่นๆ เพื่อยกเลิก'
if ($confirm -ne 'ROLLBACK') {
    Write-Log 'ยกเลิก rollback โดยผู้ใช้' 'WARN'
    Write-Host ''
    Write-Host '  ยกเลิก -- ไม่มีการเปลี่ยนแปลง' -ForegroundColor Cyan
    exit 0
}

Write-Log 'ผู้ใช้ยืนยัน rollback' 'WARN'

# ============================================================
#  [3] หยุด PROD services
# ============================================================
Write-Host ''
Write-Host '  [3/5] Stop PROD services' -ForegroundColor Yellow
Stop-ProdServices

# ============================================================
#  [4] กู้คืน builds
# ============================================================
Write-Host ''
Write-Host '  [4/5] กู้คืน rollback builds' -ForegroundColor Yellow
Write-Log 'กู้คืน builds...' 'STEP'

# กู้คืน backend: dist-rollback -> dist
if ($hasBackend) {
    $currentDist = Join-Path $BackendDir 'dist'
    # เก็บ dist ที่ล้มเหลวไว้เป็น dist-failed (เผื่อต้องตรวจสอบ)
    $failedDist = Join-Path $BackendDir 'dist-failed'
    if (Test-Path $currentDist) {
        if (Test-Path $failedDist) { Remove-Item $failedDist -Recurse -Force -ErrorAction SilentlyContinue }
        Rename-Item -Path $currentDist -NewName 'dist-failed' -ErrorAction SilentlyContinue
        Write-Log '  backend: dist ปัจจุบัน -> dist-failed (เก็บไว้ตรวจสอบ)' 'INFO'
    }
    Copy-Item $backendRollback -Destination $currentDist -Recurse -Force -ErrorAction SilentlyContinue
    Write-Log '  backend: dist-rollback -> dist' 'OK'
} else {
    Write-Log '  ข้ามการกู้คืน backend (ไม่มี dist-rollback)' 'WARN'
}

# กู้คืน frontend: .next-rollback -> .next
if ($hasFrontend) {
    $currentNext = Join-Path $WebAppDir '.next'
    # เก็บ .next ที่ล้มเหลวไว้เป็น .next-failed
    $failedNext = Join-Path $WebAppDir '.next-failed'
    if (Test-Path $currentNext) {
        if (Test-Path $failedNext) { Remove-Item $failedNext -Recurse -Force -ErrorAction SilentlyContinue }
        Rename-Item -Path $currentNext -NewName '.next-failed' -ErrorAction SilentlyContinue
        Write-Log '  frontend: .next ปัจจุบัน -> .next-failed (เก็บไว้ตรวจสอบ)' 'INFO'
    }
    Copy-Item $frontendRollback -Destination $currentNext -Recurse -Force -ErrorAction SilentlyContinue
    Write-Log '  frontend: .next-rollback -> .next' 'OK'
} else {
    Write-Log '  ข้ามการกู้คืน frontend (ไม่มี .next-rollback)' 'WARN'
}

Write-Log 'กู้คืน builds เสร็จสิ้น' 'OK'

# ============================================================
#  [5] Start PROD services + Health check
# ============================================================
Write-Host ''
Write-Host '  [5/5] Start + Health check' -ForegroundColor Yellow
Start-ProdServices

$healthy = Test-ProdHealth

# ============================================================
#  Summary
# ============================================================
Write-Host ''
Write-Host '  ============================================================' -ForegroundColor Yellow

if ($healthy) {
    Write-Log 'Rollback สำเร็จ -- PROD กลับมาทำงานปกติ' 'OK'
    Write-Host ''
    Write-Host "  Backend  : http://${PROD_HOST}:${PROD_BACKEND_PORT}" -ForegroundColor Green
    Write-Host "  Frontend : http://${PROD_HOST}:${PROD_FRONTEND_PORT}" -ForegroundColor Green
    Write-Host ''
    Write-Host '  *** ขั้นตอนหลัง rollback ***' -ForegroundColor Cyan
    Write-Host '  1. ตรวจสอบว่า migration ที่รันไปแล้ว (ถ้ามี) กระทบ rollback build หรือไม่' -ForegroundColor Cyan
    Write-Host '     ดูที่: D:\FixITPro\logs\deploy.log' -ForegroundColor Cyan
    Write-Host '  2. หาก DB ต้องกู้คืนด้วย: ใช้ pg_restore จาก D:\FixITPro_Backup' -ForegroundColor Cyan
    Write-Host '  3. แก้ไข bug แล้วรัน deploy-prod.ps1 อีกครั้ง' -ForegroundColor Cyan
    Write-Host '  ============================================================' -ForegroundColor Yellow
    Write-Host ''
    exit 0
} else {
    Write-Log 'Rollback เสร็จแต่ health check ล้มเหลว!' 'ERROR'
    Write-Host ''
    Write-Host '  *** Health check ล้มเหลวหลัง rollback ***' -ForegroundColor Red
    Write-Host '  ตรวจสอบหน้าต่าง Backend/Frontend ว่ามี error อะไร' -ForegroundColor Yellow
    Write-Host '  หรือรัน health-check-prod.ps1 เพื่อดูรายละเอียด' -ForegroundColor Yellow
    Write-Host '  ============================================================' -ForegroundColor Yellow
    Write-Host ''
    exit 1
}

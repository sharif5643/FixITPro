#Requires -Version 5.1
# ============================================================
# FixITPro -- Deploy PROD
#
# ขั้นตอนการ deploy (9 ขั้น):
#   [1] Preflight    -- ตรวจสอบ .env.production, JWT_SECRET, DATABASE_URL
#   [2] Backup       -- สำรอง DB + uploads ก่อน deploy ทุกครั้ง
#   [3] Stop         -- หยุด PROD services (kill port 3000, 3001)
#   [4] Archive      -- เก็บ dist/ และ .next/ เก่าไว้เป็น rollback
#   [5] Install      -- npm ci ทั้ง backend และ frontend
#   [6] Migrate      -- prisma migrate deploy เท่านั้น
#                       ห้าม migrate dev / ห้าม migrate reset / ห้าม reset DB
#   [7] Build        -- npm run build backend + frontend
#   [8] Start        -- เปิด PROD services ใหม่
#   [9] Health check -- ตรวจสอบ http://192.168.1.171:3000 และ :3001
#
# Port:
#   DEV  -- backend 4000,  frontend 4001
#   PROD -- backend 3000,  frontend 3001  (สคริปต์นี้ใช้ PROD เสมอ)
#
# ใช้งาน:
#   powershell -ExecutionPolicy Bypass -File "D:\FixITPro\scripts\deploy-prod.ps1"
#   powershell -ExecutionPolicy Bypass -File "D:\FixITPro\scripts\deploy-prod.ps1" -SkipBackup
#   powershell -ExecutionPolicy Bypass -File "D:\FixITPro\scripts\deploy-prod.ps1" -SkipNpmInstall
#
# ข้อห้ามเด็ดขาด:
#   - ห้ามรัน prisma migrate dev บน PROD ไม่ว่ากรณีใด
#   - ห้ามรัน prisma migrate reset บน PROD ไม่ว่ากรณีใด
#   - ห้าม reset / drop ฐานข้อมูล fixitpro_prod
# ============================================================
param(
    # ข้ามขั้นตอน backup (อันตราย -- ต้องยืนยันก่อน)
    [switch]$SkipBackup,
    # ข้ามขั้นตอน npm ci (ใช้เมื่อ package.json ไม่เปลี่ยน)
    [switch]$SkipNpmInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'   # ใช้ Continue เพื่อให้ Stop-Process fail gracefully

# ---- ค่าคงที่ -----------------------------------------------
$BackendDir       = 'D:\FixITPro\backend'
$WebAppDir        = 'D:\FixITPro\web-app'
$EnvFile          = 'D:\FixITPro\backend\.env.production'
$BackupScript     = 'D:\FixITPro\scripts\backup-prod.ps1'
$LogDir           = 'D:\FixITPro\logs'
$DeployLog        = Join-Path $LogDir 'deploy.log'
$RollbackMeta     = Join-Path $LogDir 'rollback-meta.json'

# PROD ports (ห้ามเปลี่ยนเป็น DEV ports 4000/4001)
$PROD_BACKEND_PORT  = 3000
$PROD_FRONTEND_PORT = 3001
$PROD_HOST          = '192.168.1.171'

$DeployStart = Get-Date

# สร้างโฟลเดอร์ logs
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
    Add-Content -Path $DeployLog -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
    $color = switch ($Level) {
        'OK'    { 'Green'  }
        'WARN'  { 'Yellow' }
        'ERROR' { 'Red'    }
        'STEP'  { 'Cyan'   }
        default { 'White'  }
    }
    Write-Host "  $line" -ForegroundColor $color
}

# อ่านค่าจาก .env file (รองรับทั้ง KEY=value และ KEY="value")
function Read-EnvValue {
    param([string]$EnvPath, [string]$Key)
    if (-not (Test-Path $EnvPath)) { return $null }
    foreach ($line in (Get-Content $EnvPath -Encoding UTF8)) {
        if ($line -match "^\s*${Key}\s*=\s*`"?([^`"#\r\n]+)`"?") {
            return $Matches[1].Trim().Trim('"').Trim("'")
        }
    }
    return $null
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

# เก็บ build ปัจจุบันไว้เป็น rollback (dist-rollback, .next-rollback)
function Save-RollbackBuilds {
    Write-Log 'Archive rollback builds...' 'STEP'
    $archived = @()

    # Backend: dist -> dist-rollback
    $src = Join-Path $BackendDir 'dist'
    $dst = Join-Path $BackendDir 'dist-rollback'
    if (Test-Path $src) {
        if (Test-Path $dst) { Remove-Item $dst -Recurse -Force -ErrorAction SilentlyContinue }
        Copy-Item $src -Destination $dst -Recurse -Force -ErrorAction SilentlyContinue
        Write-Log '  backend: dist -> dist-rollback' 'OK'
        $archived += 'backend'
    } else {
        Write-Log '  backend dist/ ไม่พบ -- deploy ครั้งแรกหรือ build ยังไม่เคยรัน' 'WARN'
    }

    # Frontend: .next -> .next-rollback
    $src = Join-Path $WebAppDir '.next'
    $dst = Join-Path $WebAppDir '.next-rollback'
    if (Test-Path $src) {
        if (Test-Path $dst) { Remove-Item $dst -Recurse -Force -ErrorAction SilentlyContinue }
        Copy-Item $src -Destination $dst -Recurse -Force -ErrorAction SilentlyContinue
        Write-Log '  frontend: .next -> .next-rollback' 'OK'
        $archived += 'frontend'
    } else {
        Write-Log '  frontend .next/ ไม่พบ -- deploy ครั้งแรกหรือ build ยังไม่เคยรัน' 'WARN'
    }

    # บันทึก metadata สำหรับ rollback-prod.ps1
    @{
        ArchivedAt       = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
        ArchivedServices = $archived
        BackendRollback  = (Join-Path $BackendDir 'dist-rollback')
        FrontendRollback = (Join-Path $WebAppDir  '.next-rollback')
    } | ConvertTo-Json | Set-Content -Path $RollbackMeta -Encoding UTF8 -ErrorAction SilentlyContinue

    Write-Log 'Archive เสร็จสิ้น' 'OK'
}

# เปิด PROD services ในหน้าต่าง PowerShell แยก
# Launcher script อ่าน .env.production เองที่ startup (ไม่ฝัง secret ใน process args)
function Start-ProdServices {
    Write-Log 'เปิด PROD services...' 'STEP'

    # ---- Backend launcher -----------------------------------
    # Script นี้ถูกสร้างตอน deploy และลบหลังจาก process เริ่มทำงาน
    $backendLauncher = Join-Path $LogDir '_launch-backend.ps1'
    @"
# โหลด .env.production -- อ่านค่า env vars สำหรับ PROD backend
Get-Content '$EnvFile' | ForEach-Object {
    if (`$_ -notmatch '^\s*#' -and `$_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?([^"#\r\n]*)"?') {
        `$k = `$Matches[1].Trim(); `$v = `$Matches[2].Trim()
        if (`$k -and `$v) { Set-Item -Path "Env:`$k" -Value `$v -ErrorAction SilentlyContinue }
    }
}
# PROD port ตายตัวที่ 3000 (DEV ใช้ 4000)
`$env:PORT     = '$PROD_BACKEND_PORT'
`$env:NODE_ENV = 'production'

Write-Host ''
Write-Host '  [PROD Backend :$PROD_BACKEND_PORT] Starting...' -ForegroundColor Green
Write-Host "  DB: `$env:DATABASE_URL" -ForegroundColor DarkGray
Set-Location '$BackendDir'
node dist/src/main
"@ | Set-Content -Path $backendLauncher -Encoding UTF8

    # ---- Frontend launcher ----------------------------------
    $frontendLauncher = Join-Path $LogDir '_launch-frontend.ps1'
    @"
# PROD frontend -- ใช้ port 3001 (DEV ใช้ 4001)
`$env:NODE_ENV = 'production'
`$env:PORT     = '$PROD_FRONTEND_PORT'

Write-Host ''
Write-Host '  [PROD Frontend :$PROD_FRONTEND_PORT] Starting...' -ForegroundColor Green
Set-Location '$WebAppDir'
npm run start
"@ | Set-Content -Path $frontendLauncher -Encoding UTF8

    # เปิด backend ในหน้าต่างใหม่
    Start-Process powershell.exe `
        -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-File', $backendLauncher) `
        -WindowStyle Normal
    Write-Log "  Backend เปิดแล้วบน port $PROD_BACKEND_PORT" 'OK'

    # รอให้ backend พร้อมก่อนเปิด frontend
    Write-Log '  รอ backend เริ่มทำงาน (8 วินาที)...' 'INFO'
    Start-Sleep -Seconds 8

    # เปิด frontend ในหน้าต่างใหม่
    Start-Process powershell.exe `
        -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-File', $frontendLauncher) `
        -WindowStyle Normal
    Write-Log "  Frontend เปิดแล้วบน port $PROD_FRONTEND_PORT" 'OK'

    # รอ frontend พร้อมก่อน health check
    Write-Log '  รอ frontend เริ่มทำงาน (15 วินาที)...' 'INFO'
    Start-Sleep -Seconds 15
}

# ตรวจสอบสุขภาพระบบ -- คืนค่า $true ถ้าทั้งคู่ OK
function Test-ProdHealth {
    Write-Log 'ตรวจสอบสุขภาพ PROD...' 'STEP'
    $allOk = $true

    # Backend health endpoint
    $backendUrl = "http://${PROD_HOST}:${PROD_BACKEND_PORT}/api/v1/health"
    try {
        $resp = Invoke-WebRequest -Uri $backendUrl -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        if ($resp.StatusCode -eq 200) {
            Write-Log "  Backend OK: $backendUrl" 'OK'
        } else {
            Write-Log "  Backend ตอบกลับ HTTP $($resp.StatusCode): $backendUrl" 'WARN'
            $allOk = $false
        }
    } catch {
        Write-Log "  Backend ไม่ตอบสนอง: $backendUrl" 'ERROR'
        $allOk = $false
    }

    # Frontend ping
    $frontendUrl = "http://${PROD_HOST}:${PROD_FRONTEND_PORT}"
    try {
        $resp = Invoke-WebRequest -Uri $frontendUrl -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        if ($resp.StatusCode -eq 200) {
            Write-Log "  Frontend OK: $frontendUrl" 'OK'
        } else {
            Write-Log "  Frontend ตอบกลับ HTTP $($resp.StatusCode): $frontendUrl" 'WARN'
            $allOk = $false
        }
    } catch {
        Write-Log "  Frontend ไม่ตอบสนอง: $frontendUrl" 'ERROR'
        $allOk = $false
    }

    return $allOk
}

# ============================================================
#  MAIN -- เริ่มกระบวนการ deploy
# ============================================================
Write-Host ''
Write-Host '  ╔══════════════════════════════════════════════╗' -ForegroundColor Cyan
Write-Host '  ║   FixITPro  --  PROD Deploy                  ║' -ForegroundColor Cyan
Write-Host '  ║   PROD: backend :3000 / frontend :3001       ║' -ForegroundColor Cyan
Write-Host '  ║   DEV:  backend :4000 / frontend :4001       ║' -ForegroundColor Cyan
Write-Host '  ╚══════════════════════════════════════════════╝' -ForegroundColor Cyan
Write-Host ''

Write-Log '============================================================' 'STEP'
Write-Log "FixITPro PROD Deploy เริ่ม -- $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" 'STEP'
Write-Log '============================================================' 'STEP'

# ============================================================
#  [1] Preflight checks
# ============================================================
Write-Host ''
Write-Host '  [1/9] Preflight checks' -ForegroundColor Cyan
Write-Log 'Preflight checks...' 'STEP'

# ตรวจสอบ .env.production
if (-not (Test-Path $EnvFile)) {
    Write-Log "ไม่พบ .env.production: $EnvFile" 'ERROR'
    Write-Log 'กรุณาสร้างไฟล์จาก backend\.env.example ก่อน deploy' 'ERROR'
    exit 1
}

# อ่านค่าที่จำเป็น
$ProdDbUrl = Read-EnvValue -EnvPath $EnvFile -Key 'DATABASE_URL'
$JwtSecret = Read-EnvValue -EnvPath $EnvFile -Key 'JWT_SECRET'

if (-not $ProdDbUrl) {
    Write-Log 'DATABASE_URL ไม่มีใน .env.production' 'ERROR'
    exit 1
}

# ตรวจสอบว่า DATABASE_URL ชี้ไป fixitpro_prod (ไม่ใช่ DEV)
if ($ProdDbUrl -notmatch 'fixitpro_prod') {
    Write-Log "DATABASE_URL ดูเหมือนไม่ใช่ PROD DB: $ProdDbUrl" 'WARN'
    Write-Host ''
    Write-Host "  DATABASE_URL: $ProdDbUrl" -ForegroundColor Yellow
    $ans = Read-Host '  ยืนยันว่า DATABASE_URL นี้ถูกต้อง? (yes/no)'
    if ($ans.ToLower() -ne 'yes') {
        Write-Log 'ยกเลิก deploy -- ตรวจสอบ DATABASE_URL ใน .env.production'
        exit 0
    }
}

# ตรวจสอบ JWT_SECRET ไม่ใช่ค่า default
if (-not $JwtSecret -or
    $JwtSecret -eq 'CHANGE_ME_STRONG_PROD_SECRET_AT_LEAST_32_CHARS' -or
    $JwtSecret.Length -lt 16) {
    Write-Log 'JWT_SECRET ยังไม่ได้ตั้งค่าหรือสั้นเกินไป -- ห้าม deploy PROD!' 'ERROR'
    Write-Log "แก้ไข JWT_SECRET ใน $EnvFile ก่อน" 'ERROR'
    exit 1
}

# ตรวจสอบ backend dist มีอยู่ (ต้องเคย build มาก่อนหรือจะ build ใน step 7)
# ตรวจสอบ .env.production ไม่ชี้ไป DEV port
$envContent = Get-Content $EnvFile -Raw -Encoding UTF8
if ($envContent -match 'PORT\s*=\s*4000') {
    Write-Log 'PORT ใน .env.production เป็น 4000 (DEV port) -- ควรเป็น 3000' 'ERROR'
    exit 1
}

Write-Log 'Preflight OK' 'OK'

# ============================================================
#  [2] Pre-deploy backup
# ============================================================
Write-Host ''
Write-Host '  [2/9] Pre-deploy backup' -ForegroundColor Cyan
Write-Log 'Pre-deploy backup...' 'STEP'

if ($SkipBackup) {
    Write-Log 'ข้ามขั้นตอน backup (-SkipBackup)' 'WARN'
    Write-Log 'คำเตือน: ไม่มี backup -- หากเกิดปัญหาต้องกู้คืนด้วยตนเอง!' 'WARN'
    Write-Host ''
    Write-Host '  *** คำเตือน: กำลังข้าม backup! ***' -ForegroundColor Red
    $confirm = Read-Host '  พิมพ์ "SKIP" (ตัวใหญ่) เพื่อยืนยัน หรืออื่นๆ เพื่อยกเลิก'
    if ($confirm -ne 'SKIP') {
        Write-Log 'ยกเลิก deploy -- ลบ -SkipBackup แล้วลองใหม่'; exit 0
    }
} else {
    if (-not (Test-Path $BackupScript)) {
        Write-Log "ไม่พบ backup-prod.ps1: $BackupScript" 'ERROR'
        exit 1
    }
    & $BackupScript
    if ($LASTEXITCODE -ne 0) {
        Write-Log 'Backup ล้มเหลว -- หยุด deploy เพื่อความปลอดภัย' 'ERROR'
        Write-Log 'แก้ไขปัญหา backup ก่อน แล้วรัน deploy-prod.ps1 ใหม่' 'ERROR'
        exit 1
    }
    Write-Log 'Pre-deploy backup OK' 'OK'
}

# ============================================================
#  [3] หยุด PROD services
# ============================================================
Write-Host ''
Write-Host '  [3/9] Stop PROD services' -ForegroundColor Cyan
Stop-ProdServices

# ============================================================
#  [4] Archive rollback builds
# ============================================================
Write-Host ''
Write-Host '  [4/9] Archive rollback builds' -ForegroundColor Cyan
Save-RollbackBuilds

# ============================================================
#  [5] Install dependencies
# ============================================================
Write-Host ''
Write-Host '  [5/9] Install dependencies' -ForegroundColor Cyan
Write-Log 'ติดตั้ง dependencies...' 'STEP'

if ($SkipNpmInstall) {
    Write-Log 'ข้ามขั้นตอน npm ci (-SkipNpmInstall)' 'WARN'
} else {
    # Backend
    Write-Log 'npm ci -- backend...' 'INFO'
    Set-Location $BackendDir
    npm ci
    if ($LASTEXITCODE -ne 0) {
        Write-Log 'npm ci backend ล้มเหลว' 'ERROR'
        Write-Log 'กู้คืน: รัน rollback-prod.ps1' 'WARN'
        exit 1
    }
    Write-Log 'Backend dependencies OK' 'OK'

    # Frontend
    Write-Log 'npm ci -- frontend...' 'INFO'
    Set-Location $WebAppDir
    npm ci
    if ($LASTEXITCODE -ne 0) {
        Write-Log 'npm ci frontend ล้มเหลว' 'ERROR'
        Write-Log 'กู้คืน: รัน rollback-prod.ps1' 'WARN'
        exit 1
    }
    Write-Log 'Frontend dependencies OK' 'OK'
}

# ============================================================
#  [6] Prisma migrate deploy
#  !! ห้าม migrate dev / ห้าม migrate reset !!
# ============================================================
Write-Host ''
Write-Host '  [6/9] Prisma migrate deploy' -ForegroundColor Cyan
Write-Log 'Prisma migration -- PROD...' 'STEP'
Write-Log '!! รันเฉพาะ migrate deploy เท่านั้น -- ห้าม dev/reset !!' 'WARN'

Set-Location $BackendDir
$env:DATABASE_URL = $ProdDbUrl
$env:NODE_ENV     = 'production'

# ตรวจสอบสถานะ migration ก่อน
Write-Log 'ตรวจสอบ migration status...' 'INFO'
$statusOut = npx prisma migrate status 2>&1
foreach ($line in ($statusOut | Where-Object { $_ -match '\S' })) {
    Write-Log "  $line" 'INFO'
}

# รัน migrate deploy (SAFE: ใช้ migration files ที่มีอยู่แล้วเท่านั้น)
Write-Log 'รัน: npx prisma migrate deploy' 'INFO'
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) {
    Write-Log 'prisma migrate deploy ล้มเหลว' 'ERROR'
    Write-Log 'ตรวจสอบ migration files และ DB connection แล้วลองใหม่' 'ERROR'
    Write-Log 'หมายเหตุ: DB ยังไม่ถูกเปลี่ยนแปลง (migrate deploy fail-safe)' 'WARN'
    Write-Log 'กู้คืน build เก่า: รัน rollback-prod.ps1' 'WARN'
    exit 1
}
Write-Log 'prisma migrate deploy OK' 'OK'

# Regenerate Prisma client ให้ตรงกับ schema ล่าสุด
Write-Log 'รัน: npx prisma generate' 'INFO'
npx prisma generate
if ($LASTEXITCODE -ne 0) {
    Write-Log 'prisma generate ล้มเหลว' 'ERROR'
    exit 1
}
Write-Log 'prisma generate OK' 'OK'

# เคลียร์ env vars หลังใช้
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:NODE_ENV     -ErrorAction SilentlyContinue

# ============================================================
#  [7] Build backend + frontend
# ============================================================
Write-Host ''
Write-Host '  [7/9] Build' -ForegroundColor Cyan
Write-Log 'Build backend...' 'STEP'

Set-Location $BackendDir
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Log 'Backend build ล้มเหลว' 'ERROR'
    Write-Log 'กู้คืน build เก่า: รัน rollback-prod.ps1' 'WARN'
    exit 1
}
Write-Log 'Backend build OK' 'OK'

Write-Log 'Build frontend...' 'STEP'
Set-Location $WebAppDir

# ตั้ง API URL ให้ชี้ไป PROD backend (port 3000)
# NEXT_PUBLIC_API_URL ถูก embed เข้า build ขณะ compile -- ต้องตั้งก่อน npm run build
$prodApiUrl = "http://${PROD_HOST}:${PROD_BACKEND_PORT}/api/v1"
Set-Content -Path (Join-Path $WebAppDir '.env.local') `
    -Value "NEXT_PUBLIC_API_URL=$prodApiUrl" `
    -Encoding UTF8
Write-Log "  NEXT_PUBLIC_API_URL = $prodApiUrl" 'INFO'

npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Log 'Frontend build ล้มเหลว' 'ERROR'
    Write-Log 'กู้คืน build เก่า: รัน rollback-prod.ps1' 'WARN'
    exit 1
}
Write-Log 'Frontend build OK' 'OK'

# ============================================================
#  [8] Start PROD services
# ============================================================
Write-Host ''
Write-Host '  [8/9] Start PROD services' -ForegroundColor Cyan
Start-ProdServices

# ============================================================
#  [9] Health check
# ============================================================
Write-Host ''
Write-Host '  [9/9] Health check' -ForegroundColor Cyan
$healthy = Test-ProdHealth

# ============================================================
#  Summary
# ============================================================
$elapsed = [math]::Round(((Get-Date) - $DeployStart).TotalMinutes, 1)

Write-Host ''
Write-Host '  ============================================================' -ForegroundColor Cyan

if ($healthy) {
    Write-Log "Deploy สำเร็จ! ใช้เวลา ${elapsed} นาที" 'OK'
    Write-Host ''
    Write-Host "  Backend  : http://${PROD_HOST}:${PROD_BACKEND_PORT}" -ForegroundColor Green
    Write-Host "  Frontend : http://${PROD_HOST}:${PROD_FRONTEND_PORT}" -ForegroundColor Green
    Write-Host ''
    Write-Host '  PROD พร้อมใช้งาน' -ForegroundColor Green
    Write-Host '  ============================================================' -ForegroundColor Cyan
    Write-Host ''
    exit 0
} else {
    Write-Log "Deploy เสร็จแต่ health check ล้มเหลว! ใช้เวลา ${elapsed} นาที" 'ERROR'
    Write-Host ''
    Write-Host '  *** Health check ล้มเหลว ***' -ForegroundColor Red
    Write-Host '  1. ตรวจสอบหน้าต่าง Backend/Frontend ว่ามี error อะไร' -ForegroundColor Yellow
    Write-Host '  2. รัน health-check-prod.ps1 เพื่อดูรายละเอียด' -ForegroundColor Yellow
    Write-Host '  3. หากต้องการกู้คืน: รัน rollback-prod.ps1' -ForegroundColor Yellow
    Write-Host '  ============================================================' -ForegroundColor Cyan
    Write-Host ''
    exit 1
}

#Requires -Version 5.1
# ============================================================
# FixITPro -- สำรองข้อมูล PROD
#
# สิ่งที่สคริปต์นี้ทำ:
#   1. สำรอง PROD database (fixitpro_prod) ด้วย pg_dump (compressed)
#   2. สำรองโฟลเดอร์อัปโหลดภาพซ่อม (D:\FixITPro_Prod_Uploads)
#   3. สำรอง config files (.env.production)
#   4. บันทึก path ของ backup ล่าสุดไว้ที่ D:\FixITPro_Backup\.last-backup-path
#
# ใช้งาน:
#   powershell -ExecutionPolicy Bypass -File "D:\FixITPro\scripts\backup-prod.ps1"
#
# เรียกใช้โดยอัตโนมัติจาก deploy-prod.ps1 ก่อนทุก deploy
# สามารถรันด้วยตนเองได้ตลอดเวลาที่ต้องการสำรองข้อมูลด่วน
#
# ไฟล์ที่ต้องมีก่อนรัน:
#   D:\FixITPro\backend\.env.production  (DATABASE_URL ชี้ไป fixitpro_prod)
#   D:\FixITPro\scripts\backup-local.ps1 (สคริปต์หลักที่ทำ pg_dump)
# ============================================================
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---- ค่าคงที่ -----------------------------------------------
$ProdEnvFile    = 'D:\FixITPro\backend\.env.production'
$ProdUploadsDir = 'D:\FixITPro_Prod_Uploads'
$BackupScript   = 'D:\FixITPro\scripts\backup-local.ps1'
$BackupRoot     = 'D:\FixITPro_Backup'
$LastBackupFile = Join-Path $BackupRoot '.last-backup-path'   # deploy-prod.ps1 อ่านไฟล์นี้

# ---- Banner -------------------------------------------------
Write-Host ''
Write-Host '  +==========================================+' -ForegroundColor Green
Write-Host '  |   FixITPro  --  PROD Backup              |' -ForegroundColor Green
Write-Host '  +==========================================+' -ForegroundColor Green
Write-Host "  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor DarkGray
Write-Host ''

# ---- ตรวจสอบไฟล์ที่จำเป็น ----------------------------------
if (-not (Test-Path $BackupScript)) {
    Write-Host "  [ERROR] ไม่พบ backup-local.ps1 ที่: $BackupScript" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $ProdEnvFile)) {
    Write-Host "  [ERROR] ไม่พบ .env.production ที่: $ProdEnvFile" -ForegroundColor Red
    Write-Host '  กรุณาสร้างไฟล์ก่อนรัน backup' -ForegroundColor Red
    exit 1
}

# ตรวจสอบว่า DATABASE_URL ชี้ไปที่ฐานข้อมูล PROD จริง
$envContent = Get-Content $ProdEnvFile -Raw -Encoding UTF8
if ($envContent -notmatch 'fixitpro_prod') {
    Write-Host "  [ERROR] DATABASE_URL ใน .env.production ไม่ได้ชี้ไป fixitpro_prod" -ForegroundColor Red
    Write-Host '  ตรวจสอบ D:\FixITPro\backend\.env.production ก่อนสำรองข้อมูล' -ForegroundColor Red
    exit 1
}

# สร้างโฟลเดอร์ backup root ถ้ายังไม่มี
if (-not (Test-Path $BackupRoot)) {
    New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
    Write-Host "  สร้างโฟลเดอร์: $BackupRoot" -ForegroundColor Cyan
}

Write-Host "  ฐานข้อมูล : fixitpro_prod" -ForegroundColor Cyan
Write-Host "  Uploads   : $ProdUploadsDir" -ForegroundColor Cyan
Write-Host "  Destination: $BackupRoot\$(Get-Date -Format 'yyyy-MM-dd')" -ForegroundColor Cyan
Write-Host ''

# ---- รัน backup-local.ps1 พร้อมค่า PROD -------------------
# backup-local.ps1 รองรับ -ConfigEnvFile และ -UploadsOverride
# เพื่อแยก PROD backup ออกจาก DEV backup อย่างชัดเจน
& $BackupScript `
    -ConfigEnvFile   $ProdEnvFile `
    -UploadsOverride $ProdUploadsDir

if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Host '  [ERROR] Backup ล้มเหลว -- ตรวจสอบ output ข้างบน' -ForegroundColor Red
    Write-Host '  ห้าม deploy โดยไม่มี backup ที่สำเร็จ' -ForegroundColor Red
    exit 1
}

# ---- บันทึก path ของ backup ล่าสุดสำหรับ deploy-prod.ps1 --
$todayPath = Join-Path $BackupRoot (Get-Date -Format 'yyyy-MM-dd')
Set-Content -Path $LastBackupFile -Value $todayPath -Encoding UTF8 -ErrorAction SilentlyContinue

Write-Host ''
Write-Host "  [OK] PROD Backup เสร็จสิ้น" -ForegroundColor Green
Write-Host "  Path: $todayPath" -ForegroundColor Green
Write-Host ''
exit 0

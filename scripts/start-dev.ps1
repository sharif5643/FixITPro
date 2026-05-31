#Requires -Version 5.1
# ============================================================
# FixITPro -- Start DEV (Backend :4000 + Frontend :4001)
#
# DEV environment -- for testing only.
# Uses: fixitpro_dev database, D:\FixITPro_Dev_Uploads
# NEVER connects to PROD database.
#
# FIRST-TIME SETUP:
#   1. Create DEV database:
#      psql -U postgres -c "CREATE DATABASE fixitpro_dev;"
#      cd D:\FixITPro\backend
#      set DATABASE_URL=postgresql://postgres:123456@localhost:5432/fixitpro_dev
#      npx prisma migrate deploy
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File "D:\FixITPro\scripts\start-dev.ps1"
# ============================================================
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$BackendDir = 'D:\FixITPro\backend'
$WebAppDir  = 'D:\FixITPro\web-app'

# ---- Detect LAN IP ------------------------------------------
$LAN_IP = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.PrefixOrigin -ne 'WellKnown' -and $_.IPAddress -notlike '169.*' -and $_.IPAddress -ne '127.0.0.1' } |
    Select-Object -First 1).IPAddress
if (-not $LAN_IP) { $LAN_IP = '192.168.1.171' }

# ---- Banner -------------------------------------------------
Write-Host ''
Write-Host '  +==========================================+' -ForegroundColor Cyan
Write-Host '  |   FixITPro  --  DEV START                |' -ForegroundColor Cyan
Write-Host '  +==========================================+' -ForegroundColor Cyan
Write-Host ''
Write-Host '  DEV -- for testing only, NOT production data'
Write-Host '  Backend     : http://localhost:4000/api/v1'
Write-Host "  Frontend    : http://${LAN_IP}:4001"
Write-Host ''

# ---- Check DEV database exists ------------------------------
Write-Host '  Checking DEV database...' -ForegroundColor Cyan
$pgCmd = Get-Command 'psql' -ErrorAction SilentlyContinue
if ($pgCmd) {
    $dbCheck = & psql -U postgres -c "SELECT 1 FROM pg_database WHERE datname='fixitpro_dev'" -t 2>$null
    if ($dbCheck -notmatch '1') {
        Write-Host ''
        Write-Host '  WARNING: fixitpro_dev database not found!' -ForegroundColor Yellow
        Write-Host '  Create it first:' -ForegroundColor Cyan
        Write-Host '    psql -U postgres -c "CREATE DATABASE fixitpro_dev;"'
        Write-Host '    cd D:\FixITPro\backend'
        Write-Host '    set NODE_ENV=development'
        Write-Host '    set DATABASE_URL=postgresql://postgres:123456@localhost:5432/fixitpro_dev'
        Write-Host '    npx prisma migrate deploy'
        Write-Host ''
        $ans = Read-Host '  Continue anyway? (YES/no)'
        if ($ans -ne 'YES') { exit 1 }
    } else {
        Write-Host '  Database OK' -ForegroundColor Green
    }
}

# ---- Update .env.local to point to DEV backend --------------
$envLocal = Join-Path $WebAppDir '.env.local'
if (Test-Path $envLocal) {
    $localContent = Get-Content $envLocal -Raw
    if ($localContent -match 'NEXT_PUBLIC_API_URL') {
        $newContent = $localContent -replace 'NEXT_PUBLIC_API_URL=.*', "NEXT_PUBLIC_API_URL=http://${LAN_IP}:4000/api/v1"
        Set-Content -Path $envLocal -Value $newContent.TrimEnd() -Encoding UTF8
    }
} else {
    Set-Content -Path $envLocal -Value "NEXT_PUBLIC_API_URL=http://${LAN_IP}:4000/api/v1" -Encoding UTF8
}
Write-Host "  .env.local set to DEV: NEXT_PUBLIC_API_URL=http://${LAN_IP}:4000/api/v1" -ForegroundColor Cyan

# ---- Create DEV uploads dirs if missing ---------------------
$dirs = @('D:\FixITPro_Dev_Uploads', 'D:\FixITPro_Dev_Uploads\repairs')
foreach ($d in $dirs) {
    if (-not (Test-Path $d)) {
        New-Item -ItemType Directory -Path $d -Force | Out-Null
        Write-Host "  Created: $d"
    }
}

# ---- Set DEV env vars (inherited by child processes) --------
$env:NODE_ENV         = 'development'
$env:PORT             = '4000'
$env:DATABASE_URL     = 'postgresql://postgres:123456@localhost:5432/fixitpro_dev'
$env:JWT_SECRET       = 'dev_jwt_secret_not_for_production'
$env:JWT_EXPIRES_IN   = '24h'
$env:UPLOADS_BASE_DIR = 'D:\FixITPro_Dev_Uploads'
$env:UPLOADS_DIR      = 'D:\FixITPro_Dev_Uploads\repairs'
$env:CORS_ORIGIN      = "http://localhost:4001,http://${LAN_IP}:4001"

# ---- Launch DEV backend window ------------------------------
Write-Host ''
Write-Host '  Starting DEV backend on port 4000 (watch mode)...' -ForegroundColor Cyan
$backendCmd = "Write-Host '[DEV Backend - WATCH MODE]' -ForegroundColor Cyan; `$env:NODE_ENV='development'; `$env:PORT='4000'; `$env:DATABASE_URL='postgresql://postgres:123456@localhost:5432/fixitpro_dev'; `$env:JWT_SECRET='dev_jwt_secret_not_for_production'; `$env:UPLOADS_BASE_DIR='D:\FixITPro_Dev_Uploads'; `$env:UPLOADS_DIR='D:\FixITPro_Dev_Uploads\repairs'; Set-Location 'D:\FixITPro\backend'; npm run start:dev"
Start-Process powershell.exe -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $backendCmd) -WindowStyle Normal

Start-Sleep -Seconds 2

# ---- Launch DEV frontend window -----------------------------
Write-Host '  Starting DEV frontend on port 4001 (hot reload)...' -ForegroundColor Cyan
$frontendCmd = "Write-Host '[DEV Frontend - HOT RELOAD]' -ForegroundColor Cyan; Set-Location 'D:\FixITPro\web-app'; npm run dev -- -p 4001"
Start-Process powershell.exe -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $frontendCmd) -WindowStyle Normal

# ---- Done ---------------------------------------------------
Write-Host ''
Write-Host '  DEV servers starting...' -ForegroundColor Green
Write-Host "  Frontend: http://${LAN_IP}:4001  (may take 15-30s on first load)" -ForegroundColor Cyan
Write-Host '  SUNMI DEV APK server URL should point to this address.'
Write-Host ''
Write-Host '  WARNING: DEV data is separate from PROD. Do not cross-connect.' -ForegroundColor Yellow
Write-Host ''

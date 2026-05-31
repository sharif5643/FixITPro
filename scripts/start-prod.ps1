#Requires -Version 5.1
# ============================================================
# FixITPro -- Start PRODUCTION (Backend :3000 + Frontend :3001)
#
# FIRST-TIME SETUP (run once before first use):
#   1. Create PROD database:
#      psql -U postgres -c "CREATE DATABASE fixitpro_prod;"
#
#   2. Migrate schema to PROD database:
#      cd D:\FixITPro\backend
#      set DATABASE_URL=postgresql://postgres:123456@localhost:5432/fixitpro_prod
#      npx prisma migrate deploy
#
#   3. If migrating real data from existing fixitpro database:
#      pg_dump -U postgres fixitpro | psql -U postgres fixitpro_prod
#
#   4. Build backend (if not done yet):
#      cd D:\FixITPro\backend && npm run build
#
#   5. Run this script:
#      powershell -ExecutionPolicy Bypass -File "D:\FixITPro\scripts\start-prod.ps1"
#
#   6. On first run without -NoBuild, frontend is built (~3-5 min).
#      Subsequent starts: use -NoBuild flag to skip rebuild.
#
# Usage:
#   start-prod.ps1             -- full start (builds frontend if needed)
#   start-prod.ps1 -NoBuild    -- fast start (skips frontend build)
# ============================================================
param([switch]$NoBuild)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$BackendDir = 'D:\FixITPro\backend'
$WebAppDir  = 'D:\FixITPro\web-app'
$EnvFile    = 'D:\FixITPro\backend\.env.production'

# ---- Detect LAN IP ------------------------------------------
$LAN_IP = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
        $_.PrefixOrigin -ne 'WellKnown' -and
        $_.IPAddress -notlike '169.*' -and
        $_.IPAddress -ne '127.0.0.1' -and
        $_.IPAddress -notlike '192.168.137.*'   # skip Windows Mobile Hotspot virtual adapter
    } |
    Select-Object -First 1).IPAddress
if (-not $LAN_IP) { $LAN_IP = '192.168.1.171' }

# ---- Banner -------------------------------------------------
Clear-Host
Write-Host ''
Write-Host '  +==========================================+' -ForegroundColor Green
Write-Host '  |   FixITPro  --  PRODUCTION START         |' -ForegroundColor Green
Write-Host '  +==========================================+' -ForegroundColor Green
Write-Host ''
Write-Host "  LAN IP      : $LAN_IP"
Write-Host '  Backend     : http://localhost:3000/api/v1'
Write-Host "  Frontend    : http://${LAN_IP}:3001"
Write-Host "  SUNMI APK   : http://${LAN_IP}:3001"
Write-Host ''

# ---- Preflight checks ---------------------------------------

# Check .env.production exists
if (-not (Test-Path $EnvFile)) {
    Write-Host "  ERROR: $EnvFile not found." -ForegroundColor Red
    exit 1
}

# Check backend dist exists
if (-not (Test-Path (Join-Path $BackendDir 'dist\src\main.js'))) {
    Write-Host '  ERROR: Backend not built. Run: cd D:\FixITPro\backend && npm run build' -ForegroundColor Red
    exit 1
}

# Check PROD database is accessible
Write-Host '  Checking PROD database...' -ForegroundColor Cyan
$pgCmd = Get-Command 'psql' -ErrorAction SilentlyContinue
if ($pgCmd) {
    $dbCheck = & psql -U postgres -c "SELECT 1 FROM pg_database WHERE datname='fixitpro_prod'" -t 2>$null
    if ($dbCheck -notmatch '1') {
        Write-Host ''
        Write-Host '  WARNING: fixitpro_prod database not found!' -ForegroundColor Yellow
        Write-Host ''
        Write-Host '  Create it first:' -ForegroundColor Cyan
        Write-Host '    psql -U postgres -c "CREATE DATABASE fixitpro_prod;"'
        Write-Host '    cd D:\FixITPro\backend'
        Write-Host '    set NODE_ENV=production'
        Write-Host '    set DATABASE_URL=postgresql://postgres:123456@localhost:5432/fixitpro_prod'
        Write-Host '    npx prisma migrate deploy'
        Write-Host ''
        Write-Host '  Then re-run this script.' -ForegroundColor Yellow
        exit 1
    }
    Write-Host '  Database OK' -ForegroundColor Green
} else {
    Write-Host '  psql not in PATH -- skipping DB check (add PostgreSQL bin to PATH)' -ForegroundColor Yellow
}

# ---- Check for conflicting .env.local -----------------------
$envLocal = Join-Path $WebAppDir '.env.local'
if (Test-Path $envLocal) {
    $localContent = Get-Content $envLocal -Raw
    if ($localContent -match 'NEXT_PUBLIC_API_URL') {
        Write-Host ''
        Write-Host '  NOTE: .env.local overrides NEXT_PUBLIC_API_URL from .env.production' -ForegroundColor Yellow
        Write-Host '  Updating .env.local to point to PROD backend (port 3000)...' -ForegroundColor Cyan
        # Update or add the correct prod URL in .env.local
        $newContent = $localContent -replace 'NEXT_PUBLIC_API_URL=.*', "NEXT_PUBLIC_API_URL=http://${LAN_IP}:3000/api/v1"
        Set-Content -Path $envLocal -Value $newContent.TrimEnd() -Encoding UTF8
        Write-Host "  .env.local updated: NEXT_PUBLIC_API_URL=http://${LAN_IP}:3000/api/v1" -ForegroundColor Green
    }
} else {
    # Write fresh .env.local with PROD settings
    Set-Content -Path $envLocal -Value "NEXT_PUBLIC_API_URL=http://${LAN_IP}:3000/api/v1" -Encoding UTF8
    Write-Host "  Created .env.local with PROD API URL (http://${LAN_IP}:3000/api/v1)" -ForegroundColor Green
}

# ---- Create uploads directories if missing ------------------
$dirs = @('D:\FixITPro_Prod_Uploads', 'D:\FixITPro_Prod_Uploads\repairs')
foreach ($d in $dirs) {
    if (-not (Test-Path $d)) {
        New-Item -ItemType Directory -Path $d -Force | Out-Null
        Write-Host "  Created: $d" -ForegroundColor Cyan
    }
}

# ---- Set PROD environment variables -------------------------
$env:NODE_ENV          = 'production'
$env:PORT              = '3000'
$env:DATABASE_URL      = 'postgresql://postgres:123456@localhost:5432/fixitpro_prod'
$env:JWT_SECRET        = 'CHANGE_ME_STRONG_PROD_SECRET_AT_LEAST_32_CHARS'
$env:JWT_EXPIRES_IN    = '8h'
$env:UPLOADS_BASE_DIR  = 'D:\FixITPro_Prod_Uploads'
$env:UPLOADS_DIR       = 'D:\FixITPro_Prod_Uploads\repairs'
$env:CORS_ORIGIN       = "http://localhost:3001,http://${LAN_IP}:3001"

# ---- Build frontend if needed -------------------------------
if (-not $NoBuild) {
    Write-Host ''
    Write-Host '  Building frontend for PROD (this takes 3-5 minutes)...' -ForegroundColor Cyan
    Write-Host '  Tip: Use -NoBuild on future starts to skip this step.'
    Set-Location $WebAppDir
    $buildResult = & npm run build 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host '  Frontend build FAILED. Check errors above.' -ForegroundColor Red
        $buildResult | Write-Host
        exit 1
    }
    Write-Host '  Frontend build OK' -ForegroundColor Green
} else {
    if (-not (Test-Path (Join-Path $WebAppDir '.next'))) {
        Write-Host '  ERROR: No .next build found. Run without -NoBuild first.' -ForegroundColor Red
        exit 1
    }
    Write-Host '  Skipping frontend build (-NoBuild)' -ForegroundColor Yellow
}

# ---- Launch backend window ----------------------------------
Write-Host ''
Write-Host '  Starting PROD backend on port 3000...' -ForegroundColor Cyan
$backendCmd = "Write-Host '[PROD Backend]' -ForegroundColor Green; `$env:NODE_ENV='production'; `$env:PORT='3000'; `$env:DATABASE_URL='postgresql://postgres:123456@localhost:5432/fixitpro_prod'; `$env:JWT_SECRET='CHANGE_ME_STRONG_PROD_SECRET_AT_LEAST_32_CHARS'; `$env:JWT_EXPIRES_IN='8h'; `$env:UPLOADS_BASE_DIR='D:\FixITPro_Prod_Uploads'; `$env:UPLOADS_DIR='D:\FixITPro_Prod_Uploads\repairs'; Set-Location 'D:\FixITPro\backend'; node dist/src/main"
Start-Process powershell.exe -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $backendCmd) -WindowStyle Normal

Start-Sleep -Seconds 3

# ---- Launch frontend window ---------------------------------
Write-Host '  Starting PROD frontend on port 3001...' -ForegroundColor Cyan
$frontendCmd = "Write-Host '[PROD Frontend]' -ForegroundColor Green; `$env:NODE_ENV='production'; Set-Location 'D:\FixITPro\web-app'; npm run start"
Start-Process powershell.exe -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $frontendCmd) -WindowStyle Normal

Start-Sleep -Seconds 5

# ---- Done ---------------------------------------------------
Write-Host ''
Write-Host '  ========================================' -ForegroundColor Green
Write-Host '  PROD SERVERS STARTED' -ForegroundColor Green
Write-Host '  ========================================' -ForegroundColor Green
Write-Host ''
Write-Host '  Web dashboard  :' -ForegroundColor Cyan
Write-Host "    http://${LAN_IP}:3001"
Write-Host ''
Write-Host '  SUNMI POS APK  :' -ForegroundColor Cyan
Write-Host "    APK server URL --> http://${LAN_IP}:3001"
Write-Host ''
Write-Host '  To stop: run stop-prod.ps1' -ForegroundColor Yellow
Write-Host ''
Write-Host '  READY FOR SHOP USE' -ForegroundColor Green
Write-Host ''

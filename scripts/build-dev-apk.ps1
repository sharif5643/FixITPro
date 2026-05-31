#Requires -Version 5.1
# ============================================================
# FixITPro -- Build DEV Debug APK
# APK points to: Backend :4000, Frontend :4001
# App name: FixITPro DEV
# App ID:   com.fixitpro.dev  (installs ALONGSIDE PROD APK)
#
# This is a DEBUG APK -- no signing needed.
# Can be installed alongside FixITPro PROD on the same device.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File "D:\FixITPro\scripts\build-dev-apk.ps1"
# ============================================================
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$WebAppDir   = 'D:\FixITPro\web-app'
$AndroidDir  = 'D:\FixITPro\web-app\android'
$ReleasesDir = 'D:\FixITPro_Releases'

# ---- Detect LAN IP ------------------------------------------
$LAN_IP = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.PrefixOrigin -ne 'WellKnown' -and $_.IPAddress -notlike '169.*' -and $_.IPAddress -ne '127.0.0.1' } |
    Select-Object -First 1).IPAddress
if (-not $LAN_IP) { $LAN_IP = '192.168.1.171' }

# ---- Banner -------------------------------------------------
Write-Host ''
Write-Host '  +==========================================+' -ForegroundColor Cyan
Write-Host '  |   FixITPro  --  Build DEV APK            |' -ForegroundColor Cyan
Write-Host '  +==========================================+' -ForegroundColor Cyan
Write-Host ''
Write-Host "  App name : FixITPro DEV"
Write-Host "  App ID   : com.fixitpro.dev"
Write-Host "  Frontend : http://${LAN_IP}:4001"
Write-Host "  Backend  : http://${LAN_IP}:4000/api/v1"
Write-Host '  Type     : Debug (unsigned)'
Write-Host ''

if (-not (Get-Command 'npx' -ErrorAction SilentlyContinue)) {
    Write-Host '  ERROR: npx not found. Install Node.js.' -ForegroundColor Red
    exit 1
}

$gradlew = Join-Path $AndroidDir 'gradlew.bat'
if (-not (Test-Path $gradlew)) {
    Write-Host "  ERROR: gradlew.bat not found at $gradlew" -ForegroundColor Red
    exit 1
}

# ---- Step 1: Update .env.local for DEV ----------------------
Write-Host '  [1/3] Writing DEV env...' -ForegroundColor Cyan
$envLocalContent = "NEXT_PUBLIC_API_URL=http://${LAN_IP}:4000/api/v1"
Set-Content -Path (Join-Path $WebAppDir '.env.local') -Value $envLocalContent -Encoding UTF8
Write-Host "  NEXT_PUBLIC_API_URL=http://${LAN_IP}:4000/api/v1"

# ---- Step 2: Sync Capacitor for DEV -------------------------
Write-Host ''
Write-Host '  [2/3] Syncing Capacitor (DEV)...' -ForegroundColor Cyan
$env:CAPACITOR_APP_ID     = 'com.fixitpro.dev'
$env:CAPACITOR_APP_NAME   = 'FixITPro DEV'
$env:CAPACITOR_SERVER_URL = "http://${LAN_IP}:4001"

Set-Location $WebAppDir
& npx cap sync android
if ($LASTEXITCODE -ne 0) {
    Write-Host '  ERROR: cap sync failed.' -ForegroundColor Red
    exit 1
}
Write-Host '  Sync OK' -ForegroundColor Green

# ---- Step 3: Build debug APK --------------------------------
Write-Host ''
Write-Host '  [3/3] Building DEV debug APK...' -ForegroundColor Cyan
Set-Location $AndroidDir
& $gradlew assembleDebug
if ($LASTEXITCODE -ne 0) {
    Write-Host '  ERROR: Gradle debug build failed.' -ForegroundColor Red
    exit 1
}

$apkSource = Join-Path $AndroidDir 'app\build\outputs\apk\debug\app-debug.apk'
if (-not (Test-Path $apkSource)) {
    Write-Host '  ERROR: debug APK not found after build.' -ForegroundColor Red
    exit 1
}

# Copy to releases
if (-not (Test-Path $ReleasesDir)) { New-Item -ItemType Directory -Path $ReleasesDir -Force | Out-Null }
$timestamp = Get-Date -Format 'yyyyMMdd-HHmm'
$apkName   = "fixitpro-DEV-debug-${timestamp}.apk"
$apkDest   = Join-Path $ReleasesDir $apkName
Copy-Item $apkSource -Destination $apkDest -Force

$apkMB = [math]::Round((Get-Item $apkDest).Length / 1MB, 1)

# ---- Done ---------------------------------------------------
Write-Host ''
Write-Host '  ========================================' -ForegroundColor Cyan
Write-Host "  DEV APK READY: $apkName" -ForegroundColor Cyan
Write-Host '  ========================================' -ForegroundColor Cyan
Write-Host ''
Write-Host '  Install on device (replaces previous DEV APK):' -ForegroundColor Cyan
Write-Host "    adb install -r `"$apkDest`""
Write-Host ''
Write-Host '  This APK uses DEV servers (ports 4000/4001).' -ForegroundColor Yellow
Write-Host '  It will NOT work when PROD servers are running on 3000/3001.' -ForegroundColor Yellow
Write-Host '  Run start-dev.ps1 before using this APK.' -ForegroundColor Yellow
Write-Host ''

# ---- Restore .env.local back to PROD after DEV build --------
Write-Host '  Restoring .env.local to PROD settings...' -ForegroundColor Cyan
$prodContent = "NEXT_PUBLIC_API_URL=http://${LAN_IP}:3000/api/v1"
Set-Content -Path (Join-Path $WebAppDir '.env.local') -Value $prodContent -Encoding UTF8
Write-Host '  .env.local restored to PROD (port 3000).' -ForegroundColor Green
Write-Host ''

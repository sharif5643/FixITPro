#Requires -Version 5.1
# ============================================================
# FixITPro -- Build PROD Release APK
# APK points to: Backend :3000, Frontend :3001
# App name: FixITPro PROD
# App ID:   com.fixitpro.pos
#
# Prerequisites:
#   - key.properties must exist in web-app\android\
#   - PROD servers must be running (or use static LAN IP)
#   - Java + Android SDK on PATH
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File "D:\FixITPro\scripts\build-prod-apk.ps1"
# ============================================================
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$WebAppDir   = 'D:\FixITPro\web-app'
$AndroidDir  = 'D:\FixITPro\web-app\android'
$ReleasesDir = 'D:\FixITPro_Releases'
$KeyProps    = Join-Path $AndroidDir 'key.properties'

# ---- Detect LAN IP ------------------------------------------
$LAN_IP = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.PrefixOrigin -ne 'WellKnown' -and $_.IPAddress -notlike '169.*' -and $_.IPAddress -ne '127.0.0.1' } |
    Select-Object -First 1).IPAddress
if (-not $LAN_IP) { $LAN_IP = '192.168.1.171' }

# ---- Banner -------------------------------------------------
Write-Host ''
Write-Host '  +==========================================+' -ForegroundColor Green
Write-Host '  |   FixITPro  --  Build PROD APK           |' -ForegroundColor Green
Write-Host '  +==========================================+' -ForegroundColor Green
Write-Host ''
Write-Host "  App name : FixITPro PROD"
Write-Host "  App ID   : com.fixitpro.pos"
Write-Host "  Frontend : http://${LAN_IP}:3001"
Write-Host "  Backend  : http://${LAN_IP}:3000/api/v1"
Write-Host ''

# ---- Preflight checks ---------------------------------------
if (-not (Test-Path $KeyProps)) {
    Write-Host '  ERROR: key.properties not found.' -ForegroundColor Red
    Write-Host "  Expected: $KeyProps" -ForegroundColor Yellow
    Write-Host '  Run the keystore setup first (see build-apk-release.ps1 instructions).'
    exit 1
}

if (-not (Get-Command 'npx' -ErrorAction SilentlyContinue)) {
    Write-Host '  ERROR: npx not found. Install Node.js.' -ForegroundColor Red
    exit 1
}

$gradlew = Join-Path $AndroidDir 'gradlew.bat'
if (-not (Test-Path $gradlew)) {
    Write-Host "  ERROR: gradlew.bat not found at $gradlew" -ForegroundColor Red
    exit 1
}

# Read version from build.gradle
$buildGradle = Get-Content (Join-Path $AndroidDir 'app\build.gradle') -Raw
$versionName = if ($buildGradle -match 'versionName\s+"([^"]+)"') { $Matches[1] } else { 'unknown' }
$versionCode = if ($buildGradle -match 'versionCode\s+(\d+)') { $Matches[1] } else { '0' }
Write-Host "  Version  : $versionName (code $versionCode)" -ForegroundColor Green

# ---- Step 1: Update .env.local for PROD ---------------------
Write-Host ''
Write-Host '  [1/4] Writing PROD env...' -ForegroundColor Cyan
$envLocalContent = "NEXT_PUBLIC_API_URL=http://${LAN_IP}:3000/api/v1"
Set-Content -Path (Join-Path $WebAppDir '.env.local') -Value $envLocalContent -Encoding UTF8
Write-Host "  NEXT_PUBLIC_API_URL=http://${LAN_IP}:3000/api/v1"

# ---- Step 2: Set Capacitor PROD config ----------------------
Write-Host ''
Write-Host '  [2/4] Syncing Capacitor (PROD)...' -ForegroundColor Cyan
$env:CAPACITOR_APP_ID     = 'com.fixitpro.pos'
$env:CAPACITOR_APP_NAME   = 'FixITPro PROD'
$env:CAPACITOR_SERVER_URL = "http://${LAN_IP}:3001"

Set-Location $WebAppDir
& npx cap sync android
if ($LASTEXITCODE -ne 0) {
    Write-Host '  ERROR: cap sync failed.' -ForegroundColor Red
    exit 1
}
Write-Host '  Sync OK' -ForegroundColor Green

# ---- Step 3: Build release APK ------------------------------
Write-Host ''
Write-Host '  [3/4] Building PROD release APK (2-5 min)...' -ForegroundColor Cyan
Set-Location $AndroidDir
& $gradlew assembleRelease
if ($LASTEXITCODE -ne 0) {
    Write-Host '  ERROR: Gradle build failed.' -ForegroundColor Red
    exit 1
}

$apkSource = Join-Path $AndroidDir 'app\build\outputs\apk\release\app-release.apk'
if (-not (Test-Path $apkSource)) {
    Write-Host '  ERROR: APK not found after build.' -ForegroundColor Red
    exit 1
}

# ---- Step 4: Copy to releases folder ------------------------
Write-Host ''
Write-Host '  [4/4] Saving APK...' -ForegroundColor Cyan
if (-not (Test-Path $ReleasesDir)) { New-Item -ItemType Directory -Path $ReleasesDir -Force | Out-Null }

$apkName = "fixitpro-PROD-v${versionName}-code${versionCode}.apk"
$apkDest = Join-Path $ReleasesDir $apkName
Copy-Item $apkSource -Destination $apkDest -Force

$apkMB = [math]::Round((Get-Item $apkDest).Length / 1MB, 1)
Write-Host "  Saved: $apkDest ($apkMB MB)" -ForegroundColor Green

# ---- Done ---------------------------------------------------
Write-Host ''
Write-Host '  ========================================' -ForegroundColor Green
Write-Host "  PROD APK READY: $apkName" -ForegroundColor Green
Write-Host '  ========================================' -ForegroundColor Green
Write-Host ''
Write-Host '  Install on SUNMI device:' -ForegroundColor Cyan
Write-Host "    adb install -r `"$apkDest`""
Write-Host ''
Write-Host '  Or transfer APK to USB drive and install manually on SUNMI.' -ForegroundColor Cyan
Write-Host ''
Write-Host '  IMPORTANT: This APK connects to PROD at:' -ForegroundColor Yellow
Write-Host "    http://${LAN_IP}:3001 (frontend)"
Write-Host "    http://${LAN_IP}:3000 (backend)"
Write-Host '  Make sure PROD servers are running when SUNMI is in use.' -ForegroundColor Yellow
Write-Host ''

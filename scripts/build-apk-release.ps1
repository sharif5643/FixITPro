#Requires -Version 5.1
# ============================================================
# FixITPro -- Release APK Builder (Windows)
#
# Builds a signed release APK for the SUNMI POS app.
#
# Prerequisites (one-time setup):
#   1. Generate keystore:
#      keytool -genkey -v -keystore fixitpro-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias fixitpro
#      (Run from D:\FixITPro\web-app\android\keystore\  -- create folder first)
#   2. Copy key.properties.example -> key.properties and fill in passwords
#   3. Java / Android SDK must be on PATH (run from Android Studio terminal or set JAVA_HOME)
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File "D:\FixITPro\scripts\build-apk-release.ps1"
#
# Output APK:
#   D:\FixITPro\web-app\android\app\build\outputs\apk\release\app-release.apk
#   D:\FixITPro_Releases\fixitpro-v<version>.apk   (versioned copy)
# ============================================================
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$WebAppDir    = 'D:\FixITPro\web-app'
$AndroidDir   = 'D:\FixITPro\web-app\android'
$KeyProps     = Join-Path $AndroidDir 'key.properties'
$ReleasesDir  = 'D:\FixITPro_Releases'
$ApkSource    = Join-Path $AndroidDir 'app\build\outputs\apk\release\app-release.apk'

# ---- Banner -------------------------------------------------
Write-Host ''
Write-Host '  +==========================================+' -ForegroundColor Cyan
Write-Host '  |   FixITPro -- Release APK Builder        |' -ForegroundColor Cyan
Write-Host '  +==========================================+' -ForegroundColor Cyan
Write-Host ''

# ---- Preflight checks ---------------------------------------

# key.properties must exist
if (-not (Test-Path $KeyProps)) {
    Write-Host '  ERROR: key.properties not found.' -ForegroundColor Red
    Write-Host "  Expected: $KeyProps" -ForegroundColor Yellow
    Write-Host ''
    Write-Host '  Setup steps:'
    Write-Host '    1. Create folder: D:\FixITPro\web-app\android\keystore\'
    Write-Host '    2. Run keytool to generate keystore (see script header comments)'
    Write-Host '    3. Copy key.properties.example to key.properties and fill in passwords'
    Write-Host ''
    exit 1
}

# npx must be available
if (-not (Get-Command 'npx' -ErrorAction SilentlyContinue)) {
    Write-Host '  ERROR: npx not found. Install Node.js and make sure it is on PATH.' -ForegroundColor Red
    exit 1
}

# Read versionName from build.gradle for output filename
$buildGradle = Get-Content (Join-Path $AndroidDir 'app\build.gradle') -Raw
$versionName = 'unknown'
if ($buildGradle -match 'versionName\s+"([^"]+)"') {
    $versionName = $Matches[1]
}
$versionCode = '0'
if ($buildGradle -match 'versionCode\s+(\d+)') {
    $versionCode = $Matches[1]
}

Write-Host "  Version: $versionName  (code $versionCode)" -ForegroundColor Green
Write-Host ''

# ---- Step 1: Capacitor sync ---------------------------------
Write-Host '  [1/3] Syncing Capacitor web assets...' -ForegroundColor Cyan
Set-Location $WebAppDir
& npx cap sync android
if ($LASTEXITCODE -ne 0) {
    Write-Host '  ERROR: cap sync failed.' -ForegroundColor Red
    exit 1
}
Write-Host '  Sync OK.' -ForegroundColor Green

# ---- Step 2: Gradle release build ---------------------------
Write-Host ''
Write-Host '  [2/3] Building release APK (this takes 2-5 minutes)...' -ForegroundColor Cyan
Set-Location $AndroidDir

$gradlew = Join-Path $AndroidDir 'gradlew.bat'
if (-not (Test-Path $gradlew)) {
    Write-Host '  ERROR: gradlew.bat not found in android folder.' -ForegroundColor Red
    exit 1
}

& $gradlew assembleRelease
if ($LASTEXITCODE -ne 0) {
    Write-Host '  ERROR: Gradle build failed. Check output above.' -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $ApkSource)) {
    Write-Host '  ERROR: APK not found after build.' -ForegroundColor Red
    Write-Host "  Expected: $ApkSource" -ForegroundColor Yellow
    exit 1
}

$apkSize = [math]::Round((Get-Item $ApkSource).Length / 1MB, 1)
Write-Host "  Build OK -- APK $apkSize MB" -ForegroundColor Green

# ---- Step 3: Copy versioned APK to releases folder ----------
Write-Host ''
Write-Host '  [3/3] Copying to releases folder...' -ForegroundColor Cyan

if (-not (Test-Path $ReleasesDir)) {
    New-Item -ItemType Directory -Path $ReleasesDir -Force | Out-Null
}

$apkName = "fixitpro-v${versionName}-code${versionCode}.apk"
$apkDest = Join-Path $ReleasesDir $apkName
Copy-Item $ApkSource -Destination $apkDest -Force

Write-Host "  Saved: $apkDest" -ForegroundColor Green

# ---- Done ---------------------------------------------------
Write-Host ''
Write-Host '  ========================================' -ForegroundColor Green
Write-Host "  RELEASE APK READY: $apkName" -ForegroundColor Green
Write-Host '  ========================================' -ForegroundColor Green
Write-Host ''
Write-Host '  Install on connected SUNMI device:' -ForegroundColor Cyan
Write-Host "    adb install -r `"$apkDest`""
Write-Host ''
Write-Host '  Or copy APK to USB and install manually on SUNMI.' -ForegroundColor Cyan
Write-Host ''
Write-Host '  Next release: bump versionCode and versionName in' -ForegroundColor Yellow
Write-Host '    web-app\android\app\build.gradle' -ForegroundColor Yellow
Write-Host ''

#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Build FixITPro Android APK.

.DESCRIPTION
  Architecture: The APK is a WebView pointing at your live Next.js server.
  One codebase, one database, one backend - browser and APK use the same system.

  Steps:
  1. Loads .env.apk.local (then .env.apk) for CAPACITOR_SERVER_URL and signing config
  2. Updates capacitor.config.ts with the production server URL
  3. Syncs Capacitor (copies plugin registrations, etc.)
  4. Compiles the APK with Gradle

  Your Next.js app must be DEPLOYED before building the APK.
  The APK connects to that server at runtime.

.PARAMETER Release
  Build a signed release APK (requires KEYSTORE_* vars in .env.apk.local).

.PARAMETER LiveReload
  Set CAPACITOR_SERVER_URL to a local LAN IP for development testing on device.
  Requires your Next.js dev server to be running: npm run dev

.EXAMPLE
  .\scripts\build-apk.ps1                       # debug APK → production URL
  .\scripts\build-apk.ps1 -Release              # signed release APK
  .\scripts\build-apk.ps1 -LiveReload 192.168.1.5  # dev testing on real device

.OUTPUTS
  Debug:   android/app/build/outputs/apk/debug/app-debug.apk
  Release: android/app/build/outputs/apk/release/app-release.apk
#>
param(
    [switch]$Release,
    [string]$LiveReload = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path $MyInvocation.MyCommand.Path
$RootDir   = Split-Path $ScriptDir

function Load-DotEnv([string]$Path) {
    if (Test-Path $Path) {
        Get-Content $Path | Where-Object { $_ -notmatch '^\s*#' -and $_ -match '=' } | ForEach-Object {
            $k, $v = $_ -split '=', 2
            $k = $k.Trim(); $v = $v.Trim()
            if ($k) { [System.Environment]::SetEnvironmentVariable($k, $v, 'Process') }
        }
    }
}

Push-Location $RootDir
Load-DotEnv "$RootDir\.env.apk"
Load-DotEnv "$RootDir\.env.apk.local"

# ── Determine server URL ───────────────────────────────────────────────────────
if ($LiveReload) {
    $ServerUrl = "http://${LiveReload}:3001"
    Write-Host "[DEV] Live reload URL: $ServerUrl" -ForegroundColor Magenta
    Write-Host "      Make sure 'npm run dev' is running on this machine." -ForegroundColor Magenta
} else {
    $ServerUrl = $env:CAPACITOR_SERVER_URL
    if (-not $ServerUrl -or $ServerUrl -match 'your-domain') {
        Write-Host "ERROR: CAPACITOR_SERVER_URL is not set to a real server." -ForegroundColor Red
        Write-Host "Edit .env.apk.local and set: CAPACITOR_SERVER_URL=https://your-real-server.com" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "=== FixITPro APK Builder ===" -ForegroundColor Cyan
Write-Host "Server  : $ServerUrl"
Write-Host "Mode    : $(if ($Release) { 'RELEASE (signed)' } else { 'DEBUG' })"
Write-Host ""

# ── Locate JDK 21 and pin JAVA_HOME / PATH ────────────────────────────────────
# Gradle inherits whatever java.exe is on PATH. If that resolves to a JDK other
# than 21, the build fails with "invalid source release: 21". We resolve JDK 21
# explicitly so the build is reproducible regardless of system PATH order.
$jdk21 = $null

# 1. Honour an explicit override in .env.apk.local  (JAVA_HOME_21=...)
if ($env:JAVA_HOME_21 -and (Test-Path "$env:JAVA_HOME_21\bin\java.exe")) {
    $jdk21 = $env:JAVA_HOME_21
}

# 2. Known install location for Eclipse Adoptium / Temurin 21
if (-not $jdk21) {
    $candidate = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot'
    if (Test-Path "$candidate\bin\java.exe") { $jdk21 = $candidate }
}

# 3. Scan Eclipse Adoptium directory for any jdk-21* folder
if (-not $jdk21) {
    $adoptDir = 'C:\Program Files\Eclipse Adoptium'
    if (Test-Path $adoptDir) {
        $found = Get-ChildItem $adoptDir -Directory | Where-Object { $_.Name -like 'jdk-21*' } | Select-Object -First 1
        if ($found -and (Test-Path "$($found.FullName)\bin\java.exe")) { $jdk21 = $found.FullName }
    }
}

# 4. Check JAVA_HOME if it is already JDK 21
if (-not $jdk21 -and $env:JAVA_HOME) {
    $ver = & "$env:JAVA_HOME\bin\java.exe" -version 2>&1 | Select-String '21\.'
    if ($ver) { $jdk21 = $env:JAVA_HOME }
}

# 5. Scan common Oracle / Microsoft / Amazon paths
if (-not $jdk21) {
    $roots = @(
        'C:\Program Files\Java',
        'C:\Program Files\Microsoft',
        'C:\Program Files\Amazon Corretto'
    )
    foreach ($root in $roots) {
        if (-not (Test-Path $root)) { continue }
        $found = Get-ChildItem $root -Directory | Where-Object { $_.Name -like '*21*' } | Select-Object -First 1
        if ($found -and (Test-Path "$($found.FullName)\bin\java.exe")) { $jdk21 = $found.FullName; break }
    }
}

if (-not $jdk21) {
    Write-Host "ERROR: JDK 21 not found. Install Eclipse Adoptium 21 from:" -ForegroundColor Red
    Write-Host "  https://adoptium.net/temurin/releases/?version=21" -ForegroundColor Yellow
    Write-Host "Or set JAVA_HOME_21=<path> in .env.apk.local" -ForegroundColor Yellow
    exit 1
}

$env:JAVA_HOME = $jdk21
$env:PATH      = "$jdk21\bin;$env:PATH"
Write-Host "JDK 21  : $jdk21" -ForegroundColor DarkGray
& "$jdk21\bin\java.exe" -version
Write-Host ""

# ── Step 0: Verify Android platform is present ────────────────────────────────
$AndroidDir = "$RootDir\android"
if (-not (Test-Path "$AndroidDir\app")) {
    Write-Host "ERROR: Android platform not found. Run first:" -ForegroundColor Red
    Write-Host "  cd web-app && npx cap add android" -ForegroundColor Yellow
    exit 1
}

# ── Step 0b: Pre-create assets dir so cap sync can write its JSON files ───────
# cap sync writes capacitor.config.json + capacitor.plugins.json here.
# If the directory is absent the write fails with ENOENT before it can create it.
$AssetsDir = "$AndroidDir\app\src\main\assets"
if (-not (Test-Path $AssetsDir)) {
    New-Item -ItemType Directory -Path $AssetsDir -Force | Out-Null
    Write-Host "      Created assets directory" -ForegroundColor DarkGray
}
# Seed an empty plugins file so cap sync can update (not create-from-nothing)
$PluginsJson = "$AssetsDir\capacitor.plugins.json"
if (-not (Test-Path $PluginsJson)) {
    '[]' | Set-Content -Path $PluginsJson -Encoding utf8 -NoNewline
    Write-Host "      Seeded capacitor.plugins.json" -ForegroundColor DarkGray
}

# ── Step 1: Inject server URL into capacitor.config.ts ────────────────────────
Write-Host "[1/3] Setting server URL in capacitor.config.ts..." -ForegroundColor Yellow
$env:CAPACITOR_SERVER_URL = $ServerUrl
Write-Host "      Server URL: $ServerUrl" -ForegroundColor Green

# ── Step 2: Capacitor sync ────────────────────────────────────────────────────
Write-Host "[2/3] Running Capacitor sync..." -ForegroundColor Yellow
npx cap sync android
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: cap sync failed" -ForegroundColor Red; Pop-Location; exit 1 }
Write-Host "      Sync complete" -ForegroundColor Green

# ── Step 3: Gradle build ─────────────────────────────────────────────────────
Write-Host "[3/3] Building APK with Gradle..." -ForegroundColor Yellow
Push-Location "$RootDir\android"

if ($Release) {
    $ksPath = $env:KEYSTORE_PATH
    if (-not $ksPath -or -not (Test-Path $ksPath)) {
        Write-Error "KEYSTORE_PATH not set or file not found. Set it in .env.apk.local"
        exit 1
    }
    .\gradlew.bat assembleRelease `
        "-Pandroid.injected.signing.store.file=$($env:KEYSTORE_PATH)" `
        "-Pandroid.injected.signing.store.password=$($env:KEYSTORE_PASS)" `
        "-Pandroid.injected.signing.key.alias=$($env:KEY_ALIAS)" `
        "-Pandroid.injected.signing.key.password=$($env:KEY_PASS)"
} else {
    .\gradlew.bat assembleDebug
}

if ($LASTEXITCODE -ne 0) { Write-Error "Gradle build failed"; exit 1 }
Pop-Location

# ── Output ─────────────────────────────────────────────────────────────────────
$ApkType = if ($Release) { "release" } else { "debug" }
$ApkName = if ($Release) { "app-release.apk" } else { "app-debug.apk" }
$ApkPath = "$RootDir\android\app\build\outputs\apk\$ApkType\$ApkName"

Write-Host ""
if (Test-Path $ApkPath) {
    $SizeMB = [math]::Round((Get-Item $ApkPath).Length / 1MB, 1)
    Write-Host "APK ready!" -ForegroundColor Green
    Write-Host "Path : $ApkPath"
    Write-Host "Size : ${SizeMB} MB"
    Write-Host ""
    Write-Host "Install commands:" -ForegroundColor Yellow
    Write-Host "  adb install -r `"$ApkPath`""
    Write-Host "  # or drag the APK to the device via file manager"
    Write-Host ""
    Write-Host "This APK connects to: $ServerUrl" -ForegroundColor Cyan
    Write-Host "Make sure that server is running and accessible from the device."
} else {
    Write-Warning "APK not found at expected path: $ApkPath"
}

Pop-Location

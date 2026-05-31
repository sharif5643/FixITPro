#!/usr/bin/env pwsh
# FixITPro - PROD Environment Validator
# Usage: .\scripts\validate-prod-env.ps1
#
# Checks all three PROD env files and refuses to proceed if anything is wrong.
# Run this BEFORE every production deployment.
#
# ห้าม deploy โดยไม่ผ่านสคริปต์นี้

$ROOT    = Split-Path $PSScriptRoot -Parent
$PASS    = 0
$FAIL    = 0
$WARN    = 0
$Results = @()

function Check {
    param(
        [string]$Id,
        [string]$Name,
        [bool]$Ok,
        [string]$Msg = "",
        [bool]$Warning = $false
    )
    if ($Ok) {
        $script:PASS++
        $status = "PASS"
        $color  = "Green"
    } elseif ($Warning) {
        $script:WARN++
        $status = "WARN"
        $color  = "Yellow"
    } else {
        $script:FAIL++
        $status = "FAIL"
        $color  = "Red"
    }
    $script:Results += [PSCustomObject]@{ Id=$Id; Name=$Name; Status=$status; Msg=$Msg }
    Write-Host "  [$status] $Id $Name$(if ($Msg) {" | $Msg"})" -ForegroundColor $color
}

function Read-EnvFile {
    param([string]$Path)
    $map = @{}
    if (-not (Test-Path $Path)) { return $map }
    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if ($line -match '^([^#=]+)=(.*)$') {
            $key = $Matches[1].Trim()
            $val = $Matches[2].Trim().Trim('"').Trim("'")
            $map[$key] = $val
        }
    }
    return $map
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  FixITPro PROD Environment Validator" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. File existence ─────────────────────────────────────────────────────────
Write-Host "[ File Existence ]" -ForegroundColor Yellow

$backendEnv  = "$ROOT\backend\.env.production"
$frontendEnv = "$ROOT\web-app\.env.production"
$apkEnv      = "$ROOT\web-app\.env.apk.production"

Check "FILE-01" "backend/.env.production exists"   (Test-Path $backendEnv)
Check "FILE-02" "web-app/.env.production exists"   (Test-Path $frontendEnv)
Check "FILE-03" "web-app/.env.apk.production exists" (Test-Path $apkEnv)

if (-not (Test-Path $backendEnv)) {
    Write-Host ""
    Write-Host "  ABORT: backend/.env.production is missing. Run:" -ForegroundColor Red
    Write-Host "    Copy-Item backend/.env.production.example backend/.env.production" -ForegroundColor Red
    Write-Host "    Then fill in real values." -ForegroundColor Red
    exit 1
}

# ── 2. Backend env checks ─────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ Backend .env.production ]" -ForegroundColor Yellow
$be = Read-EnvFile $backendEnv

# NODE_ENV
Check "BE-01" "NODE_ENV=production"   ($be["NODE_ENV"] -eq "production") "Got: $($be['NODE_ENV'])"

# PORT must NOT be 4000 (DEV port)
$port = $be["PORT"]
Check "BE-02" "PORT is 3000 (not DEV 4000)" ($port -eq "3000")  "Got: $port"

# DATABASE_URL must NOT point to DEV db
$dbUrl = $be["DATABASE_URL"]
$dbBad = ($dbUrl -match "fixitpro[^_]") -or ($dbUrl -match "/fixitpro`"") -or ($dbUrl -match "/fixitpro$")
$dbGood = $dbUrl -match "fixitpro_prod"
Check "BE-03" "DATABASE_URL points to fixitpro_prod (not DEV)" ($dbGood -and -not $dbBad) "URL: $($dbUrl.Substring(0,[Math]::Min(60,$dbUrl.Length)))..."

# DATABASE_URL must NOT contain DEV IP
$dbDevIp = $dbUrl -match "192\.168\.1\.172"
Check "BE-04" "DATABASE_URL does NOT contain DEV IP (172)" (-not $dbDevIp) "$(if ($dbDevIp) {'Found DEV IP in DATABASE_URL!'})"

# JWT_SECRET must be real
$jwt = $be["JWT_SECRET"]
$jwtPlaceholder = ($jwt -match "REPLACE|CHANGE_ME|your_secret|placeholder|default") -or ($jwt.Length -lt 32)
Check "BE-05" "JWT_SECRET is set and not a placeholder" (-not $jwtPlaceholder -and $jwt.Length -ge 32) "Length=$($jwt.Length)"

# JWT_SECRET must not be the DEV default
$jwtDev = ($jwt -eq "your_secret_key")
Check "BE-06" "JWT_SECRET is not the DEV default" (-not $jwtDev) "$(if ($jwtDev) {'Still using DEV secret!'})"

# JWT_SECRET length should be 64+
Check "BE-07" "JWT_SECRET >= 64 chars" ($jwt.Length -ge 64) "Length=$($jwt.Length)" -Warning ($jwt.Length -lt 64)

# CORS_ORIGIN
$cors = $be["CORS_ORIGIN"]
$corsDevIp = $cors -match "192\.168\.1\.172"
Check "BE-08" "CORS_ORIGIN set (not empty)"            ($cors.Length -gt 0) "Got: $cors"
Check "BE-09" "CORS_ORIGIN does NOT use DEV IP (172)"  (-not $corsDevIp) "$(if ($corsDevIp) {'Found DEV IP 172 in CORS_ORIGIN'})"

# ALLOW_PUBLIC_REGISTER
$reg = $be["ALLOW_PUBLIC_REGISTER"]
Check "BE-10" "ALLOW_PUBLIC_REGISTER=false" ($reg -eq "false") "Got: $reg"

# BACKUP_DIR
$bkup = $be["BACKUP_DIR"]
Check "BE-11" "BACKUP_DIR set" ($bkup.Length -gt 0) "Got: $bkup" -Warning ($bkup.Length -eq 0)

# DB_PASSWORD not 123456 (warning only - may be acceptable for LAN)
$dbPw = $be["DB_PASSWORD"]
Check "BE-12" "DB_PASSWORD is not default 123456" ($dbPw -ne "123456") `
    "$(if ($dbPw -eq '123456') {'WARNING: Using DEV DB password in PROD. Change before go-live.'})" `
    -Warning ($dbPw -eq "123456")

# ── 3. Frontend env checks ────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ Frontend .env.production ]" -ForegroundColor Yellow
$fe = Read-EnvFile $frontendEnv

$apiUrl = $fe["NEXT_PUBLIC_API_URL"]
Check "FE-01" "NEXT_PUBLIC_API_URL set"                   ($apiUrl.Length -gt 0) "Got: $apiUrl"
Check "FE-02" "NEXT_PUBLIC_API_URL ends with /api/v1"     ($apiUrl -match "/api/v1$") "Got: $apiUrl"
Check "FE-03" "NEXT_PUBLIC_API_URL uses PROD IP (171)"    ($apiUrl -match "192\.168\.1\.171" -or $apiUrl -match "localhost") "Got: $apiUrl"
Check "FE-04" "NEXT_PUBLIC_API_URL does NOT use DEV IP"   (-not ($apiUrl -match "192\.168\.1\.172")) "$(if ($apiUrl -match '172') {'Found DEV IP 172!'})"
Check "FE-05" "NEXT_PUBLIC_API_URL uses PROD port (3000)" ($apiUrl -match ":3000") "Got: $apiUrl"

# ── 4. APK env checks ────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ APK .env.apk.production ]" -ForegroundColor Yellow
$apk = Read-EnvFile $apkEnv

$serverUrl = $apk["CAPACITOR_SERVER_URL"]
$appId     = $apk["CAPACITOR_APP_ID"]
Check "APK-01" "CAPACITOR_SERVER_URL set"                    ($serverUrl.Length -gt 0) "Got: $serverUrl"
Check "APK-02" "CAPACITOR_SERVER_URL uses PROD IP (171)"     ($serverUrl -match "192\.168\.1\.171" -or $serverUrl -match "localhost") "Got: $serverUrl"
Check "APK-03" "CAPACITOR_SERVER_URL does NOT use DEV IP"    (-not ($serverUrl -match "192\.168\.1\.172")) "$(if ($serverUrl -match '172') {'Found DEV IP 172!'})"
Check "APK-04" "CAPACITOR_APP_ID is PROD (com.fixitpro.pos)" ($appId -eq "com.fixitpro.pos") "Got: $appId"
Check "APK-05" "CAPACITOR_APP_ID is NOT DEV"                 ($appId -ne "com.fixitpro.dev") "Got: $appId"

# ── 5. Cross-checks ───────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ Cross-checks ]" -ForegroundColor Yellow
$beApiPort  = if ($be["PORT"]) { $be["PORT"] } else { "3000" }
$feApiMatch = $apiUrl -match ":$beApiPort/"
Check "CROSS-01" "Frontend API port matches backend PORT" $feApiMatch "Backend PORT=$beApiPort, Frontend URL=$apiUrl"
Check "CROSS-02" "APK server URL port matches frontend port (3001)" ($serverUrl -match ":3001") "APK server: $serverUrl"

# ── Summary ───────────────────────────────────────────────────────────────────
$total = $PASS + $FAIL + $WARN
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
if ($FAIL -gt 0) {
    Write-Host "  RESULT: FAIL - $FAIL error(s), $WARN warning(s)" -ForegroundColor Red
    Write-Host "  Fix all FAIL items before deploying to PROD." -ForegroundColor Red
    $Results | Where-Object { $_.Status -eq "FAIL" } | ForEach-Object {
        Write-Host "    FAIL $($_.Id) $($_.Name): $($_.Msg)" -ForegroundColor Red
    }
} elseif ($WARN -gt 0) {
    Write-Host "  RESULT: WARN - 0 errors, $WARN warning(s)" -ForegroundColor Yellow
    Write-Host "  All checks passed with warnings. Review warnings before deploying." -ForegroundColor Yellow
    $Results | Where-Object { $_.Status -eq "WARN" } | ForEach-Object {
        Write-Host "    WARN $($_.Id) $($_.Name): $($_.Msg)" -ForegroundColor Yellow
    }
} else {
    Write-Host "  RESULT: PASS - All $PASS checks passed" -ForegroundColor Green
    Write-Host "  Environment is ready for PROD deployment." -ForegroundColor Green
}
Write-Host "  Checks: $PASS pass, $FAIL fail, $WARN warn / $total total" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($FAIL -gt 0) { exit 1 }
if ($WARN -gt 0) { exit 2 }
exit 0

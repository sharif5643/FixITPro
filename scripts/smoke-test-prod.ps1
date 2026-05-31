#!/usr/bin/env pwsh
# FixITPro — PROD Smoke Tests
# Usage: .\scripts\smoke-test-prod.ps1
# Requires: PROD backend on http://192.168.1.171:3000, frontend on :3001
#
# ห้ามใช้ไฟล์นี้กับ DEV database  ห้าม reset/drop PROD DB
# ห้ามรัน migrate dev/reset บน PROD

$PROD_API  = "http://192.168.1.171:3000/api/v1"
$PROD_FRONT = "http://192.168.1.171:3001"
$PASS  = 0
$FAIL  = 0
$Results = @()

function Test-Api {
    param(
        [string]$Id,
        [string]$Name,
        [string]$Url,
        [string]$Method = "GET",
        [string]$Body = "",
        [hashtable]$Auth = @{},
        [int]$ExpectStatus = 200,
        [string]$CheckField = ""
    )
    try {
        $h = @{ "Accept" = "application/json" }
        if ($Auth.Count -gt 0) { $h["Authorization"] = $Auth["Authorization"] }
        $splat = @{
            Uri             = $Url
            Method          = $Method
            Headers         = $h
            TimeoutSec      = 15
            UseBasicParsing = $true
            ErrorAction     = "Stop"
        }
        if ($Body -ne "") {
            $splat["Body"]        = $Body
            $splat["ContentType"] = "application/json"
        }
        $resp = Invoke-WebRequest @splat
        $code = [int]$resp.StatusCode
        $ok   = ($code -eq $ExpectStatus)
        $note = "HTTP $code"
        if ($ok -and $CheckField -ne "") {
            $json = $resp.Content | ConvertFrom-Json
            $val  = $json.$CheckField
            if ($null -eq $val) { $ok = $false; $note = "HTTP $code but '$CheckField' missing" }
            else { $note = "HTTP $code [$CheckField present]" }
        }
    } catch {
        $code = 0
        $ok   = $false
        $note = $_.Exception.Message.Split("`n")[0]
        if ($note -match "\((\d{3})\)") {
            $code = [int]$Matches[1]
            $ok   = ($code -eq $ExpectStatus)
            $note = "HTTP $code$(if ($ok) {' (expected)'})"
        } elseif ($note.Length -gt 80) { $note = $note.Substring(0,80) }
    }
    if ($ok) { $script:PASS++ } else { $script:FAIL++ }
    $color  = if ($ok) { "Green" } else { "Red" }
    $status = if ($ok) { "PASS" } else { "FAIL" }
    $script:Results += [PSCustomObject]@{ Id=$Id; Name=$Name; Status=$status; Note=$note }
    Write-Host "  [$status] $Id $Name | $note" -ForegroundColor $color
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  FixITPro PROD Smoke Tests" -ForegroundColor Cyan
Write-Host "  API:  $PROD_API" -ForegroundColor Cyan
Write-Host "  Web:  $PROD_FRONT" -ForegroundColor Cyan
Write-Host "  Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  WARNING: Tests run against PROD server." -ForegroundColor Yellow
Write-Host "  Read-only tests only — no data is modified." -ForegroundColor Yellow
Write-Host ""

# ── 1. Infrastructure ─────────────────────────────────────────────────────────
Write-Host "[ Infrastructure ]" -ForegroundColor Yellow
Test-Api -Id "INF-01" -Name "PROD backend health" -Url "$PROD_API/health" -CheckField "status"
Test-Api -Id "INF-02" -Name "PROD frontend home"  -Url "$PROD_FRONT"

# ── 2. Authentication ─────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ Authentication ]" -ForegroundColor Yellow

$ownerToken = ""
$ownerEmail = Read-Host "PROD OWNER email (e.g. owner@fixitpro.com)"
$ownerPass  = Read-Host "PROD OWNER password"

try {
    $body = "{`"email`":`"$ownerEmail`",`"password`":`"$ownerPass`"}"
    $r = Invoke-RestMethod -Uri "$PROD_API/auth/login" -Method POST `
         -Body $body -ContentType "application/json" -TimeoutSec 10
    $ownerToken = $r.accessToken
    $PASS++
    $Results += [PSCustomObject]@{ Id="AUTH-01"; Name="Login OWNER"; Status="PASS"; Note="role=$($r.user.role)" }
    Write-Host "  [PASS] AUTH-01 Login OWNER | role=$($r.user.role)" -ForegroundColor Green
} catch {
    $FAIL++
    $Results += [PSCustomObject]@{ Id="AUTH-01"; Name="Login OWNER"; Status="FAIL"; Note="$($_.Exception.Message)" }
    Write-Host "  [FAIL] AUTH-01 Login OWNER | $($_.Exception.Message)" -ForegroundColor Red
}

Test-Api -Id "AUTH-02" -Name "Reject bad password" `
    -Url "$PROD_API/auth/login" -Method "POST" `
    -Body "{`"email`":`"$ownerEmail`",`"password`":`"wrongpass_invalid`"}" `
    -ExpectStatus 401

$ownerH = @{ "Authorization" = "Bearer $ownerToken" }

# ── 3. Core reads ────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ Core Reads ]" -ForegroundColor Yellow
Test-Api -Id "PROD-01" -Name "GET products"            -Url "$PROD_API/products"            -Auth $ownerH -CheckField "data"
Test-Api -Id "PROD-02" -Name "GET categories"          -Url "$PROD_API/categories"          -Auth $ownerH
Test-Api -Id "DASH-01" -Name "GET dashboard/overview"  -Url "$PROD_API/dashboard/overview"  -Auth $ownerH
Test-Api -Id "NOTIF-01" -Name "GET notifications"      -Url "$PROD_API/notifications"       -Auth $ownerH -CheckField "items"
Test-Api -Id "SUB-01"  -Name "GET subscription"        -Url "$PROD_API/subscription"        -Auth $ownerH -CheckField "effectiveStatus"

# ── 4. Transfers ─────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ Transfers ]" -ForegroundColor Yellow
Test-Api -Id "XFER-01" -Name "GET transfers list"       -Url "$PROD_API/branches/transfers/list" -Auth $ownerH
Test-Api -Id "XFER-02" -Name "GET transfers PENDING"    -Url "$PROD_API/branches/transfers/list?status=PENDING" -Auth $ownerH

# ── 5. Reports ───────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ Reports ]" -ForegroundColor Yellow
$today = (Get-Date).ToString("yyyy-MM-dd")
Test-Api -Id "RPT-01" -Name "GET daily report"   -Url "$PROD_API/reports/daily?date=$today"   -Auth $ownerH
Test-Api -Id "RPT-02" -Name "GET analytics"      -Url "$PROD_API/analytics/overview"           -Auth $ownerH

# ── 6. Security spot-checks ──────────────────────────────────────────────────
Write-Host ""
Write-Host "[ Security ]" -ForegroundColor Yellow
Test-Api -Id "SEC-01" -Name "No-auth blocked from products" -Url "$PROD_API/products"         -ExpectStatus 401
Test-Api -Id "SEC-02" -Name "No-auth blocked from dashboard" -Url "$PROD_API/dashboard/overview" -ExpectStatus 401

# ── Summary ──────────────────────────────────────────────────────────────────
$total = $PASS + $FAIL
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
$resultColor = if ($FAIL -eq 0) { "Green" } else { "Yellow" }
Write-Host "  RESULTS: $PASS/$total PASSED  |  $FAIL FAILED" -ForegroundColor $resultColor
if ($FAIL -gt 0) {
    Write-Host "  FAILURES:" -ForegroundColor Red
    $Results | Where-Object { $_.Status -eq "FAIL" } | ForEach-Object {
        Write-Host "    FAIL $($_.Id) $($_.Name): $($_.Note)" -ForegroundColor Red
    }
}
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$Results | Export-Csv -Path "$PSScriptRoot\smoke-prod-results.csv" -NoTypeInformation -Encoding UTF8
Write-Host "Results saved to: $PSScriptRoot\smoke-prod-results.csv" -ForegroundColor DarkGray

if ($FAIL -gt 0) { exit 1 } else { exit 0 }

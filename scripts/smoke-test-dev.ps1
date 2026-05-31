#!/usr/bin/env pwsh
# FixITPro DEV Smoke Tests
# Usage: .\scripts\smoke-test-dev.ps1
# Requires: backend on :4000, frontend on :3001
# Self-contained: creates test users, runs tests, cleans up.

$BASE  = "http://localhost:4000/api/v1"
$FRONT = "http://localhost:3001"
$PASS  = 0
$FAIL  = 0
$Results = @()

# Test users created at runtime (cleaned up after)
$TEST_MANAGER_EMAIL  = "smoketest-manager-$(Get-Date -Format 'yyyyMMddHHmm')@test.local"
$TEST_CASHIER_EMAIL  = "smoketest-cashier-$(Get-Date -Format 'yyyyMMddHHmm')@test.local"
$TEST_PASS           = "SmokeTest#1234"
$TEST_BRANCH_ID      = "cmpjh7qho00022uxwt2qqs2rq"  # สาขา2

$CreatedUserIds = @()

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
            TimeoutSec      = 10
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
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  FixITPro DEV Smoke Tests" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Infrastructure ────────────────────────────────────────────────────────
Write-Host "[ Infrastructure ]" -ForegroundColor Yellow
Test-Api -Id "INF-01" -Name "Backend health"  -Url "$BASE/health"  -CheckField "status"
Test-Api -Id "INF-02" -Name "Frontend home"   -Url "$FRONT"

# ── 2. Authentication ────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ Authentication ]" -ForegroundColor Yellow

$ownerToken   = ""
$managerToken = ""
$cashierToken = ""

# Owner login
try {
    $r = Invoke-RestMethod -Uri "$BASE/auth/login" -Method POST `
         -Body '{"email":"owner@fixitpro.com","password":"admin1234"}' `
         -ContentType "application/json" -TimeoutSec 10
    $ownerToken = $r.accessToken
    $PASS++
    $Results += [PSCustomObject]@{ Id="AUTH-01"; Name="Login OWNER"; Status="PASS"; Note="role=$($r.user.role)" }
    Write-Host "  [PASS] AUTH-01 Login OWNER | role=$($r.user.role)" -ForegroundColor Green
} catch {
    $FAIL++
    $Results += [PSCustomObject]@{ Id="AUTH-01"; Name="Login OWNER"; Status="FAIL"; Note="$($_.Exception.Message)" }
    Write-Host "  [FAIL] AUTH-01 Login OWNER | $($_.Exception.Message)" -ForegroundColor Red
}

$ownerH = @{ "Authorization" = "Bearer $ownerToken" }

# Create test manager user
Write-Host "  [SETUP] Creating test users..." -ForegroundColor DarkGray
try {
    $body = @{
        email    = $TEST_MANAGER_EMAIL
        name     = "Smoke Test Manager"
        password = $TEST_PASS
        role     = "MANAGER"
        branchId = $TEST_BRANCH_ID
    } | ConvertTo-Json
    $ru = Invoke-RestMethod -Uri "$BASE/users" -Method POST `
          -Body $body -ContentType "application/json" -Headers $ownerH -TimeoutSec 10
    $CreatedUserIds += $ru.id
    Write-Host "  [SETUP] Test manager created id=$($ru.id)" -ForegroundColor DarkGray
} catch {
    Write-Host "  [SETUP] Could not create test manager: $($_.Exception.Message)" -ForegroundColor DarkYellow
}

# Create test cashier user
try {
    $body = @{
        email    = $TEST_CASHIER_EMAIL
        name     = "Smoke Test Cashier"
        password = $TEST_PASS
        role     = "CASHIER"
        branchId = $TEST_BRANCH_ID
    } | ConvertTo-Json
    $ru = Invoke-RestMethod -Uri "$BASE/users" -Method POST `
          -Body $body -ContentType "application/json" -Headers $ownerH -TimeoutSec 10
    $CreatedUserIds += $ru.id
    Write-Host "  [SETUP] Test cashier created id=$($ru.id)" -ForegroundColor DarkGray
} catch {
    Write-Host "  [SETUP] Could not create test cashier: $($_.Exception.Message)" -ForegroundColor DarkYellow
}

# Login test manager
try {
    $body = "{`"email`":`"$TEST_MANAGER_EMAIL`",`"password`":`"$TEST_PASS`"}"
    $r = Invoke-RestMethod -Uri "$BASE/auth/login" -Method POST `
         -Body $body -ContentType "application/json" -TimeoutSec 10
    $managerToken = $r.accessToken
    $PASS++
    $Results += [PSCustomObject]@{ Id="AUTH-02"; Name="Login MANAGER (test)"; Status="PASS"; Note="role=$($r.user.role) branchId=$($r.user.branchId)" }
    Write-Host "  [PASS] AUTH-02 Login MANAGER | role=$($r.user.role) branch=$($r.user.branchId)" -ForegroundColor Green
} catch {
    $FAIL++
    $Results += [PSCustomObject]@{ Id="AUTH-02"; Name="Login MANAGER (test)"; Status="FAIL"; Note="$($_.Exception.Message)" }
    Write-Host "  [FAIL] AUTH-02 Login MANAGER | $($_.Exception.Message)" -ForegroundColor Red
}

# Login test cashier
try {
    $body = "{`"email`":`"$TEST_CASHIER_EMAIL`",`"password`":`"$TEST_PASS`"}"
    $r = Invoke-RestMethod -Uri "$BASE/auth/login" -Method POST `
         -Body $body -ContentType "application/json" -TimeoutSec 10
    $cashierToken = $r.accessToken
    $PASS++
    $Results += [PSCustomObject]@{ Id="AUTH-03"; Name="Login CASHIER (test)"; Status="PASS"; Note="role=$($r.user.role)" }
    Write-Host "  [PASS] AUTH-03 Login CASHIER | role=$($r.user.role)" -ForegroundColor Green
} catch {
    $FAIL++
    $Results += [PSCustomObject]@{ Id="AUTH-03"; Name="Login CASHIER (test)"; Status="FAIL"; Note="$($_.Exception.Message)" }
    Write-Host "  [FAIL] AUTH-03 Login CASHIER | $($_.Exception.Message)" -ForegroundColor Red
}

$managerH = @{ "Authorization" = "Bearer $managerToken" }
$cashierH = @{ "Authorization" = "Bearer $cashierToken" }

# Wrong password
Test-Api -Id "AUTH-04" -Name "Reject bad password" `
    -Url "$BASE/auth/login" -Method "POST" `
    -Body '{"email":"owner@fixitpro.com","password":"wrongpass"}' `
    -ExpectStatus 401

# ── 3. Products ──────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ Products ]" -ForegroundColor Yellow
Test-Api -Id "PROD-01" -Name "GET products (owner)"   -Url "$BASE/products"           -Auth $ownerH   -CheckField "data"
Test-Api -Id "PROD-02" -Name "GET products (manager)" -Url "$BASE/products"           -Auth $managerH -CheckField "data"
Test-Api -Id "PROD-03" -Name "GET products no auth"   -Url "$BASE/products"           -ExpectStatus 401
Test-Api -Id "PROD-04" -Name "GET categories"         -Url "$BASE/categories"         -Auth $ownerH
Test-Api -Id "PROD-05" -Name "GET products limit=5"   -Url "$BASE/products?limit=5"   -Auth $ownerH   -CheckField "data"
Test-Api -Id "PROD-06" -Name "GET gen-sku PHONE"      -Url "$BASE/products/generate-sku?type=PHONE" -Auth $ownerH -CheckField "sku"
Test-Api -Id "PROD-07" -Name "GET gen-barcode"        -Url "$BASE/products/generate-barcode"        -Auth $ownerH -CheckField "barcode"

# ── 4. Branches ──────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ Branches ]" -ForegroundColor Yellow
Test-Api -Id "BRANCH-01" -Name "GET branches (owner)"            -Url "$BASE/branches"                      -Auth $ownerH
Test-Api -Id "BRANCH-02" -Name "GET branches (manager readable)"  -Url "$BASE/branches"                      -Auth $managerH -ExpectStatus 200
Test-Api -Id "BRANCH-03" -Name "GET branches includeInactive"    -Url "$BASE/branches?includeInactive=true" -Auth $ownerH

# ── 5. Stock Transfers ───────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ Stock Transfers ]" -ForegroundColor Yellow
Test-Api -Id "XFER-01" -Name "GET transfers (owner)"        -Url "$BASE/branches/transfers/list"              -Auth $ownerH
Test-Api -Id "XFER-02" -Name "GET transfers PENDING filter" -Url "$BASE/branches/transfers/list?status=PENDING" -Auth $ownerH
Test-Api -Id "XFER-03" -Name "GET transfers (manager)"      -Url "$BASE/branches/transfers/list"              -Auth $managerH
Test-Api -Id "XFER-04" -Name "GET transfers (cashier blocked)" -Url "$BASE/branches/transfers/list"           -Auth $cashierH -ExpectStatus 403

# ── 6. Dashboard ─────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ Dashboard ]" -ForegroundColor Yellow
Test-Api -Id "DASH-01" -Name "GET dashboard (owner)"          -Url "$BASE/dashboard/overview" -Auth $ownerH
Test-Api -Id "DASH-02" -Name "GET dashboard (manager)"        -Url "$BASE/dashboard/overview" -Auth $managerH
Test-Api -Id "DASH-03" -Name "GET dashboard (cashier blocked)" -Url "$BASE/dashboard/overview" -Auth $cashierH -ExpectStatus 403

# ── 7. Notifications ─────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ Notifications ]" -ForegroundColor Yellow
Test-Api -Id "NOTIF-01" -Name "GET notifications (owner)"           -Url "$BASE/notifications" -Auth $ownerH   -CheckField "items"
Test-Api -Id "NOTIF-02" -Name "GET notifications (manager)"         -Url "$BASE/notifications" -Auth $managerH -CheckField "items"
Test-Api -Id "NOTIF-03" -Name "GET notifications (cashier allowed)" -Url "$BASE/notifications" -Auth $cashierH -CheckField "items"

# ── 8. Analytics ─────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ Analytics ]" -ForegroundColor Yellow
Test-Api -Id "ANALY-01" -Name "GET analytics/overview (owner)"   -Url "$BASE/analytics/overview" -Auth $ownerH
Test-Api -Id "ANALY-02" -Name "GET analytics/overview (manager)" -Url "$BASE/analytics/overview" -Auth $managerH
Test-Api -Id "ANALY-03" -Name "GET analytics dead-stock"         -Url "$BASE/analytics/dead-stock"       -Auth $ownerH
Test-Api -Id "ANALY-04" -Name "GET analytics repair-aging"       -Url "$BASE/analytics/repair-aging"     -Auth $ownerH
Test-Api -Id "ANALY-05" -Name "GET analytics branch-stock"       -Url "$BASE/analytics/branch-stock"     -Auth $ownerH
Test-Api -Id "ANALY-06" -Name "GET analytics (cashier blocked)"  -Url "$BASE/analytics/overview"         -Auth $cashierH -ExpectStatus 403

# ── 9. Reports ───────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ Reports ]" -ForegroundColor Yellow
$today = (Get-Date).ToString("yyyy-MM-dd")
Test-Api -Id "RPT-01" -Name "GET daily report (owner)"           -Url "$BASE/reports/daily?date=$today" -Auth $ownerH
Test-Api -Id "RPT-02" -Name "GET daily report (manager)"         -Url "$BASE/reports/daily?date=$today" -Auth $managerH
Test-Api -Id "RPT-03" -Name "GET daily report (cashier blocked)" -Url "$BASE/reports/daily?date=$today" -Auth $cashierH -ExpectStatus 403
Test-Api -Id "RPT-04" -Name "GET summary report"                 -Url "$BASE/reports/summary?startDate=2026-05-01&endDate=$today" -Auth $ownerH

# ── 10. Shifts ───────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ Shifts ]" -ForegroundColor Yellow
Test-Api -Id "SHIFT-01" -Name "GET current shift (owner)"   -Url "$BASE/shifts/current" -Auth $ownerH
Test-Api -Id "SHIFT-02" -Name "GET current shift (manager)" -Url "$BASE/shifts/current" -Auth $managerH

# ── 11. Repairs ──────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ Repairs ]" -ForegroundColor Yellow
Test-Api -Id "REP-01" -Name "GET repairs (owner)"    -Url "$BASE/repairs" -Auth $ownerH
Test-Api -Id "REP-02" -Name "GET repairs (manager)"  -Url "$BASE/repairs" -Auth $managerH
Test-Api -Id "REP-03" -Name "GET repairs (cashier)"  -Url "$BASE/repairs" -Auth $cashierH

# ── 12. Customers ────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ Customers ]" -ForegroundColor Yellow
Test-Api -Id "CUST-01" -Name "GET customers (owner)" -Url "$BASE/customers" -Auth $ownerH

# ── 13. Sales ────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ Sales ]" -ForegroundColor Yellow
Test-Api -Id "SALE-01" -Name "GET sales (owner)"   -Url "$BASE/sales"  -Auth $ownerH
Test-Api -Id "SALE-02" -Name "GET sales (cashier)" -Url "$BASE/sales"  -Auth $cashierH

# ── 14. Expenses ─────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ Expenses ]" -ForegroundColor Yellow
Test-Api -Id "EXP-01" -Name "GET expenses (owner)"           -Url "$BASE/expenses" -Auth $ownerH
Test-Api -Id "EXP-02" -Name "GET expenses (cashier readable)" -Url "$BASE/expenses" -Auth $cashierH

# ── 15. Settings ─────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ Settings ]" -ForegroundColor Yellow
Test-Api -Id "SET-01" -Name "GET settings (owner)"           -Url "$BASE/settings" -Auth $ownerH
Test-Api -Id "SET-02" -Name "GET settings (cashier readable)"  -Url "$BASE/settings" -Auth $cashierH

# ── 16. Permissions ──────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ Permissions ]" -ForegroundColor Yellow
Test-Api -Id "PERM-01" -Name "GET roles permissions" -Url "$BASE/permissions/roles" -Auth $ownerH
Test-Api -Id "PERM-02" -Name "GET all permissions"   -Url "$BASE/permissions"       -Auth $ownerH

# ── 17. Audit Log ────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ Audit Log ]" -ForegroundColor Yellow
Test-Api -Id "AUDIT-01" -Name "GET audit-logs (owner)"           -Url "$BASE/audit-logs"  -Auth $ownerH
Test-Api -Id "AUDIT-02" -Name "GET audit-logs (cashier blocked)" -Url "$BASE/audit-logs"  -Auth $cashierH -ExpectStatus 403

# ── 18. Subscription ─────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ Subscription ]" -ForegroundColor Yellow
Test-Api -Id "SUB-01" -Name "GET subscription (owner)"   -Url "$BASE/subscription" -Auth $ownerH   -CheckField "effectiveStatus"
Test-Api -Id "SUB-02" -Name "GET subscription (manager)" -Url "$BASE/subscription" -Auth $managerH -CheckField "effectiveStatus"

# ── 19. Serials / Warranties ─────────────────────────────────────────────────
Write-Host ""
Write-Host "[ Serials / Warranties ]" -ForegroundColor Yellow
Test-Api -Id "SER-01" -Name "GET serials (owner)"        -Url "$BASE/serials"    -Auth $ownerH
Test-Api -Id "SER-02" -Name "GET warranties (owner)"     -Url "$BASE/warranties" -Auth $ownerH

# ── 20. Supplier / PO ────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ Suppliers / PO ]" -ForegroundColor Yellow
Test-Api -Id "SUP-01" -Name "GET suppliers (owner)" -Url "$BASE/suppliers"        -Auth $ownerH
Test-Api -Id "SUP-02" -Name "GET purchase-orders"   -Url "$BASE/purchase-orders"  -Auth $ownerH

# ── 21. Carrier Wallet ───────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ Carrier Wallet ]" -ForegroundColor Yellow
Test-Api -Id "CW-01" -Name "GET carrier balances" -Url "$BASE/carrier-wallet/balances"       -Auth $ownerH
Test-Api -Id "CW-02" -Name "GET carrier movements"-Url "$BASE/carrier-wallet/movements"      -Auth $ownerH

# ── Cleanup ──────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[ Cleanup ]" -ForegroundColor DarkGray
foreach ($uid in $CreatedUserIds) {
    try {
        Invoke-RestMethod -Uri "$BASE/users/$uid/toggle" -Method PATCH -Headers $ownerH -TimeoutSec 5 | Out-Null
        Write-Host "  Deactivated test user ${uid}" -ForegroundColor DarkGray
    } catch {
        Write-Host "  Could not deactivate test user ${uid}: $($_.Exception.Message)" -ForegroundColor DarkYellow
    }
}

# ── Summary ──────────────────────────────────────────────────────────────────
$total = $PASS + $FAIL
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
$resultColor = if ($FAIL -eq 0) { "Green" } else { "Yellow" }
Write-Host "  RESULTS: $PASS/$total PASSED  |  $FAIL FAILED" -ForegroundColor $resultColor
if ($FAIL -gt 0) {
    Write-Host "  FAILURES:" -ForegroundColor Red
    $Results | Where-Object { $_.Status -eq "FAIL" } | ForEach-Object {
        Write-Host "    FAIL $($_.Id) $($_.Name): $($_.Note)" -ForegroundColor Red
    }
}
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Output CSV for UAT doc
$Results | Export-Csv -Path "$PSScriptRoot\smoke-results.csv" -NoTypeInformation -Encoding UTF8
Write-Host "Results saved to: $PSScriptRoot\smoke-results.csv" -ForegroundColor DarkGray

if ($FAIL -gt 0) { exit 1 } else { exit 0 }

#Requires -Version 5.1
# ============================================================
# FixITPro -- Pre-Launch PROD Data Cleanup
#
# Removes ALL test transaction data from fixitpro_prod before
# the shop opens for real customers.
#
# DELETES:
#   sales, sale_items, sale_refunds, sale_refund_items
#   repairs, repair_parts, repair_images,
#   repair_additional_payments, repair_payment_reversals
#   shifts, package_sales
#   carrier_wallet_movements  (balances reset to 0)
#   stock_movements
#   claims, claim_status_histories
#   repair upload files (D:\FixITPro_Prod_Uploads\repairs\)
#   serial numbers reset to IN_STOCK (records kept)
#
# KEEPS:
#   users, roles, permissions
#   products (stock counts left exactly as configured)
#   categories, suppliers, purchase_orders
#   customers, shop_settings, subscriptions, tenants
#   serial number records (status reset to IN_STOCK)
#   carrier_wallet rows (balance reset to 0)
#
# SAFETY:
#   1. Runs a full PROD backup first
#   2. Shows row counts before touching anything
#   3. Requires typing YES to proceed
#   4. Entire delete runs in a single SQL TRANSACTION --
#      any error rolls back everything automatically
#
# Usage:
#   powershell -ExecutionPolicy Bypass `
#     -File "D:\FixITPro\scripts\cleanup-prod-before-live.ps1"
# ============================================================
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$BackupScript  = 'D:\FixITPro\scripts\backup-prod-now.ps1'
$HealthScript  = 'D:\FixITPro\scripts\health-check-prod.ps1'
$RepairUploads = 'D:\FixITPro_Prod_Uploads\repairs'

$DB_HOST = 'localhost'
$DB_PORT = '5432'
$DB_USER = 'postgres'
$DB_PASS = '123456'
$DB_NAME = 'fixitpro_prod'

# ---- Banner -----------------------------------------------------
Write-Host ''
Write-Host '  +====================================================+' -ForegroundColor Red
Write-Host '  |   FixITPro  --  PRE-LAUNCH PROD CLEANUP            |' -ForegroundColor Red
Write-Host '  |   Clears test transactions. Keeps master data.     |' -ForegroundColor Red
Write-Host '  +====================================================+' -ForegroundColor Red
Write-Host ''
Write-Host "  Target  : $DB_NAME @ ${DB_HOST}:${DB_PORT}"
Write-Host "  Started : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host ''

# ---- Find psql.exe ----------------------------------------------
function Find-Psql {
    $found = Get-Command 'psql' -ErrorAction SilentlyContinue
    if ($found) { return $found.Source }

    try {
        $reg = 'HKLM:\SOFTWARE\PostgreSQL\Installations'
        foreach ($inst in (Get-ChildItem $reg -ErrorAction SilentlyContinue)) {
            $dir = (Get-ItemProperty $inst.PSPath -ErrorAction SilentlyContinue).Base_Directory
            if ($dir) {
                $p = Join-Path $dir 'bin\psql.exe'
                if (Test-Path $p) { return $p }
            }
        }
    } catch {}

    foreach ($base in @('C:\Program Files\PostgreSQL','C:\Program Files (x86)\PostgreSQL','D:\DB','D:\PostgreSQL','E:\PostgreSQL')) {
        foreach ($v in @(18,17,16,15,14,13)) {
            $p = "$base\$v\bin\psql.exe"
            if (Test-Path $p) { return $p }
        }
        $p = "$base\bin\psql.exe"
        if (Test-Path $p) { return $p }
    }
    return $null
}

$psqlExe = Find-Psql
if (-not $psqlExe) {
    Write-Host '  ERROR: psql.exe not found.' -ForegroundColor Red
    Write-Host '  Add PostgreSQL bin folder to PATH (e.g. C:\Program Files\PostgreSQL\16\bin)' -ForegroundColor Yellow
    exit 1
}
Write-Host "  psql    : $psqlExe"
$env:PGPASSWORD = $DB_PASS

# ---- Helper: run SQL via temp file, return trimmed output -------
# Writing SQL to a file avoids PowerShell 5.1 quoting issues when
# passing mixed-case identifiers with -c to native executables.
function Invoke-Sql {
    param([string]$Sql)
    $tmp = [System.IO.Path]::GetTempFileName() -replace '\.tmp$', '.sql'
    Set-Content -Path $tmp -Value $Sql -Encoding UTF8
    try {
        $out = & $psqlExe -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME -t -A -f $tmp 2>&1
        if ($LASTEXITCODE -ne 0) {
            $msg = ($out | Where-Object { $_ -is [string] }) -join ' '
            throw "SQL error (exit $LASTEXITCODE): $msg"
        }
        # PS5.1: stderr from native exe comes back as ErrorRecord objects mixed
        # in with string output. Keep only string lines (actual psql output).
        return (($out | Where-Object { $_ -is [string] }) -join "`n").Trim()
    } finally {
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    }
}

function Get-Count {
    param([string]$Table, [string]$Where = '')
    # Build SQL by concatenation — never embed " inside a PS double-quoted string
    $w = if ($Where) { ' WHERE ' + $Where } else { '' }
    $sql = 'SELECT COUNT(*) FROM "' + $Table + '"' + $w
    $raw = (Invoke-Sql -Sql $sql).Trim()
    # Take the last numeric line in case psql emits trailing notices
    $num = ($raw -split "`n" | Where-Object { $_ -match '^\s*\d+\s*$' } | Select-Object -Last 1)
    if ($num) { return [int]$num.Trim() }
    return [int]$raw
}

# ---- Test connection --------------------------------------------
Write-Host ''
Write-Host '  Verifying database connection...' -ForegroundColor Cyan
try {
    Invoke-Sql -Sql 'SELECT 1' | Out-Null
    Write-Host "  Connected to $DB_NAME OK" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Cannot connect to ${DB_NAME}: $_" -ForegroundColor Red
    exit 1
}

# ---- STEP 1: Backup ---------------------------------------------
Write-Host ''
Write-Host '  [1/5] Backup fixitpro_prod (required before any changes)' -ForegroundColor Cyan

if (-not (Test-Path $BackupScript)) {
    Write-Host "  ERROR: Backup script not found: $BackupScript" -ForegroundColor Red
    exit 1
}

& powershell.exe -ExecutionPolicy Bypass -File $BackupScript
if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Host '  ERROR: Backup failed. Cleanup aborted — nothing was deleted.' -ForegroundColor Red
    exit 1
}
Write-Host '  Backup complete.' -ForegroundColor Green

# ---- STEP 2: Count rows to be deleted ---------------------------
Write-Host ''
Write-Host '  [2/5] Counting rows...' -ForegroundColor Cyan
Write-Host ''

# Transactions to delete
$cSales              = Get-Count 'Sale'
$cSaleItems          = Get-Count 'SaleItem'
$cSaleRefunds        = Get-Count 'SaleRefund'
$cSaleRefundItems    = Get-Count 'SaleRefundItem'
$cRepairs            = Get-Count 'Repair'
$cRepairParts        = Get-Count 'RepairPart'
$cRepairImages       = Get-Count 'RepairImage'
$cRepairAddPayments  = Get-Count 'RepairAdditionalPayment'
$cRepairReversals    = Get-Count 'RepairPaymentReversal'
$cShifts             = Get-Count 'Shift'
$cPackageSales       = Get-Count 'PackageSale'
$cWalletMovements    = Get-Count 'CarrierWalletMovement'
$cStockMovements     = Get-Count 'StockMovement'
$cClaims             = Get-Count 'Claim'
$cClaimHistories     = Get-Count 'ClaimStatusHistory'
$cSerialsToReset     = Get-Count 'SerialNumber' "status = 'SOLD' OR `"saleItemId`" IS NOT NULL"
$cWalletsNonZero     = Get-Count 'CarrierWallet' 'balance != 0'

$totalDbRows = $cSales + $cSaleItems + $cSaleRefunds + $cSaleRefundItems +
               $cRepairs + $cRepairParts + $cRepairImages + $cRepairAddPayments +
               $cRepairReversals + $cShifts + $cPackageSales + $cWalletMovements +
               $cStockMovements + $cClaims + $cClaimHistories

# Upload files
$uploadFileCount = 0
if (Test-Path $RepairUploads) {
    $uploadFileCount = @(Get-ChildItem $RepairUploads -Recurse -File -ErrorAction SilentlyContinue).Count
}

# Master data being kept
$kUsers         = Get-Count 'User'
$kProducts      = Get-Count 'Product'
$kCustomers     = Get-Count 'Customer'
$kCategories    = Get-Count 'Category'
$kSuppliers     = Get-Count 'Supplier'
$kPOs           = Get-Count 'PurchaseOrder'
$kSerials       = Get-Count 'SerialNumber'
$kCarrierWallets= Get-Count 'CarrierWallet'

# Carrier wallet current balances
$walletBalances = Invoke-Sql -Sql 'SELECT carrier || ''='' || balance FROM "CarrierWallet" ORDER BY carrier'

# Helper: pad and color a count row
function Write-CountRow {
    param([string]$Label, [int]$Count, [string]$Color = 'White')
    $line = '  |  {0,-38} {1,6}  |' -f $Label, $Count
    Write-Host $line -ForegroundColor $Color
}

Write-Host '  +--------------------------------------------------+' -ForegroundColor Red
Write-Host '  |  WILL BE DELETED                                 |' -ForegroundColor Red
Write-Host '  +--------------------------------------------------+' -ForegroundColor Red
Write-CountRow 'Sales'                             $cSales             $(if($cSales -gt 0){'Red'}else{'DarkGray'})
Write-CountRow 'Sale items'                        $cSaleItems         $(if($cSaleItems -gt 0){'Red'}else{'DarkGray'})
Write-CountRow 'Sale refunds'                      $cSaleRefunds       $(if($cSaleRefunds -gt 0){'Red'}else{'DarkGray'})
Write-CountRow 'Sale refund items'                 $cSaleRefundItems   $(if($cSaleRefundItems -gt 0){'Red'}else{'DarkGray'})
Write-CountRow 'Repairs'                           $cRepairs           $(if($cRepairs -gt 0){'Red'}else{'DarkGray'})
Write-CountRow 'Repair parts'                      $cRepairParts       $(if($cRepairParts -gt 0){'Red'}else{'DarkGray'})
Write-CountRow 'Repair images (DB records)'        $cRepairImages      $(if($cRepairImages -gt 0){'Red'}else{'DarkGray'})
Write-CountRow 'Repair additional payments'        $cRepairAddPayments $(if($cRepairAddPayments -gt 0){'Red'}else{'DarkGray'})
Write-CountRow 'Repair payment reversals'          $cRepairReversals   $(if($cRepairReversals -gt 0){'Red'}else{'DarkGray'})
Write-CountRow 'Shifts'                            $cShifts            $(if($cShifts -gt 0){'Red'}else{'DarkGray'})
Write-CountRow 'Package sales (SIM/data)'          $cPackageSales      $(if($cPackageSales -gt 0){'Red'}else{'DarkGray'})
Write-CountRow 'Carrier wallet movements'          $cWalletMovements   $(if($cWalletMovements -gt 0){'Red'}else{'DarkGray'})
Write-CountRow 'Stock movements'                   $cStockMovements    $(if($cStockMovements -gt 0){'Red'}else{'DarkGray'})
Write-CountRow 'Claims'                            $cClaims            $(if($cClaims -gt 0){'Red'}else{'DarkGray'})
Write-CountRow 'Claim status histories'            $cClaimHistories    $(if($cClaimHistories -gt 0){'Red'}else{'DarkGray'})
Write-Host '  +--------------------------------------------------+' -ForegroundColor Red
Write-Host ("  |  TOTAL DB ROWS TO DELETE     {0,18}  |" -f $totalDbRows) -ForegroundColor Red
Write-Host '  +--------------------------------------------------+' -ForegroundColor Red
Write-Host ''
Write-Host '  +--------------------------------------------------+' -ForegroundColor Yellow
Write-Host '  |  WILL BE RESET (records kept, values changed)    |' -ForegroundColor Yellow
Write-Host '  +--------------------------------------------------+' -ForegroundColor Yellow
Write-CountRow "Serial numbers SOLD -> IN_STOCK"  $cSerialsToReset    $(if($cSerialsToReset -gt 0){'Yellow'}else{'DarkGray'})
Write-CountRow "Carrier wallets balance -> 0"     $cWalletsNonZero    $(if($cWalletsNonZero -gt 0){'Yellow'}else{'DarkGray'})
if ($walletBalances) {
    Write-Host "  |  Current balances: $($walletBalances -join ', ')" -ForegroundColor DarkGray
}
Write-Host '  +--------------------------------------------------+' -ForegroundColor Yellow
Write-Host ''
Write-Host '  +--------------------------------------------------+' -ForegroundColor Green
Write-Host '  |  WILL BE KEPT (untouched)                        |' -ForegroundColor Green
Write-Host '  +--------------------------------------------------+' -ForegroundColor Green
Write-CountRow 'Users'                             $kUsers             'Green'
Write-CountRow 'Products (stock kept as-is)'       $kProducts          'Green'
Write-CountRow 'Customers'                         $kCustomers         'Green'
Write-CountRow 'Categories'                        $kCategories        'Green'
Write-CountRow 'Suppliers'                         $kSuppliers         'Green'
Write-CountRow 'Purchase orders'                   $kPOs               'Green'
Write-CountRow 'Serial numbers (records)'          $kSerials           'Green'
Write-CountRow 'Carrier wallets (rows)'            $kCarrierWallets    'Green'
Write-Host '  |  Shop settings, roles, permissions, tenants     |' -ForegroundColor Green
Write-Host '  |  Subscriptions, categories, role permissions     |' -ForegroundColor Green
Write-Host '  +--------------------------------------------------+' -ForegroundColor Green
Write-Host ''

if ($totalDbRows -eq 0 -and $uploadFileCount -eq 0 -and $cSerialsToReset -eq 0 -and $cWalletsNonZero -eq 0) {
    Write-Host '  Nothing to clean up. Database is already empty of transactions.' -ForegroundColor Green
    Write-Host ''
    exit 0
}

# ---- STEP 3: Confirmation ---------------------------------------
Write-Host '  [3/5] Confirmation' -ForegroundColor Yellow
Write-Host ''
Write-Host '  !! This will PERMANENTLY delete all test transaction data !!' -ForegroundColor Red
Write-Host ''
Write-Host '  Safe: a backup was just created in D:\FixITPro_Backup' -ForegroundColor Green
Write-Host '  Safe: master data (users, products, settings) is NOT affected' -ForegroundColor Green
Write-Host ''
Write-Host '  Repair upload files to delete : ' -NoNewline; Write-Host $uploadFileCount -ForegroundColor Red
Write-Host '  Database rows to delete       : ' -NoNewline; Write-Host $totalDbRows -ForegroundColor Red
Write-Host ''
Write-Host '  Type  YES  (all capitals) and press Enter to proceed.' -ForegroundColor Yellow
Write-Host '  Type anything else to abort.' -ForegroundColor DarkGray
Write-Host ''
$confirm = Read-Host '  Confirmation'

if ($confirm -ne 'YES') {
    Write-Host ''
    Write-Host '  Aborted. Nothing was changed.' -ForegroundColor Yellow
    exit 0
}

Write-Host ''
Write-Host '  Confirmed. Proceeding with cleanup...' -ForegroundColor Cyan
Write-Host ''

# ---- STEP 4: Execute cleanup ------------------------------------
Write-Host '  [4/5] Executing database cleanup...' -ForegroundColor Cyan

# Write cleanup SQL to a temp file so psql receives it cleanly.
# All deletes run inside a single transaction -- any error causes
# automatic ROLLBACK and nothing is changed.
$tmpSql = Join-Path $env:TEMP "fixitpro_cleanup_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql"

$cleanupSql = @'
BEGIN;

-- Safety guard: abort immediately if somehow on wrong database.
DO $body$
BEGIN
  IF current_database() != 'fixitpro_prod' THEN
    RAISE EXCEPTION 'Wrong database: %. Aborting.', current_database();
  END IF;
END
$body$;

-- ---------------------------------------------------------------
-- DELETE ORDER follows FK dependency chain bottom-up.
-- ---------------------------------------------------------------

-- 1. Claim status histories (leaf, no outbound FKs to our targets)
DELETE FROM "ClaimStatusHistory";

-- 2. Claims (before Repair is deleted; before SerialNumber reset)
DELETE FROM "Claim";

-- 3. Reset serial numbers that were linked to sold sale items.
--    Records are KEPT; only saleItemId, status, soldAt are cleared.
UPDATE "SerialNumber"
SET "saleItemId" = NULL,
    "status"     = 'IN_STOCK',
    "soldAt"     = NULL
WHERE "saleItemId" IS NOT NULL
   OR "status"    = 'SOLD';

-- 4. Sale refund items (before SaleRefund and SaleItem)
DELETE FROM "SaleRefundItem";

-- 5. Sale refunds (before Sale)
DELETE FROM "SaleRefund";

-- 6. Stock movements (references SaleItem + RepairPart via FKs;
--    must be deleted BEFORE both of those tables)
DELETE FROM "StockMovement";

-- 7. Sale items (after SerialNumber saleItemId nulled, after StockMovement)
DELETE FROM "SaleItem";

-- 8. Sales (after SaleItems, SaleRefunds cleared)
DELETE FROM "Sale";

-- 9. Repair payment reversals (before Repair)
DELETE FROM "RepairPaymentReversal";

-- 10. Repair additional payments (before Repair)
DELETE FROM "RepairAdditionalPayment";

-- 11. Repair parts (after StockMovement deleted, before Repair)
DELETE FROM "RepairPart";

-- 12. Repair images (DB records; physical files deleted separately)
--     (schema has onDelete:Cascade from Repair, but explicit is safer)
DELETE FROM "RepairImage";

-- 13. Repairs (after all child tables cleared)
DELETE FROM "Repair";

-- 14. Package sales (SIM/data sales)
DELETE FROM "PackageSale";

-- 15. Carrier wallet movements (before wallet balance reset)
DELETE FROM "CarrierWalletMovement";

-- 16. Reset carrier wallet balances to 0 (rows kept for future topups)
UPDATE "CarrierWallet" SET "balance" = 0, "updatedAt" = NOW();

-- 17. Shifts (all Sale.shiftId and Repair.paymentShiftId now NULL or deleted)
DELETE FROM "Shift";

-- ---------------------------------------------------------------
-- Verify: these critical tables must be empty after this block.
-- If any count > 0, something went wrong -- ROLLBACK entire txn.
-- ---------------------------------------------------------------
DO $verify$
DECLARE
  n INT;
BEGIN
  SELECT COUNT(*) INTO n FROM "Sale";
  IF n > 0 THEN RAISE EXCEPTION 'Sale table not empty after cleanup (% rows)', n; END IF;

  SELECT COUNT(*) INTO n FROM "Repair";
  IF n > 0 THEN RAISE EXCEPTION 'Repair table not empty after cleanup (% rows)', n; END IF;

  SELECT COUNT(*) INTO n FROM "Shift";
  IF n > 0 THEN RAISE EXCEPTION 'Shift table not empty after cleanup (% rows)', n; END IF;

  SELECT COUNT(*) INTO n FROM "StockMovement";
  IF n > 0 THEN RAISE EXCEPTION 'StockMovement table not empty after cleanup (% rows)', n; END IF;

  SELECT COUNT(*) INTO n FROM "CarrierWalletMovement";
  IF n > 0 THEN RAISE EXCEPTION 'CarrierWalletMovement not empty after cleanup (% rows)', n; END IF;
END
$verify$;

COMMIT;
'@

Set-Content -Path $tmpSql -Value $cleanupSql -Encoding UTF8

try {
    Write-Host '  Running SQL transaction...' -ForegroundColor Cyan

    $sqlOutput = & $psqlExe -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME -f $tmpSql 2>&1
    $sqlExit   = $LASTEXITCODE

    # Print psql output (shows DELETE counts, UPDATE counts, etc.)
    foreach ($line in $sqlOutput) {
        if ($line) {
            $color = if ($line -match 'ERROR|FATAL|error') { 'Red' } else { 'DarkGray' }
            Write-Host "    $line" -ForegroundColor $color
        }
    }

    if ($sqlExit -ne 0) {
        Write-Host ''
        Write-Host '  SQL transaction FAILED and was automatically ROLLED BACK.' -ForegroundColor Red
        Write-Host '  No data was changed. Check the error above.' -ForegroundColor Yellow
        exit 1
    }

    Write-Host '  SQL transaction committed successfully.' -ForegroundColor Green

} finally {
    Remove-Item $tmpSql -Force -ErrorAction SilentlyContinue
}

# ---- Delete repair upload files ---------------------------------
Write-Host ''
Write-Host '  Purging repair upload files...' -ForegroundColor Cyan
if (Test-Path $RepairUploads) {
    $files = @(Get-ChildItem $RepairUploads -Recurse -File -ErrorAction SilentlyContinue)
    $deleted = 0
    foreach ($f in $files) {
        try {
            Remove-Item $f.FullName -Force -ErrorAction Stop
            $deleted++
        } catch {
            Write-Host "  WARN: Could not delete $($f.FullName): $_" -ForegroundColor Yellow
        }
    }
    # Remove empty subdirectories (deepest first)
    Get-ChildItem $RepairUploads -Recurse -Directory -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending |
        ForEach-Object {
            if (-not (Get-ChildItem $_.FullName -ErrorAction SilentlyContinue)) {
                Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
            }
        }
    Write-Host "  Deleted $deleted file(s) from $RepairUploads" -ForegroundColor Green
} else {
    Write-Host "  $RepairUploads does not exist -- nothing to delete" -ForegroundColor DarkGray
}

# ---- Post-cleanup row verification ------------------------------
Write-Host ''
Write-Host '  Verifying row counts after cleanup...' -ForegroundColor Cyan
Write-Host ''

$verifyPassed = $true
$verifyItems = @(
    @{ Table = 'Sale';                   Expect = 0 },
    @{ Table = 'SaleItem';               Expect = 0 },
    @{ Table = 'SaleRefund';             Expect = 0 },
    @{ Table = 'SaleRefundItem';         Expect = 0 },
    @{ Table = 'Repair';                 Expect = 0 },
    @{ Table = 'RepairPart';             Expect = 0 },
    @{ Table = 'RepairImage';            Expect = 0 },
    @{ Table = 'RepairAdditionalPayment';Expect = 0 },
    @{ Table = 'RepairPaymentReversal';  Expect = 0 },
    @{ Table = 'Shift';                  Expect = 0 },
    @{ Table = 'PackageSale';            Expect = 0 },
    @{ Table = 'CarrierWalletMovement';  Expect = 0 },
    @{ Table = 'StockMovement';          Expect = 0 },
    @{ Table = 'Claim';                  Expect = 0 },
    @{ Table = 'ClaimStatusHistory';     Expect = 0 }
)

foreach ($item in $verifyItems) {
    $n = Get-Count $item.Table
    if ($n -eq 0) {
        Write-Host ("    {0,-35} {1,6}   OK" -f $item.Table, $n) -ForegroundColor Green
    } else {
        Write-Host ("    {0,-35} {1,6}   WARN: rows remain" -f $item.Table, $n) -ForegroundColor Yellow
        $verifyPassed = $false
    }
}

Write-Host ''

# Show preserved master data counts
Write-Host '  Master data preserved:' -ForegroundColor Cyan
foreach ($pair in @(
    @('User',          (Get-Count 'User')),
    @('Product',       (Get-Count 'Product')),
    @('Customer',      (Get-Count 'Customer')),
    @('Category',      (Get-Count 'Category')),
    @('Supplier',      (Get-Count 'Supplier')),
    @('PurchaseOrder', (Get-Count 'PurchaseOrder')),
    @('SerialNumber',  (Get-Count 'SerialNumber'))
)) {
    Write-Host ("    {0,-35} {1,6}" -f $pair[0], $pair[1]) -ForegroundColor Green
}

# Carrier wallet state
Write-Host ''
Write-Host '  Carrier wallet balances after reset:' -ForegroundColor Cyan
$walletState = Invoke-Sql -Sql 'SELECT carrier || '' = '' || balance FROM "CarrierWallet" ORDER BY carrier'
foreach ($w in $walletState) {
    if ($w) { Write-Host "    $w" -ForegroundColor $(if ($w -match '= 0') { 'Green' } else { 'Yellow' }) }
}

# Serials reset confirmation
$soldLeft = Get-Count 'SerialNumber' "status = 'SOLD'"
Write-Host ''
Write-Host ("  SerialNumbers still with status=SOLD : {0}  {1}" -f $soldLeft, $(if ($soldLeft -eq 0) { 'OK' } else { 'WARN' })) -ForegroundColor $(if ($soldLeft -eq 0) { 'Green' } else { 'Yellow' })

# ---- STEP 5: Health check ---------------------------------------
Write-Host ''
Write-Host '  [5/5] Running PROD health check...' -ForegroundColor Cyan
Write-Host ''
& powershell.exe -ExecutionPolicy Bypass -File $HealthScript

# ---- Final summary ----------------------------------------------
Write-Host ''
Write-Host '  +====================================================+' -ForegroundColor $(if ($verifyPassed) { 'Green' } else { 'Yellow' })
if ($verifyPassed) {
    Write-Host '  |   CLEANUP COMPLETE -- PROD IS READY FOR LAUNCH     |' -ForegroundColor Green
} else {
    Write-Host '  |   CLEANUP DONE (with warnings -- check above)       |' -ForegroundColor Yellow
}
Write-Host '  +====================================================+' -ForegroundColor $(if ($verifyPassed) { 'Green' } else { 'Yellow' })
Write-Host ''
Write-Host '  Deleted:' -ForegroundColor Red
Write-Host "    $totalDbRows transaction rows from the database"
Write-Host "    $uploadFileCount repair image files from $RepairUploads"
Write-Host ''
Write-Host '  Reset:' -ForegroundColor Yellow
Write-Host "    Serial numbers: SOLD -> IN_STOCK"
Write-Host "    Carrier wallet balances: -> 0"
Write-Host ''
Write-Host '  Kept intact:' -ForegroundColor Green
Write-Host "    Users, products, stock levels, categories, customers"
Write-Host "    Suppliers, purchase orders, shop settings"
Write-Host "    Roles, permissions, subscriptions, tenants"
Write-Host ''
Write-Host "  Backup saved : D:\FixITPro_Backup\$(Get-Date -Format 'yyyy-MM-dd')"
Write-Host "  Completed    : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host ''

if (-not $verifyPassed) {
    Write-Host '  WARNING: Some tables still have rows. Review output above.' -ForegroundColor Yellow
    Write-Host '  The backup is intact -- you can investigate before re-running.' -ForegroundColor Yellow
    Write-Host ''
    exit 1
}

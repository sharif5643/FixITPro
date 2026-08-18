# Production Pre-Migration Row Count Baseline

> **Captured:** 2026-08-17 (Phase 2A pre-flight)  
> **Purpose:** Post-migration verification — compare these counts to confirm no data loss  
> **Method:** READ-ONLY via `psql` inside Docker container  
> **Server:** 91.98.151.10 (masked)  
> **Database:** fixitpro  
> **PostgreSQL:** 15.18  
> **Migration pending:** `20260817025923_add_accounting_core` (NOT applied at time of capture)

---

## Row Counts

| Table | Row Count | Notes |
|-------|-----------|-------|
| Tenant | 9 | |
| Branch | 13 | |
| Customer | 28 | |
| Sale | 84 | |
| SaleItem | 166 | |
| Repair | 23 | |
| RepairAdditionalPayment | 1 | |
| RepairPaymentReversal | 0 | |
| Expense | 0 | |
| Product | 253 | |
| StockMovement | 243 | |
| PurchaseOrder | 2 | |
| Supplier | 2 | |
| SupplierPayment | 1 | |
| CashDrawer | 4 | |
| CashDrawerSession | 3 | |
| CashDrawerTransaction | 110 | |
| DailyClose | 0 | |

---

## Database State

| Item | Value |
|------|-------|
| Total tables | 62 |
| Applied migrations | 68 |
| Rolled-back migrations | 1 (`20260620000000_add_performance_indexes`, rolled back 2026-06-20) |
| DB size | 18 MB |
| Tablespace size | 39 MB |

---

## Expected After Migration #69

| Item | Expected |
|------|----------|
| Total tables | 65 (+3: AccountingAccount, JournalEntry, JournalLine) |
| Applied migrations | 69 |
| AccountingAccount rows | 0 (empty until Phase 3) |
| JournalEntry rows | 0 (empty until Phase 4) |
| JournalLine rows | 0 (empty until Phase 4) |
| All business table row counts | Unchanged (additive migration only) |

---

## Post-Migration Verification Query

Run these after migration to confirm no data loss:

```sql
-- Verify row counts unchanged
SELECT 'Tenant' as t, COUNT(*) FROM "Tenant"
UNION ALL SELECT 'Branch', COUNT(*) FROM "Branch"
UNION ALL SELECT 'Customer', COUNT(*) FROM "Customer"
UNION ALL SELECT 'Sale', COUNT(*) FROM "Sale"
UNION ALL SELECT 'SaleItem', COUNT(*) FROM "SaleItem"
UNION ALL SELECT 'Repair', COUNT(*) FROM "Repair"
UNION ALL SELECT 'RepairAdditionalPayment', COUNT(*) FROM "RepairAdditionalPayment"
UNION ALL SELECT 'Product', COUNT(*) FROM "Product"
UNION ALL SELECT 'StockMovement', COUNT(*) FROM "StockMovement"
UNION ALL SELECT 'CashDrawerTransaction', COUNT(*) FROM "CashDrawerTransaction";

-- Verify new tables created and empty
SELECT COUNT(*) FROM "AccountingAccount";  -- expected 0
SELECT COUNT(*) FROM "JournalEntry";       -- expected 0
SELECT COUNT(*) FROM "JournalLine";        -- expected 0

-- Verify total table count
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'; -- expected 65
```

---

*Baseline captured 2026-08-17 as part of Phase 2A pre-flight. Do not modify this file.*

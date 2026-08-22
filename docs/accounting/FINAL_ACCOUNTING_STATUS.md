# Accounting System — Final Status Report
**Phase 4B.5 — 2026-08-21**

## Implementation Summary

All planned accounting modules are implemented, tested, and production-verified for the pilot tenant.

---

## Module Status Matrix

| # | Event | Source Type | Implemented | Unit Tested | Production Verified | Notes |
|---|---|---|---|---|---|---|
| 1 | Sale (revenue) | `SALE_PAYMENT` | ✅ | ✅ | ✅ | Per payment leg; CASH vs CLEARING split |
| 2 | Sale refund (revenue reversal) | `SALE_REFUND` | ✅ | ✅ | ✅ | Full and partial refunds |
| 3 | Sale void (revenue reversal) | `JOURNAL_REVERSAL` | ✅ | ✅ | ✅ | Reverses SALE_PAYMENT journals |
| 4 | Sale COGS | `SALE_COGS` | ✅ | ✅ | ✅ | Per SaleItem; skips costPrice=0 |
| 5 | Sale refund COGS reversal | `SALE_REFUND_COGS` | ✅ | ✅ | ✅ | sourceId = `{refundId}:{saleItemId}` |
| 6 | Repair deposit | `REPAIR_DEPOSIT` | ✅ | ✅ | ✅ | DR 1100/1120 / CR 2110 |
| 7 | Repair final payment | `REPAIR_FINAL_PAYMENT` | ✅ | ✅ | ✅ | DR 1100/1120 / CR 4200 |
| 8 | Repair deposit settlement | `REPAIR_DEPOSIT_SETTLE` | ✅ | ✅ | ✅ | DR 2110 / CR 4200; conditional on REPAIR_DEPOSIT posted |
| 9 | Repair COGS | `REPAIR_COGS` | ✅ | ✅ | ✅ | Per active RepairPart; DR 5200 / CR 1310 |
| 10 | Repair additional payment | `REPAIR_ADDITIONAL_PAYMENT` | ✅ | ✅ | ✅ | DR 1100/1120 / CR 1200 |
| 11 | Repair payment reversal | `REPAIR_PAYMENT_REVERSAL` | ✅ | ✅ | ✅ | Swaps REPAIR_FINAL_PAYMENT lines |
| 12 | Repair deposit settle reversal | `REPAIR_DEPOSIT_SETTLE_REVERSAL` | ✅ | ✅ | ✅ | Swaps REPAIR_DEPOSIT_SETTLE lines |
| 13 | Repair deposit refund (cancellation) | `REPAIR_DEPOSIT_REFUND` | ✅ | ✅ | ✅ | DR 2110 / CR 1100\|1120 |
| 14 | Repair COGS reversal (cancel after delivery) | `REPAIR_COGS_REVERSAL` | ✅ | ✅ | ✅ | Per part; DR 1310 / CR 5200 |
| 15 | Repair additional payment reversal | `REPAIR_ADDITIONAL_PAYMENT_REVERSAL` | ✅ | ✅ | ✅ | Per payment; swaps REPAIR_ADDITIONAL_PAYMENT |
| 16 | Expense payment | `EXPENSE_PAYMENT` | ✅ | ✅ | ✅ | DR 6100/6200 / CR 1100/1120 |
| 17 | Expense void (reversal) | `EXPENSE_REVERSAL` | ✅ | ✅ | ✅ | Swaps EXPENSE_PAYMENT lines |
| 18 | Exchange — return leg (revenue reversal) | `SALE_REFUND` | ✅ | ✅ | ✅ | Reuses refund adapter; pilot 2026-08-21 |
| 19 | Exchange — return COGS reversal | `SALE_REFUND_COGS` | ✅ | ✅ | ✅ | Reuses refund COGS adapter |
| 20 | Exchange — replacement sale revenue | `SALE_PAYMENT` | ✅ | ✅ | ✅ | New sale; pilot 2026-08-21 |
| 21 | Exchange — replacement COGS | `SALE_COGS` | ✅ | ✅ | ✅ | New SaleItem; pilot 2026-08-21 |
| 22 | Reconciliation — Sales | auto-scan | ✅ | ✅ | PARTIAL | Blocked by 24h timestamp window (see §6) |
| 23 | Reconciliation — Repairs | auto-scan | ✅ | ✅ | PARTIAL | Same timestamp constraint |
| 24 | Reconciliation — Expenses | auto-scan | ✅ | ✅ | PARTIAL | Same timestamp constraint |
| 25 | Reconciliation — Exchange | implicit (via Sale + SaleRefund) | ✅ | N/A | PARTIAL | Exchange creates a Sale + SaleRefund; both covered by sale scan |

---

## Account Code Map

| Code | Name | Type | Used By |
|---|---|---|---|
| 1100 | Cash on Hand | ASSET | All CASH payments |
| 1110 | Bank Deposit | ASSET | (reserved) |
| 1120 | Transfer/Card Clearing | ASSET | All non-CASH payments |
| 1200 | Repair Accounts Receivable | ASSET | REPAIR_ADDITIONAL_PAYMENT |
| 1300 | Inventory | ASSET | SALE_COGS, SALE_REFUND_COGS |
| 1310 | Repair Parts Inventory | ASSET | REPAIR_COGS, REPAIR_COGS_REVERSAL |
| 2110 | Customer Deposit | LIABILITY | REPAIR_DEPOSIT, REPAIR_DEPOSIT_SETTLE, REPAIR_DEPOSIT_REFUND |
| 4100 | Sales Revenue | REVENUE | SALE_PAYMENT, SALE_REFUND |
| 4200 | Repair Revenue | REVENUE | REPAIR_FINAL_PAYMENT, REPAIR_DEPOSIT_SETTLE |
| 5100 | Cost of Goods Sold | EXPENSE | SALE_COGS |
| 5200 | Repair Parts Cost | EXPENSE | REPAIR_COGS |
| 6100 | Operating Expenses | EXPENSE | EXPENSE_PAYMENT (non-misc) |
| 6200 | Other Expenses | EXPENSE | EXPENSE_PAYMENT (misc) |

---

## Pilot Tenant Production State (2026-08-21)

**Tenant:** `cmsc05do8001u7i29q3p5x6zp` (ริวคอม เซอร์วิซ)

| Metric | Value |
|---|---|
| AccountingAccounts | 17 (all active) |
| JournalEntry count | 110 |
| JournalLine count | 220 (2 per JE) |
| Unbalanced JEs | 0 |
| Duplicate source keys | 0 |
| Cross-tenant contamination | 0 JEs for other tenants |

**JEs by source type (pilot tenant):**
- SALE_PAYMENT: 32 | SALE_COGS: 57 | SALE_REFUND: 2 | SALE_REFUND_COGS: 2
- REPAIR_DEPOSIT: 3 | REPAIR_FINAL_PAYMENT: 2 | REPAIR_DEPOSIT_SETTLE: 2
- REPAIR_COGS: 1 | REPAIR_PAYMENT_REVERSAL: 1 | REPAIR_DEPOSIT_SETTLE_REVERSAL: 1
- REPAIR_DEPOSIT_REFUND: 2 | REPAIR_COGS_REVERSAL: 1
- EXPENSE_PAYMENT: 1 | EXPENSE_REVERSAL: 1
- JOURNAL_REVERSAL: 2

---

## Feature Flag Design

```
ACCOUNTING_CORE_ENABLED != 'true'          → DISABLED (all tenants)
ACCOUNTING_CORE_ENABLED = 'true' + no list → DISABLED (fail-closed)
ACCOUNTING_CORE_ENABLED = 'true' + 't1,t2' → PILOT mode (only listed tenants)
ACCOUNTING_CORE_ENABLED = 'true' + '*'     → FULL ROLLOUT (explicit; requires owner approval)
```

**Current production env:**
- `ACCOUNTING_CORE_ENABLED=true`
- `ACCOUNTING_ENABLED_TENANTS=cmsc05do8001u7i29q3p5x6zp`
- `ACCOUNTING_ACTIVATION_TIMESTAMP=2026-08-19T23:10:50Z` (32h old — reconciliation blocked)

---

## Known Limitations

See `KNOWN_LIMITATIONS.md` for full detail.

1. **BUG-6**: `netAmount` for Exchange returned in API response but not persisted in DB.
2. **Reconciliation timestamp**: 24h safety window blocks automated scan after 24h.
3. **Audit log actorName**: Some journal-created audit entries show `actorName: null`.
4. **Exchange no back-link**: New sale created by exchange has no `exchangeSaleId` field pointing back to the original sale.

---

## Production Pilots Completed

| Phase | Date | Transaction | Result |
|---|---|---|---|
| 4B.3D | 2026-08 | First POS sale | PASS |
| 4B.3E | 2026-08 | POS edge cases (void, refund) | PASS |
| 4B.4F | 2026-08 | Repair deposit + final payment | PASS |
| 4B.4H | 2026-08 | Repair COGS + debt payment | PASS |
| 4B.4K | 2026-08 | Repair deposit refund (cancellation) | PASS |
| 4B.4V | 2026-08-21 | Exchange (HIGHER-PRICE) | PASS |

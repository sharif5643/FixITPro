# Accounting System — Known Limitations
**Phase 4B.5 — 2026-08-21**

---

## L-1: BUG-6 — Exchange netAmount Not Persisted

**Description:** The Exchange API (`POST /sales/{id}/exchange`) computes `netAmount` (difference between new sale total and refund total) and returns it in the API response JSON. This value is NOT stored in any database field.

**Impact Assessment:**

The following are NOT affected:
- `SalePayment.amount` — records the actual new sale payment amount (e.g., 150 for a 150-baht replacement)
- `SaleRefund.totalRefund` — records the full refund amount (e.g., 100 for a 100-baht return)
- `CashDrawerTransaction` — records the actual cash flows: OUT for refund, IN for new payment
- `JournalEntry` — records the correct accounting journals for both legs
- Double-entry balance — all journals balance (DR=CR)
- Stock movements — REFUND + SALE quantities are correct

What IS missing:
- A stored `netAmount` field on `Sale` or `SaleRefund` that records the net difference (+50 in the pilot)

**Business Impact:** The net difference (+50 = customer pays extra, -X = shop pays difference) is derivable by `newSale.total - refund.totalRefund` at query time. No accounting correctness is compromised. Reports and audits can compute net on-the-fly.

**Decision: ACCEPTED LIMITATION** — no schema change required for accounting correctness. This is an application convenience field, not an accounting integrity field.

**To add persistence (future, if desired):**
- Add `netAmount Decimal?` field to `SaleRefund` or a new `SaleExchange` junction table
- Migration required: `ALTER TABLE sale_refunds ADD COLUMN net_amount DECIMAL(10,2)`
- Affected services: `SalesService.exchangeSaleItems()`, Exchange API response
- No backward-compatibility break (nullable field)

---

## L-2: Reconciliation Timestamp 24h Safety Window

**Description:** `AccountingReconciliationService.validateActivationTimestamp()` rejects any `ACCOUNTING_ACTIVATION_TIMESTAMP` older than 24 hours. This prevents a far-past timestamp from backfilling all historical transactions.

**Impact:** After the first 24 hours post-activation, automated reconciliation is **blocked**. The scheduled 15-minute cron scan silently returns an empty report.

**Current state (2026-08-21):** `ACCOUNTING_ACTIVATION_TIMESTAMP=2026-08-19T23:10:50Z` is 32 hours old. Reconciliation is **blocked in production**.

**To re-enable reconciliation:**
1. Owner approves refreshing the timestamp
2. Update `ACCOUNTING_ACTIVATION_TIMESTAMP` env var to current UTC time
3. Redeploy or restart backend
4. Reconciliation will scan transactions created after the new timestamp

**Risk of refresh:** Transactions between old timestamp and new timestamp will NOT be scanned retroactively. If any JEs are missing for that gap, they will not be auto-recovered. Manual retry via `POST /admin/accounting/retry-sale/{id}` is still available.

**Design note:** The 24h window is intentional — it prevents accidental mass-backfill. Reconciliation is a safety net for new transactions going forward, not a historical backfill tool.

---

## L-3: Audit Log actorName Null for System Events

**Description:** Some audit log entries created by the accounting adapter (e.g., `JOURNAL_CREATED` events) show `actorName: null`. This occurs when the journal is created post-commit without a named actor passed through.

**Impact:** Audit trail is functional and all events are logged. The actor is identifiable via `actorId` when a JWT was used. System-level journal creation (e.g., reconciliation recovery) legitimately has no named actor.

**Not a bug.** Consistent with other system-initiated events in the audit log.

---

## L-4: No Exchange Back-Link on New Sale

**Description:** When an Exchange creates a new Sale, that Sale has no `exchangeSaleId` field pointing back to the original sale. The link is:
- `SaleRefund.saleId` → original sale (forward reference from refund)
- `SaleRefund` contains the returned items from the original sale

There is no reverse link from the new sale to the original.

**Impact:** Tracing an exchange requires: new sale → its SaleRefund (none, it's a fresh sale) → unrelated. The exchange chain is: original sale → SaleRefund → (same refund was created by exchange at the same time as the new sale). The exchange relationship is reconstructable via timestamp + branch + actor, but not via a foreign key.

**Decision:** No schema change required. Acceptable for current business use. A future `exchangeRefundId` foreign key on `Sale` could formalize this if reporting requires it.

---

## L-5: BUG-8 — Exchange Single paymentMethod

**Description:** Exchange DTO accepts a single `paymentMethod` for the replacement payment. Split-payment exchanges (part cash, part transfer) are not supported in the current Exchange flow.

**Impact:** Customers who want to use multiple payment methods for an exchange must do a manual refund + new sale instead. No data integrity issue.

**Decision:** Out of scope for Phase 4B. Acceptable limitation.

---

## L-6: Pre-existing Orphan Repair (Non-Pilot Tenant)

**Description:** Tenant `cmqgw3ysh0003f963vgqh32j2` has a pre-existing repair `REP-20260808-BCC4DD` with `amount=850` that was identified as a potential orphan before accounting was enabled.

**Impact:** This tenant has NO accounting accounts and NO JEs. The orphan is not tracked by the accounting system. If this tenant is ever activated for accounting, the pre-existing repair will not have historical journals (accounting was not active when it was created).

**Decision:** Not touched. Tenant is not activated. No action required until tenant activation is approved.

---

## L-7: Package/Carrier Sale Revenue Account Unused

**Description:** Account code `4300 Package Revenue` exists in the pilot COA but no `PACKAGE_PAYMENT` source type is implemented in the accounting adapters. Carrier/package sales are not yet journalized.

**Impact:** Package sale revenue is not recorded in double-entry journals. POS records are complete; only accounting journals are missing for this transaction type.

**Decision:** Out of scope for Phase 4B. Package/carrier accounting is a separate initiative.

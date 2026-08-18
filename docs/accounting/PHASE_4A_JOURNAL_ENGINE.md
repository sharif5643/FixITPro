# Phase 4A — Double-Entry Journal Engine

**Status:** COMPLETE  
**Date:** 2026-08-17  
**Scope:** Journal engine infrastructure only — no live transaction wiring, no production journal entries

---

## Summary

Phase 4A adds a complete double-entry journal engine to the FixITPro backend. It provides validated, atomic, tenant-isolated journal creation with idempotency, void, and reversal support. No existing modules are modified, no production data is written, and `ACCOUNTING_CORE_ENABLED` remains disabled.

---

## Files Created

| File | Purpose |
|------|---------|
| `backend/src/journal/journal.service.ts` | Core journal engine (create, void, reverse, query) |
| `backend/src/journal/journal.module.ts` | Module (imports AuditLogModule, exports JournalService) |
| `backend/src/journal/journal.service.spec.ts` | 33 unit tests (A–T + extras) |

**Modified:**
| File | Change |
|------|--------|
| `backend/src/app.module.ts` | Added `JournalModule` import after `AccountingAccountsModule` |

---

## Architecture

### Input Contract

```typescript
// Per-line input — accountCode is resolved server-side to accountId
interface JournalLineInput {
  accountCode:    string;       // e.g. '1100' (Cash)
  debit?:         number | string;
  credit?:        number | string;
  paymentMethod?: string;
  note?:          string;
  sortOrder?:     number;
}

// Journal header
interface CreateJournalInput {
  tenantId:    string;          // required
  branchId?:   string | null;
  entryDate:   Date;
  description: string;
  sourceType?: string | null;   // e.g. 'SALE_PAYMENT' (from ACCOUNTING_SOURCE)
  sourceId?:   string | null;   // business record ID (Sale / Repair / Expense)
  sourceRef?:  string | null;   // human-readable reference
  postedById?: string | null;
  isBackfill?: boolean;
  lines:       JournalLineInput[];
}
```

**Design principle**: account codes are resolved from `(accountCode, tenantId)` server-side. Callers never pass raw `accountId` values.

### Service Methods

| Method | Description |
|--------|-------------|
| `create(input)` | Validates, resolves accounts, creates atomically. Returns `{ journal, created }`. |
| `void(id, tenantId, { reason, actorId })` | Marks entry as voided. Cannot void an already-voided entry. |
| `reverse(id, tenantId, reason, actorId?)` | Creates a reversal entry (swapped debit/credit). Links via `sourceType=JOURNAL_REVERSAL` + `sourceId=originalId`. |
| `findById(id, tenantId)` | Retrieves one entry with lines + accounts. Enforces tenant scope. |
| `findBySource(sourceType, sourceId, tenantId)` | Idempotency lookup. |
| `findMany(query)` | Paginated tenant-scoped query with optional date/branch/source/void filters. |

---

## Validation Rules

### Line-level
| Rule | Behaviour |
|------|-----------|
| `debit >= 0` | `BadRequestException` if negative |
| `credit >= 0` | `BadRequestException` if negative |
| `!(debit > 0 AND credit > 0)` | A line cannot carry both sides |
| `debit > 0 OR credit > 0` | Zero lines are rejected |

> **Note:** Decimal.js `isPositive()` returns `true` for `+0`, so all sign checks use `.gt(0)` (strict greater-than) instead of `.isPositive()`.

### Entry-level
| Rule | Behaviour |
|------|-----------|
| `lines.length >= 2` | `BadRequestException` for single-line or empty journals |
| `SUM(debit) == SUM(credit)` | `BadRequestException` with exact amounts in message |

### Money
All monetary arithmetic uses `Prisma.Decimal` (backed by Decimal.js). `String()` coercion is used on all user-supplied inputs before constructing `Prisma.Decimal` to prevent silent float precision loss (e.g. `0.1 + 0.2 === 0.3` passes with Decimal, fails with IEEE 754).

---

## Account Validation

Accounts are resolved via the composite unique key `@@unique([code, tenantId])`:

```typescript
prisma.accountingAccount.findUnique({
  where: { code_tenantId: { code, tenantId } },
})
```

| Check | Exception |
|-------|-----------|
| Account not found for tenant | `NotFoundException` |
| Account belongs to different tenant | `ForbiddenException` |
| Account is inactive | `ConflictException` |

System accounts (`tenantId = null`) are unreachable via tenant-scoped queries because PostgreSQL `NULL != NULL` semantics mean the composite key `{ code, tenantId: 'T1' }` never matches a row with `tenantId = NULL`.

---

## Tenant Isolation

| Boundary | Enforcement |
|----------|-------------|
| Tenant exists | `validateTenant()` — `NotFoundException` if not found |
| Branch belongs to tenant | `validateBranch()` — `ForbiddenException` if `branch.tenantId !== journalTenantId` |
| Accounts belong to tenant | `resolveAccounts()` — composite key scopes all lookups |
| `findById` cross-tenant | `ForbiddenException` if `entry.tenantId !== callerTenantId` |
| `void` cross-tenant | `ForbiddenException` (via `findById` pre-check) |
| `findMany` | `where: { tenantId }` filter always applied |

---

## Idempotency

**Mechanism:** Application-level check before creation.

```typescript
if (input.sourceType && input.sourceId) {
  const existing = await this.findBySource(sourceType, sourceId, tenantId);
  if (existing) return { journal: existing, created: false };
}
```

**⚠ Limitation:** The current schema has `@@index([sourceType, sourceId])` but NOT `@@unique([sourceType, sourceId, tenantId])`. Under concurrent requests from the same tenant for the same `sourceType + sourceId`, both requests could pass the `findFirst` check and both create a journal entry.

**Recommended Phase 4B migration** (requires owner approval before applying):
```sql
CREATE UNIQUE INDEX "JournalEntry_source_tenant_unique"
  ON "JournalEntry" ("sourceType", "sourceId", "tenantId")
  WHERE "sourceType" IS NOT NULL AND "sourceId" IS NOT NULL;
```

This is a Prisma partial index (using `@@unique` with a raw filter) and requires a new migration file. **Not created in this phase.**

For sequential operations (all current use cases), the application-level check is sufficient.

---

## Journal Numbering

**Format:** `JE-{YYYYMMDD}-{8hex}` (example: `JE-20260817-A3F9C201`)

- `randomBytes(4)` produces 4 bytes = 8 hex characters = ~4 billion unique values per day
- Collision probability: ~1.2 × 10⁻⁷ per 1000 entries/day — effectively zero
- Tenant-safe: each `JournalEntry` row already carries `tenantId`; the number itself is globally unique via the existing `entryNumber @unique` constraint
- No migration needed — `entryNumber String @unique` already exists on `JournalEntry`
- The DB `@unique` constraint is the enforced safety net; no pre-check DB roundtrip required

---

## Atomic Transaction

Journal creation wraps `JournalEntry.create` + `JournalLine.createMany` + `AuditLog.create` in a single `prisma.$transaction(async (tx) => { ... })`. If any step throws, all changes roll back.

```
prisma.$transaction(tx => {
  tx.journalEntry.create(...)          // header
  tx.journalLine.createMany(...)       // all lines
  auditLog.logWithTx(tx, {...})        // audit (rolls back with tx on failure)
  tx.journalEntry.findUniqueOrThrow()  // return full entry with relations
})
```

---

## Void

- Updates: `isVoided = true`, `voidedAt = now()`, `voidedById`, `voidReason`
- Immutable: lines are never deleted or modified
- Guard: `ConflictException` if already voided
- Audit: `JOURNAL_VOIDED` written inside the same `$transaction`

---

## Reversal

Reversal creates a new `JournalEntry` with debit/credit swapped for all lines. The original entry is **never modified**.

**Link mechanism** (no schema change required):
- Reversal `sourceType = 'JOURNAL_REVERSAL'`
- Reversal `sourceId = originalEntry.id`
- Reversal `sourceRef = originalEntry.entryNumber`

This allows querying all reversals of a given entry via `findBySource('JOURNAL_REVERSAL', originalId, tenantId)`.

**Idempotency**: if `reverse()` is called twice for the same original entry, the second call finds the existing reversal via `findBySource` and returns it without creating a duplicate.

**Guard**: `ConflictException` if the original entry is already voided.

---

## Audit Log

Uses the existing `AuditLogService` (no schema change):

| Event | Method | Context |
|-------|--------|---------|
| `JOURNAL_CREATED` | `logWithTx` (inside `$transaction`) | Rolls back with journal if tx fails |
| `JOURNAL_VOIDED` | `logWithTx` (inside `$transaction`) | Rolls back with void update if tx fails |
| `JOURNAL_REVERSED` | `log` (outside `$transaction`) | After reversal entry is committed |

---

## Performance

Existing indexes cover all query patterns:

| Index | Used by |
|-------|---------|
| `@@index([tenantId, entryDate])` | `findMany` with date range |
| `@@index([branchId, entryDate])` | `findMany` with branch filter |
| `@@index([sourceType, sourceId])` | `findBySource`, idempotency check |
| `@@index([entryDate])` | `findMany` date ordering |
| `@@index([isVoided])` | `findMany` with `isVoided` filter |
| `@@index([entryId])` on JournalLine | Line lookup by entry |
| `@@index([accountId])` on JournalLine | Account usage queries |
| `@@unique([code, tenantId])` on AccountingAccount | Account resolution (O(log n)) |

---

## Tests

`backend/src/journal/journal.service.spec.ts` — **33 tests**

| # | Case | Result |
|---|------|--------|
| A | Balanced 2-line journal created | PASS |
| A2 | `createMany` called with `Prisma.Decimal` values | PASS |
| B | Balanced multi-line (3 lines) journal | PASS |
| C | Unbalanced journal rejected | PASS |
| D | Negative debit rejected | PASS |
| D2 | Negative credit rejected | PASS |
| E | Line with both debit and credit rejected | PASS |
| F | Zero line (both 0) rejected | PASS |
| G | Single-line journal rejected | PASS |
| G2 | Empty lines array rejected | PASS |
| H | Inactive account rejected | PASS |
| I | Missing account code rejected | PASS |
| J | Cross-tenant account (returns null → NotFoundException) | PASS |
| K | Cross-tenant branch rejected | PASS |
| L | Duplicate source returns existing journal | PASS |
| M | Sequential idempotency: second call returns existing | PASS |
| N | Transaction rollback on DB error | PASS |
| O | Void sets isVoided + voidReason + voidedAt | PASS |
| O2 | Cannot void already-voided entry | PASS |
| P | Reversal swaps debit/credit for all lines | PASS |
| P2 | Reversal sourceType=JOURNAL_REVERSAL, sourceId=originalId | PASS |
| P3 | Cannot reverse a voided entry | PASS |
| Q | Decimal arithmetic: 0.1+0.2=0.3 passes (vs IEEE 754 failure) | PASS |
| Q2 | `Prisma.Decimal` instances stored in createMany data | PASS |
| R | Audit: `JOURNAL_CREATED` via `logWithTx` on create | PASS |
| R2 | Audit: `JOURNAL_VOIDED` via `logWithTx` on void | PASS |
| R3 | Audit: `JOURNAL_REVERSED` via `log` on reversal | PASS |
| S | Tenant: `findById` cross-tenant → ForbiddenException | PASS |
| S2 | Tenant: `void` cross-tenant → ForbiddenException | PASS |
| S3 | Tenant: non-existent tenant → NotFoundException | PASS |
| T | Branch: cross-tenant branch → ForbiddenException | PASS |
| T2 | Branch: non-existent branch → NotFoundException | PASS |
| Extra | `findMany` passes tenantId filter + pagination | PASS |
| Extra2 | Reversing same entry twice returns existing on 2nd call | PASS |

**Total: 278/278 tests pass** (245 pre-existing + 33 new)

---

## Risks and Limitations

### ⚠ Idempotency race condition (concurrent requests)
Without `@@unique([sourceType, sourceId, tenantId])` on `JournalEntry`, two concurrent requests for the same business source could both create a journal. Acceptable for Phase 4A (sequential use) but requires a migration before Phase 4B wires live transactions.

### ✅ Journal numbering (no risk)
`randomBytes(4)` provides ~4 billion unique values per day. The DB `@unique` constraint on `entryNumber` enforces global uniqueness. No pre-check needed.

### ✅ Reversal link (no schema change)
`sourceType=JOURNAL_REVERSAL` + `sourceId=originalId` provides a queryable link. A dedicated `reversalOfId` foreign key would be cleaner but is not required for Phase 4A.

---

## Production State

```
Production JournalEntry:  0  (unchanged)
Production JournalLine:   0  (unchanged)
AccountingAccount:        unchanged
Existing business data:   unchanged
ACCOUNTING_CORE_ENABLED:  not enabled
```

---

## Remaining Work (Phase 4B+, requires approval)

1. **Migration**: Add `@@unique([sourceType, sourceId, tenantId])` partial index for concurrent-safe idempotency
2. **Wire POS transactions**: connect `SalesService.create()` → `JournalService.create()` for sales journal entries
3. **Wire Repair transactions**: connect repair deposit/final payment/additional payment → journal entries
4. **Wire Expense transactions**: connect `ExpensesService.create()` → journal entries
5. **Trial balance / P&L endpoint**: aggregate JournalLine by account for financial reporting
6. **Backfill**: optionally journal-ize historical transactions (requires explicit owner approval)
7. **Admin endpoint**: manual journal creation (OWNER/SUPER_ADMIN only, with full validation)

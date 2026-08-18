# Phase 4A.1 — Journal Idempotency Database Constraint

**Status:** COMPLETE  
**Date:** 2026-08-17  
**Migration:** `20260817100000_add_journal_idempotency_index`  
**Migration applied at:** 2026-08-17 10:59:00 UTC (duration: ~8ms)

---

## Summary

Phase 4A.1 adds a PostgreSQL partial unique index to `JournalEntry` to prevent concurrent duplicate records for the same `(sourceType, sourceId, tenantId)` combination. This upgrades the application-level idempotency check added in Phase 4A to a database-enforced constraint.

---

## Reason

Phase 4A identified that `JournalEntry` had `@@index([sourceType, sourceId])` but no unique constraint. Under concurrent requests (e.g. a sale being processed by two parallel retries), both requests could pass the `findFirst` check and both create a journal entry for the same business source.

This phase adds the DB-level safety net. The `JournalService` was simultaneously updated to catch P2002 from the constraint and return the winning entry, making the full create flow race-safe.

---

## SQL

```sql
-- Partial unique index: only covers rows where sourceType AND sourceId are non-NULL.
-- Manual journals (sourceType=NULL, sourceId=NULL) are intentionally excluded.
-- JournalEntry has no rows at time of migration — instant, zero-downtime.

CREATE UNIQUE INDEX "JournalEntry_sourceType_sourceId_tenantId_unique"
  ON "JournalEntry" ("sourceType", "sourceId", "tenantId")
  WHERE "sourceType" IS NOT NULL AND "sourceId" IS NOT NULL;
```

**Migration file:** `backend/prisma/migrations/20260817100000_add_journal_idempotency_index/migration.sql`

> Prisma's schema DSL does not support partial unique indexes. The index is managed via raw migration SQL. The schema.prisma has a comment block noting the index and advising against `prisma migrate dev` without awareness of it.

---

## Constraint Behaviour

| Scenario | Result |
|----------|--------|
| Same `(sourceType, sourceId, tenantId)` twice | BLOCKED — Prisma P2002 |
| `sourceType IS NULL` OR `sourceId IS NULL` | ALLOWED — partial index predicate excludes NULLs |
| Same `(sourceType, sourceId)` for different `tenantId` | ALLOWED — tenant is part of the key |
| Same `(sourceType, sourceId, tenantId)` across different entries | BLOCKED |

---

## P2002 Race Handler

`JournalService.create()` now wraps `$transaction` in a try/catch:

```typescript
} catch (err: any) {
  // DB-level race: concurrent request won; re-fetch the winner
  if (err?.code === 'P2002' && input.sourceType && input.sourceId) {
    this.logger.warn(`JournalService.create: P2002 concurrent duplicate ...`);
    const winner = await this.findBySource(input.sourceType, input.sourceId, input.tenantId);
    if (winner) return { journal: winner, created: false };
  }
  throw err;
}
```

This means under any level of concurrent load, exactly ONE journal is created per `(sourceType, sourceId, tenantId)`. All losing requests receive `{ journal: existingEntry, created: false }` — identical to the sequential idempotency path.

**Manual journals** (`sourceType=null`, `sourceId=null`): P2002 re-throws (no idempotency lookup — each manual entry is independent).

---

## Test Results

### Unit Tests (Jest, fixitpro_test mocked)

| Test | Result |
|------|--------|
| M-DB: P2002 from DB constraint → returns existing journal | PASS |
| M-DB: P2002 on manual journal (no source) → re-throws | PASS |
| All 280 existing tests | PASS |

**Total: 280/280 tests pass**

### Constraint Tests (fixitpro_test PostgreSQL)

A temporary `fixitpro_test` database was created to verify the constraint before production:

| Test | Result |
|------|--------|
| First insert `(SALE_PAYMENT, sale-1, tenant-1)` | PASS — inserted |
| Duplicate `(SALE_PAYMENT, sale-1, tenant-1)` | PASS — BLOCKED with P2002 |
| NULL source `(NULL, NULL, tenant-1)` | PASS — allowed (manual journal exempt) |
| Cross-tenant `(SALE_PAYMENT, sale-1, tenant-2)` | PASS — allowed |

`fixitpro_test` was dropped after verification.

---

## Concurrency Behavior

With this constraint in place, the full concurrent create flow is:

```
Request A                         Request B (concurrent)
─────────                         ─────────
findFirst → null (no existing)    findFirst → null (no existing)
$transaction → JournalEntry.create  $transaction → JournalEntry.create
↓ SUCCESS                         ↓ P2002 (unique constraint violation)
return { created: true }          catch P2002 →
                                  findBySource → finds A's entry
                                  return { journal: A_entry, created: false }
```

Result: Exactly ONE `JournalEntry` per `(sourceType, sourceId, tenantId)`. No partial writes (transaction rollback). No unhandled exceptions.

---

## Production Pre-flight Results

| Check | Result |
|-------|--------|
| Backup exists | PASS — `/opt/fixitpro-backups/db/fixitpro_20260817_033319.sql.gz` |
| Backup SHA-256 | `48a1016f7dc140f524bde6403f0d7def0b6ce6bc33f22f9d1a2de6ce96a5f8a9` (matches Phase 2B) |
| Backup gzip integrity | VALID |
| `JournalEntry` count | 0 |
| Duplicate source candidates | 0 rows |
| Index already present | NO |
| DB health | PostgreSQL 15.18 — healthy |

---

## Production Migration Results

| Check | Result |
|-------|--------|
| Migration applied | `20260817100000_add_journal_idempotency_index` — SUCCESS |
| Applied at | 2026-08-17 10:59:00 UTC |
| Duration | ~8ms (empty table — instant) |
| Index exists | PASS |
| Index is UNIQUE | `indisunique = t` ✓ |
| Index predicate | `(("sourceType" IS NOT NULL) AND ("sourceId" IS NOT NULL))` ✓ |
| Recorded in `_prisma_migrations` | `applied_steps_count = 1` ✓ |

### Post-migration Row Counts (unchanged)

| Table | Count |
|-------|-------|
| `JournalEntry` | 0 |
| `JournalLine` | 0 |
| `AccountingAccount` | 0 |
| `Tenant` | 9 |
| `Branch` | 13 |
| `Customer` | 30 |
| `Sale` | 89 |
| `Repair` | 23 |
| `CashDrawerTransaction` | 115 |

### Backend Health

```json
{"status":"ok","db":"ok","redis":"ok","timestamp":"2026-08-17T11:28:44.759Z"}
```

---

## Rollback / Recovery Plan

If the index needs to be removed:

```sql
-- Safe to run at any time — drops only the index, never touches data
DROP INDEX IF EXISTS "JournalEntry_sourceType_sourceId_tenantId_unique";
```

This is fully reversible. The `_prisma_migrations` record would need to be removed manually if a Prisma-managed rollback is required:

```sql
DELETE FROM _prisma_migrations 
WHERE migration_name = '20260817100000_add_journal_idempotency_index';
```

---

## Files Changed

| File | Change |
|------|--------|
| `backend/prisma/migrations/20260817100000_add_journal_idempotency_index/migration.sql` | NEW — CREATE UNIQUE INDEX |
| `backend/prisma/schema.prisma` | MODIFIED — comment block noting the partial index |
| `backend/src/journal/journal.service.ts` | MODIFIED — P2002 catch block in `create()` |
| `backend/src/journal/journal.service.spec.ts` | MODIFIED — 2 new P2002 concurrency tests |

---

## Final Report

| Item | Status |
|------|--------|
| Migration | **PASS** |
| Production | **PASS** |
| Index | **PASS** |
| Concurrent duplicate protection | **PASS** |
| Existing data changes | **0** |
| `JournalEntry` | **0** |
| `JournalLine` | **0** |

---

## STOPPED

Not proceeding to Phase 4B. Awaiting owner approval.

Do NOT:
- Wire POS
- Wire Repair  
- Wire Expense
- Enable ACCOUNTING_CORE_ENABLED

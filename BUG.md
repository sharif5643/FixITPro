# FixITPro — BUG.md

> Premium UX v2 — Active bug tracker for `feature/premium-ui-v2`
> Updated: 2026-07-20 (RC1)

## How to use
- **OPEN** = confirmed bug, not yet fixed
- **WIP** = being worked on
- **FIXED** = fixed (include commit hash)
- **WONTFIX** = accepted limitation / deferred to Phase B

---

## Active Bugs (RC1 — Minor only)

### UI-001 — Super-admin tests expect 12 nav items and /super-admin/production route
- **Status**: OPEN (pre-existing)
- **File**: `web-app/src/tests/super-admin-v2.test.ts`
- **Severity**: Minor (test-only failure; feature works in browser)
- **Details**: 1215/1217 tests pass. Two pre-existing assertion failures.
- **Fix plan**: Phase B stabilization

### UI-002 — POS shortcuts Ctrl+Backspace / +/- not in hint bar
- **Status**: OPEN
- **File**: `web-app/src/app/(dashboard)/sales/page.tsx:436`
- **Severity**: Minor (feature works, just not discoverable)
- **Fix plan**: Add to hint bar in Phase B polish

### UI-004 — Shifts double-open race condition with stale cache
- **Status**: OPEN
- **File**: `web-app/src/app/(dashboard)/shifts/page.tsx:159`
- **Severity**: Minor (API rejects duplicate; user sees error toast)
- **Fix plan**: Set `staleTime: 0` for shifts/current query in Phase B

### UI-005 — BranchModal submit button has no isPending disabled guard
- **Status**: OPEN
- **File**: `web-app/src/app/(dashboard)/branches/page.tsx`
- **Severity**: Minor (double-submit possible on slow API)
- **Fix plan**: Pass `isPending` prop to BranchModal in Phase B

### UI-007 — Payables table has no overlay during background refresh
- **Status**: OPEN
- **File**: `web-app/src/app/(dashboard)/reports/payables/page.tsx`
- **Severity**: Minor (button spinner present; stale data shown)
- **Fix plan**: Add `isRefetching` overlay in Phase B

### UI-008 — Audit-logs table has no mobile card alternative
- **Status**: OPEN
- **File**: `web-app/src/app/(dashboard)/audit-logs/page.tsx:589`
- **Severity**: Minor (owner/admin-only; horizontal scroll available)
- **Fix plan**: Phase B responsive pass

### UI-009 — Analytics 3 sections use inline Thai strings instead of EmptyState
- **Status**: OPEN
- **File**: `web-app/src/app/(dashboard)/analytics/page.tsx:487,536,600`
- **Severity**: Minor (visual inconsistency only)
- **Fix plan**: Phase B consistency pass

### UI-010 — Dashboard widget inline empty text not using EmptyState component
- **Status**: OPEN
- **File**: `web-app/src/app/(dashboard)/dashboard/page.tsx`
- **Severity**: Minor (low impact; widget context differs)
- **Fix plan**: Phase B consistency pass

---

## Fixed Bugs

| ID | Description | Severity | Commit |
|---|---|---|---|
| UI-003 | Repair status READY_PICKUP/QC_PENDING raw enum in customer history | Minor | `d33ea24` |
| UI-006 | Analytics no error state on API failure | Major | `d33ea24` |
| SEC-001 | /subscription page unguarded (any role could access) | **Critical** | `d33ea24` |
| SEC-002 | /data-tools page unguarded (any role could export/import) | **Critical** | `d33ea24` |
| SEC-003 | /reports/payables page unguarded (AP aging visible to all) | Major | `d33ea24` |
| SEC-004 | /roles page allowed non-OWNER access to permission toggles | Major | `d33ea24` |
| SEC-005 | /employees page allowed non-OWNER access to user management | Major | `d33ea24` |
| SEC-006 | /branches page unguarded + window.prompt/confirm for destructive actions | Major | `d33ea24` |
| SEC-007 | Backup download bypassed auth (bare href with localhost fallback) | Major | `d33ea24` |
| SEC-008 | Backup page exposed internal "DEV only" deployment topology text | Minor | `d33ea24` |

---

## Notes
- Do NOT stop development for OPEN bugs unless severity = **BLOCKER**
- All OPEN bugs must be resolved before Phase B → main merge
- RC1 cleared: 2 Critical + 6 Major security issues + 2 Minor UX issues
- Remaining: 8 Minor items — all deferred to Phase B

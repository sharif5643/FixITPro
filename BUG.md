# FixITPro — BUG.md

> Premium UX v2 — Active bug tracker for `feature/premium-ui-v2`
> Updated: 2026-07-19

## How to use
- **OPEN** = confirmed bug, not yet fixed
- **WIP** = being worked on
- **FIXED** = fixed (include commit hash)
- **WONTFIX** = accepted limitation / deferred to Phase B

---

## Active Bugs

### UI-001 — Super-admin tests expect 12 nav items and /super-admin/production route
- **Status**: OPEN (pre-existing)
- **File**: `web-app/src/tests/super-admin-v2.test.ts`
- **Severity**: Low (test-only failure; feature works in browser)
- **Details**: `SA_NAV_ITEMS` count assertion = 12; `/super-admin/production` route assertion. Both existed before Premium UI work. 1215/1217 tests pass. These 2 are pre-existing.
- **Fix plan**: Phase B stabilization

---

## Fixed Bugs

_(none yet)_

---

## Notes
- Do NOT stop development for OPEN bugs unless severity = **BLOCKER**
- All OPEN bugs must be resolved before Phase B → main merge

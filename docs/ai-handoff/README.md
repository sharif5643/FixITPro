# AI Handoff Workflow

## Purpose

`latest.md` is the single source of truth between AI sessions.
Update it at the end of every phase so any session can resume without re-reading the full conversation.

## Rules

1. **Always** overwrite `latest.md` before stopping work.
2. **Never** start the next phase without explicit approval.
3. Keep `latest.md` under 100 lines.
4. Mobile-readable — short lines, no wide tables.
5. Use ✅ for completed work and ⚠️ for blockers.

## Required Sections

```
# Phase Summary
## Completed
## Changed Files
## Build Status
## Test Results
## Risks
## Review Questions
## Next Recommended Action
```

## File

`docs/ai-handoff/latest.md` — overwritten after every phase.

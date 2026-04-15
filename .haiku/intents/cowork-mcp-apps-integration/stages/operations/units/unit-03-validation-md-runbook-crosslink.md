---
title: Cross-link VALIDATION.md and RUNBOOK.md
type: ops
model: sonnet
depends_on:
  - unit-02-monitoring-and-slos
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - .haiku/knowledge/RUNBOOK.md
status: active
bolt: 1
hat: ops-engineer
started_at: '2026-04-15T19:31:58Z'
hat_started_at: '2026-04-15T19:31:58Z'
---

# Cross-link VALIDATION.md and RUNBOOK.md

## Scope

Ensure `packages/haiku/VALIDATION.md` and `.haiku/knowledge/RUNBOOK.md` reference each
other so an operator reading one doc can find the other. No new content — linking only.

### In scope

- **VALIDATION.md → RUNBOOK.md.** Add an `## Operational runbook` section at the bottom
  of `packages/haiku/VALIDATION.md` with a relative link to
  `.haiku/knowledge/RUNBOOK.md` and a one-sentence summary of what each scenario covers
  (iframe failure, timeout, HTTP fallback, session loss, bundle regression).
- **RUNBOOK.md → VALIDATION.md.** Add a reference line near the top of the
  `## MCP Apps Review Path (Cowork)` section in `.haiku/knowledge/RUNBOOK.md` pointing
  to `packages/haiku/VALIDATION.md` § "MCP Apps capability negotiation" and
  § "Cowork review transport" for implementation context. (A `See also:` line is
  sufficient — already partially present from the RUNBOOK template; confirm it links
  correctly.)

### Out of scope

- No new content in either file beyond the cross-links.
- No changes to CI, source code, or other docs.

## Completion Criteria

1. **VALIDATION.md links to RUNBOOK.** `rg -n 'RUNBOOK.md' packages/haiku/VALIDATION.md`
   returns ≥ 1 hit.
2. **RUNBOOK.md links to VALIDATION.** `rg -n 'VALIDATION.md' .haiku/knowledge/RUNBOOK.md`
   returns ≥ 1 hit.
3. **Runbook section header present.** `rg -n '## Operational runbook' packages/haiku/VALIDATION.md`
   returns 1 hit.
4. **Scenario summary present.** `rg -n 'iframe\|timeout\|fallback\|session\|bundle' packages/haiku/VALIDATION.md`
   returns ≥ 3 hits within the `## Operational runbook` section.
5. **No source code changes.** `git diff --name-only` includes only `packages/haiku/VALIDATION.md`
   and `.haiku/knowledge/RUNBOOK.md` for this unit's commit.

---
title: Finalize Gherkin .feature files
type: spec
model: sonnet
depends_on:
  - unit-01-finalize-acceptance-criteria
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - knowledge/ACCEPTANCE-CRITERIA.md
  - features/mcp-apps-capability-negotiation.feature
  - features/workspace-handshake.feature
  - features/iframe-review-gate.feature
  - features/iframe-decision-submit.feature
  - features/host-bridge-detection.feature
  - features/error-recovery.feature
  - features/accessibility-iframe.feature
status: active
bolt: 1
hat: validator
started_at: '2026-04-15T14:14:16Z'
hat_started_at: '2026-04-15T14:21:44Z'
outputs:
  - features/mcp-apps-capability-negotiation.feature
  - features/workspace-handshake.feature
  - features/iframe-review-gate.feature
  - features/iframe-decision-submit.feature
  - features/host-bridge-detection.feature
  - features/error-recovery.feature
  - features/accessibility-iframe.feature
  - knowledge/PRODUCT-UNIT-02-VALIDATION.md
---

# Finalize Gherkin behavioral specs

## Scope

Seven `.feature` files were produced during elaboration. This unit reviews them for Gherkin syntax correctness, scenario completeness, and one-to-one traceability to the AC items finalized by unit-01. Adds missing scenarios, fixes any invalid Gherkin, and ensures every AC item has at least one scenario covering it.

In scope:
- Lint each `.feature` file with `gherkin-lint` or `cucumber --dry-run` (whichever is available; if neither, manual inspection).
- For every AC item from `knowledge/ACCEPTANCE-CRITERIA.md`, ensure at least one scenario exists in one of the 7 features.
- Add missing happy-path / error / edge-case scenarios so each feature has at least 1 happy + 3 errors + edges.
- Use `Scenario Outline` for parameterized cases (decision outcomes, session types, breakpoint widths).
- Domain language consistent with AC actor names.

Out of scope:
- Writing step definitions / glue code.
- Implementation — these are specs only.
- Modifying the AC document (that's unit-01's domain).

## Completion Criteria

1. **All 7 files parse as valid Gherkin.** `for f in features/*.feature; do gherkin-lint "$f"; done` exits 0 for every file. (If `gherkin-lint` not installed, document the dry-run alternative.)
2. **Every AC item is covered.** Audit script maps each AC item to one or more scenario names and reports zero gaps.
3. **Each feature has ≥ 1 happy + ≥ 3 error + ≥ 1 edge scenario.** Verified by counting scenario types per file.
4. **Scenario Outline is used** for at least: `iframe-decision-submit.feature` (3 decision outcomes × 3 session types) and `accessibility-iframe.feature` (touch target audit across N elements).
5. **Domain language consistency.** All actor names match the AC document. `rg -n '\bUser\b' features/` returns hits only inside scenario step text where the role is generic by design (e.g., the `User Agent`); no generic "the user" outside that.
6. **No code, no glue.** `rg -n '@When|@Then|step\(' features/` returns zero hits.

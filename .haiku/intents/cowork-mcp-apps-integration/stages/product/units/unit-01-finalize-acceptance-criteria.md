---
title: Finalize acceptance criteria document
type: spec
model: sonnet
depends_on: []
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - knowledge/ACCEPTANCE-CRITERIA.md
  - stages/design/DESIGN-BRIEF.md
  - knowledge/DESIGN-TOKENS.md
status: active
bolt: 1
hat: product
started_at: '2026-04-15T13:53:30Z'
hat_started_at: '2026-04-15T13:53:30Z'
---

# Finalize ACCEPTANCE-CRITERIA.md

## Scope

The `acceptance-criteria` discovery artifact at `knowledge/ACCEPTANCE-CRITERIA.md` was produced during elaboration as a scaffold + first-pass content. This unit reviews it against the 13 inception/design unit specs, fills in any unaddressed AC items, splits any over-broad criterion into measurable sub-items, and confirms P0/P1 prioritization with the user via `AskUserQuestion` if any prioritization is unclear.

In scope:
- Verify every numbered criterion in inception units 01–08 and design units 01–05 is referenced by at least one AC item. Cross-reference via the unit name in the AC traceability index.
- Add missing AC items for any unreferenced criterion.
- Confirm the variability brief covers all six axes (capability negotiation, workspace roots, iframe breakpoint, decision outcome, session type, connection state) — split any axis that isn't fully populated.
- Ensure each AC item is testable — concrete enough to map to a Gherkin scenario.
- Reconcile P0 vs P1 split with the user if any P1 item is debatable.

Out of scope:
- Writing Gherkin (that's unit-02).
- Filling in the coverage matrix (that's unit-04).
- Modifying the unit specs themselves.

## Completion Criteria

1. **Every inception/design criterion is referenced.** `python3 -c "..."` script (or manual audit) confirms every numbered criterion across the 13 unit specs has at least one matching AC item by name. Verified by an audit log appended to the AC document.
2. **Every AC item has a `Test:` line** describing the concrete test that would verify it. Verified by `grep -c '^Test:' knowledge/ACCEPTANCE-CRITERIA.md` ≥ count of AC items.
3. **Variability brief lists all six axes** explicitly named in the unit. Verified by grep for each axis name.
4. **P0/P1 split is justified per item** with a one-line rationale. Verified by manual review.
5. **No env-var coupling** in the AC items. `rg -n 'CLAUDE_CODE_IS_COWORK|isCoworkHost' knowledge/ACCEPTANCE-CRITERIA.md` returns zero hits.

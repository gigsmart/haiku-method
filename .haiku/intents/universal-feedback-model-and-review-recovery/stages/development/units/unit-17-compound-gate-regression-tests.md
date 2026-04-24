---
title: Compound [external, ask] gate regression tests
type: regression
depends_on: []
quality_gates:
  - typecheck
  - test
inputs:
  - features/external-review-feedback.feature
  - knowledge/DATA-CONTRACTS.md
  - stages/development/artifacts/legacy-gate-feedback-check.md
  - stages/development/artifacts/legacy-external-review-detection.md
status: pending
bolt: 1
hat: implementer
closes:
  - FB-56
model: sonnet
---

## Summary

The implementation in `packages/haiku/src/orchestrator.ts` already handles
compound `[external, ask]` gates correctly: `normalizeReviewType` preserves
the compound string `"external,ask"` rather than collapsing to `"external"`;
the gate-phase pending-feedback check fires **before** any gate-type branching
(so pending feedback rolls the FSM to elaborate regardless of gate type);
the effective-gate computation passes compound arrays through to the review
UI unchanged when no feedback is pending; and external-change detection writes
the feedback file identically for simple `external` and compound `[external, ask]`
gates. This unit exists to lock that behavior behind regression tests so that
a future refactor cannot silently regress the ordering of
`countPendingFeedback` vs gate-type branching, nor the compound-gate
pass-through, nor the non-git fallback that strips `external` from compound
lists.

## Scope

**In scope:**

- Compound-gate scenarios A, B, and C from
  `features/external-review-feedback.feature` §`Compound Gate: [external, ask]`.
- The invariant that `countPendingFeedback` runs **before** gate-type
  branching in the `phase==="gate"` handler of `orchestrator.ts`.
- Non-git fallback: compound gates containing `external` strip it and keep
  the remaining type (`[external, ask]` → `ask`).

**Out of scope:**

- Single `external`-only gates — covered by
  `packages/haiku/test/external-review.test.mjs`.
- Single `ask`-only gates — covered by
  `packages/haiku/test/gate-feedback.test.mjs` existing cases.
- Implementation changes to `orchestrator.ts` — the behavior is already
  correct; this unit only lands regression tests that lock it in.

## Acceptance criteria

1. **AC1 — pending feedback beats compound gate (any origin):** With
   `review: [external, ask]`, a completed stage containing at least one
   feedback file with `status: pending` (any origin) causes the gate-phase
   handler to return `action: feedback_revisit` and increment `state.visits`.
   The response MUST NOT include `gate_type: "external,ask"` and MUST NOT
   include a `gate_review` action.

2. **AC2 — compound pass-through when no feedback is pending:** With
   `review: [external, ask]` and zero pending feedback in the stage, the
   gate-phase handler returns `action: gate_review` with
   `gate_type: "external,ask"` (compound pass-through preserved). The review
   UI is then expected to present both "Approve" (ask) and "Submit for
   External Review" (external) options.

3. **AC3 — external CHANGES_REQUESTED on compound gate:** With
   `review: [external, ask]` and an external PR reporting
   `CHANGES_REQUESTED`, the orchestrator MUST create a feedback file with
   `origin: external-pr` and `status: pending`, return
   `action: external_changes_requested`, and roll the FSM phase to
   `elaborate`. Behavior MUST be identical to a simple `external` gate.

4. **AC4 — non-git environment compound collapse:** In a non-git environment
   (filesystem persistence) with `review: [external, ask]`, the effective
   gate strips `external` and collapses to `ask` (per `orchestrator.ts`
   around line 3293). With zero pending feedback the action is
   `gate_review` with `gate_type: "ask"`. With at least one pending feedback
   file the action is `feedback_revisit` — matching the AC1 invariant that
   pending feedback wins regardless of the effective gate type.

5. **AC5 — ordering regression guard:** The pending-feedback check MUST run
   **before** any gate-type branching in the `phase==="gate"` handler. A
   test that sets `review: [external, ask]`, a valid
   `external_review_url`, and one feedback file with `status: pending` MUST
   observe `feedback_revisit` WITHOUT triggering any call to
   `checkExternalState` / `gh pr view` / `glab mr view`. This locks in the
   ordering invariant and prevents a refactor from accidentally checking
   external state first and short-circuiting the pending-feedback rollback.

## Test locations

- `packages/haiku/test/gate-feedback.test.mjs` — extend this existing file
  with one test case per acceptance criterion (AC1 through AC5). Do not
  create a parallel test file. Each test case title SHOULD include the
  acceptance-criterion ID (e.g. `compound [external, ask] — AC1: pending
  feedback beats gate`).

## Verification commands

```bash
# From repo root:
npx tsc --noEmit

# From packages/haiku:
cd packages/haiku
npm test -- test/gate-feedback.test.mjs
npm test
```

All commands MUST exit 0.

## References

- `features/external-review-feedback.feature` — §`Compound Gate: [external, ask]`
  (Scenarios A, B, C — the canonical spec for this unit).
- `stages/development/artifacts/legacy-gate-feedback-check.md` — prior-visit
  implementation notes for the pending-feedback gate check (preserved as
  history; renamed from `unit-04-gate-feedback-check.md` by FB-44).
- `stages/development/artifacts/legacy-external-review-detection.md` — prior-visit
  implementation notes for external-review detection (renamed from
  `unit-07-external-review-detection.md` by FB-44).
- `knowledge/DATA-CONTRACTS.md` — §`Compound Gate Resolution` (authoritative
  written contract for the six invariants this unit verifies).
- `packages/haiku/src/orchestrator.ts` — `normalizeReviewType` (~L655),
  `phase==="gate"` handler pending-feedback check (~L2949+), effective-gate
  computation (~L3292-3309), `external_changes_requested` action (~L860).

# Unit-07 Coverage Supplement — Approve-with-pending confirmation + comment-loss non-feature

This artifact supplements the `## Completion Criteria` section of
`stages/development/units/unit-07-review-page-desktop-and-mobile.md`. It was
authored in response to FB-39 to close the completeness gap that the unit body
was written before `review-ui-feedback.feature:130-138,223-230` were enumerated
at stage scope.

Closes: [FB-39] (in part — the FooterBar half).

## Why a supplement instead of an in-unit edit

`unit-07-review-page-desktop-and-mobile.md` is `status: completed`. The
`guard-fsm-fields` PreToolUse hook blocks any Write/Edit whose projected file
content matches `^status:\s*completed` on a unit file, so body-only edits to a
completed unit are rejected by the harness. This stage already mixes in-unit
criteria with artifact-level criteria (see `legacy-crud-companion-tools.md`,
`legacy-gate-feedback-check.md`, `legacy-orchestrator-integration.md`,
`legacy-external-review-detection.md`) — sidecar supplements are idiomatic
here. The behavioral spec for this visit = unit bodies + sidecar artifacts; the
test author reads both.

## Added completion criteria

### 1. Approve-with-pending confirmation (closes review-ui-feedback.feature:130-138)

**Surface:** `packages/haiku-ui/src/pages/review/FooterBar.tsx`

- The `FooterBar` component accepts `hasPendingFeedback: boolean`. Callers pass
  a truthy value when unresolved feedback items exist in the sidebar — this
  local decision is driven by the feedback list snapshot, not re-fetched by
  the footer.
- When `hasPendingFeedback === true` and the reviewer clicks **Approve** for
  the first time, the footer MUST flip into a confirmation state rather than
  firing `submitDecision`. Concretely:
  - The Approve button label changes to **"Confirm Approve"**.
  - A live `role="status"` message appears adjacent to the button: `"Pending
    feedback present — click Approve again to confirm."`
  - No `POST /api/review-decide` call is made on this first click.
- When the reviewer clicks **Confirm Approve** (the second click), the footer
  MUST submit the decision: `client.submitDecision(sessionId, { decision:
  "approved", ... })`.
- When `hasPendingFeedback === false` (or undefined), a single click on
  **Approve** MUST submit the decision immediately with no intermediate
  confirmation.

**Test (new):** `packages/haiku-ui/src/pages/review/__tests__/approve-with-pending.test.tsx`

Required RTL assertions:
1. Render `<FooterBar sessionId="s1" hasPendingFeedback>` with a mocked
   `ApiClient`.
2. Assert the Approve button label starts as `"Approve"` and that `role="status"`
   is absent.
3. Click the Approve button.
4. Assert the button label is now `"Confirm Approve"`.
5. Assert the `role="status"` message contains `/pending feedback.*click approve again/i`.
6. Assert `client.submitDecision` was **NOT** called after the first click.
7. Click the (now `"Confirm Approve"`) button.
8. Assert `client.submitDecision` was called exactly once with
   `{ decision: "approved", ... }`.
9. Re-render `<FooterBar sessionId="s2" />` with `hasPendingFeedback={false}`.
10. Click Approve once.
11. Assert `client.submitDecision` was called immediately (no intermediate
    confirm step).

This test proves the two-click confirm is wired, the guard does not call the
decision API prematurely, and the guard is bypassed when no pending feedback
exists.

**Acceptable implementation variants:** A modal-dialog implementation
(`role="alertdialog" aria-modal="true"` with explicit Cancel/Continue buttons
and a literal `"There are N pending feedback items. Approving will close all
remaining items. Continue?"` body) is also acceptable and MAY replace the
two-click-confirm pattern without re-opening this finding. If the implementation
upgrades to a modal dialog, the test above is extended to assert the dialog
role, the literal N-count substring, and the Cancel/Continue buttons instead of
the two-click label flip. The product-scenario text at `feature:136-138` is the
source of truth for the dialog copy when the dialog form is chosen.

**Out of scope:** "Bulk-close all pending items on confirm" is explicitly NOT
a v1 feature — the two-click confirm path approves the decision only; any
pending-feedback gate handling lives on the orchestrator side (gate rolls to
elaborate if structural feedback still pending, per
`feature:239-247`). The footer MUST NOT issue `PUT /api/feedback/.../FB-NN`
bulk mutations from the Approve click — feedback-lifecycle ownership lives in
`FeedbackItem` actions (see `unit-08-coverage-supplement.md`).

### 2. Comment-loss non-feature (closes review-ui-feedback.feature:223-230)

**Explicit out-of-scope declaration.** Per the feature file, when a reviewer
closes the browser tab without clicking Request Changes, the comments are lost
and no feedback files are created. This is the known v1 contract and the
intent's scope table explicitly excludes "debounced draft persistence for
review-UI comments beyond annotations".

No unit-07 completion criterion asserts positive persistence of unsubmitted
comments. No test is written for this scenario — its correct behavior is
absence of behavior (no network call, no file creation). The scenario is
covered by:
- The existing `feedback-crud.feature` coverage, which asserts feedback files
  are created only on `POST /api/feedback/...`.
- The absence of any localStorage / IndexedDB / service-worker write path in
  the review-page source.

**Audit guard (optional):** an `audit-banned-patterns.mjs` rule that
`localStorage\.setItem|indexedDB\.open` returns zero hits under
`packages/haiku-ui/src/pages/review/` would mechanically prove the non-feature.
If the banned-patterns audit is ever extended, this rule closes the loop. Not
required for FB-39 closure.

## Done when

- `packages/haiku-ui/src/pages/review/__tests__/approve-with-pending.test.tsx`
  exists and the eleven-step assertion list above passes.
- `packages/haiku-ui/src/pages/review/FooterBar.tsx` implements the two-click
  confirm (or equivalent modal-dialog upgrade per the acceptable-variants
  clause).
- `npx tsc --noEmit` exits 0 across the haiku-ui package.
- `npx vitest run --dir packages/haiku-ui` exits 0.
- This supplement artifact is committed with `haiku: fix FB-39 bolt 2 (builder)`.

## References

- `features/review-ui-feedback.feature:130-138` — approve-with-pending scenario.
- `features/review-ui-feedback.feature:140-144` — no-pending happy path.
- `features/review-ui-feedback.feature:223-230` — comment-loss v1 limitation.
- `features/review-ui-feedback.feature:239-247` — structural-feedback override
  of human approval (orchestrator-side, not UI).
- `stages/design/artifacts/footer-button-copy-spec.md` — banned verbs on the
  FooterBar.
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/39-review-ui-feedback-feature-scenarios-partially-covered-sever.md` — the
  finding this supplement closes.

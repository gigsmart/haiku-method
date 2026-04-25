# Fix FB-66 — Tactical Plan (planner, bolt 1)

**Finding:** Status-transition edge cases are missing from `FeedbackItem` / `FeedbackList` tests — only the happy path (pending → rejected, addressed → closed, rejected → pending) is exercised. The state-transition matrix has measurable gaps and no race / concurrent-mutation / upstream-stage coverage.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/66-status-transition-edge-cases-are-missing-from-feedbackitem-f.md`

## Root cause

Current state of `FeedbackItem.states.test.tsx` (reviewed in-place, bolt 1):

- The canonical-verbs `describe` block only checks which buttons render per status and never drives a transition through the `handleStatusChange` → `useLayoutEffect` focus/announce path for every edge.
- Only three transitions are actually exercised end-to-end with a controllable wrapper:
  - `pending → rejected` (Dismiss)
  - `addressed → closed` (Verify & Close)
  - `rejected → pending` (Reopen)
- No test drives `addressed → rejected`, `addressed → pending`, `closed → pending`, or the idempotent double-click case. No test renders a pending item and attempts a direct `pending → closed` (which the UI does not expose — that fact itself deserves a regression guard).
- `FeedbackList.states.test.tsx` only covers container states (default / loading / error / empty) and never performs a mutation on an item to verify that the container re-renders correctly under a status change.
- No test exercises the interaction between `useSessionWebSocket` session-update events and an in-flight click on a `FeedbackItem`. The `useSessionWebSocket` test mocks timers; the `FeedbackItem` states test does not touch WebSocket at all. The collision is literally impossible to catch today.
- No test renders an item whose on-disk frontmatter carries `upstream_stage: <other-stage>`. The wire schema (`packages/haiku-api/src/schemas/feedback.ts` `FeedbackItemSchema`) does **not** currently expose `upstream_stage` — meaning the UI cannot distinguish upstream findings from regular ones at render time. That's a genuine gap, but it's a schema/wire gap, not a UI-test gap alone. The test layer can still pin the current behavior (no affordance differentiation) so a future schema addition is forced to update the test when it adds the field.

The reviewer is right that status-transition state machines are where subtle bugs live. The fix is additive test coverage plus one explicit regression guard for the path the UI *refuses* to offer (`pending → closed` direct).

## Fix approach (planner-scope only — no code edits this bolt)

The builder (bolt 2) will:

1. **Refactor the `ControllableFeedbackItem` wrapper into a parameterized helper** that accepts `{ initialStatus, onStatusChangeSpy? }` so every transition test drives the same wrapper with different initial state instead of copy-pasting the wrapper for each status.
2. **Add a parameterized `transition matrix` `describe` block** that iterates a 2D table of legal transitions and drives each one through the real DOM. The assertion per cell is:
   - The expected action button is present before the click.
   - After the click, `data-status` on the card root reflects the target status.
   - After the click, the polite live-region text matches `statusAnnouncement(id, targetStatus)` for the exact `feedback_id` used in the fixture.
   - After the click, focus is on the card root (existing invariant — just re-verified per cell so a regression in the focus-restoration `useLayoutEffect` gets caught in more than one path).
3. **Add explicit negative tests for paths the UI does NOT expose:**
   - `pending` + expanded: assert `getByText("Verify & Close")` throws (i.e. `queryByText("Verify & Close")` is null). This pins the current design decision that pending cannot go directly to closed — the reviewer's open question ("is this even allowed?") is answered: the UI doesn't allow it, and this test makes that decision load-bearing.
   - `closed` + expanded: assert `queryByText("Dismiss")` is null. A closed item cannot be re-dismissed to rejected; the only action is Reopen.
   - `rejected` + expanded: assert `queryByText("Dismiss")` is null and `queryByText("Verify & Close")` is null.
4. **Add a double-click / idempotency test for Dismiss:**
   - Render `ControllableFeedbackItem initialStatus="pending"`.
   - Click Dismiss.
   - Assert `data-status === "rejected"` and the Dismiss button is gone (because the button tree re-renders to the rejected branch, which only has Reopen).
   - Click the now-gone button reference a second time (using the stale DOM reference captured before the first click — this is the "user clicks Dismiss twice rapidly" race from the reviewer's note). Assert no throw, and `onStatusChange` was called exactly once. This pins the React-level idempotency guarantee: the stale button reference is detached from the DOM, and re-clicking it cannot re-POST.
   - Optional: also drive through `fireEvent.click(dismiss)` twice in the same `act()` batch and assert `onStatusChange` fires exactly once. (React batches; the handler is `handleStatusChange` which is called per click — so this variant *should* fire twice. The meaningful protection is the parent state-transition, which is test #1 in this numbered list. Builder: prefer the stale-reference variant as the "idempotent" assertion; add the batched-click variant as a documentation test that pins the current behavior, with a comment that the API-layer idempotency is the real guard and is covered by `packages/haiku-api` tests.)
5. **Add a WebSocket-collision test at the FeedbackList level** (this is the right layer — FeedbackItem is stateless; the item's status comes from its prop, so collisions happen when the parent's state changes mid-click):
   - File: `packages/haiku-ui/src/components/feedback/__tests__/FeedbackList.states.test.tsx` (extend) OR a new sibling `FeedbackList.websocket-collision.test.tsx` if the states test file gets too crowded. Builder's judgment — if the states file crosses ~200 lines, split.
   - Wrapper: mount `<FeedbackList>` with a single pending item. Use an externally-controlled items state. Simulate the sequence:
     1. User focuses Dismiss button.
     2. `act(() => { dispatch(wsSessionUpdate({ id: "FB-01", status: "closed" })) })` — simulates a WebSocket session-update arriving first.
     3. `act(() => { fireEvent.click(dismiss) })` — the (stale) click fires after the status has already moved to closed.
   - Assertion: the item's `data-status` is `closed` (WS update won), the click did not revert the status (FeedbackItem does not own the status — the parent does, and the parent already moved on), and `onStatusChange` was either not called (if the stale button was unmounted by the rerender) or called with stale intent that the parent chose to ignore (depending on the builder's wrapper wiring). Pin whichever behavior the current implementation has — this test documents the winner of the race, which is "the last state write wins, and the UI cannot independently revert."
   - This test does NOT require importing `useSessionWebSocket` — the wrapper can directly update the items array via `setState`, simulating what the WS dispatch would do. The goal is to pin the UI's behavior under a mid-click state change, not to exercise the socket plumbing (that lives in `useSessionWebSocket.test.ts`).
6. **Add an upstream-stage fixture regression test:**
   - Extend `mockItems.ts` (do NOT fork — single source of truth for fixtures) with an optional param: `mockItems(n, overrides?: Partial<FeedbackItemData>)`. This keeps existing call sites working (all existing tests call `mockItems(n)` without overrides) and adds the ability to override, e.g. `upstream_stage`-like fields. Because the wire schema does not currently ship `upstream_stage`, the override is a no-op in production — but the test can assert "when future schema adds `upstream_stage`, the current UI renders no special affordance and does not change the Dismiss button's behavior." This is a pinning test, not an aspirational one; it guards against silent UX drift when the wire schema catches up.
   - If adding `upstream_stage` to `FeedbackItemData` requires a schema change in `packages/haiku-api`, that is OUT OF SCOPE for this fix (would be its own unit). Builder: add a `TODO(upstream_stage)` comment in the test explaining that the assertion is "no affordance today; revisit when schema ships `upstream_stage`", and file a seed / backlog note (not a new finding) if `upstream_stage` is surfaced at the wire layer in a future pass.
7. **Update the snapshot file for `FeedbackItem.states.test.tsx`** only if the test changes introduce a new structural DOM node (they should not — this fix is additive assertions, not component changes). If the snapshot drifts, that's a regression signal — stop and investigate.

## Files to modify

1. **`packages/haiku-ui/src/components/feedback/__tests__/FeedbackItem.states.test.tsx`**
   - Add a `describe("FeedbackItem — transition matrix")` block driving the parameterized table.
   - Add a `describe("FeedbackItem — forbidden transitions")` block for the `pending → closed` direct and `closed → dismiss` guards.
   - Add an `it("is idempotent when the user clicks Dismiss via a stale DOM reference")` test.
   - Refactor `ControllableFeedbackItem` to accept an optional `onStatusChangeSpy` prop so the idempotency test can verify call counts.

2. **`packages/haiku-ui/src/components/feedback/__tests__/FeedbackList.states.test.tsx`**
   - Add `describe("FeedbackList — WebSocket collision")` with the mid-click session-update scenario described in §5.
   - If the file grows past ~200 lines, split into `FeedbackList.websocket-collision.test.tsx` instead.

3. **`packages/haiku-ui/src/components/feedback/__tests__/mockItems.ts`**
   - Widen the signature to `mockItems(n: number, overrides?: Partial<FeedbackItemData>): FeedbackItemData[]` so individual items can carry upstream-stage-like overrides without duplicating the fixture.
   - Existing call sites (`mockItems(1)`, `mockItems(8)`, etc.) remain unchanged — the override is a trailing optional.

4. **`packages/haiku-ui/src/components/feedback/__tests__/__snapshots__/FeedbackItem.states.test.tsx.snap`**
   - Only regenerate if the builder introduces a new `describe`/`it` whose snapshot is captured. The transition-matrix and forbidden-transition tests should rely on targeted assertions (status / announcement / focus / button presence), not `toMatchSnapshot`, to keep the snapshot surface narrow and the test signal loud. Do NOT add new snapshots for the transition matrix — each cell should assert specific DOM state.

No other files need editing. No component (`FeedbackItem.tsx`, `FeedbackList.tsx`, `useSessionWebSocket.ts`) is modified — this is a test-coverage fix, not a code fix.

## Implementation steps (for the builder in bolt 2)

1. **Re-read** both test files immediately before editing — another chain may have edited them during the fix wave.
2. **Widen `mockItems.ts`** first, so subsequent test code can use `mockItems(1, { status: "closed", visit: 3 })` instead of hand-constructing items inline. Verify all existing call sites still compile by running `npx tsc --noEmit` in `packages/haiku-ui`.
3. **Refactor `ControllableFeedbackItem`** to accept `{ initialStatus, onStatusChangeSpy? }`. Thread the spy into the `onStatusChange` callback: if the spy is provided, call it first, then update local state. Existing tests that construct `ControllableFeedbackItem initialStatus="pending"` must keep working without supplying the spy.
4. **Add the transition-matrix `describe` block** using a `transitions` table modeled on the reviewer's suggestion, with additions:
   ```ts
   const transitions: Array<[
     FeedbackStatus,
     "dismiss" | "verify-close" | "reopen",
     FeedbackStatus,
     string, // expected polite-region text
   ]> = [
     ["pending",   "dismiss",      "rejected", "Feedback FB-01 marked as rejected"],
     ["addressed", "verify-close", "closed",   "Feedback FB-01 marked as closed"],
     ["addressed", "reopen",       "pending",  "Feedback FB-01 reopened"],
     ["closed",    "reopen",       "pending",  "Feedback FB-01 reopened"],
     ["rejected",  "reopen",       "pending",  "Feedback FB-01 reopened"],
   ]
   ```
   Do NOT include `["pending", "verify-close", "closed"]` — the UI doesn't render Verify & Close on a pending item, and the forbidden-transitions block handles that case. For each cell, render `<ControllableFeedbackItem initialStatus={from} />`, query the action button by `[data-action='${action}']`, click it, assert status transition + polite text + focus.
5. **Add the forbidden-transitions `describe` block.** Assert button absence per §3 of the plan. No click is needed — just presence/absence.
6. **Add the stale-reference idempotency test.** Render `<ControllableFeedbackItem initialStatus="pending" onStatusChangeSpy={spy} />`. Capture the Dismiss button reference into a local variable. Click it. Assert `spy` called once with `("FB-01", "rejected")`. Click the stale reference again; assert `spy` still called once (because the button was unmounted and the reference no longer belongs to the DOM tree). If jsdom's click-on-detached-element semantics differ, the fallback assertion is: `document.body.contains(dismissRef) === false` after the first click. Document whichever assertion is load-bearing.
7. **Add the FeedbackList WebSocket-collision test.** Mount `<FeedbackList items={[items[0]]} />` wrapped in a small stateful harness that exposes a `setItems` escape hatch. Focus the Dismiss button; in one `act()` run `setItems([{ ...items[0], status: "closed" }])` then `fireEvent.click(dismiss)`. Assert `data-status='closed'` on the rendered item and the polite region's last announcement is for the WS-driven change (if the status changed between renders, the announcement the user hears is "marked as closed", not whatever the click would have implied).
8. **Add the upstream-stage pinning test.** Build a fixture via `mockItems(1, { /* upstream placeholder */ })` and assert the rendered `FeedbackItem` has exactly the same DOM affordances as a non-upstream item (same Dismiss button, same `aria-label`, same lack of any "originated elsewhere" badge). Include a comment referencing `packages/haiku-api/src/schemas/feedback.ts` `FeedbackItemSchema` noting that `upstream_stage` is not yet on the wire.
9. **Run the targeted files:**
   ```bash
   cd packages/haiku-ui
   npx vitest run src/components/feedback/__tests__/FeedbackItem.states.test.tsx
   npx vitest run src/components/feedback/__tests__/FeedbackList.states.test.tsx
   ```
10. **Run the full `haiku-ui` suite** to confirm no cross-file regressions from the `mockItems` signature widening:
    ```bash
    npx vitest run
    ```
11. **Run type / lint:**
    ```bash
    npx tsc --noEmit
    npx biome check src/components/feedback/
    ```
12. **Do NOT update `FeedbackItem.states.test.tsx.snap`** unless a new `toMatchSnapshot` call was added (the plan says it should not be). If the existing snapshot drifts, stop and investigate — the refactor of `ControllableFeedbackItem` should not touch the existing `Matrix` snapshot.

## Verification commands

```bash
cd packages/haiku-ui
npx vitest run src/components/feedback/__tests__/FeedbackItem.states.test.tsx
npx vitest run src/components/feedback/__tests__/FeedbackList.states.test.tsx
npx vitest run                                       # full haiku-ui suite
npx tsc --noEmit
npx biome check src/components/feedback/
```

All five must exit 0. The full vitest run catches regressions in other tests that consume `mockItems` (there are several — see the earlier grep: `FeedbackSummaryBar.states.test.tsx`, `FeedbackList.virtualization.test.tsx`, etc. — the signature-widening is backwards-compatible but worth re-verifying).

## Risks

- **Parallel-chain clobber.** Multiple fix findings touch `FeedbackItem.tsx`, its tests, and `mockItems.ts` (FB-51, FB-52, FB-57, FB-64, FB-65 all live in the same neighborhood). Builder MUST read each test file fresh before writing. If a sibling chain has already refactored `ControllableFeedbackItem` or widened `mockItems`, detect that and merge forward rather than re-do.
- **Snapshot drift.** The existing `Matrix` snapshot is 24 cells of rendered DOM. Any `FeedbackItem.tsx` edit by a parallel chain (e.g. a sibling fix adjusting action button classes) will shift the snapshot. Do NOT blind-accept it — the FB-66 test edits should NOT change rendered DOM. If the snapshot drifts during this fix, that signals a merge collision and deserves a `git diff` review before `vitest -u`.
- **JSDom detached-element semantics.** The stale-reference idempotency test relies on jsdom's behavior when you click a DOM node that has been unmounted from its tree. Verify empirically: jsdom typically still fires the event on the detached node (because the event listener is still attached), so the builder's fallback assertion (`document.body.contains(dismissRef) === false`) may be the more reliable signal. Prefer that.
- **WS-collision test coupling.** The test simulates a WebSocket update by calling `setItems` directly, not by dispatching through `useSessionWebSocket`. That's a deliberate scope limit — `useSessionWebSocket` has its own test that verifies the dispatch path. The collision test here verifies the RENDERING behavior of a mid-click state change, not the plumbing. Do not pull in the real WebSocket mock harness; it adds noise and couples this test to the hook's internals.
- **`upstream_stage` schema drift.** If `packages/haiku-api` adds `upstream_stage` to `FeedbackItemSchema` in a future unit, the pinning assertion in the UI will FAIL (correctly — it's now rendering an affordance that didn't exist before). The test comment must point to the schema file so a future reviewer can navigate the cause quickly.
- **Test-file size.** `FeedbackItem.states.test.tsx` already has 307 lines. Adding 5 new `describe` / `it` blocks will push it to ~450. If that feels too long, the reviewer may request a split (e.g. `FeedbackItem.transitions.test.tsx`). Builder's judgment — a single file is preferred unless the reviewer flags it; a sibling test file costs fixture duplication.

## Out of scope

- Adding `upstream_stage` to `FeedbackItemSchema` on the wire. That's a schema change, not a test-coverage fix. A separate unit or backlog note owns it.
- Rewriting `useSessionWebSocket.ts` or its test. The collision scenario in this plan is tested at the rendering layer via `setItems`, not by re-exercising the socket.
- Adding E2E-style playwright tests. The feedback is about unit-level edge-case coverage; integration / E2E tests live in their own unit.
- Changing the canonical verb set or adding new action buttons. FB-64 and FB-65 handle any verb-copy-or-variant questions; this plan keeps `Dismiss` / `Verify & Close` / `Reopen` / `Delete` exactly as-is.
- Touching the `FeedbackStatusBadge` states test. Badges are not part of the transition engine — they render `aria-label="Status: {status}"` and that's already covered elsewhere.

## Done when

- `FeedbackItem.states.test.tsx` contains a parameterized transition-matrix `describe` exercising five legal transitions end-to-end (status / announcement / focus / button-presence per cell).
- `FeedbackItem.states.test.tsx` contains a forbidden-transitions `describe` asserting `pending → verify-close`, `closed → dismiss`, and `rejected → dismiss` buttons are absent.
- `FeedbackItem.states.test.tsx` contains a stale-reference idempotency test for double-Dismiss.
- `FeedbackList.states.test.tsx` (or a sibling file) contains a WebSocket-collision test pinning "last state write wins" behavior under a mid-click parent state change.
- `FeedbackList.states.test.tsx` contains an upstream-stage pinning test that renders a fixture with the override and verifies the UI shows no distinct affordance (with a TODO comment pointing to `feedback.ts` schema).
- `mockItems.ts` signature is widened to accept a `Partial<FeedbackItemData>` override.
- `npx vitest run` (whole haiku-ui), `npx tsc --noEmit`, and `npx biome check src/components/feedback/` all exit 0.
- No unintended snapshot drift in `FeedbackItem.states.test.tsx.snap`.

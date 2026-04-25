# Fix Plan: FB-24 — AnnotationCanvas arrow-key traversal test is a no-op

Owner: planner (fix-mode, bolt 1)
Target finding: `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/24-annotationcanvas-arrow-key-traversal-test-is-a-no-op.md`

## Problem statement (reviewer's claim, verified)

The test file `packages/haiku-ui/src/pages/review/__tests__/AnnotationCanvas.test.tsx:146-215` advertises itself (header comment line 9) as covering the unit-13 completion criterion "Arrow-key traversal across a pin set (sorted by (y, x))." The current implementation (lines 146-215):

1. Drops three pins via `pointerDown` + `commitCurrent(...)` — each commit calls `onSubmit` which succeeds, so the pin is removed from the DOM (see `AnnotationCanvas.tsx:511` — `setPins((prev) => prev.filter((p) => p.id !== submittedId))`). After three commits the canvas has **zero** pins.
2. Contains an inline comment (line 207-211) acknowledging "we can't have 3 live draft pins … Instead, verify the sort invariant on the second phase below" — but **there is no second phase**. The test body ends at `void container` (line 213).
3. Dispatches **zero** `ArrowRight` / `ArrowLeft` / `ArrowUp` / `ArrowDown` key events.
4. Asserts **zero** focus-movement invariants (`document.activeElement` is never inspected).

Verified against the component source (`AnnotationCanvas.tsx:297-332`):

- `sortedPinIds` is memoized from `pins` and sorted by `(y, x)` (ascending).
- `moveFocusBy(delta)` uses `sortedPinIds`, starts from `focusedPin ?? activePin ?? sortedPinIds[0]`, and clamps at the endpoints (does **not** wrap).
- `ArrowRight` / `ArrowDown` → `moveFocusBy(1)`, `ArrowLeft` / `ArrowUp` → `moveFocusBy(-1)`.
- Focus is applied imperatively via `pinButtonsRef.current[id].focus()` inside `focusPin(id)`.

So the component's traversal contract is real and testable; the test just doesn't test it.

## Fix strategy (chosen approach: seed via localStorage)

The feedback body suggests two options; the **localStorage seed** path is the right one:

- **Option A — `vi.spyOn(onSubmit).mockRejectedValue(...)`** keeps drafts alive, but the component still tears down the popover only on success. Keeping three draft pins mounted simultaneously would require either three commit-reject cycles with the popover caching each draft before the next pointerdown — messy and order-dependent.
- **Option B — seed three pins into `localStorage`** before mounting and let the boot-time read-back effect (`AnnotationCanvas.tsx:165-211`) restore them. This mirrors the already-passing `"reload survives"` test at line 475 and the pattern used throughout `annotation-perf.spec.tsx`. One mount, three pins, deterministic (y, x) ordering.

Option B is the chosen approach.

### Test rewrite shape

Replace the body of `it("Arrow-key traversal moves focus across pins in (y, x) sorted order", ...)` (lines 146-214) with:

1. **Seed** — Before `render()`, `localStorage.setItem("haiku-ui:annotation-draft:sess-arrow", JSON.stringify({ sessionId: "sess-arrow", pins: [A, B, C], savedAt: ... }))` where the pins are arranged so (y, x) sorted order is deterministic **and not** DOM-insertion order, so we prove the sort invariant rather than accidentally asserting insertion order:
   - Pin A: `{ id: "pin-a", y: 0.1, x: 0.5, … }` — smallest y, first in sorted order.
   - Pin B: `{ id: "pin-b", y: 0.3, x: 0.2, … }` — same y-tier as C, but smaller x, so second.
   - Pin C: `{ id: "pin-c", y: 0.3, x: 0.8, … }` — last.
   - **Seed order in the array is intentionally scrambled** (`[C, A, B]`) so any "DOM order" shortcut would produce a wrong answer.
2. **Render** — `renderCanvas({ sessionId: "sess-arrow" })`. Use `waitFor` to ensure the boot-time effect mounts all three pin buttons (`await waitFor(() => expect(root.querySelectorAll("button[data-pin-id]")).toHaveLength(3))`).
3. **Initial focus** — Focus the first pin programmatically: `act(() => { pinButtonsRef[0].focus() })`. The component's keydown handler uses `focusedPin ?? activePin ?? sortedPinIds[0]`, so focusing pin-a by DOM sets the starting point. Alternatively, dispatch `ArrowRight` from the canvas root without a prior focus and assert the handler lands on `sortedPinIds[0]` (pin-a) — that also proves the fallback. Do both as two sub-assertions:
   - 3a. `fireEvent.keyDown(root, { key: "ArrowRight" })` → `expect(document.activeElement).toBe(pin-a button)`.
4. **Forward traversal** — With pin-a focused, dispatch three `ArrowRight` events:
   - After 1st: `activeElement` === pin-b button (y=0.3, x=0.2).
   - After 2nd: `activeElement` === pin-c button (y=0.3, x=0.8).
   - After 3rd: `activeElement` still === pin-c (clamp — component uses `Math.min` at the top end, does not wrap).
5. **Backward traversal** — Dispatch three `ArrowLeft` events:
   - After 1st: `activeElement` === pin-b.
   - After 2nd: `activeElement` === pin-a.
   - After 3rd: `activeElement` still === pin-a (clamp — `Math.max(0, …)`).
6. **Vertical aliases** — One `ArrowDown` → next pin; one `ArrowUp` → previous pin. This proves the four-key mapping (`ArrowDown` and `ArrowUp` share code paths with `ArrowRight` and `ArrowLeft` per `AnnotationCanvas.tsx:412-421`).
7. **Sort-invariant reverse-seed check** — Because the seed payload order is `[C, A, B]`, the component's `sortedPinIds` `useMemo` is what produces the traversal order. Re-mount with a different scrambled seed order (`[B, C, A]`) and re-run step 3a + one `ArrowRight` — `activeElement` still starts on pin-a and advances to pin-b. Captures regressions where a future refactor accidentally uses insertion order.

### Why `fireEvent.keyDown(root, …)` and not `user.keyboard("{ArrowRight}")`

The component attaches `keydown` directly on the root via `addEventListener` (`AnnotationCanvas.tsx:428`). `user.keyboard` dispatches on `document` by default. `fireEvent.keyDown(root, …)` dispatches the event on the exact node the delegated listener is bound to, matching how a real keyboard event would bubble from an activeElement inside the root. This also matches the existing pattern at line 280 (`fireEvent.pointerDown(root, …)`).

### Assertion style

- `expect(document.activeElement).toBe(expectedButton)` — the strictest form; equality by DOM node.
- Each step gets its own `expect` so a failure tells you exactly which transition broke.
- No `toMatchObject` / snapshot / `toBeTruthy()` — those are the tautological patterns FB-24 is complaining about.

### localStorage fixture shape (matches `DraftPayloadSchema`)

The seed payload MUST pass `DraftPayloadSchema` (`AnnotationCanvas.tsx:101-105`) — otherwise the boot-time effect silently discards it. Required fields per `AnnotationDraftPinSchema`:

```
{
  id: string (1..200 chars),
  pageId: string (1..200 chars),
  x: number ∈ [0,1],
  y: number ∈ [0,1],
  viewportWidth: positive int ≤ 10000,
  viewportHeight: positive int ≤ 10000,
  title: string ≤ 2000,
  body: string ≤ 20000,
  state: "draft" | "pending",
}
```

Use `state: "pending"` so the pins are treated as submitted-but-in-flight (matches the reload-survives fixture at line 495). Either state value renders the pin button with `data-pin-id` so traversal works identically.

## Files to modify

| Path | Change |
|---|---|
| `packages/haiku-ui/src/pages/review/__tests__/AnnotationCanvas.test.tsx` | Replace the body of the existing `it("Arrow-key traversal moves focus across pins in (y, x) sorted order", …)` test (lines 146-214) with the seeded-localStorage traversal test described above. Keep the `describe("AnnotationCanvas — keyboard a11y", …)` wrapper. Remove the unused `commitCurrent` closure and `drop` helper that are no longer reached. |

Only **one** file is touched. No component source change is required — the contract is already correct; the test just failed to exercise it.

## Verification commands

Run from repo root (`/Volumes/dev/src/github.com/gigsmart/haiku-method/.claude/worktrees/delegated-swimming-honey`):

1. `cd packages/haiku-ui && npx vitest run src/pages/review/__tests__/AnnotationCanvas.test.tsx --reporter=verbose` — all AnnotationCanvas tests green, including the rewritten traversal test. Expect the new test to emit ~8 `expect(document.activeElement).toBe(...)` passes.
2. `cd packages/haiku-ui && npx vitest run src/pages/review/__tests__/AnnotationCanvas.test.tsx -t "Arrow-key traversal"` — scoped run of just the fixed test.
3. `cd packages/haiku-ui && npx tsc --noEmit` — the new test must typecheck (the three fixture pins are typed against `AnnotationDraftPin`; the `JSON.stringify`'d payload matches `DraftPayloadSchema`).
4. `cd packages/haiku-ui && npm run test` — full haiku-ui test suite to catch any accidental fallout from `localStorage` state bleeding (the existing `afterEach` already calls `localStorage.clear()` at line 59, so the seed is cleaned up between tests).

All four MUST pass. If any fail, the builder treats the fix as incomplete and iterates.

## Risk assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| **R1 — Boot-time read-back is asynchronous** — the effect at `AnnotationCanvas.tsx:165-211` runs on mount and calls `setPins(validated.data.pins)`, which causes a re-render. The test must `await waitFor(...)` before dispatching key events. | High (this is how the reload-survives test at line 475 works) | Use `waitFor(() => expect(root.querySelectorAll('button[data-pin-id]')).toHaveLength(3))` before step 3. Matches line 517-523. |
| **R2 — `afterEach` runs `localStorage.clear()`** — if any new test runs before this one and leaves stale data, the seed could be corrupted. | Low | The `afterEach` already handles this (line 59). Also call `localStorage.clear()` in a `beforeEach` inside the new `describe` block as belt-and-suspenders, matching line 249-251. |
| **R3 — `user.keyboard` vs `fireEvent.keyDown`** — mixing the two could attach to different listeners. | Medium | Use `fireEvent.keyDown(root, { key: "ArrowRight" })` consistently. This hits the exact root-level listener the component registers. |
| **R4 — Parallel fix chain could edit the same test file** — FB-23, FB-48, FB-54, FB-62 et al. touch haiku-ui test files; FB-35 specifically references `AnnotationCanvas` memory behavior. | Medium | Per the parallel-batch warning, re-read the file immediately before writing. If another chain has already reshaped lines 146-214, merge intelligently — the goal is a real traversal test, not a specific diff. |
| **R5 — Focus in jsdom is flaky under certain event orderings** — `element.focus()` returns synchronously but React batching can still delay state updates. | Low | The component's `focusPin(id)` calls `.focus()` and `setFocusedPin(id)` synchronously inside the keydown handler; jsdom dispatches focus synchronously. Existing tests already rely on this (see `renderCanvas` + `root.focus()` at line 73). If flakes appear, wrap each transition in `await act(async () => { fireEvent.keyDown(root, { key: "ArrowRight" }) })`. |
| **R6 — Clamp semantics drift** — if a future refactor makes Arrow wrap instead of clamp, step 4's 3rd assertion would fail. | Intentional | This is the point — the test pins the clamp contract. The unit spec does not specify wrapping; the component clamps. |

## Anti-patterns this fix explicitly avoids

- ❌ **Snapshot assertions** — no `toMatchSnapshot`, no `toMatchInlineSnapshot`.
- ❌ **Tautological checks** — no `expect(foo).toBe(foo)`, no `expect(foo).toBeTruthy()` on values that are always truthy by construction.
- ❌ **Asserting the test's own setup** — we do not assert `pins.length === 3` as the primary check; the primary check is focus movement.
- ❌ **Coupling to CSS classes** — we assert on `data-pin-id` and DOM nodes, not Tailwind classes.
- ❌ **Hidden dependencies on DOM insertion order** — the scrambled seed order proves the sort invariant.

## Out of scope for this bolt

- Other FB findings on AnnotationCanvas (FB-35 unbounded ImageData history, FB-42 CSS inlining, FB-45 textarea/body duplication, FB-58 pin contrast, FB-62 perf timer mocks). Each has its own fix chain.
- Any change to `AnnotationCanvas.tsx` — the component's traversal logic is correct; this fix is test-only.
- The `annotation-perf.spec.tsx` perf budget is **not** the same thing (FB-62) — it measures timing, not correctness. That's a separate finding.

## Handoff to builder

The builder receives:
1. This plan.
2. The current test file at `packages/haiku-ui/src/pages/review/__tests__/AnnotationCanvas.test.tsx`.
3. The current component at `packages/haiku-ui/src/pages/review/AnnotationCanvas.tsx` (read-only reference — NOT modified).

Builder task: implement the rewritten test body exactly as described under "Test rewrite shape" and "Assertion style" above, run the four verification commands, and commit as `haiku: fix FB-24 bolt 1 (builder)`.

# Fix FB-34 — Tactical Plan (planner, bolt 1)

**Finding:** `FeedbackSheet: role=dialog on div mismatches index.css dialog.feedback-sheet selectors`.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/34-feedbacksheet-role-dialog-on-div-mismatches-index-css-dialog.md`

## TL;DR

`packages/haiku-ui/src/index.css:240-305` ships a full native-`<dialog>`
styling block scoped to `dialog.feedback-sheet` — backdrop, slide-up
animation, reduced-motion guards, dark-mode bg override. The component
that actually renders in the review page
(`packages/haiku-ui/src/pages/review/FeedbackSidebar.tsx:247-290`) is a
plain `<div role="dialog" aria-modal="true">` — the selector
`dialog.feedback-sheet` never matches, so the entire CSS block is dead.

The canonical fix is to **stop rendering the placeholder `<div>` sheet
and wire the page to the already-existing native `<dialog>` component**
at `packages/haiku-ui/src/components/feedback/FeedbackSheet.tsx`. That
component is the one the CSS selectors are written for; it already uses
`<dialog>` + `showModal()` + `useFocusTrap` + `useReducedMotion` + the
`sheet-enter` / `sheet-enter--reduced` class contract.

This fix overlaps heavily with **FB-12** (Duplicate FeedbackSheet +
FeedbackFloatingButton with incompatible APIs). FB-12's tactical plan
(`fix-FB-12-tactical-plan.md`) already prescribes deleting the inline
duplicates and cutting `ReviewPage.tsx` over to the canonical
`components/feedback/*` exports. **The FB-12 builder commit closes FB-34
as a natural side effect** — once the placeholder `<div>` sheet is
deleted, the selector mismatch disappears and the canonical CSS block
starts painting on the real rendered DOM.

The FB-34 builder has two paths depending on what has already landed:

- **Path A (preferred, primary):** FB-12 has not yet landed at bolt 2.
  Coordinate with FB-12 — do nothing in the FB-34 builder beyond
  asserting the overlap, letting FB-12's cut-over land, and relying on
  the assessor to close FB-34 on the next review sweep.
- **Path B (fallback, if FB-12 stalls or is rejected):** Narrowly fix
  FB-34 in place by converting the inline `<div role="dialog">` to a
  native `<dialog>` with `showModal()` / `close()` + minimal hook
  wiring, so the CSS selectors match and the styling paints. This
  keeps the duplicate alive but closes the selector mismatch.

## Root cause

Unit-07 (review-page composition) shipped placeholder `FeedbackFloatingButton`
and `FeedbackSheet` components inline in `pages/review/FeedbackSidebar.tsx`
with a docstring that said "unit-10 upgrades the sheet with focus-trap-react
semantics + main-content `aria-hidden` contract; this unit ships the
placeholder state machine only."

Unit-10 then landed:

1. The canonical React components at
   `packages/haiku-ui/src/components/feedback/FeedbackSheet.tsx` +
   `FeedbackFloatingButton.tsx` (native `<dialog>` + focus trap +
   reduced motion + ref-forwarding), and
2. The canonical CSS styling block in `src/index.css:240-305` scoped to
   `dialog.feedback-sheet` (backdrop blur, slide-up animation,
   reduced-motion guards, dark-mode override).

But the cut-over step — swap `ReviewPage.tsx` from the placeholders to
the canonical exports — was forgotten. The result:

- The **CSS** ships the unit-10 styling, keyed to `<dialog>` selectors.
- The **React** placeholder sheet still renders a `<div role="dialog">`.
- The **selector** `dialog.feedback-sheet` matches zero nodes in the
  rendered DOM, so the entire unit-10 styling block is dead CSS.

The inline docstring on the placeholder sheet even confirms this: it
says "Full focus-trap + aria-hidden on main content is unit-10's scope"
— despite unit-10 having already shipped.

## Fix approach

**Strategy: coordinate with FB-12's cut-over; do not re-do FB-12's work.**

The FB-12 tactical plan already specifies:

- Delete the inline `FeedbackFloatingButton` + `FeedbackSheet` exports
  in `pages/review/FeedbackSidebar.tsx` (lines 181-291 there).
- Wire `ReviewPage.tsx` to the canonical
  `components/feedback/FeedbackFloatingButton` +
  `components/feedback/FeedbackSheet` exports.
- Add `data-testid={resolvedId}` to the canonical `<dialog>` root for
  test parity.
- Regenerate `FeedbackSheet.states.test.tsx.snap` with `-u`.

Once that lands, the rendered mobile sheet becomes a real `<dialog
class="feedback-sheet">`, the selector `dialog.feedback-sheet` matches,
and all four of the dead-CSS behaviors from FB-34's feedback body start
working:

- Backdrop scrim + `::backdrop` blur paint.
- `sheet-up` slide-in animation runs on open.
- Reduced-motion guards kick in under `@media (prefers-reduced-motion: reduce)`.
- Dark-mode background override (`:where(.dark) dialog.feedback-sheet`) takes effect.

**FB-34 requires no independent code edits if FB-12 lands in this
fix-wave.** The builder (bolt 2) should:

1. Verify FB-12's tactical plan exists and matches the strategy above
   (`cat .haiku/intents/.../artifacts/fix-FB-12-tactical-plan.md`).
2. Check whether FB-12's builder commit has already landed on the
   current branch
   (`git log --oneline | grep 'fix FB-12'`).
3. If FB-12 is already done: add a status comment to
   `feedback/34-*.md` referencing the FB-12 commit hash and noting the
   fix is subsumed. Close the loop — no code changes.
4. If FB-12 is still pending: commit an empty
   `haiku: fix FB-34 bolt 2 (builder)` marker that acknowledges the
   dependency, or — if policy forbids empty commits — add a one-line
   note to `fix-FB-34-tactical-plan.md` saying "deferred to FB-12
   cut-over." The assessor will hold FB-34 open until FB-12 closes.
5. If FB-12 was rejected or stalls, follow **Path B** below to narrow-fix
   FB-34 independently.

### Path B — fallback narrow fix (only if FB-12 does NOT land)

If the feedback-assessor reopens FB-34 after FB-12 fails, the builder
swaps the placeholder `<div>` sheet in
`pages/review/FeedbackSidebar.tsx:247-290` to a native `<dialog>` in
place. Minimum changes to match the CSS selector namespace:

1. Change the JSX root from
   `<div id="feedback-sheet" role="dialog" aria-modal="true" ... hidden={!isOpen}>`
   to
   `<dialog ref={dialogRef} id="feedback-sheet" className="feedback-sheet xl:hidden fixed inset-0 z-50 flex flex-col bg-white dark:bg-stone-900">` —
   drop the `hidden` attr, drop `role="dialog"` (native dialog has it
   implicitly), drop `aria-modal="true"` (native dialog sets it on
   `showModal()`), keep `aria-labelledby="feedback-sheet-title"`.
2. Add `const dialogRef = useRef<HTMLDialogElement>(null)` at the top.
3. Add a `useEffect` that drives `open` → `dialog.showModal()` /
   `close()` with the `dialog.open` idempotency guard from unit-10's
   tactical plan §A:
   ```tsx
   useEffect(() => {
     const d = dialogRef.current
     if (!d) return
     if (isOpen && !d.open) d.showModal()
     if (!isOpen && d.open) d.close()
   }, [isOpen])
   ```
4. Attach a `close` event listener on the `<dialog>` that calls
   `onClose` so Escape-close and imperative close both propagate.
5. Remove the ad-hoc `onKeyDown` Escape handler — native `<dialog>`
   handles Escape via the `cancel` + `close` events.
6. Add `className="feedback-sheet"` (or include it in the root class
   string) so the CSS block's selector matches.
7. Keep the inline amber "Mobile review experience is under
   construction" banner for now — it's FB-12's job to delete the
   placeholder entirely; Path B is strictly a selector-matching fix.
8. Update `packages/haiku-ui/src/pages/review/__tests__/layout.test.tsx`
   — the existing `getByTestId("feedback-sheet")` assertion continues
   to resolve because `data-testid="feedback-sheet"` is preserved. No
   jsdom `showModal` shim is needed in *this* test because the test
   checks only existence + role, not open-state behavior; but if any
   test asserts `dialog.open === true`, the builder must add the shim
   from unit-10 tactical plan §F (risk 1):
   ```ts
   if (typeof HTMLDialogElement !== "undefined"
       && !HTMLDialogElement.prototype.showModal) {
     HTMLDialogElement.prototype.showModal = function () {
       this.setAttribute("open", "")
     }
   }
   ```

Path B is **the fallback**, not the primary fix. Prefer Path A every time
unless FB-12 has been explicitly rejected.

## Files to modify

### Path A (primary — no code edits beyond status notes)

- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/34-feedbacksheet-role-dialog-on-div-mismatches-index-css-dialog.md`
  — if FB-12 has already landed, append a one-paragraph note in the body
  (below the last `Fix:` line) pointing at the FB-12 commit hash and
  stating the fix is subsumed. Do NOT edit frontmatter — the assessor
  owns `status` transitions.
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/artifacts/fix-FB-34-tactical-plan.md`
  — this file itself (the plan). Commit as the planner-bolt-1 deliverable.

### Path B (fallback only)

- `packages/haiku-ui/src/pages/review/FeedbackSidebar.tsx` — convert
  the `FeedbackSheet` component's root from `<div>` to `<dialog>` per §§1-6 above.
- `packages/haiku-ui/src/pages/review/__tests__/layout.test.tsx` — add
  the jsdom `showModal` shim at the top of the test file if any
  assertion exercises open-state behavior (currently does not appear to).
- `packages/haiku-ui/src/pages/review/__tests__/responsive.test.tsx` and
  `__tests__/status-announce.test.tsx` — verify no regressions; no
  edits expected.

## Implementation steps (for the builder in bolt 2)

### Path A (primary)

1. On the current branch, run `git log --oneline -20 | grep "fix FB-12"`
   to see whether FB-12's builder commit has landed.
2. If FB-12 has landed:
   - Cross-check the relevant CSS selectors match the rendered DOM:
     ```bash
     grep -n "feedback-sheet" packages/haiku-ui/src/components/feedback/FeedbackSheet.tsx
     grep -n "dialog.feedback-sheet" packages/haiku-ui/src/index.css
     ```
     Confirm the canonical `<dialog>` component ships `className="feedback-sheet"` (or includes it via the className prop pattern used in unit-10 tactical plan §A).
   - Verify `ReviewPage.tsx` imports `FeedbackSheet` from
     `../../components/feedback`, not from `./FeedbackSidebar`.
   - Append a status note to `feedback/34-*.md` body referencing the
     FB-12 commit hash. No code edits.
   - Commit: `haiku: fix FB-34 bolt 2 (builder) — subsumed by FB-12`.
3. If FB-12 has NOT landed:
   - Commit: `haiku: fix FB-34 bolt 2 (builder) — deferred to FB-12 cut-over`
     with only a note appended to `feedback/34-*.md` explaining the
     dependency and linking to `fix-FB-12-tactical-plan.md`.
   - The assessor holds FB-34 open; FB-12's merge closes both findings
     on the next sweep.

### Path B (fallback, only if FB-12 is rejected)

1. Read `pages/review/FeedbackSidebar.tsx` fresh (parallel-batch
   warning — FB-12, FB-22, FB-26, FB-38 also touch this area).
2. Convert the `FeedbackSheet` function's root to `<dialog>` per §§1-6
   of Path B above.
3. Run the targeted + package test suites:
   ```bash
   pnpm --filter haiku-ui typecheck
   pnpm --filter haiku-ui test -- pages/review
   pnpm --filter haiku-ui test
   ```
4. If `layout.test.tsx` fails with "showModal is not a function",
   add the jsdom shim at the top.
5. Commit: `haiku: fix FB-34 bolt 2 (builder)`.

## Verification commands

```bash
# (a) Canonical CSS selectors match the canonical component's className
grep -n "dialog.feedback-sheet" packages/haiku-ui/src/index.css
grep -n "feedback-sheet" packages/haiku-ui/src/components/feedback/FeedbackSheet.tsx

# (b) The inline <div role="dialog"> is no longer rendered by ReviewPage.tsx
#     (either because FB-12 deleted the inline sheet, OR because Path B
#     converted it to <dialog>)
grep -nE 'role="dialog"[^"]*\b(feedback-sheet|FeedbackSheet)\b' \
  packages/haiku-ui/src/pages/review/FeedbackSidebar.tsx

# (c) Typecheck + test pass
pnpm --filter haiku-ui typecheck
pnpm --filter haiku-ui test
```

Expected outcomes:

- After **Path A + FB-12 landed**: (b) returns zero lines (the inline
  sheet is gone); the canonical `<dialog>` in
  `components/feedback/FeedbackSheet.tsx` carries the
  `className="feedback-sheet"` — (a) shows both sides matching.
- After **Path B**: (b) shows the converted `<dialog>` in
  `FeedbackSidebar.tsx`; (a) shows the selector matches the converted
  element; (c) still passes.

## Risks

- **Parallel-chain clobber (high).** FB-12 is the natural fix for FB-34;
  FB-22, FB-26, and FB-38 all touch adjacent files. The builder MUST
  re-read every file immediately before editing and check git status
  for pending sibling commits. If FB-12 has already deleted the inline
  sheet, Path B edits would resurrect it — do not take Path B without
  first confirming FB-12 is NOT in the commit graph.
- **Ordering dependency on FB-12.** FB-34 is safer to hold until FB-12
  lands. If the assessor is running bolts in parallel and finishes
  FB-34 before FB-12, the selector mismatch remains — but the assessor
  should notice the shared root cause and close both in the same sweep
  on the next retry. Document the dependency explicitly in the
  follow-up commit message so the audit trail is clear.
- **Path B is a divergence from the canonical architecture.** Path B
  keeps the duplicate `FeedbackSheet` implementation alive; that
  violates FB-12's broader dedupe goal. Only take Path B when FB-12 has
  been formally rejected (status changed away from `fixing`/`pending`).
- **jsdom `showModal` missing (Path B only).** `HTMLDialogElement.showModal`
  is not implemented in jsdom < 27. Unit-10 tactical plan §F already
  documents the shim. If Path B is taken and any test asserts open
  state, add the shim to that test file's setup.
- **Dark-mode backdrop override.** The CSS block
  `:where(.dark) dialog.feedback-sheet { background: #1c1917 }` uses
  `#1c1917`, not the Tailwind `stone-900` class. Once the selector
  starts matching, verify the dark-mode sheet does not paint a
  double-background (Tailwind `dark:bg-stone-900` + CSS
  `#1c1917`). Both resolve to the same color, so the layered render
  is invisible — but document the duplication in the fix commit so a
  future cleanup can pick one.
- **Selector scope leakage.** The CSS selector `dialog.feedback-sheet`
  is scoped tightly by the class name. No other `<dialog>` in the app
  should carry `className="feedback-sheet"`. Grep to confirm:
  `grep -rn 'feedback-sheet' packages/haiku-ui/src` — expect only the
  canonical component + tests + index.css.

## Out of scope

- Rewriting the unit-10 tactical plan. The CSS block is correct; the
  bug is that the React side never cut over to match.
- Deleting the duplicate inline sheet + rewiring `ReviewPage.tsx`.
  That's FB-12's explicit scope.
- Adding a pending-count badge to the FAB. FB-12 flags this as a
  follow-up; it is not FB-34's scope.
- DESIGN-BRIEF §6 updates. The brief still names `focus-trap-react`;
  unit-10 diverged intentionally. The divergence is recorded in
  `BROWSER-SUPPORT.md`. No doc edit here.
- Paper / website / plugin sync. Purely a `packages/haiku-ui` internal
  consistency fix; no H·AI·K·U concept or plugin behavior changes.

## Done when

**Path A (primary) — done when:**

- FB-12's builder commit has landed on the branch.
- `packages/haiku-ui/src/pages/review/ReviewPage.tsx` imports
  `FeedbackSheet` from `../../components/feedback`, not from
  `./FeedbackSidebar`.
- The canonical `<dialog>` in
  `components/feedback/FeedbackSheet.tsx` carries the
  `className="feedback-sheet"` string (matching `dialog.feedback-sheet`
  in `index.css`).
- No `<div role="dialog" ...>` remains in
  `pages/review/FeedbackSidebar.tsx`.
- `pnpm --filter haiku-ui typecheck` and
  `pnpm --filter haiku-ui test` both pass.
- The feedback-assessor closes FB-34 (either in the same sweep that
  closes FB-12, or in the subsequent sweep).

**Path B (fallback) — done when:**

- `pages/review/FeedbackSidebar.tsx`'s `FeedbackSheet` function renders
  a native `<dialog ... className="feedback-sheet">` with
  `showModal()` / `close()` wiring and the CSS selector now matches.
- All tests in `packages/haiku-ui/src/pages/review/__tests__/` pass
  (with the jsdom shim added if required).
- The feedback-assessor closes FB-34.
- A follow-up tracking note is added so FB-12's broader dedupe still
  happens in a later bolt.

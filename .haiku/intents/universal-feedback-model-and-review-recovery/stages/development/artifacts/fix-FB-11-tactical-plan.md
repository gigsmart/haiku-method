# Fix FB-11 — Tactical Plan (planner, bolt 1)

**Finding:** `Duplicate ReviewPage + AnnotationCanvas components with circular re-export`.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/11-duplicate-reviewpage-annotationcanvas-components-with-circul.md`

## TL;DR

Finish the strangler cutover — do NOT back it out. The `pages/review/*`
layer is the canonical composition; the `components/ReviewPage.tsx`
monolith is legacy and must be dismantled. This plan instructs the
builder to (a) delete the dead `LegacyReviewPage` top-level function,
(b) migrate `IntentReview` / `UnitReview` / `RereviewBanner` /
`ReviewPageSessionData` out of `components/ReviewPage.tsx` into
`pages/review/intent/`, `pages/review/unit/`, `pages/review/shared/`
modules, (c) delete the orphaned `pages/review/AnnotationCanvas.tsx`
(the 784-LOC implementation that only its own test consumes), and
(d) rewire `components/ReviewPage.tsx` to a thin re-export shim (or
delete it entirely once imports are rewritten). The live runtime
`components/AnnotationCanvas.tsx` (499 lines) is kept as-is — it is the
one used by the tree today; the orphaned `pages/review/` copy is the
duplicate, not the leaf.

This plan also closes, or materially advances, related findings
**FB-22** (1659-line monolith split) and **FB-27** (`LegacyReviewPage`
dead code). Those are the same refactor viewed from three angles —
architecture, monolith, performance. Sharing one cutover instead of
three half-cutovers is the Boy-Scout move.

## Root cause

Unit-07 shipped a *partial* strangler-fig cutover. The PR adopted the
right shape (`pages/review/ReviewPage.tsx` as the new composition) but
preserved the old file "for cost reasons" and left the leaf components
(`IntentReview`, `UnitReview`, `RereviewBanner`, parsed-session type)
sitting inside the old 1659-line monolith. The top-level
`components/ReviewPage.tsx` was re-pointed at the new composition via
`export { ReviewPage } from "../pages/review/ReviewPage"` (line 155),
while `LegacyReviewPage` (line 157 onward, ~365 lines before the leaf
exports) was renamed and kept "in case tests need it" — but no test
imports `LegacyReviewPage`.

Independently, unit-13 shipped a fresh `pages/review/AnnotationCanvas.tsx`
(784 lines, pin state-machine: `"draft" | "saved"`, listener-budget
tests) as its deliverable — but never flipped any runtime call site off
the legacy `components/AnnotationCanvas.tsx` (499 lines, pin `id: string`,
simpler contract). Result: unit-13's deliverable is unreachable code
verified only by its own tests; the runtime still uses the component
from unit-03.

The "circular re-export" claim in the feedback body is not a literal
module cycle (the two files export different symbols, so the module
loader is happy), but it IS an inverted dependency direction —
`components/*` re-exporting from `pages/*`, while `pages/*` imports
leaves from `components/*`. That's architecturally backwards: leaves
should not know about pages, and aggregator files should not live in
`components/`.

## Fix approach

**Strategy: complete the cutover, don't revert it.** Backing out the
`pages/review/*` layer would delete unit-07's entire thesis (three-pane
composition, responsive split, `ArtifactsPane`/`FeedbackSidebar`
decomposition) and every piece of scaffolding unit-10 and unit-11 built
on top of it. The cost of finishing is smaller than the cost of
reverting.

For **AnnotationCanvas**, the direction is the *opposite* of
ReviewPage: the unit-13 file is the orphan, not the incumbent. Runtime
call sites all use `components/AnnotationCanvas.tsx`. The unit-13 file
either (a) needs to actually replace the legacy canvas, or (b) needs to
be deleted. Given the runtime cost of a mid-fix canvas swap and the
fact that unit-13's tests may be testing behavior the current canvas
doesn't implement, the right call for THIS bolt is **delete the
orphan** and create a follow-up unit to migrate the runtime to
unit-13's pin state-machine when the design direction is clearer. The
feedback body is explicit that "shipping both is worst-of-both-worlds"
— we pick the one call-sites actually use and delete the other.

## Files to modify — ReviewPage cutover

### Delete from `packages/haiku-ui/src/components/ReviewPage.tsx`
1. **`LegacyReviewPage` function body** (lines ~157 through ~522) —
   unused; confirmed by `rg 'LegacyReviewPage' packages/haiku-ui/src`
   matching only the docstring and declaration.
2. **`loadDraft` / `saveDraft` / `DRAFT_STORAGE_KEY` helpers**
   (lines ~91-142) — only used by `LegacyReviewPage`. After
   `LegacyReviewPage` is deleted, these are dead.
3. **`ReviewDraft` interface** (lines ~91-95) — same reason.
4. **`isImageUrl` / `findSection` / `findSectionWithSubs` /
   `getPreamble` helpers** (lines ~56-89) — keep ONLY if
   `IntentReview`/`UnitReview` use them. Re-audit during migration and
   move to the new leaf module or delete.
5. **The `export { ReviewPage } from "../pages/review/ReviewPage"`
   re-export** (line 155) — after step 6 below retargets all callers,
   this shim is no longer needed. Either delete `components/ReviewPage.tsx`
   entirely, or leave it as a pure re-export barrel (0 local components).

### Migrate out of `packages/haiku-ui/src/components/ReviewPage.tsx`

Create the following new files and move the corresponding code blocks:

6. **`packages/haiku-ui/src/pages/review/shared/session-data.ts`**
   - Exports `ReviewPageSessionData` (currently lines 23-32 of the
     legacy file).
   - Re-export chain updated: `pages/review/ReviewPage.tsx` drops its
     `export type { ReviewPageSessionData } from "../../components/ReviewPage"`
     and imports from this new module instead.
7. **`packages/haiku-ui/src/pages/review/intent/IntentReview.tsx`**
   - Moves the `IntentReview` function (currently around line 535 in
     the legacy file).
   - All type imports follow to this file.
   - Test co-location: if there are any tests for `IntentReview`, they
     move with it. (As of this bolt, `rg -l 'IntentReview' .../__tests__`
     found 0 direct tests — `IntentReview` is exercised transitively via
     `ArtifactsPane`.)
8. **`packages/haiku-ui/src/pages/review/unit/UnitReview.tsx`**
   - Moves the `UnitReview` function (currently around line 911).
   - Same transit rules.
9. **`packages/haiku-ui/src/pages/review/shared/RereviewBanner.tsx`**
   - Moves `RereviewBanner` (currently around line 1633).
   - `pages/review/ReviewPage.tsx` line 40 (`RereviewBanner` import)
     retargets here.

### Rewire callers

10. **`packages/haiku-ui/src/pages/review/ArtifactsPane.tsx`**
    - Line 18 `import type { AnnotationPin } from "../../components/AnnotationCanvas"` — stays (the live canvas did not move).
    - Lines 20-24 — swap `import { IntentReview, type ReviewPageSessionData, UnitReview } from "../../components/ReviewPage"` to import from the new `intent/IntentReview`, `unit/UnitReview`, and `shared/session-data` modules.
    - Remove the stale docstring paragraph (lines 1-15) that says "this
      unit does not rewrite those views — the tactical plan §14 is
      explicit that the ~1400-LOC monolith stays in place" — that carve-
      out is now obsolete.
11. **`packages/haiku-ui/src/pages/review/ReviewPage.tsx`**
    - Lines 37-40 — replace the multi-import from `../../components/ReviewPage`
      with `import { RereviewBanner } from "./shared/RereviewBanner"` plus
      `import type { ReviewPageSessionData } from "./shared/session-data"`.
    - Line 54 (`export type { ReviewPageSessionData } from "../../components/ReviewPage"`) —
      retarget to `./shared/session-data`.
12. **`packages/haiku-ui/src/pages/review/__tests__/layout.test.tsx`,
    `responsive.test.tsx`, `status-announce.test.tsx`** — each
    imports `ReviewPageSessionData` from `../../../components/ReviewPage`.
    Retarget all three to the new `shared/session-data` module.

### Delete from the tree

13. **`packages/haiku-ui/src/pages/review/AnnotationCanvas.tsx`** (784 lines)
    - Orphaned; only `pages/review/__tests__/AnnotationCanvas.test.tsx`
      imports it, and that test was never wired to the runtime canvas.
14. **`packages/haiku-ui/src/pages/review/__tests__/AnnotationCanvas.test.tsx`**
    - Tests for the orphan canvas. Delete along with the orphan. Any
      regression coverage we actually want for the runtime canvas (pin
      keyboard nav, listener budget, etc.) lives under
      `packages/haiku-ui/src/components/__tests__/AnnotationCanvas.test.tsx`
      — re-audit and port what we want in a follow-up unit.
15. **`packages/haiku-ui/src/components/ReviewPage.tsx`** — after all
    callers retarget, this file has no local components left. Either:
    - **Option A (simplest):** delete the file and let callers import
      directly from the new leaf modules. Callers are already scoped
      down to test fixtures and the barrel in `pages/review/index.tsx`.
    - **Option B (transitional):** keep the file as a 3-line re-export
      barrel (`export { ReviewPage } from "../pages/review/ReviewPage"`
      plus re-exports of the new `IntentReview` / `UnitReview` /
      `RereviewBanner` if any external consumer depends on them).
      The `@haiku/shared` barrel should decide.
    - Recommendation: **Option A**. Barrels that echo a different
      directory are architecture smells; the grep shows no external
      consumer needs the legacy import path after step 12 lands.

## Files to modify — unit spec alignment

16. **`.haiku/intents/.../stages/development/units/unit-07-review-page-desktop-and-mobile.md`**
    - Remove `packages/haiku-ui/src/components/ReviewPage.tsx` from
      the deliverables list (line 54). That file will not exist after
      this fix lands.
    - Add the new deliverables: `pages/review/intent/IntentReview.tsx`,
      `pages/review/unit/UnitReview.tsx`,
      `pages/review/shared/RereviewBanner.tsx`,
      `pages/review/shared/session-data.ts`.
17. **`.haiku/intents/.../stages/development/units/unit-13-annotation-canvas.md`**
    - Replace the `pages/review/AnnotationCanvas.tsx` deliverable (line 41)
      with the runtime path `components/AnnotationCanvas.tsx` — OR, if
      unit-13's intent was genuinely a new canvas, create an explicit
      follow-up unit `unit-NN-annotation-canvas-migration.md` that
      flips the runtime call sites and deletes the legacy 499-LOC
      component. The builder should surface this decision in the bolt-2
      commit message so the assessor can route appropriately.
    - Update the banned-pattern regression guard reference (line 63,
      line 101) to point at the live runtime file.
18. **`.haiku/intents/.../stages/development/artifacts/unit-07-tactical-plan.md`**
    - Drop the §14 "don't rewrite the monolith" carve-out prose.
      Replace with a dated note saying the carve-out was dissolved by
      FB-11 / FB-22 / FB-27 fix-loop and the split completed.

## Verification commands

Run from the worktree root after the builder bolt:

```bash
# (a) LegacyReviewPage is gone
! grep -rq 'LegacyReviewPage' packages/haiku-ui/src

# (b) Orphan canvas is gone
test ! -f packages/haiku-ui/src/pages/review/AnnotationCanvas.tsx
test ! -f packages/haiku-ui/src/pages/review/__tests__/AnnotationCanvas.test.tsx

# (c) New leaf modules exist
test -f packages/haiku-ui/src/pages/review/intent/IntentReview.tsx
test -f packages/haiku-ui/src/pages/review/unit/UnitReview.tsx
test -f packages/haiku-ui/src/pages/review/shared/RereviewBanner.tsx
test -f packages/haiku-ui/src/pages/review/shared/session-data.ts

# (d) No legacy import paths remain (only runtime canvas from components)
! grep -rq 'from.*components/ReviewPage' packages/haiku-ui/src

# (e) The monolith is either gone, or a re-export barrel under 20 lines
if [ -f packages/haiku-ui/src/components/ReviewPage.tsx ]; then
  test "$(wc -l < packages/haiku-ui/src/components/ReviewPage.tsx)" -lt 20
fi

# (f) TypeScript compiles
pnpm --filter haiku-ui typecheck

# (g) Test suite green (no stale imports, no missing modules)
pnpm --filter haiku-ui test

# (h) Bundle size drops — take a before/after on `dist/assets/*.js`
#     gzipped. The ~15 KB source of LegacyReviewPage should translate
#     to ~5-8 KB gzipped drop per FB-27's estimate.
pnpm --filter haiku-ui build
gzip -c packages/haiku-ui/dist/assets/index-*.js | wc -c
```

## Handoff to the builder

1. Work on the current branch (`haiku/universal-feedback-model-and-review-recovery/development`).
2. Do the refactor as a **single cohesive commit** — this is not a
   drive-by; it undoes three related findings in one move. Commit
   message: `haiku: fix FB-11 bolt 2 (builder)` with body noting that
   it also addresses FB-22 and FB-27.
3. **Read each file immediately before writing** — parallel chains may
   be editing sibling files in this directory (the FB-22 and FB-27
   chains are particularly likely to overlap). If a parallel chain
   already migrated `IntentReview`, don't clobber — reconcile.
4. After the code move, run verification commands (a)-(g) and paste
   the output into the bolt-2 commit message.
5. If the migration surfaces type errors the planner didn't predict
   (the monolith's helpers may have tighter cohesion than the grep
   suggests), the correct move is to migrate the helper too, NOT to
   leave a half-migrated state.

## Risks

- **Parallel-chain clobber (high)** — FB-22 and FB-27 are the same
  cutover. If those fix-loops run in parallel and any one of them does
  the rewrite first, this bolt becomes a no-op / conflict-resolution
  bolt. Mitigation: read-before-write every touched file; the assessor
  will close multiple findings from one commit if the work overlaps.
- **Test drift surfaces hidden coupling (medium)** — the
  `IntentReview` / `UnitReview` leaf helpers (`findSection`,
  `getPreamble`, `isImageUrl`) may be imported transitively in places
  grep doesn't catch (e.g. dynamic requires, re-exports via a barrel).
  Mitigation: the builder runs `pnpm --filter haiku-ui test` after
  every migration step, not just at the end.
- **Bundle-size regression (low)** — deleting
  `LegacyReviewPage` should REDUCE bundle, not grow it, but the new
  leaf modules add import boundaries that might bump the module map.
  Mitigation: verify with step (h) above.
- **Unit-13 intent ambiguity (medium)** — the orphan canvas may
  represent unit-13's genuine design thesis (pin state-machine, listener
  budget) that the runtime was supposed to absorb. If the assessor
  flags the orphan-delete as "throwing away unit-13's work," escalate
  to a follow-up unit that properly migrates the runtime canvas to
  unit-13's semantics. Do NOT ship both canvases to paper over the
  decision. This plan opts for deletion because: the orphan is
  unreachable runtime, the runtime canvas is stable, and re-doing the
  canvas is a unit-sized effort, not a fix-bolt-sized one.

## Out of scope

- Rewriting `IntentReview` / `UnitReview` internals. The mandate is to
  MOVE them, not rewrite them. Any internal rework is a separate unit.
- Migrating `FeedbackPanel` / `InlineComments` / `ReviewSidebar`
  cohesion improvements. FB-26 and FB-38 cover those separately.
- Changing the annotation canvas's runtime behavior. Deleting the
  orphan file removes the *duplicate*, not the canvas.
- Paper / website sync. This is an internal package refactor; no
  paper concepts change.

## Done when

- `packages/haiku-ui/src/pages/review/AnnotationCanvas.tsx` and its
  test are gone.
- `LegacyReviewPage` is gone; `components/ReviewPage.tsx` is either
  deleted or reduced to a re-export barrel ≤20 lines.
- `IntentReview`, `UnitReview`, `RereviewBanner`, and
  `ReviewPageSessionData` live under `pages/review/*` in single-
  responsibility modules.
- All imports across `packages/haiku-ui/src` resolve to the new module
  paths; grep returns zero matches for `from.*components/ReviewPage`.
- `pnpm --filter haiku-ui typecheck` and `pnpm --filter haiku-ui test`
  pass.
- Unit-07 + unit-13 deliverables lists match the new file layout.
- Feedback-assessor closes FB-11 (and, if the builder commits the
  cross-link, FB-22 + FB-27) on the next bolt.

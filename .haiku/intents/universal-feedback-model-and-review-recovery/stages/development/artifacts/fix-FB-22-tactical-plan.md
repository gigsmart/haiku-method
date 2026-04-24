# Fix FB-22 — Tactical Plan (planner, bolt 1)

**Finding:** `components/ReviewPage.tsx is a 1659-line monolith that was explicitly not split`.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/22-components-reviewpage-tsx-is-a-1659-line-monolith-that-was-e.md`

## TL;DR

Finish the strangler cutover. Split `packages/haiku-ui/src/components/ReviewPage.tsx`
(1659 LOC) into focused modules under `pages/review/` so the file stops
being both a leaf-component namespace AND an aggregator. Concretely:

1. Extract `IntentReview` → `pages/review/intent/IntentReview.tsx` (≈380 LOC).
2. Extract `UnitReview` → `pages/review/unit/UnitReview.tsx` (≈270 LOC).
3. Extract the shared helpers actually needed by both (`SubReviewProps`,
   `isImageUrl`, `findSection`, `findSectionWithSubs`, `getPreamble`,
   `markdownToSimpleHtml`, `MockupEmbeds`, `OutputArtifactsTab`,
   `UnitsTable`, `formatRelativeTime`) → `pages/review/internal/`.
4. Extract `RereviewBanner` → `pages/review/RereviewBanner.tsx`.
5. Hoist `loadDraft` / `saveDraft` / `DRAFT_STORAGE_KEY` / `ReviewDraft` into
   `hooks/useReviewDraft.ts` as a reusable hook (even though only the
   dead `LegacyReviewPage` consumes it today — either FB-27 deletes the
   file or a future cutover uses the hook; a real module is the correct
   resting place either way).
6. Extract `ReviewPageSessionData` → `pages/review/session-data.ts` (the
   canonical location; `ArtifactsPane`, `ReviewPage`, and all three test
   files import it today from `components/ReviewPage`, which is the
   inverse of the correct dependency direction).
7. Delete `LegacyReviewPage` entirely — it is unreachable. This is the
   same outcome as FB-27 so the two fixes converge. The builder MUST
   re-read the file before writing so that, if FB-27's bolt runs first,
   the deletion is already done and this bolt only has to finish the
   architectural split.
8. Leave `components/ReviewPage.tsx` as a ≤30-line backwards-compat
   shim: re-exports `ReviewPage`, `IntentReview`, `UnitReview`,
   `RereviewBanner`, and `ReviewPageSessionData` from their new
   locations so **no caller outside the file needs to change**. The
   circular inversion (`components/*` importing from `pages/*`) goes
   away in a follow-up bolt that migrates the five external imports;
   that is **out of scope for this bolt** per the "one bolt of work"
   mandate.

Reviewer stops paying the 1659-line cognitive tax. Test blast radius
shrinks because `IntentReview`, `UnitReview`, and the tabs composition
can each be rendered in isolation. The `ArtifactsPane.tsx:1-15`
apology comment ("this unit does not rewrite those views") gets
deleted — the rewrite is now done.

## Root cause

Unit-07 (`units/unit-07-review-page-desktop-and-mobile.md`) shipped
the `pages/review/*` shell as a top-of-file composition and explicitly
deferred splitting the 1400-LOC monolith below it ("tactical plan §14
is explicit that the ~1400-LOC monolith stays in place; only the
top-level composition responsibility moves" — see
`pages/review/ArtifactsPane.tsx:1-15`). That carve-out was defensible
as a single-unit cost cap. Across units 07-15, the carve-out became
permanent and is actively blocking multiple downstream refactors:

- `ArtifactsPane` is a 67-line thin wrapper because `IntentReview` and
  `UnitReview` still live in the legacy file and can't be restyled
  without touching a 1659-line blast radius (cited in FB-22 body).
- Two `AnnotationCanvas` implementations coexist (FB-11) because the
  legacy file hard-codes `components/AnnotationCanvas` while
  `pages/review/AnnotationCanvas.tsx` exists but has no migration
  path — the call sites live inside the monolith.
- The FAB / Sheet duplicates (FB-12) have the same shape: new module
  exists, legacy call site is stuck inside the monolith.
- `LegacyReviewPage` is dead code shipping in the bundle (FB-27).
- The `components/*` directory is polluted with page-layer concerns
  (session state, draft persistence, submission orchestration) — a
  module-boundary violation the file's own docstring at lines 144-155
  now admits.

Net state today:
- `components/ReviewPage.tsx` = 1659 LOC, 4 top-level exported
  components, 9 top-level helpers, 1 localStorage side-effect
  registry.
- `pages/review/ReviewPage.tsx` = 185 LOC, imports back into the
  legacy file for `ReviewPageSessionData`, `RereviewBanner`, and
  (via `ArtifactsPane`) `IntentReview` / `UnitReview`.
- Dependency direction is inverted: `components/*` (which should be
  leaf components) depends on `pages/*` (which should be the
  composer). The only edge that makes sense — `pages/*` using `components/*`
  primitives — is also present, giving the module graph two
  contradictory shapes at once.

## Fix approach

**Strategy: split by responsibility, not by line count.** Each new
module owns ONE component or ONE cohesive helper family. Everything
imported by `pages/review/ReviewPage.tsx` moves to `pages/review/`.
Everything truly shared with other `components/*` files (there is
nothing, empirically — `MockupEmbeds`, `OutputArtifactsTab`,
`UnitsTable`, `isImageUrl`, etc. are only called by `IntentReview` /
`UnitReview`) moves with them.

### Target layout

```
packages/haiku-ui/src/
├── pages/review/
│   ├── ReviewPage.tsx                  (unchanged — 185 LOC shell)
│   ├── ArtifactsPane.tsx               (drop apology docstring;
│   │                                    re-import IntentReview/UnitReview
│   │                                    from their new locations)
│   ├── FeedbackSidebar.tsx             (unchanged)
│   ├── FooterBar.tsx                   (unchanged)
│   ├── useIsMobile.ts                  (unchanged)
│   ├── RereviewBanner.tsx              NEW (≈35 LOC)
│   ├── session-data.ts                 NEW (ReviewPageSessionData +
│   │                                    SubReviewProps type re-exports)
│   ├── intent/
│   │   ├── IntentReview.tsx            NEW (≈380 LOC)
│   │   └── __tests__/ (future)
│   ├── unit/
│   │   ├── UnitReview.tsx              NEW (≈270 LOC)
│   │   └── __tests__/ (future)
│   └── internal/
│       ├── section-helpers.ts          NEW (findSection,
│       │                                findSectionWithSubs,
│       │                                getPreamble, isImageUrl,
│       │                                formatRelativeTime)
│       ├── markdown.ts                 NEW (markdownToSimpleHtml)
│       ├── MockupEmbeds.tsx            NEW (≈40 LOC)
│       ├── OutputArtifactsTab.tsx      NEW (≈180 LOC)
│       └── UnitsTable.tsx              NEW (≈215 LOC)
├── hooks/
│   └── useReviewDraft.ts               NEW (≈75 LOC —
│                                        loadDraft/saveDraft/
│                                        DRAFT_STORAGE_KEY behind
│                                        a hook returning { draft,
│                                        setDraft, clearDraft })
└── components/
    └── ReviewPage.tsx                  SHRUNK to ≤30 LOC re-export shim
```

### Backwards-compat shim contract

The shim at `packages/haiku-ui/src/components/ReviewPage.tsx`
**MUST** re-export at least the symbols that external code imports
today (empirically verified via `grep -r 'from ["\x27][^"\x27]*components/ReviewPage["\x27]'`):

- `ReviewPage` (already comes from `pages/review/ReviewPage`)
- `IntentReview`
- `UnitReview`
- `RereviewBanner`
- `ReviewPageSessionData` (as `type`)

Do NOT re-export:
- `LegacyReviewPage` — it's dead (see FB-27 convergence below).
- `SubReviewProps` — only used internally by the two leaf components;
  keep it co-located in `pages/review/session-data.ts`.

The shim **MUST** carry a file-level docstring explaining it exists
purely for backwards compatibility and that new code **MUST** import
from `pages/review/*` directly. Target file length: ≤30 LOC including
the docstring.

### FB-27 convergence

FB-27 ("LegacyReviewPage is dead code shipped to production") asks for
the same deletion this plan requires. Two possibilities:

1. **FB-27's bolt lands first.** Then `LegacyReviewPage` is already
   gone; this bolt's deletion step is a no-op. Verify via re-read.
2. **This bolt lands first.** Then FB-27's assessor sees the
   deletion already happened and closes the finding on the next
   bolt.

Either way, the outcome is identical. The builder MUST re-read
`packages/haiku-ui/src/components/ReviewPage.tsx` immediately before
writing; if `LegacyReviewPage` is missing, skip that deletion step
and proceed with the split.

### FB-11 partial convergence

FB-11 (duplicate `ReviewPage` + `AnnotationCanvas`) asks for the same
architectural split on the `ReviewPage` side. This bolt addresses
that half. The `AnnotationCanvas` half is FB-11's responsibility —
do NOT also delete or migrate `pages/review/AnnotationCanvas.tsx` in
this bolt. That is a separate consolidation decision and its own fix
chain.

## Files to modify

### New files

1. `packages/haiku-ui/src/pages/review/session-data.ts`
   - Move `ReviewPageSessionData` type definition here verbatim
     from `components/ReviewPage.tsx:23-32`.
   - Move `SubReviewProps` interface here verbatim from
     `components/ReviewPage.tsx:526-533`.
   - Keep the docstring comment explaining why `ReviewSessionPayload`
     is narrowed (currently at `components/ReviewPage.tsx:17-22`).
   - Imports: `ReviewSessionPayload` from `haiku-api`,
     `ParsedIntent`, `ParsedUnit`, `Section` from `../../parsed`,
     `CriterionItem`, `MockupInfo`, `ReviewAnnotations` from `../../types`,
     `AnnotationPin` from `../../components/AnnotationCanvas`,
     `InlineCommentEntry` from `../../components/InlineComments`.

2. `packages/haiku-ui/src/pages/review/RereviewBanner.tsx`
   - Move the `RereviewBanner` function verbatim from
     `components/ReviewPage.tsx:1633-1659`.
   - Import `PreviousReviewSnapshot` from `../../types`.
   - Import `formatRelativeTime` from `./internal/section-helpers`
     (see step 3 below).
   - Export `RereviewBanner` as a named export.

3. `packages/haiku-ui/src/pages/review/internal/section-helpers.ts`
   - Move `isImageUrl` (+ `IMAGE_EXTS` const) verbatim from
     `components/ReviewPage.tsx:56-60`.
   - Move `findSection` verbatim from `components/ReviewPage.tsx:62-70`.
   - Move `findSectionWithSubs` verbatim from `components/ReviewPage.tsx:72-83`.
   - Move `getPreamble` verbatim from `components/ReviewPage.tsx:85-89`.
   - Move `formatRelativeTime` verbatim from `components/ReviewPage.tsx:1616-1627`.
   - Import `Section` from `../../../parsed`.
   - Export each function as named exports.

4. `packages/haiku-ui/src/pages/review/internal/markdown.ts`
   - Move `markdownToSimpleHtml` verbatim from `components/ReviewPage.tsx:1612-1614`.
   - Import `remark`, `remarkGfm`, `remarkHtml`.
   - Export as named export.

5. `packages/haiku-ui/src/pages/review/internal/MockupEmbeds.tsx`
   - Move `MockupEmbeds` verbatim from `components/ReviewPage.tsx:1572-1608`.
   - Import `MockupInfo` from `../../../types`.
   - Import `isImageUrl` from `./section-helpers`.

6. `packages/haiku-ui/src/pages/review/internal/OutputArtifactsTab.tsx`
   - Move `OutputArtifactsTab` verbatim from `components/ReviewPage.tsx:1176-1354`
     (boundaries: function declaration through closing brace).
   - Imports: `useState` from `react`, `Card`, `SectionHeading` from
     `../../../components/Card`, `InlineComments` +
     `InlineCommentEntry` from `../../../components/InlineComments`,
     `OutputArtifact` from `../../../types`, `markdownToSimpleHtml`
     from `./markdown`, and anything else the function body
     references (re-read the body; `@haiku/shared` `StatusBadge` is
     **not** used here — verify with a grep).

7. `packages/haiku-ui/src/pages/review/internal/UnitsTable.tsx`
   - Move `UnitsTable` verbatim from `components/ReviewPage.tsx:1356-1570`
     (boundaries: function declaration through closing brace).
   - Imports: `useState` from `react`, `StatusBadge` from
     `@haiku/shared`, `ParsedUnit` from `../../../parsed`,
     `MockupInfo` from `../../../types`, `InlineComments` +
     `InlineCommentEntry` from `../../../components/InlineComments`,
     `markdownToSimpleHtml` from `./markdown`.

8. `packages/haiku-ui/src/pages/review/intent/IntentReview.tsx`
   - Move `IntentReview` verbatim from `components/ReviewPage.tsx:535-907`.
   - Imports:
     - `useState` from `react`.
     - `CriteriaChecklist`, `MarkdownViewer`, `StatusBadge` from `@haiku/shared`.
     - `Card`, `SectionHeading` from `../../../components/Card`.
     - `InlineComments` from `../../../components/InlineComments`.
     - `MermaidDiagram` from `../../../components/MermaidDiagram`.
     - `AnnotationCanvas` from `../../../components/AnnotationCanvas`
       (keep the legacy 499-line canvas import for now — FB-11
       handles the canvas consolidation separately; do NOT swap to
       `../AnnotationCanvas` inside this bolt).
     - `Tabs`, `TabDef` from `../../../components/Tabs`.
     - `ParsedUnit` from `../../../parsed`.
     - `SubReviewProps` from `../session-data`.
     - `findSection`, `findSectionWithSubs`, `getPreamble`,
       `isImageUrl` from `../internal/section-helpers`.
     - `markdownToSimpleHtml` from `../internal/markdown`.
     - `MockupEmbeds` from `../internal/MockupEmbeds`.
     - `OutputArtifactsTab` from `../internal/OutputArtifactsTab`.
     - `UnitsTable` from `../internal/UnitsTable`.
   - Export `IntentReview` as named export.

9. `packages/haiku-ui/src/pages/review/unit/UnitReview.tsx`
   - Move `UnitReview` verbatim from `components/ReviewPage.tsx:911-1174`.
   - Imports:
     - `useState` from `react`.
     - `CriteriaChecklist`, `MarkdownViewer`, `StatusBadge` from `@haiku/shared`.
     - `Card`, `SectionHeading` from `../../../components/Card`.
     - `InlineComments` from `../../../components/InlineComments`.
     - `AnnotationCanvas` from `../../../components/AnnotationCanvas`.
     - `Tabs`, `TabDef` from `../../../components/Tabs`.
     - `SubReviewProps` from `../session-data`.
     - `findSection`, `getPreamble`, `isImageUrl` from `../internal/section-helpers`.
     - `markdownToSimpleHtml` from `../internal/markdown`.
     - `MockupEmbeds` from `../internal/MockupEmbeds`.
   - Export `UnitReview` as named export.

10. `packages/haiku-ui/src/hooks/useReviewDraft.ts`
    - Hoist `ReviewDraft` interface, `DRAFT_STORAGE_KEY` factory,
      `loadDraft`, `saveDraft` from `components/ReviewPage.tsx:91-142`.
    - Package them as a `useReviewDraft(sessionId)` hook returning
      `{ draft, setDraft, clearDraft }`. Signature:
      ```ts
      export function useReviewDraft(sessionId: string): {
        draft: ReviewDraft
        setDraft: (next: ReviewDraft) => void
        clearDraft: () => void
      }
      ```
    - Export `ReviewDraft` type as named export.
    - Use the debounced localStorage write pattern from the old
      `LegacyReviewPage:265-270` `useEffect`.
    - **No existing consumer.** `LegacyReviewPage` is the only user
      and we're deleting it. The hook is ready for when the
      `pages/review/ReviewPage` composition adds draft persistence
      (not in this bolt). Include a unit test
      `packages/haiku-ui/src/hooks/__tests__/useReviewDraft.test.ts`
      exercising: load-with-no-key returns empty draft,
      load-with-valid-key returns hydrated draft,
      load-with-corrupted-JSON returns empty draft,
      save-then-load round-trips, clear removes the key. This keeps
      the hook from being "test coverage on a future use case" — the
      persistence contract is worth testing regardless of consumer.

### Modify

11. `packages/haiku-ui/src/components/ReviewPage.tsx`
    - Delete everything from line 1 through the end of the file
      **except** the opening docstring (lines 144-155 area).
    - Replace with a ≤30-LOC backwards-compat shim:
      ```ts
      /**
       * Backwards-compatibility shim. The real ReviewPage composition
       * lives at `pages/review/ReviewPage.tsx`; the leaf views live at
       * `pages/review/intent/IntentReview.tsx` and
       * `pages/review/unit/UnitReview.tsx`. New code MUST import from
       * those paths directly. This file exists only so that existing
       * imports from `components/ReviewPage` keep resolving during
       * the strangler cutover — see FB-22.
       */
      export { ReviewPage } from "../pages/review/ReviewPage"
      export { IntentReview } from "../pages/review/intent/IntentReview"
      export { UnitReview } from "../pages/review/unit/UnitReview"
      export { RereviewBanner } from "../pages/review/RereviewBanner"
      export type { ReviewPageSessionData } from "../pages/review/session-data"
      ```
    - No `LegacyReviewPage` export. No helper functions. No side
      effects. No localStorage keys.

12. `packages/haiku-ui/src/pages/review/ArtifactsPane.tsx`
    - Replace the apology docstring at lines 1-16 with a terse
      accurate one: "ArtifactsPane — left column of the review page.
      Delegates to `IntentReview` / `UnitReview` based on
      `session.review_type`."
    - Change imports (lines 20-24):
      ```ts
      import {
          IntentReview,
      } from "./intent/IntentReview"
      import {
          UnitReview,
      } from "./unit/UnitReview"
      import type { ReviewPageSessionData } from "./session-data"
      ```
    - Everything else stays the same.

13. `packages/haiku-ui/src/pages/review/ReviewPage.tsx`
    - Change imports (lines 37-42):
      ```ts
      import { RereviewBanner } from "./RereviewBanner"
      import type { ReviewPageSessionData } from "./session-data"
      ```
      (drop the `../../components/ReviewPage` import entirely).
    - The re-export at line 54 (`export type { ReviewPageSessionData } from "../../components/ReviewPage"`)
      changes to `export type { ReviewPageSessionData } from "./session-data"`.
      The public API of `pages/review/ReviewPage` is preserved.

### Test imports

14. `packages/haiku-ui/src/pages/review/__tests__/layout.test.tsx:34`
    - Change `import type { ReviewPageSessionData } from "../../../components/ReviewPage"`
      to `import type { ReviewPageSessionData } from "../session-data"`.

15. `packages/haiku-ui/src/pages/review/__tests__/responsive.test.tsx:22`
    - Change `import type { ReviewPageSessionData } from "../../../components/ReviewPage"`
      to `import type { ReviewPageSessionData } from "../session-data"`.

16. `packages/haiku-ui/src/pages/review/__tests__/status-announce.test.tsx:19`
    - Change `import type { ReviewPageSessionData } from "../../../components/ReviewPage"`
      to `import type { ReviewPageSessionData } from "../session-data"`.

    These three test files are the only tests that currently import
    from `components/ReviewPage`. They get the canonical path at the
    same time the production code does. The `components/ReviewPage`
    shim still re-exports the type, so leaving the test imports
    untouched would also work — but updating them is 3 one-line
    edits that remove the last non-shim consumer of the legacy
    location.

### Unit-spec alignment

17. `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/units/unit-07-review-page-desktop-and-mobile.md`
    - Locate the line(s) in the unit's `Scope` / `Boundaries` /
      `Known Risks (Accepted)` block that enshrine "the ~1400-LOC
      monolith stays in place" (this is the carve-out the
      `ArtifactsPane.tsx:1-15` comment is quoting). Rewrite that
      carve-out to: "The 1400-LOC `components/ReviewPage.tsx` stays
      in place during this unit; unit-07 only moves the top-level
      composition. The monolith is split in a follow-up fix loop
      (see FB-22)." — the historical scope record stays truthful;
      the future-directed language that kept blocking downstream
      work goes away.
    - If there is an explicit "out of scope" bullet that says
      "rewriting the monolith," leave that bullet intact — it was
      true at the time of unit-07 — but add a trailing note:
      "(Split completed in FB-22 fix bolt, 2026-04-21.)"

18. `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/units/unit-06-shell-and-routing.md`,
    `unit-08-feedback-components.md`, `unit-09-agent-feedback-toggle.md`,
    `unit-10-feedback-sheet-mobile.md`, `unit-13-annotation-canvas.md`,
    `unit-15-stagewide-audit.md`
    - Re-read each one. If any has a boilerplate reference to
      "legacy ReviewPage monolith" or "components/ReviewPage.tsx
      stays in place," it can stay — those are historical records of
      what the unit's scope WAS. Do **not** edit these unless the
      acceptance criteria would now be falsified by the split (e.g.
      an acceptance line that says "import IntentReview from
      components/ReviewPage"). If you find such a line, rewrite it
      to use the new path.

## Verification commands

Run from the worktree root after the builder bolt:

```bash
# (a) The legacy file is a shim (≤30 LOC)
test "$(wc -l < packages/haiku-ui/src/components/ReviewPage.tsx)" -le 30

# (b) LegacyReviewPage is gone from the source tree
! grep -q "^export function LegacyReviewPage" packages/haiku-ui/src/components/ReviewPage.tsx
! grep -rq "LegacyReviewPage" packages/haiku-ui/src --include="*.ts" --include="*.tsx"

# (c) The new modules exist
test -f packages/haiku-ui/src/pages/review/session-data.ts
test -f packages/haiku-ui/src/pages/review/RereviewBanner.tsx
test -f packages/haiku-ui/src/pages/review/intent/IntentReview.tsx
test -f packages/haiku-ui/src/pages/review/unit/UnitReview.tsx
test -f packages/haiku-ui/src/pages/review/internal/section-helpers.ts
test -f packages/haiku-ui/src/pages/review/internal/markdown.ts
test -f packages/haiku-ui/src/pages/review/internal/MockupEmbeds.tsx
test -f packages/haiku-ui/src/pages/review/internal/OutputArtifactsTab.tsx
test -f packages/haiku-ui/src/pages/review/internal/UnitsTable.tsx
test -f packages/haiku-ui/src/hooks/useReviewDraft.ts
test -f packages/haiku-ui/src/hooks/__tests__/useReviewDraft.test.ts

# (d) No module in the new layout exceeds 400 LOC (intent view is
#     the biggest; everything else is ≤270).
for f in \
  packages/haiku-ui/src/pages/review/intent/IntentReview.tsx \
  packages/haiku-ui/src/pages/review/unit/UnitReview.tsx \
  packages/haiku-ui/src/pages/review/internal/OutputArtifactsTab.tsx \
  packages/haiku-ui/src/pages/review/internal/UnitsTable.tsx; do
  n=$(wc -l < "$f")
  test "$n" -le 400 || { echo "BUDGET BLOWN: $f = $n LOC"; exit 1; }
done

# (e) ArtifactsPane no longer imports from components/ReviewPage
! grep -q 'components/ReviewPage' packages/haiku-ui/src/pages/review/ArtifactsPane.tsx

# (f) pages/review/ReviewPage.tsx no longer imports from components/ReviewPage
! grep -q 'components/ReviewPage' packages/haiku-ui/src/pages/review/ReviewPage.tsx

# (g) Test files use the new session-data path
grep -q 'from "../session-data"' packages/haiku-ui/src/pages/review/__tests__/layout.test.tsx
grep -q 'from "../session-data"' packages/haiku-ui/src/pages/review/__tests__/responsive.test.tsx
grep -q 'from "../session-data"' packages/haiku-ui/src/pages/review/__tests__/status-announce.test.tsx

# (h) The compat shim re-exports the five canonical symbols
grep -q 'export { ReviewPage }' packages/haiku-ui/src/components/ReviewPage.tsx
grep -q 'export { IntentReview }' packages/haiku-ui/src/components/ReviewPage.tsx
grep -q 'export { UnitReview }' packages/haiku-ui/src/components/ReviewPage.tsx
grep -q 'export { RereviewBanner }' packages/haiku-ui/src/components/ReviewPage.tsx
grep -q 'export type { ReviewPageSessionData }' packages/haiku-ui/src/components/ReviewPage.tsx

# (i) TypeScript compiles
pnpm --filter haiku-ui typecheck
# or: npx tsc --noEmit -p packages/haiku-ui

# (j) Full test suite green
pnpm --filter haiku-ui test

# (k) Build succeeds (bundle regen)
pnpm --filter haiku-ui build

# (l) Bundle size delta — capture before/after for the commit body.
#     Expected: a small reduction (~5-8 KB gzipped) from deleting
#     LegacyReviewPage. Not a required pass threshold for FB-22;
#     FB-21 owns the 500 KB ceiling.
ls -l packages/haiku-ui/dist/assets/*.js
```

## Handoff to the builder

1. Work on the current branch
   (`haiku/universal-feedback-model-and-review-recovery/development`).
2. **Read every file immediately before writing.** This fix loop
   runs in parallel with other chains. In particular:
   - `packages/haiku-ui/src/components/ReviewPage.tsx` is the
     biggest parallel-clobber risk. FB-27 targets `LegacyReviewPage`
     directly. FB-11 targets the broader duplication. FB-38 (pages/
     review/FeedbackSidebar.tsx mixes 3 components internally) may
     also land reshuffles. Re-read the file, not the line numbers
     in this plan, before writing.
   - `packages/haiku-ui/src/pages/review/ReviewPage.tsx` and
     `ArtifactsPane.tsx` — re-read before editing imports.
   - The three `__tests__/` files — re-read before updating imports.
3. Commit as a **single cohesive commit** with message
   `haiku: fix FB-22 bolt 1 (builder)`. The split is mechanical
   once the plan is set; one commit, no intermediate push.
4. Run verification commands (a)-(k) and paste the output into the
   commit body. (l) is nice-to-have.
5. If `pnpm --filter haiku-ui test` surfaces any failure — pre-existing
   or new — **do not use "pre-existing" as an excuse**. The
   no-excuses policy applies. Triage, fix anything the split
   touched (import resolution, circular refs, type shape drift).

## Risks

- **Parallel-chain clobber (high)** — this bolt touches the single
  highest-contention file in the repo (`components/ReviewPage.tsx`).
  FB-27 (delete `LegacyReviewPage`) and FB-11 (duplicate
  ReviewPage/AnnotationCanvas) converge on the same file. Mitigation:
  re-read the file immediately before writing; if
  `LegacyReviewPage` is already gone, skip the deletion and proceed
  with the split; if `IntentReview` / `UnitReview` have already been
  extracted by another chain, reconcile by treating this bolt as a
  no-op on those files and focusing only on the test-import + shim
  rewrite. The assessor will catch any gap; the FSM retries.

- **Circular re-export (medium)** — the new shim at
  `components/ReviewPage.tsx` re-exports from `pages/review/*`. The
  `pages/review/*` modules import from `components/*` (e.g.
  `AnnotationCanvas`, `Card`, `InlineComments`, `MermaidDiagram`,
  `Tabs`). That's fine — the shim does NOT import back from
  `pages/review/*` internally; it only re-exports. Verify with a
  `pnpm typecheck` that TypeScript's module resolver is happy. If
  it complains about a cycle, the fix is usually to inline the
  re-exported type in the shim (rather than re-export) — but only if
  the cycle is real, not a phantom from an import-graph linter.

- **Blast-radius test failures (medium)** — moving `IntentReview`
  and `UnitReview` changes the React component identity as far as
  `React.createElement` is concerned (same component function, new
  module). Tests that use `displayName`-based assertions or that
  do instance-level equality checks could fail. Mitigation: don't
  rename the exported function names; the function *name* is
  preserved, only the import path changes. Display names
  automatically track function names in React DevTools.

- **Bundle-graph shifts (low)** — splitting into 9 files instead of
  1 changes what Rollup / esbuild can tree-shake. In practice, the
  `inlineDynamicImports: true` + `manualChunks: undefined` Vite
  config means everything still lands in one chunk, so the bundle
  size delta is bounded by (a) `LegacyReviewPage` deletion (≈5-8 KB
  gzipped saved, per FB-27) and (b) a handful of extra module
  boundaries (≈200-400 B of overhead). Net: should improve, not
  regress. If the build surfaces new top-level side effects that
  weren't captured before, fix them — they were bugs the
  mega-module was hiding.

- **FB-11 canvas swap drift (low)** — this plan explicitly keeps
  `AnnotationCanvas` imports pointed at `components/AnnotationCanvas`
  (the 499-LOC legacy). If FB-11's bolt lands first and consolidates
  the two canvases under `pages/review/AnnotationCanvas`, the
  imports in the new `IntentReview.tsx` / `UnitReview.tsx` modules
  will need to be re-pointed. Mitigation: builder re-reads; if the
  legacy `components/AnnotationCanvas` is gone, use the new path.
  Otherwise, preserve the existing import and let FB-11's next bolt
  do the swap.

- **"Split for split's sake" criticism (low)** — a reviewer could
  argue 9 modules is over-engineered. Response: the architecture
  mandate's test is not module count, it's that each module has one
  responsibility, external consumers see a stable API, and future
  edits touch ≤1 file. All three hold here. The `internal/`
  subdirectory specifically hides implementation helpers from the
  public import surface so nobody outside `pages/review/` can
  depend on them.

## Out of scope

- **Migrating external imports off `components/ReviewPage`.** The
  five external consumers (three tests, two production modules in
  `pages/review/*`) get updated to the new paths in this bolt. But
  the compat shim stays. A follow-up unit or fix bolt can delete
  the shim entirely once `grep -r "components/ReviewPage"
  packages/haiku-ui/src` returns zero — currently blocked only by
  the shim itself being a load-bearing re-export the linter uses.
  Do NOT delete the shim in this bolt.

- **Consolidating the two `AnnotationCanvas` implementations** —
  that's FB-11's job. Keep the legacy canvas import wired.

- **Consolidating the two `FeedbackSidebar` styles / FAB duplicates**
  — that's FB-12 and FB-38's job. The FeedbackSidebar composition
  at `pages/review/FeedbackSidebar.tsx` is not touched here; the
  `LegacyReviewPage`-era `ReviewSidebar` + `FeedbackPanel` wiring
  (lines 464-518 in the legacy file) is **deleted with the
  monolith**, not migrated. If anyone later argues the tabbed
  sidebar needs to come back, that's a new unit with real design
  input — not a fix-loop deliverable.

- **Using `useReviewDraft` in the live composition.**
  `pages/review/ReviewPage.tsx` currently has no draft persistence
  (the feature lived only in `LegacyReviewPage`). Adding draft
  persistence to the live composition is a design call the current
  unit scope does not cover. Hoist the hook; wire it later.

- **Paper / website sync.** This is an internal package refactor.
  No concepts change.

## Done when

- `packages/haiku-ui/src/components/ReviewPage.tsx` is ≤30 LOC and
  is a pure re-export shim.
- `LegacyReviewPage` is not a symbol anywhere in `packages/haiku-ui/src`.
- `IntentReview`, `UnitReview`, `RereviewBanner` live in their own
  modules under `pages/review/`.
- `ReviewPageSessionData` and `SubReviewProps` live in
  `pages/review/session-data.ts`.
- The shared helpers (`isImageUrl`, `findSection`,
  `findSectionWithSubs`, `getPreamble`, `markdownToSimpleHtml`,
  `formatRelativeTime`) live in
  `pages/review/internal/section-helpers.ts` and
  `pages/review/internal/markdown.ts`.
- `MockupEmbeds`, `OutputArtifactsTab`, `UnitsTable` live in
  `pages/review/internal/*`.
- `useReviewDraft` hook exists under `hooks/`, has a test, and is
  ready for a future consumer.
- `ArtifactsPane.tsx` imports from the new locations; its docstring
  no longer apologizes for leaving the monolith in place.
- `pages/review/ReviewPage.tsx` re-exports `ReviewPageSessionData`
  from `./session-data` (not from `components/ReviewPage`).
- The three existing review tests import `ReviewPageSessionData`
  from `../session-data`.
- `pnpm --filter haiku-ui typecheck`, `pnpm --filter haiku-ui test`,
  and `pnpm --filter haiku-ui build` all pass.
- Feedback-assessor closes FB-22 on the next bolt.

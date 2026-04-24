# Fix FB-38 — Tactical Plan (planner, bolt 1)

**Finding:** `pages/review/FeedbackSidebar.tsx mixes 3 components + internal hook in one file`.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/38-pages-review-feedbacksidebar-tsx-mixes-3-components-internal.md`

## TL;DR

`packages/haiku-ui/src/pages/review/FeedbackSidebar.tsx` currently exports
three unrelated top-level components (`FeedbackSidebar`, `FeedbackFloatingButton`,
`FeedbackSheet`) plus a private hook (`useFeedbackSidebarController`), a
private body helper (`FeedbackPanelBody`), and a free announcement helper
(`statusAnnouncement`). The reviewer's fix prescription is the right shape:
hoist the shared hook + body into their own modules, and give each component
its own file. The remaining `pages/review`-vs-`components/feedback` duplication
call-out belongs to FB-12 — this fix does not remove or rename the mobile
variants, only splits them into separate files so FB-12 can act on them later
without also re-splitting this monolith.

## Root cause

The defense comment at the top of the file says the mobile variants "live in
this file by design — they share ~80% of the desktop plumbing and splitting
them would duplicate the `useFeedback` wiring." That argument conflates two
things: the *wiring* (which is the hook `useFeedbackSidebarController`) and
the *components that use it*. Hooks cross file boundaries at zero cost —
they do not get re-instantiated per import, and they do not re-run `useFeedback`.
Once the hook is in its own file, each component file imports the hook and
the `useFeedback` wiring stays singular in effect. The "can't split because
wiring" justification is wrong.

The structural cost of the current layout:

- Grepping for the FAB by file name fails (`FeedbackSidebar.tsx` does not
  match `grep -rn "FeedbackFloatingButton" --include="*.tsx" -l` expectations
  that the file name tracks the top-level export).
- Tree-shaking and reviewer co-location both suffer. A consumer that only
  wants the FAB still pulls in `FeedbackSidebar`'s imports at dev-server
  resolve time.
- It is the only file in `pages/review/` that breaks the one-top-level-per-file
  convention (`AnnotationCanvas.tsx`, `ArtifactsPane.tsx`, `FooterBar.tsx`,
  `ReviewPage.tsx` all follow it).

## Fix approach

Split `packages/haiku-ui/src/pages/review/FeedbackSidebar.tsx` into five
files in the same directory, keeping their public behaviour bit-identical.

1. `pages/review/useFeedbackSidebarController.ts`
   - Exports `useFeedbackSidebarController(intent, stage)` (the hook).
   - Exports `statusAnnouncement(id, next)` (the announce phrasing helper)
     so the hook and any future test importer can reach it. The helper was
     previously file-private; now it becomes a module-scoped named export.
   - Exports the controller return type interface
     (`UseFeedbackSidebarControllerResult`) so that `FeedbackPanelBody` and
     any future consumer don't have to redeclare it.
   - Does NOT export `FeedbackPanelBody` — that's a view concern, not hook.

2. `pages/review/FeedbackPanelBody.tsx`
   - Exports the previously-private `FeedbackPanelBody` component and its
     `FeedbackPanelBodyProps` type.
   - Named export only — it is a shared helper, not a page-level component.

3. `pages/review/FeedbackSidebar.tsx`
   - Retains only the desktop `FeedbackSidebar` component and its
     `FeedbackSidebarProps` type.
   - Imports `useFeedbackSidebarController` from `./useFeedbackSidebarController`
     and `FeedbackPanelBody` from `./FeedbackPanelBody`.
   - Docstring trimmed: remove the "Mobile variants live in this file by
     design" paragraph — no longer true. Keep the brief note about what the
     desktop composition does.

4. `pages/review/FeedbackFloatingButton.tsx`
   - Exports `FeedbackFloatingButton` and `FeedbackFloatingButtonProps`.
   - Pure presentational — no hook import needed; only its a11y / style
     imports from `../../a11y`.

5. `pages/review/FeedbackSheet.tsx`
   - Exports `FeedbackSheet` and `FeedbackSheetProps`.
   - Imports `useFeedbackSidebarController` from
     `./useFeedbackSidebarController` and `FeedbackPanelBody` from
     `./FeedbackPanelBody`.

### Callers to update

Only one production caller imports the three components together:

- `packages/haiku-ui/src/pages/review/ReviewPage.tsx` — currently:
  ```ts
  import {
      FeedbackFloatingButton,
      FeedbackSheet,
      FeedbackSidebar,
  } from "./FeedbackSidebar"
  ```
  After split, change to three separate imports from the three new files.

No other production file imports from `./FeedbackSidebar`. Tests in
`pages/review/__tests__/` only reference the names in prose comments
(`layout.test.tsx` line 23 mentions `FeedbackSheet` in a docstring).

### Namespace collision check

The canonical `packages/haiku-ui/src/components/feedback/FeedbackFloatingButton.tsx`
and `.../FeedbackSheet.tsx` already exist with the same exported names. The
`pages/review`-local variants I am creating have the same filename but live
in a different directory (`pages/review/`), so no import-path collision —
importers continue to disambiguate by path (`./FeedbackFloatingButton`
relative-import inside `pages/review/` vs `../../components/feedback`
elsewhere). The duplication of the *names themselves* across the two trees
is the core of FB-12 — out of scope for this fix.

## Files to modify

- `packages/haiku-ui/src/pages/review/FeedbackSidebar.tsx` — slim to desktop-only.
- `packages/haiku-ui/src/pages/review/useFeedbackSidebarController.ts` — new.
- `packages/haiku-ui/src/pages/review/FeedbackPanelBody.tsx` — new.
- `packages/haiku-ui/src/pages/review/FeedbackFloatingButton.tsx` — new.
- `packages/haiku-ui/src/pages/review/FeedbackSheet.tsx` — new.
- `packages/haiku-ui/src/pages/review/ReviewPage.tsx` — update the three imports.

## Verification

1. `cd packages/haiku-ui && npx tsc --noEmit` — compile clean.
2. Grep for any stale imports: `grep -rn "from \"[^\"]*FeedbackSidebar\"" packages/haiku-ui/src` — should only yield the new slim re-import in `ReviewPage.tsx`, and the new file itself should only export `FeedbackSidebar`.
3. `grep -n "FeedbackPanelBody\|FeedbackFloatingButton\|FeedbackSheet\|useFeedbackSidebarController" packages/haiku-ui/src/pages/review/FeedbackSidebar.tsx` — all four names are gone from this file except the imports it needs for its own composition (only `useFeedbackSidebarController` + `FeedbackPanelBody`).

## Risks

- `React.ReactElement` return types are already used in the original; new
  files must keep them to preserve `--strict` inference.
- Keep the named-export pattern exactly as it was; consumers use named
  imports.
- Do not change the `xl:hidden` / `xl:flex` breakpoint conditions —
  adjusting the mobile breakpoint is FB-16's scope.
- Do not re-home these to `components/feedback/` — that is FB-12's call.

## Anti-patterns avoided

- No new unit spec created — strict fix-mode.
- No FSM field touched.
- No behavioural change: the split preserves every prop, every handler, every
  className string verbatim.

# Fix FB-12 — Tactical Plan (planner, bolt 1)

**Finding:** `Duplicate FeedbackSheet + FeedbackFloatingButton with incompatible APIs`.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/12-duplicate-feedbacksheet-feedbackfloatingbutton-with-incompat.md`

## TL;DR

Two `FeedbackSheet` and two `FeedbackFloatingButton` components exist in
`packages/haiku-ui` with incompatible prop signatures. The review page
(`pages/review/ReviewPage.tsx`) renders the **placeholder** variants
declared inline in `pages/review/FeedbackSidebar.tsx`, while the
a11y-complete **canonical** variants in `components/feedback/` (shipped
by unit-10, snapshot-tested, ref-forwarding, native `<dialog>` with
focus-trap, `aria-haspopup="dialog"`, dynamic accessible name) are dead
code in the runtime graph.

Fix: **delete the inline duplicates** in `pages/review/FeedbackSidebar.tsx`
and wire `ReviewPage.tsx` to the canonical `components/feedback` exports.
Extract the sheet body wiring (`FeedbackPanelBody` + controller hook)
into reusable exports so the canonical `FeedbackSheet` can receive the
same content as the desktop sidebar via `children`.

## Root cause

Unit-07 shipped the review-page composition shell (split, FAB + sheet
render points) before unit-10 shipped the canonical FAB + sheet. The
unit-07 author put **placeholder** FAB / sheet components inline in
`FeedbackSidebar.tsx` with a docstring pointer saying "unit-10 upgrades
the sheet with focus-trap-react semantics + main-content `aria-hidden`
contract; this unit ships the placeholder state machine only."

Unit-10 then landed the canonical `FeedbackSheet` and
`FeedbackFloatingButton` under `components/feedback/`, snapshot-tested
and exported via the barrel — but **never cut over the review page to
use them**. The upgrade step the docstring promised was forgotten. The
inline placeholders stayed and the canonical components became
unreachable from the runtime graph.

## API divergence matrix

| Prop           | Inline (placeholder) FAB              | Canonical FAB (`components/feedback/FeedbackFloatingButton.tsx`) |
|----------------|---------------------------------------|------------------------------------------------------------------|
| Handler        | `onClick: () => void`                 | `onToggle: () => void`                                           |
| Open flag      | `isOpen: boolean`                     | `open: boolean`                                                  |
| Count          | `pendingCount?: number`               | `count?: number`                                                 |
| ref-forwarding | no                                    | `forwardRef<HTMLButtonElement>`                                  |
| aria-controls  | hardcoded `"feedback-sheet"`          | `ariaControlsId?: string` (default `"feedback-sheet"`)           |
| Dynamic label  | no (`aria-label="Open feedback panel"`) | yes (`"Open feedback panel, {n} pending"` when `count > 0`)    |

| Prop           | Inline (placeholder) Sheet            | Canonical Sheet (`components/feedback/FeedbackSheet.tsx`)        |
|----------------|---------------------------------------|------------------------------------------------------------------|
| Open flag      | `isOpen: boolean`                     | `open: boolean`                                                  |
| Data props     | `intent / stage / sessionId`          | `title / titleId / id / triggerRef / children / className`       |
| Root element   | `<div role="dialog" hidden={!open}>`  | `<dialog role="dialog" aria-modal="true">` + imperative `showModal()` |
| Focus trap     | none (docstring defers to unit-10)    | `useFocusTrap(dialogRef, open)`                                  |
| Backdrop close | none                                  | click handler on `event.target === dialog`                       |
| Reduced motion | none                                  | `useReducedMotion()` swaps `sheet-enter` → `sheet-enter--reduced` |
| Body content   | hardcoded `<FeedbackPanelBody />`     | `children` (caller composes)                                     |
| Accessible name | hardcoded `<h2 id="feedback-sheet-title">Feedback</h2>` | `<h2 id={titleId ?? "feedback-sheet-title"}>{title ?? "Feedback"}</h2>` |

The canonical variants are strictly a superset in capability. The inline
ones provide zero features the canonical ones don't — they are pure dead
weight that happens to sit on the runtime path.

## Fix approach

**Strategy: delete the inline placeholders, compose the canonical
components in `ReviewPage.tsx` with the existing controller hook +
`FeedbackPanelBody` content.**

Keep the desktop `FeedbackSidebar` composition as-is — it's fine. The
shared wiring (`useFeedbackSidebarController`, `FeedbackPanelBody`) gets
exported so the mobile branch in `ReviewPage.tsx` can hand the same
content to the canonical `FeedbackSheet` via `children`.

Add a single `data-testid="feedback-sheet"` to the canonical sheet root
so the existing `layout.test.tsx` assertion
(`screen.getByTestId("feedback-sheet")` → `role="dialog"`) keeps passing
without a test rewrite. This is a 1-line addition to an existing
component and requires a snapshot update, which is expected and
intentional.

## Files to modify

### 1. `packages/haiku-ui/src/pages/review/FeedbackSidebar.tsx`
- **Delete lines 181-215**: the inline `FeedbackFloatingButton` export
  and its `FeedbackFloatingButtonProps` interface.
- **Delete lines 217-291**: the inline `FeedbackSheet` export and its
  `FeedbackSheetProps` interface.
- **Update the file docstring (lines 13-17)**: remove the "Mobile variants
  (`FeedbackFloatingButton`, `FeedbackSheet`) live in this file by
  design — ... this unit ships the placeholder state machine only."
  paragraph. Replace with a short note that mobile affordances are
  composed in `ReviewPage.tsx` from the canonical
  `components/feedback/*` exports, and that this file owns the desktop
  sidebar plus the shared controller/body that both branches share.
- **Export** the existing `useFeedbackSidebarController` hook (add
  `export` keyword at line 98) and the existing `FeedbackPanelBody`
  function (add `export` keyword at line 60) — and their prop/return
  types — so `ReviewPage.tsx` can compose them with the canonical
  `FeedbackSheet`.

### 2. `packages/haiku-ui/src/pages/review/ReviewPage.tsx`
- **Lines 45-49**: replace the import
  `{ FeedbackFloatingButton, FeedbackSheet, FeedbackSidebar } from "./FeedbackSidebar"`
  with:
  - `FeedbackSidebar`, `useFeedbackSidebarController`, and
    `FeedbackPanelBody` from `./FeedbackSidebar`, and
  - `FeedbackFloatingButton`, `FeedbackSheet` from
    `"../../components/feedback"`.
- **Line 87**: keep `useState<boolean>` for `sheetOpen`.
- **Add a ref**: `const fabRef = useRef<HTMLButtonElement>(null)` at the
  top of the component body (paired with the canonical FAB's
  `forwardRef`).
- **Lines 170-180**: replace the mobile-branch JSX:
  ```tsx
  <FeedbackFloatingButton
    ref={fabRef}
    open={sheetOpen}
    onToggle={() => setSheetOpen((o) => !o)}
    count={pendingCount /* see §3 below */}
  />
  <FeedbackSheet
    open={sheetOpen}
    onClose={() => setSheetOpen(false)}
    triggerRef={fabRef}
    title="Feedback"
  >
    <FeedbackPanelBody {...bodyProps} />
  </FeedbackSheet>
  ```
- Drive `bodyProps` from the shared hook:
  ```tsx
  const mobileController = useFeedbackSidebarController(intentSlug, activeStage)
  const mobileBodyProps = {
    items: mobileController.items,
    loading: mobileController.loading,
    error: mobileController.error,
    onStatusChange: mobileController.handleStatusChange,
    onDelete: mobileController.handleDelete,
    onRetry: mobileController.retry,
  }
  ```
  The hook is the same one the desktop `FeedbackSidebar` uses
  internally — we get identical status-announce behavior, identical
  optimistic UI, identical refetch on failure, no duplication.

### 3. Pending-count source
- The inline FAB passed no `pendingCount` (so badge never rendered).
  Keep that behavior in bolt 1 to stay in FB-12's scope: either pass
  `undefined` explicitly or omit the prop.
- A follow-up can wire the real pending count from
  `mobileController.items.filter(i => i.status === "pending").length` —
  that is a **badge-surfacing feature**, not a duplicate-deletion fix,
  and the feedback body is silent on it. Do not widen scope here; the
  assessor can open a new finding if the badge absence regresses.

### 4. `packages/haiku-ui/src/components/feedback/FeedbackSheet.tsx`
- **Line ~248 (the `<dialog>` element opening tag)**: add
  `data-testid={resolvedId}` so the default `id="feedback-sheet"`
  renders as `data-testid="feedback-sheet"`. This preserves the
  existing `layout.test.tsx` assertion without edits.
- **Update the snapshot**:
  `packages/haiku-ui/src/components/feedback/__tests__/__snapshots__/FeedbackSheet.states.test.tsx.snap`
  will diff by one attribute on each snapshot cell. Regenerate with
  `pnpm --filter haiku-ui test -- -u FeedbackSheet.states` or
  equivalent. The diff is a one-attribute addition, visually trivial.
- No other canonical-file changes required. The canonical FAB already
  renders `data-testid="feedback-fab"` (line 111) so the existing
  mobile-branch FAB assertion continues to pass.

### 5. Tests — no behavior edits required, but verify
- `packages/haiku-ui/src/pages/review/__tests__/layout.test.tsx` —
  desktop branch asserts `queryByTestId("feedback-fab") === null` and
  `queryByTestId("feedback-sheet") === null`. The canonical `FeedbackSheet`
  **always renders** its `<dialog>` (the `open` prop only drives
  imperative `showModal()`), so on desktop the test will now find a
  `feedback-sheet` in the DOM even though `isMobile` is false.
  - **Mitigation**: the desktop branch already guards `FeedbackSheet`
    inside `{isMobile && (...)}` — the sheet is not rendered at all on
    desktop. This assertion keeps passing because the component is not
    mounted. No test edits.
  - **Mobile branch**: `getByTestId("feedback-sheet")` returns the
    canonical `<dialog>` element with `role="dialog"` — assertion
    continues to pass after step 4 above adds the testid.
- `packages/haiku-ui/src/pages/review/__tests__/responsive.test.tsx`
  and `status-announce.test.tsx` — re-run and confirm no regressions;
  they do not directly assert on `FeedbackSheet` internals.
- `packages/haiku-ui/src/components/feedback/__tests__/FeedbackSheet.test.tsx`,
  `FeedbackSheet.states.test.tsx`,
  `FeedbackFloatingButton.states.test.tsx`, and
  `FeedbackFloatingButton.test.tsx` — all continue to exercise the
  canonical components directly, no changes.

### 6. Unit-10 spec alignment (single line check, no edit expected)
- `.haiku/intents/.../stages/development/units/unit-10-feedback-sheet-mobile.md`
  declares `FeedbackSheet` and `FeedbackFloatingButton` as its
  deliverables at the canonical paths. That spec is already correct —
  the bug was that unit-07's placeholders were never cut over when
  unit-10 landed. No unit-spec edit is required.

## Verification commands

Run from the worktree root after the builder bolt:

```bash
# (a) No inline FeedbackSheet or FeedbackFloatingButton exports survive in
#     pages/review/FeedbackSidebar.tsx
! grep -qE 'export (function|const) FeedbackFloatingButton' packages/haiku-ui/src/pages/review/FeedbackSidebar.tsx
! grep -qE 'export (function|const) FeedbackSheet' packages/haiku-ui/src/pages/review/FeedbackSidebar.tsx

# (b) ReviewPage imports the canonical variants from components/feedback
grep -q "from \"../../components/feedback\"" packages/haiku-ui/src/pages/review/ReviewPage.tsx
grep -qE "FeedbackFloatingButton|FeedbackSheet" packages/haiku-ui/src/pages/review/ReviewPage.tsx

# (c) The canonical sheet carries the layout-test testid
grep -q 'data-testid={resolvedId}' packages/haiku-ui/src/components/feedback/FeedbackSheet.tsx

# (d) Controller hook and body are now exported
grep -qE 'export function FeedbackPanelBody' packages/haiku-ui/src/pages/review/FeedbackSidebar.tsx
grep -qE 'export function useFeedbackSidebarController' packages/haiku-ui/src/pages/review/FeedbackSidebar.tsx

# (e) Type-check the package
pnpm --filter haiku-ui typecheck

# (f) Unit + integration tests (includes snapshot re-gen if needed)
pnpm --filter haiku-ui test

# (g) Build — ensures the tree shakes cleanly and no runtime imports break
pnpm --filter haiku-ui build
```

## Handoff to the builder

1. Work on the current branch
   (`haiku/universal-feedback-model-and-review-recovery/development`).
2. Read each file immediately before writing — parallel fix chains may
   be editing sibling files in
   `packages/haiku-ui/src/pages/review/` (FB-22, FB-38) and
   `packages/haiku-ui/src/components/feedback/` (FB-34, FB-60, FB-70).
   If a parallel chain already refactored something you expected to see,
   reconcile; don't clobber.
3. Do the deletion + rewire as a single commit:
   `haiku: fix FB-12 bolt 2 (builder)`. Do NOT push.
4. Regenerate the snapshot (`FeedbackSheet.states.test.tsx.snap`) with
   `-u` as part of the same commit so the diff is self-contained.
5. Run verification steps (a)–(g) and paste the tail of the output into
   the commit message so the assessor can close cleanly.

## Risks

- **Parallel-chain clobber (medium)** — FB-34 (role="dialog" on
  `<div>`) targets the inline sheet's root element. If FB-34's fix
  chain ran first, the inline sheet may already be a `<dialog>`; in
  that case the deletion here still lands cleanly because FB-12's
  remedy subsumes FB-34's — deleting the file closes both findings.
  The assessor should notice and close both.
- **Snapshot churn (low)** — step 4 rewrites one snapshot. The diff
  is a single attribute (`data-testid="feedback-sheet"`) per cell, which
  is trivially reviewable. Do not batch unrelated snapshot updates.
- **Breakpoint mismatch with canonical FAB (out of scope)** — the
  canonical FAB uses `md:hidden`, the desktop sidebar uses `xl:flex`.
  There is a gap between `md` (768px) and `xl` (1280px) where neither
  renders without the `useIsMobile` gate. The review page already
  guards both branches behind `{isMobile && ...}` and
  `{!isMobile && <FeedbackSidebar>}`, so the CSS class mismatch is
  masked at runtime — no bug surfaces from this fix. FB-16 covers the
  underlying `md` vs `xl` inconsistency; do not widen scope here.
- **`pendingCount` regression (low)** — see §3. The inline FAB never
  rendered a badge, so dropping the badge-count prop keeps behavior
  identical. Follow-up finding, not this one.
- **Mobile sheet placeholder banner (low)** — the inline sheet renders
  an amber "Mobile review experience is under construction — unit-10
  will ship full dialog semantics" banner. That banner is cosmetic
  in-development messaging, contradicted by the fact that unit-10 HAS
  shipped. Deleting the inline sheet deletes the banner; the canonical
  sheet correctly does not render it. This is the intended outcome.

## Out of scope

- Pending-count badge wiring (§3). Follow-up finding if needed.
- `md:hidden` vs `xl:hidden` breakpoint reconciliation (FB-16 owns it).
- Any `FeedbackSidebar` desktop-side refactor. The desktop sidebar is
  fine — only the inline mobile duplicates are removed.
- Paper / website sync. No concept changes; purely an internal
  `packages/haiku-ui` refactor.
- `FeedbackPanel` compatibility shim (FB-26 owns it separately).

## Done when

- `pages/review/FeedbackSidebar.tsx` no longer exports
  `FeedbackFloatingButton` or `FeedbackSheet` (or their prop types).
- `pages/review/ReviewPage.tsx` imports
  `FeedbackFloatingButton` + `FeedbackSheet` from
  `../../components/feedback` and composes the canonical FAB + sheet
  pair with `ref={fabRef}` + `triggerRef={fabRef}`.
- `useFeedbackSidebarController` and `FeedbackPanelBody` are public
  exports from `pages/review/FeedbackSidebar.tsx`.
- `components/feedback/FeedbackSheet.tsx` emits
  `data-testid={resolvedId}` on its `<dialog>` root.
- `FeedbackSheet.states.test.tsx.snap` is regenerated.
- `pnpm --filter haiku-ui typecheck` and
  `pnpm --filter haiku-ui test` pass.
- Feedback-assessor closes FB-12 on the next bolt.

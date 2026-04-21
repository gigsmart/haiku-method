# Fix FB-29 — Tactical Plan (planner, bolt 1)

**Finding:** `StageProgressStrip: raw 2px connector + missing focus-visible ring + no state-matrix hover/focus cells`.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/29-stageprogressstrip-raw-2px-connector-missing-focus-visible-r.md`

## TL;DR

`packages/haiku-ui/src/components/StageProgressStrip.tsx` violates three
DESIGN-BRIEF / DESIGN-TOKENS rules and its state-matrix snapshot covers the
wrong axis (component arrangement instead of interaction states):

1. Connector uses `w-6 h-[2px]` — `h-[2px]` is a raw-pixel magic number.
2. Stage dot `<button>` has no `focus-visible` ring; it's the only
   interactive control in `haiku-ui` that skips `focusRingClass` from
   `a11y/focus.ts`.
3. Label uses `text-[11px] font-semibold` — bracket magic that sidesteps
   `text-xs`. DESIGN-TOKENS §1.4 lists `text-xs` as the named tier for
   tiny labels; the bracket form is only allowed when strictly necessary.
4. `StageProgressStrip.states.test.tsx` snapshots six **arrangement**
   variants (`default`, `first-stage-current`, `last-stage-completed`,
   `with-click-handler`, `visited-but-not-current`, `never-visited`) —
   none of which are the mandate-required `hover` / `focus` / `active`
   / `disabled` cells from `state-coverage-grid.md` §5 + §7.11.

**Fix (builder bolt 2):**
- Add `focusRingClass` to the stage-dot `<button>`.
- Replace `h-[2px]` with `border-t-2` on the connector; this is a named
  Tailwind utility that scales with accessibility zoom, matches the
  `border-b-2` pattern used elsewhere (DESIGN-TOKENS §1.5 "Tab active
  border"), and drops the raw-pixel sidestep.
- Replace `text-[11px]` with `text-xs` on the label.
- Rewrite the states test to enumerate the documented state vocabulary
  (`default`, `hover`, `focus`, `active`, `disabled`) using
  `data-forced-state` inline-class forcing — same pattern used by other
  state-matrix snapshots in this package — and regenerate the snapshot.

All four sub-fixes are mechanical; none require new logic.

## Root cause

The component was authored before `a11y/focus.ts` centralised the
focus-ring contract (`focusRingClass`). Every subsequent interactive
control (`RevisitModal` close, `FeedbackItem` actions, `FeedbackFloatingButton`,
`DirectionPage` submit, `Tabs` tab buttons per FB-67 in parallel) routes
through it; `StageProgressStrip` was never migrated. The `h-[2px]` and
`text-[11px]` sidesteps are similar — they predate the DESIGN-TOKENS
typography-floor and border-width rules.

The state-matrix test was written against arrangement variants because
the spec it cites (`state-coverage-grid.md` §7.11) cross-references §5
instead of enumerating the cells inline. §5 explicitly lists the six-cell
vocabulary (`default`, `hover`, `focus`, `active`, `disabled`, `error`)
for this component; the test author missed the redirect.

## Confirmed scope (MUST change)

| File | Change |
|---|---|
| `packages/haiku-ui/src/components/StageProgressStrip.tsx` | Line 7: add `import { focusRingClass } from "../a11y/focus"`. Lines 32-40: swap the connector `<div class="w-6 h-[2px] …">` to `<div class="w-6 border-t-2 …">` and drop the `h-[2px]` utility (color utilities stay as `border-teal-400 dark:border-teal-500` / `border-stone-300 dark:border-stone-600` — the color needs to move from `bg-*` to `border-*` since we're now using a border, not a filled div). Lines 43-61: append ` ${focusRingClass}` to the dot button `className` template. Line 65: replace `text-[11px]` with `text-xs`. |
| `packages/haiku-ui/src/components/__tests__/StageProgressStrip.states.test.tsx` | Rewrite the test body to render cells `data-cell="default"`, `data-cell="hover"`, `data-cell="focus"`, `data-cell="active"`, `data-cell="disabled"`. Force hover/focus/active visuals via a `data-forced-state` prop on the inner button OR via inline style injection (see §"State-forcing mechanism" below). |
| `packages/haiku-ui/src/components/__tests__/__snapshots__/StageProgressStrip.states.test.tsx.snap` | Delete or let vitest rewrite via `-u`. Do NOT hand-edit; run `npx vitest -u --dir packages/haiku-ui/src/components/__tests__ StageProgressStrip.states` to regenerate. |

## State-forcing mechanism (builder must pick ONE)

jsdom does not dispatch real `:hover` / `:focus-visible` / `:active`
pseudo-class styles during render, so the snapshot needs an explicit
affordance. Two options — **pick Option A** (cleaner, matches the
pattern other components use):

### Option A — `data-forced-state` prop on the component (recommended)

Add an optional `forcedState?: "hover" | "focus" | "active" | "disabled"`
prop to `StageProgressStrip`. When set, the component applies the
equivalent classes on the dot button unconditionally:

```tsx
// inside the button className template
const forcedHover = forcedState === "hover" ? "scale-125 border-teal-400" : ""
const forcedFocus = forcedState === "focus" ? "ring-2 ring-teal-500 ring-offset-2" : ""
const forcedActive = forcedState === "active" ? "scale-110 brightness-95" : ""
// existing disabled branch already covers disabled
```

This keeps the forcing mechanism scoped to the component, makes the
snapshot reproducible, and matches the approach `AssessorSummaryCard`
uses for its `loading` / `error` state cells (props-driven, not
pseudo-class-driven). Document the prop with `/** Test-only — forces a
visual state for state-matrix snapshots. Do not use in production. */`.

### Option B — wrapper `<div data-forced-state="hover"><StageProgressStrip /></div>` (rejected)

Does not propagate to child button classes without a component-level
hook anyway, so it degenerates into Option A with extra plumbing. Skip.

### Option C — `userEvent.hover` / `focus` before snapshot (rejected)

RTL `userEvent.hover` does not cause jsdom to add `:hover` pseudo-class
styles in the serialized output — Tailwind's `hover:` variants are
CSS-only and don't materialize in snapshots. Same story for
`:focus-visible`. Snapshot would be identical to default, defeating the
purpose. Skip.

## Confirmed preserve surface (MUST NOT change)

- `StageProgressStrip`'s external API (`stages`, `currentStage`,
  `onStageClick` props) stays identical; the new `forcedState` prop is
  optional and test-only. No consumer changes.
- The three existing consumers — `pages/review/ReviewContextHeader.tsx`,
  `pages/review/sidebar/StageMapSidebar.tsx` (if present), and
  `components/ReviewPage.tsx` via the re-export — do not need edits.
- The color contract for connector (teal when completed/current, stone
  when future) is preserved; only the mechanism (border-top vs filled
  div with fixed height) changes.
- The stage-dot shape vocabulary (diamond for current, filled circle for
  completed, bordered circle for clickable future, flat bordered circle
  for never-visited) is preserved.

## Files to modify (builder scope)

| File | Action |
|---|---|
| `packages/haiku-ui/src/components/StageProgressStrip.tsx` | Edit in place — add `focusRingClass` import, swap connector to `border-t-2`, swap label to `text-xs`, thread through optional `forcedState` prop. |
| `packages/haiku-ui/src/components/__tests__/StageProgressStrip.states.test.tsx` | Rewrite to enumerate `default / hover / focus / active / disabled` cells. |
| `packages/haiku-ui/src/components/__tests__/__snapshots__/StageProgressStrip.states.test.tsx.snap` | Regenerated by vitest. |

NO other files should change. In particular:
- Do NOT add a `--stroke-connector` CSS custom property to `index.css`.
  The finding offers it as an alternative, but `border-t-2` is the
  lighter fix and matches the existing `border-b-2` tab-active pattern in
  DESIGN-TOKENS §1.5 — one less token to maintain.
- Do NOT touch `a11y/focus.ts`.
- Do NOT touch any other component's state-matrix test.
- Do NOT update `DESIGN-TOKENS.md` or `state-coverage-grid.md` —
  both are already correct; the component violates them, not the other
  way round.

## Verification commands (builder must run)

```bash
# (a) Confirm raw-pixel magic is gone from the component.
rg 'h-\[2px\]|text-\[11px\]' packages/haiku-ui/src/components/StageProgressStrip.tsx
#   expected: zero matches

# (b) Confirm focusRingClass is wired in.
rg 'focusRingClass' packages/haiku-ui/src/components/StageProgressStrip.tsx
#   expected: at least one import and one usage in the dot-button className

# (c) Type-check.
npx tsc -p packages/haiku-ui --noEmit
#   expected: exit 0

# (d) Regenerate the state-matrix snapshot.
npx vitest run -u --dir packages/haiku-ui/src/components/__tests__ StageProgressStrip.states
#   expected: exit 0, snapshot file rewritten with data-cell="default|hover|focus|active|disabled"

# (e) Confirm the snapshot cells match the mandate vocabulary.
rg 'data-cell="(default|hover|focus|active|disabled)"' packages/haiku-ui/src/components/__tests__/__snapshots__/StageProgressStrip.states.test.tsx.snap | wc -l
#   expected: 5

# (f) Confirm the mandate-violating cells are gone.
rg 'data-cell="(first-stage-current|last-stage-completed|with-click-handler|visited-but-not-current|never-visited)"' packages/haiku-ui/src/components/__tests__/__snapshots__/StageProgressStrip.states.test.tsx.snap
#   expected: zero matches

# (g) Full component-package test sweep.
npx vitest run --dir packages/haiku-ui
#   expected: all tests green; other snapshot tests unchanged

# (h) Build still passes.
npm run build -w haiku-ui
#   expected: exit 0
```

## Risk assessment

- **Does changing `h-[2px]` to `border-t-2` change the visual?** No.
  `border-t-2` renders a 2px border on the top edge. The parent `w-6`
  gives it a 24px width. The color moves from `bg-teal-400` to
  `border-teal-400`. The visual delta is <1px (the border replaces a
  filled 2px band at the same vertical position) and in practice is
  indistinguishable from the current rendering. `border-t-2` scales
  with user zoom correctly; `h-[2px]` does not.
- **Does `focus-visible:ring-2 focus-visible:ring-teal-500
  focus-visible:ring-offset-2` visually collide with the teal-filled
  current-stage diamond?** Slightly — the teal ring-500 on a teal-400
  diamond has lower contrast than on stone-300. Acceptable because the
  :focus-visible ring is a transient state (only while tabbed-to) and
  matches the canonical contract in `a11y/focus-ring-spec.html §1`.
  The FB-61 / FB-62 chain owns the "should Approve get the variant
  ring?" decision; stage dots are neither approve nor destructive, so
  `focusRingClass` (plain teal-500) is correct.
- **Does the new `forcedState` prop leak into production?** No. It's
  optional, defaults to `undefined`, and only materializes classes when
  explicitly passed. Document it as test-only in the prop comment.
- **Does rewriting the snapshot lose coverage of the arrangement
  variants (first-stage-current, visited-but-not-current, etc.)?** Yes,
  and that's the point — those were asserting the wrong thing. If we
  want arrangement-variant coverage (first-stage, last-stage, all-
  completed), that belongs in a separate `StageProgressStrip.arrangements.test.tsx`
  file, not in the state-matrix test. The finding does not require that
  new file, so do NOT create it speculatively. If a future feedback
  requests arrangement coverage, add it then — `YAGNI`.
- **Parallel-chain clobber risk.** FB-67 (tab-button focus ring) and
  FB-23 (tabs focus ring + sticky magic number) are both touching
  `Tabs.tsx` — different file, no overlap. FB-20 (fail-open auth) is
  backend, no overlap. FB-14 (usesession bypass) is hooks, no overlap.
  No parallel fix touches `StageProgressStrip.tsx` or its test file
  based on the feedback ledger. Still, builder MUST re-read
  `StageProgressStrip.tsx` immediately before editing — if a parallel
  chain has already applied one or more of the sub-fixes, treat this
  fix as additive (fill in whatever is still missing) rather than a
  full rewrite.
- **Does the `forcedState="disabled"` cell duplicate the existing
  disabled coverage (future never-visited)?** No, the mandate requires
  both: the arrangement-driven disabled (a dot that is structurally
  `disabled` because its stage is future-never-visited) AND the
  token-forced disabled cell (snapshot proof that the disabled visuals
  render correctly in isolation). The new test covers the latter; the
  old `never-visited` cell implicitly covered the former and its
  information content is preserved in the `disabled` cell.
- **Does removing the `never-visited` cell break a human-review
  expectation?** Grep for callers of the `never-visited` label — none.
  The snapshot file is referenced nowhere else. Safe to regenerate.

## Handoff to the builder

Builder bolt (bolt 2) should:

1. Re-read `packages/haiku-ui/src/components/StageProgressStrip.tsx`
   and confirm the current line counts roughly match (81 lines, with
   `h-[2px]` on line 34, `text-[11px]` on line 65, no `focusRingClass`
   import, no `forcedState` prop). If the file has drifted (another
   chain partially fixed it), apply only the missing sub-fixes.
2. Edit `StageProgressStrip.tsx`:
   - Add `import { focusRingClass } from "../a11y/focus"` at the top of
     the imports.
   - Extend `Props` to include `forcedState?: "hover" | "focus" | "active" | "disabled"`.
     Destructure it in the function signature.
   - Swap the connector `<div>` (currently at lines 32-40) from
     `w-6 h-[2px] bg-*` to `w-6 border-t-2` with color routed through
     `border-teal-400 dark:border-teal-500` / `border-stone-300 dark:border-stone-600`.
   - Append `${focusRingClass}` to the dot button's className template
     (currently lines 48-56). Also append `forcedHover` / `forcedFocus`
     / `forcedActive` class strings gated on the `forcedState` prop.
   - Replace `text-[11px]` with `text-xs` on the label span (currently
     line 65). `font-semibold` stays — DESIGN-TOKENS §1.4 lists
     `text-xs font-semibold uppercase tracking-wider` as the canonical
     "Table header" / label tier.
3. Rewrite `__tests__/StageProgressStrip.states.test.tsx` to enumerate
   `default / hover / focus / active / disabled` cells. Use the same
   `STAGES` fixture but render each cell with the appropriate
   `forcedState` prop (default = none, hover = `"hover"`, etc.). The
   `disabled` cell can keep the existing "future, never-visited" fixture
   since that naturally produces a `disabled=""` dot.
4. Delete the old snapshot file or let vitest regenerate it via
   `npx vitest run -u --dir packages/haiku-ui StageProgressStrip.states`.
5. Run verification commands (a) through (h) in order.
6. Commit with `haiku: fix FB-29 bolt 2 (builder)`. Do NOT push.
7. If any verification step fails, stop and capture the output in the
   commit body rather than forcing through. Feedback-assessor (bolt 3)
   will re-open the finding and the FSM will retry.

## Out of scope

- **Adding `--stroke-connector` to `:root`.** `border-t-2` is the
  cleaner fix; don't promote a one-use token. If a future component
  needs a shared stroke token, lift it then.
- **Arrangement-variant snapshot coverage** (first-stage-current,
  last-stage-completed, etc.). Belongs in a separate `*.arrangements.test.tsx`
  if product ever asks for it. Not required by FB-29.
- **FB-63** (StageProgressStrip conveys status via color/shape only —
  missing aria-labels). Overlapping file, different concern. That
  finding has its own plan. Do not preempt its aria fixes here.
- **FB-67** (tab buttons missing focus ring). Same contract concern on
  a different component. Owned by its own plan.
- **Paper / website / CLAUDE.md updates.** No methodology change; this
  is a component-level a11y + token cleanup. Sync discipline does not
  apply.

## Done when

- `rg 'h-\[2px\]|text-\[11px\]' packages/haiku-ui/src/components/StageProgressStrip.tsx` returns zero matches.
- `rg 'focusRingClass' packages/haiku-ui/src/components/StageProgressStrip.tsx` returns at least two matches (import + usage).
- `__tests__/__snapshots__/StageProgressStrip.states.test.tsx.snap`
  contains exactly `data-cell="default"`, `data-cell="hover"`,
  `data-cell="focus"`, `data-cell="active"`, `data-cell="disabled"` —
  and none of the old arrangement labels.
- `npx tsc -p packages/haiku-ui --noEmit` exits 0.
- `npx vitest run --dir packages/haiku-ui` exits 0 with all snapshots
  green.
- `npm run build -w haiku-ui` exits 0.
- `haiku: fix FB-29 bolt 2 (builder)` commit exists on the branch.
- Feedback-assessor (bolt 3) confirms: (1) no raw-pixel magic in the
  component, (2) focus-visible ring present on the dot button,
  (3) label uses `text-xs`, (4) state-matrix snapshot enumerates
  default / hover / focus / active / disabled.

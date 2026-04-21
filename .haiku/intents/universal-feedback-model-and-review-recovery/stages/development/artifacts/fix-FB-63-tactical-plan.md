# Fix FB-63 — Tactical Plan (planner, bolt 1)

**Finding:** `StageProgressStrip` conveys status via color+shape only; dots are 14-20px (fail 44px target); no focus indicator.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/63-stageprogressstrip-conveys-status-via-color-shape-only-dots.md`

## Root cause

`packages/haiku-ui/src/components/StageProgressStrip.tsx` is a shell-level
navigation control that renders on every page. It has three independent a11y
defects (plus a related bonus) that together violate WCAG 1.4.1, 2.4.7, 2.5.5,
and 2.5.8:

1. **Color/shape-only status conveyance (1.4.1).** Stage status lives entirely
   in the dot geometry (rotated square vs filled circle vs outline circle) and
   teal-vs-stone color. The `title` attribute is not SR/keyboard-accessible and
   the visible label is just `{stage.name}` with no status text. Colorblind /
   low-vision / SR users have no reliable channel to tell which stage is current
   vs completed vs future.
2. **Touch target 14-20 px (2.5.5 / 2.5.8).** The button itself is `w-5 h-5`
   (current, 20 px) or `w-3.5 h-3.5` (others, 14 px). The a11y foundation
   already ships `touchTargetHitAreaClass` in `src/a11y/touch-target.ts` that
   paints a 44×44 invisible hit-area via `::before` without enlarging the
   visible dot. The StageProgressStrip never applies it.
3. **No visible focus indicator (2.4.7).** The button relies on
   `transition-all` + `hover:scale-125` + `hover:border-teal-400` — none of
   which react to keyboard focus. `focusRingClass` from `src/a11y/focus.ts`
   exists precisely for this and is not applied.
4. **Bonus: connector color-only (1.4.1).** The connector between stages
   changes `bg-teal-400` ↔ `bg-stone-300` to convey progress. That alone is
   acceptable *if* the dot conveys the status via non-color channels — once the
   dot carries a text / icon status signal, the connector is decorative and
   passes 1.4.1.

The design-stage focus-ring spec and touch-target audit already designate
`focusRingClass` and `touchTargetHitAreaClass` as the canonical fixes for both
problems — StageProgressStrip is the only shell nav element that skipped them.
This is a pure consumption issue: all primitives exist and are re-exported from
`src/a11y/index.ts`.

## Fix approach (planner-scope only — no code edits)

The builder (bolt 2) will:

1. **Replace `title` with an `aria-label` that includes status text.** Each
   button gets `aria-label={\`Stage \${stage.name}, \${statusText}\`}` where
   `statusText` is derived from the three-way status:
   - `isCurrent` → `"current stage"`
   - `isCompleted` → `"completed"`
   - `isClickable` (future but visited) → `"previously visited, not current"`
   - otherwise → `"not yet started"`
   Drop the `title={...}` attribute entirely. `title` is not accessible and
   duplicates the aria-label poorly.
2. **Add an `aria-current="step"` on the current-stage button.** Required by
   WAI-ARIA for step-indicator patterns; pairs with the status text so SR users
   hear "current stage" and the programmatic step state simultaneously.
3. **Wrap the strip in a labelled landmark.** `<nav aria-label="Stage
   progress">` around the current `<div className="flex …">`, so the role and
   label announce once at the strip boundary instead of once per button. This
   is the standard pattern used by `aria-landmark-spec.md` for step/progress
   navigation.
4. **Add a non-color visual status glyph inside the dot.** Current already has
   the inner white circle; completed and future need a text-equivalent too. Per
   the feedback body, completed gets a check-mark (`✓`), current keeps its
   inner-dot (already present), future stays empty (acceptable because the
   outline + "not yet started" aria-label already distinguishes it). The
   check-mark is an SVG with `aria-hidden="true"` — the aria-label already
   carries the semantic status, so the icon is redundant for SR and decorative
   at the DOM level. This gives colorblind / low-vision users a second channel.
5. **Apply `touchTargetHitAreaClass` to every button.** The visible dot
   geometry stays exactly the same (14×14 or 20×20); a `::before`
   pseudo-element paints a centered 44×44 invisible hit area that absorbs
   pointer and keyboard focus. Imported from `@/a11y` (via `a11y/index.ts`).
6. **Apply `focusRingClass` to every button.** Adds the canonical 2px teal-500
   ring on `:focus-visible` with the dark-mode offset. Imported from `@/a11y`.
   Note: the ring must be visible on the *visible dot*, not the 44×44 hit area
   — `touchTargetHitAreaClass` expands only the ::before hit region, not the
   element's focus outline, so the ring still wraps the dot correctly. Verify
   in manual QA that the ring is not clipped by `overflow-x-auto` on the outer
   strip container; if clipped, add `focus-visible:z-10` so the ring renders
   above siblings. (overflow-x:auto does not clip focus rings by default in
   evergreen browsers, but verify.)
7. **Do NOT enlarge the dot.** The visual design (dots + connector line) is
   intentional. Only the hit-area and focus ring grow. Rotating-square +
   inner-white-dot for `current` stays.
8. **Leave the connector as-is for now.** Once the dot carries text-equivalent
   status, the connector is decorative (color-only distinction between two
   decorative segments is not a WCAG 1.4.1 violation — the information is
   already carried by the dot). Documenting this explicitly so a future
   reviewer does not reopen.

## Files to modify

1. **`packages/haiku-ui/src/components/StageProgressStrip.tsx`** — sole
   component edit. Imports `focusRingClass` and `touchTargetHitAreaClass` from
   `../a11y`. Wraps the outer `<div>` in `<nav aria-label="Stage progress">`
   (keep the existing flex `<div>` inside for layout — or add the aria-label +
   role directly on the `<div>` as `role="navigation" aria-label="Stage
   progress"`, whichever is idiomatic with the rest of the codebase — check
   `aria-landmark-spec.md` in the design stage before committing). Each
   `<button>` gets:
   - `aria-label={...}` (status-inclusive)
   - `aria-current={isCurrent ? "step" : undefined}`
   - `className` gains ` ${touchTargetHitAreaClass} ${focusRingClass}`
   - Inner content adds the check-mark SVG for `isCompleted`
   - Remove `title={...}`

2. **`packages/haiku-ui/src/components/__tests__/StageProgressStrip.states.test.tsx`**
   — add targeted assertions (not just snapshot):
   - For each of the six data-cell variants, assert the expected aria-label
     text appears on the correct button.
   - Assert `aria-current="step"` is present on exactly one button per strip
     (the current stage).
   - Assert every button has both `touch-target` (in some form —
     `touchTargetHitAreaClass` expands to `"touch-target
     touch-target--hit-area"`) and the `focus-visible:ring-2` utility in its
     class list.
   - Assert `title` attribute is NOT present on any button (regression guard
     against re-adding it).
   - Update the snapshot deliberately (the DOM will change — new class
     tokens, new aria attributes, new SVG children, removed title). Review the
     new snapshot in the PR diff to make sure only the intended nodes changed.

3. **`packages/haiku-ui/src/components/__tests__/__snapshots__/StageProgressStrip.states.test.tsx.snap`**
   — regenerate with `vitest -u`. Single snapshot, low risk.

No other files need editing. The check-mark SVG is inline (4 lines), not a new
component.

## Implementation steps (for the builder in bolt 2)

1. Read `StageProgressStrip.tsx` fresh (parallel-batch warning — another chain
   may have edited it). Edit in place.
2. Add imports at top: `import { focusRingClass, touchTargetHitAreaClass }
   from "../a11y"`.
3. Inside the map, compute `statusText` as described above. Build the button's
   `aria-label` from `\`Stage \${stage.name}, \${statusText}\``.
4. Replace `title={...}` with `aria-label={...}` and add
   `aria-current={isCurrent ? "step" : undefined}`.
5. Append `${touchTargetHitAreaClass} ${focusRingClass}` to the button's
   `className` template (after the size/color variants so focus-visible
   utilities override `transition-all` at the correct cascade order).
6. For the `isCompleted` branch, render an inline `<svg aria-hidden="true"
   viewBox="0 0 12 12" className="w-2 h-2 text-white fill-none stroke-current
   stroke-[2.5]"><path d="M2 6.5l2.5 2.5L10 3" strokeLinecap="round"
   strokeLinejoin="round" /></svg>` (or equivalent check-mark) as the button's
   sole child. Keep the existing `isCurrent` inner-dot span.
7. Wrap the outer `<div className="flex …">` in `<nav aria-label="Stage
   progress">` — OR add `role="navigation" aria-label="Stage progress"` to the
   existing `<div>`, matching the convention used elsewhere in the codebase
   (check `ShellLayout.tsx`, `FeedbackSidebar.tsx`, or whatever already uses
   landmark regions). Pick one style and stick with it.
8. Update `StageProgressStrip.states.test.tsx`: add targeted assertions per
   §2 above. Delete the `title` assertion if none exists; add a negative
   assertion (`expect(button.getAttribute("title")).toBeNull()`) so it cannot
   regress silently.
9. Run `npx vitest run src/components/__tests__/StageProgressStrip.states.test.tsx`
   — expect snapshot mismatch. Re-run with `-u` to accept. Diff the snapshot
   in git and verify only the expected nodes changed (new classes, new aria,
   new SVG, no title).
10. Run `npx tsc --noEmit` and `npx biome check src/components/StageProgressStrip.tsx`
    to catch type / lint errors introduced by the edit.
11. Run the full `haiku-ui` test suite to confirm no cross-file regressions
    (nothing else consumes the `title` prop or snapshots StageProgressStrip's
    DOM).

## Verification commands

```bash
# From packages/haiku-ui:
npx vitest run src/components/__tests__/StageProgressStrip.states.test.tsx
npx vitest run                                   # whole suite
npx tsc --noEmit
npx biome check src/components/StageProgressStrip.tsx
```

All four must exit 0. The full vitest run is important because
StageProgressStrip is rendered inside `ReviewPage.tsx`, `ReviewCurrentPage.tsx`,
and `pages/review/ReviewPage.tsx` — any of those tests may snapshot the strip
indirectly. If a downstream snapshot breaks, accept the change intentionally
(same reason — new aria + classes) and diff carefully.

## Risks

- **Parallel-chain clobber.** Other findings in this fix-wave may be editing
  the same component. Read the file immediately before each Edit call; verify
  the current source contents rather than trusting feedback body line numbers.
  If another chain has already added `focusRingClass` or aria-label, de-dup
  before committing.
- **Snapshot drift.** The snapshot file will change — this is expected. The
  risk is *sloppy* acceptance: if the builder blindly runs `-u` without
  reviewing the diff, a regression in an unrelated cell could slip through.
  The builder MUST diff the snapshot in git before committing.
- **Focus-ring clipping by `overflow-x-auto`.** The outer strip has
  `overflow-x-auto py-2 px-1` — in some browsers a 2px ring on an edge button
  can be clipped. Manual QA step: keyboard-tab through every stage at mobile
  (375 px) and desktop (1440 px) widths. If clipped at mobile, bump `py-2`
  to `py-3` or add `focus-visible:z-10` to the button.
- **Landmark duplication.** If the page already has a parent `<nav>` (e.g.
  ShellLayout's primary nav), nesting a second `<nav>` is allowed but needs
  the `aria-label` to disambiguate. Builder must check `ShellLayout.tsx` for
  an existing nav landmark before committing the `aria-label` text (avoid
  duplicate labels).
- **Check-mark glyph as SVG vs text `"✓"`.** SVG is more reliable
  cross-platform — the Unicode ✓ varies in weight and position across
  fonts / emoji sets and can look crude at 8-12 px. Inline SVG gives
  deterministic rendering. `aria-hidden="true"` either way — the semantic
  status lives in the aria-label.
- **`aria-current="step"` on a `<nav>` vs `<ol>`.** The WAI-ARIA spec for
  `aria-current="step"` assumes a step indicator pattern (progressbar / nav).
  Using it inside a landmark `<nav>` is idiomatic; using it inside a bare
  `<div>` is also valid but less semantically rich. Prefer `<nav>` wrap.

## Out of scope

- Rewriting the component as a list-based step indicator (`<ol><li>`).
  Current `<div>`-with-buttons markup is acceptable once the landmark +
  aria-current are added.
- Redesigning the visual (dot shapes, colors, connector). The feedback is
  about a11y affordances, not visuals.
- Adding E2E keyboard-navigation tests — unit-level class + aria assertions
  are sufficient for the feedback-close criteria. A richer keyboard-nav test
  lives in unit-07's spec.
- Touching `audit-touch-targets.mjs` to expand its sampling. That's a
  separate finding (the feedback body flags it as a "why the audit missed it"
  note, not a line item for this fix).

## Done when

- StageProgressStrip buttons carry a status-inclusive `aria-label` and no
  `title` attribute.
- Current stage button carries `aria-current="step"`.
- Every button's `className` contains `touch-target touch-target--hit-area`
  (the tokens from `touchTargetHitAreaClass`) and a `focus-visible:ring-2`
  utility (from `focusRingClass`).
- Completed-stage buttons render an inline check-mark SVG with
  `aria-hidden="true"`.
- The strip is wrapped in `<nav aria-label="Stage progress">` (or the
  equivalent `role="navigation" aria-label="…"` on the existing outer
  `<div>`), so the landmark is announced once.
- `StageProgressStrip.states.test.tsx` asserts all five properties above
  (aria-label, aria-current, classes, no-title, check-mark presence for
  completed) and the snapshot has been reviewed and regenerated.
- `npx vitest run`, `npx tsc --noEmit`, and `npx biome check` all exit 0 in
  `packages/haiku-ui`.
- A keyboard Tab sweep at mobile (375 px) and desktop (1440 px) shows a
  visible teal focus ring on each stage button and no clipping.

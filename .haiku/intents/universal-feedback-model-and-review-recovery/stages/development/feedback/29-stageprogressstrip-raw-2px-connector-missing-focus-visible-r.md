---
title: >-
  StageProgressStrip: raw 2px connector + missing focus-visible ring + no
  state-matrix hover/focus cells
status: closed
origin: adversarial-review
author: consistency (from design)
author_type: agent
created_at: '2026-04-21T20:23:14Z'
iteration: 0
visit: 0
source_ref: null
closed_by: 'fix-loop:FB-29:bolt-2'
bolt: 2
upstream_stage: null
---

**Mandate check:** "no raw px or magic numbers" + "interactive elements have consistent state coverage (default, hover, focus, active, disabled, error)."

`packages/haiku-ui/src/components/StageProgressStrip.tsx`:

1. **Line 34** — connector line styled `w-6 h-[2px]`. The `h-[2px]` is a raw pixel literal. The rest of the design system uses `border-b-2` / `border-b-[2px]` or named stroke tokens. Either switch to `border-t-2 border-teal-400` (which scales with accessibility zoom) or promote to a named token `--stroke-connector: 2px` in `:root`.

2. **Lines 43–61 (stage dot button)** — the button has no `focus-visible:ring-*` class at all. Keyboard focus on a stage dot is invisible (the browser default outline is removed by the parent container's transitions in practice). Every other interactive control in haiku-ui (RevisitModal close, FeedbackItem actions, FeedbackFloatingButton, DirectionPage submit) routes through `focusRingClass` / `focusRingCompactClass` from `a11y/focus.ts`. StageProgressStrip is the only one missing it.

3. **Line 65** — `text-[11px] font-semibold`. DESIGN-TOKENS §1.4 says `text-[11px]` is allowed "only with `font-semibold`/`font-bold`" — this one technically passes, but the raw bracket size sidesteps the `text-xs` (12 px) token. Given DESIGN-TOKENS §1.4 lists "Tiny text / labels: `text-xs`", prefer the named tier over the bracket magic number.

4. **State-matrix gap** — `packages/haiku-ui/src/components/__tests__/StageProgressStrip.states.test.tsx` covers 6 cells (default, first-stage-current, last-stage-completed, with-click-handler, visited-but-not-current, never-visited) but none of these are the mandate-required **hover / focus / active / disabled / error** states. The snapshot proves component arrangement renders, not that interaction states are covered.  DESIGN-BRIEF §2 / state-coverage-grid.md explicitly lists `(default, hover, focus, active, disabled, never-visited)` for this component — the current snapshot swaps 3 of those (hover, focus, active) for arrangement variants. Re-render the snapshot with explicit `data-cell="hover"` / `focus` / `active` states (use RTL userEvent or inline class forcing via `data-forced-state`).

**Fix:** add focus ring to the dot button, promote `h-[2px]` to a named token, and re-author the states snapshot against the actual state vocabulary the state-coverage grid requires.

---
title: 'StageProgressStrip — 44px targets, full keyboard reach'
type: implementation
depends_on:
  - unit-04-design-token-system
  - unit-05-a11y-foundations
quality_gates:
  - typecheck
  - test
inputs:
  - knowledge/DESIGN-TOKENS.md
  - stages/design/DESIGN-BRIEF.md
  - stages/design/artifacts/stage-progress-strip.html
  - stages/design/artifacts/touch-target-audit.md
status: completed
bolt: 1
hat: reviewer
started_at: '2026-04-21T07:26:59Z'
hat_started_at: '2026-04-21T13:08:54Z'
iterations:
  - hat: planner
    started_at: '2026-04-21T07:26:59Z'
    completed_at: '2026-04-21T07:44:47Z'
    result: advance
  - hat: builder
    started_at: '2026-04-21T07:44:47Z'
    completed_at: '2026-04-21T13:08:54Z'
    result: advance
  - hat: reviewer
    started_at: '2026-04-21T13:08:54Z'
    completed_at: '2026-04-21T13:27:51Z'
    result: advance
outputs:
  - stages/development/artifacts/unit-12-tactical-plan.md
  - packages/haiku-ui/audit-config.json
  - packages/haiku-ui/src/components/StageProgressStrip.tsx
  - packages/haiku-ui/src/index.css
  - packages/haiku-ui/tests/StageProgressStrip.test.tsx
completed_at: '2026-04-21T13:27:51Z'
model: sonnet
---
# StageProgressStrip

Visible navigation of the intent's stage progression. Regression guards against: sub-44 hit area; upcoming-stage contrast fail; future stages at `tabindex=-1` unreachable by keyboard.

## Scope

- `packages/haiku-ui/src/components/StageProgressStrip.tsx`:
  - `<nav aria-label="Stage progress">`.
  - Each stage node is a `<button>` (not a div). Tabbable; activates on Enter/Space.
  - Glyph per state: ✓ completed, ◆ in-progress, ○ upcoming. Visible glyph dimensions 20×20 circle, 22×22 diamond — **values sourced from DESIGN-TOKENS `--stage-glyph-*` tokens added by unit-04**, not hardcoded.
  - 44×44 hit zone via `touchTargetClass` (hidden `::before`); visible glyph unchanged.
  - Upcoming-stage colors: `border-stone-400 dark:border-stone-500`, glyph + label `text-stone-600 dark:text-stone-300` (≥ 3:1 non-text contrast, ≥ 4.5:1 text contrast — verified by audit-contrast).
  - Future stages are keyboard-reachable (no `tabindex="-1"`). Clicking a future stage is disabled via `aria-disabled="true"` (visual dimming), but focus IS allowed.
  - Variants: desktop, mobile, revisit, all-completed — all share the same node primitive.
  - In-progress stage has `aria-current="step"`.

## Out of scope

- Underlying stage-state fetching (consumed from session payload).

## Completion Criteria

**Touch target:**
- RTL test mounts `<StageProgressStrip>` with 6 stages, queries each node's `getBoundingClientRect()`, asserts width ≥ 44 and height ≥ 44.

**Keyboard reach:**
- RTL test confirms Tab reaches every stage node in DOM order.
- `audit-banned-patterns.mjs --profile=tokens` regex `tabindex=["']-1["']` scoped to `StageProgressStrip.tsx` returns zero hits.

**Contrast:**
- `audit-contrast.mjs --mode=tokens` reports WCAG 1.4.11 pass for the upcoming-stage border and ≥ 4.5:1 for the label text.

**Glyph geometry:**
- RTL test renders circle + diamond glyphs; `getBoundingClientRect()` matches `--stage-glyph-circle` (20×20) and `--stage-glyph-diamond` (22×22) tokens from DESIGN-TOKENS.

**aria-current:**
- When props.activeStage is set, the matching node has `aria-current="step"` — RTL asserts.

- `npx tsc --noEmit` passes.

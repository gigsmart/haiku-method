---
title: 'AgentFeedbackToggle (role=switch, canonical aria-label, 44px target)'
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
  - stages/design/artifacts/agent-feedback-toggle-spec.html
  - stages/design/artifacts/comments-list-with-agent-toggle.html
status: completed
bolt: 1
hat: reviewer
started_at: '2026-04-21T07:27:04Z'
hat_started_at: '2026-04-21T07:55:58Z'
iterations:
  - hat: planner
    started_at: '2026-04-21T07:27:04Z'
    completed_at: '2026-04-21T07:32:17Z'
    result: advance
  - hat: builder
    started_at: '2026-04-21T07:32:17Z'
    completed_at: '2026-04-21T07:55:58Z'
    result: advance
  - hat: reviewer
    started_at: '2026-04-21T07:55:58Z'
    completed_at: '2026-04-21T13:02:59Z'
    result: advance
outputs:
  - stages/development/artifacts/unit-09-tactical-plan.md
  - packages/haiku-ui/audit-config.json
  - packages/haiku-ui/scripts/audit-banned-patterns.mjs
  - packages/haiku-ui/src/components/feedback/AgentFeedbackToggle.tsx
  - >-
    packages/haiku-ui/src/components/feedback/__tests__/AgentFeedbackToggle.test.tsx
  - packages/haiku-ui/tests/audit-banned-patterns.test.ts
completed_at: '2026-04-21T13:02:59Z'
model: sonnet
---
# AgentFeedbackToggle

Dedicated unit because prior implementation shipped a div-label masquerading as a switch. Proper toggle semantics, canonical aria-label, 44×44 hit area, reduced-motion animation guard. Regression guard for div-toggle + aria-label-drift + sub-44 target + animation-ignores-prefers-reduced classes of issue.

## Scope

- `packages/haiku-ui/src/components/feedback/AgentFeedbackToggle.tsx`:
  - Native `<button type="button" role="switch" aria-checked="false">`.
  - Default state on mount is `aria-checked="false"` (OFF) per DESIGN-BRIEF §2.
  - `aria-label="Show agent feedback inline"` — exact canonical string enforced by banned-patterns audit.
  - Visible count chip when OFF: `text-[11px] font-semibold uppercase tracking-wide text-stone-700 dark:text-stone-200` (per §2 exemption for ≥11px semibold).
  - 44×44 hit area via `touchTargetClass`.
  - Focus ring via `focusRingClass`.
  - Toggle animation gated by `useReducedMotion()` — swapped for an opacity-free crossfade under `prefers-reduced-motion: reduce`.
  - State change triggers `useAnnounce('polite', isOn ? 'Agent feedback now visible' : 'Agent feedback hidden')`.

## Out of scope

- List-render-when-enabled behavior (integrated in review-page units).

## Completion Criteria

**Keyboard:**
- Space or Enter toggles when focused — RTL test asserts transition on both keys.
- Tab reaches the toggle in the expected DOM position.

**Accessibility tree (replaces SR-specific assertions):**
- `screen.getByRole('switch', { name: /^Show agent feedback inline$/ })` resolves — confirms role + accessible name.
- `aria-checked` transitions `'false' ↔ 'true'` on activation (string literals; not booleans).
- Default render has `aria-checked="false"`.

**Canonical string enforcement:**
- Banned-patterns audit config includes `"Show agent feedback"(?! inline)` with scope `packages/haiku-ui/src/**/*.{ts,tsx}` — `audit-banned-patterns.mjs` returns zero hits.
- Banned-patterns audit also asserts ≥ 1 occurrence of `"Show agent feedback inline"` in `components/feedback/AgentFeedbackToggle.tsx` — presence-side check.

**Touch target:**
- Test renders toggle, measures `getBoundingClientRect()` on the `<button>`, asserts width ≥ 44 and height ≥ 44.

**Reduced motion:**
- With matchMedia stub set to `reduce`, assert the toggle's animation class is the no-motion variant (grep DOM).

**Live-region announce:**
- Toggle on → `within(politeLiveRegion).findByText('Agent feedback now visible')`.
- Toggle off → same for 'Agent feedback hidden'.

- `npx tsc --noEmit` passes.

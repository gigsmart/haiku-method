---
title: 'Interactive state coverage, touch targets, and reduced-motion guards'
type: design
closes:
  - FB-12
  - FB-20
  - FB-25
depends_on: []
inputs:
  - stages/design/DESIGN-BRIEF.md
  - stages/design/artifacts/feedback-inline-desktop.html
  - stages/design/artifacts/feedback-inline-mobile.html
  - stages/design/artifacts/annotation-gesture-spec.html
  - stages/design/artifacts/annotation-popover-states.html
  - stages/design/artifacts/feedback-card-states.html
  - stages/design/artifacts/revisit-modal-spec.html
  - stages/design/artifacts/revisit-modal-states.html
  - stages/design/artifacts/revisit-unit-list.html
  - stages/design/artifacts/stage-progress-strip.html
  - stages/design/artifacts/focus-ring-spec.html
  - >-
    stages/design/feedback/12-pin-annotation-buttons-are-28px-below-44px-touch-target-on-m.md
  - >-
    stages/design/feedback/20-fab-pulse-animation-has-no-prefers-reduced-motion-guard.md
  - >-
    stages/design/feedback/25-interactive-state-coverage-incomplete-focus-state-missing-fr.md
outputs:
  - stages/design/artifacts/state-coverage-grid.md
  - stages/design/artifacts/touch-target-audit.md
  - stages/design/artifacts/motion-and-reduced-motion-spec.md
quality_gates:
  - >-
    All pin markers present a 44×44px touch hit area (either `w-11 h-11` on the
    button itself, OR a 44px invisible hit area wrapping a 28px visual marker);
    affected files at minimum: feedback-inline-desktop.html:164/180/183,
    annotation-gesture-spec.html:195, annotation-popover-states.html .pin CSS
    lines 55-63; touch-target-audit.md lists every touch-activated control with
    measured dimensions
  - >-
    Every animation in DESIGN-BRIEF §7 and every artifact (`feedback-fab-pulse`,
    `sheet-up`, `pop-in`, `review-pulse`, `feedback-status-change`, cross-flash,
    and any others) has a `@media (prefers-reduced-motion: reduce)` fallback
    that sets `animation: none` (or a static equivalent);
    motion-and-reduced-motion-spec.md enumerates every animation with its
    reduced-motion fallback; `grep -rEn '@keyframes' stages/design/artifacts/`
    every hit has a sibling `prefers-reduced-motion` block
  - >-
    state-coverage-grid.md enumerates every interactive surface across all
    artifacts with six columns (default, hover, focus, active, disabled, error);
    the following artifacts have complete coverage rendered: revisit-modal (adds
    error/failure-on-confirm state — mirrors feedback-card toast+revert
    pattern), stage-progress-strip (distinguishes `tabindex="-1"` future stages
    from focusable-but-no-action visited stages), feedback-inline-* FAB
    (default/hover/focus/active/disabled broken out), annotation-popover (adds
    explicit disabled popover state for empty-body Create), revisit-unit-list
    (focus ring on locked/completed units for read-only inspection)
  - >-
    Every interactive surface with existing state coverage gaps in the FB-25
    audit now renders all six states explicitly (default, hover, focus, active,
    disabled, error); DESIGN-BRIEF §2 amended to require state-coverage grids
    for new components
  - >-
    Touch target rule documented once in DESIGN-TOKENS.md (≥ 44px on any
    tablet/mobile touch-activated control, ≥ 24px WCAG 2.2 1.4.11 minimum on
    desktop, with explicit exceptions); every affected artifact complies
status: active
bolt: 4
hat: design-reviewer
started_at: '2026-04-18T03:11:01Z'
hat_started_at: '2026-04-18T03:53:23Z'
iterations:
  - hat: designer
    started_at: '2026-04-18T03:11:01Z'
    completed_at: '2026-04-18T03:26:12Z'
    result: advance
  - hat: design-reviewer
    started_at: '2026-04-18T03:26:12Z'
    completed_at: '2026-04-18T03:33:53Z'
    result: advance
  - hat: feedback-assessor
    started_at: '2026-04-18T03:33:53Z'
    completed_at: '2026-04-18T03:39:24Z'
    result: reject
    reason: >-
      FB-20 not closed: DESIGN-BRIEF.md §7 CSS block (lines 638-645) contains
      `@keyframes feedback-pulse` and `.feedback-fab-pulse` but has no sibling
      `@media (prefers-reduced-motion: reduce) { .feedback-fab-pulse {
      animation: none; } }` guard. The FB-20 feedback body explicitly requires
      this be added to DESIGN-BRIEF §7, and the unit's own completion
      criteria/quality gate states every `@keyframes` in DESIGN-BRIEF §7 must
      have a sibling reduced-motion block. §7 is the canonical CSS that ships to
      `packages/haiku/review-app/src/index.css` — the
      `motion-and-reduced-motion-spec.md` documents the fallback but does not
      patch §7 itself, so production CSS still lacks the guard. FB-12 (pins have
      44×44 `::before` hit areas in all three affected files + DESIGN-TOKENS
      rule) and FB-25 (six-state grid + explicit renders for FAB, popover 4b,
      progress-strip tabindex, revisit-modal rollback toast, locked unit focus,
      feedback-card error visual) are closed. Fix: add the reduced-motion block
      inside the §7 code fence next to `.feedback-fab-pulse`.
  - hat: design-reviewer
    started_at: '2026-04-18T03:39:24Z'
    completed_at: '2026-04-18T03:41:45Z'
    result: reject
    reason: >-
      FB-20 residual — DESIGN-BRIEF §7 canonical FAB pulse CSS (lines 639-645)
      still has no sibling @media (prefers-reduced-motion: reduce) block.
      Artifacts have guards; the source-of-truth spec does not. Add `@media
      (prefers-reduced-motion: reduce) { .feedback-fab-pulse { animation: none;
      } }` (or equivalent) to §7 right after the @keyframes block.
  - hat: designer
    started_at: '2026-04-18T03:41:45Z'
    completed_at: '2026-04-18T03:43:31Z'
    result: advance
  - hat: design-reviewer
    started_at: '2026-04-18T03:43:31Z'
    completed_at: '2026-04-18T03:49:39Z'
    result: advance
  - hat: feedback-assessor
    started_at: '2026-04-18T03:49:39Z'
    completed_at: '2026-04-18T03:53:23Z'
    result: reject
    reason: >-
      FB-12 / FB-20 / FB-25 are all substantively closed — verified by the
      assessor: pins use `.pin-hit::before` / `.pin::before` 44×44 hit areas
      across feedback-inline-desktop.html, annotation-gesture-spec.html,
      annotation-popover-states.html; DESIGN-BRIEF.md §7 lines 647-651 now carry
      the `@media (prefers-reduced-motion: reduce) { .feedback-fab-pulse {
      animation: none; } }` sibling guard that was missing in bolt 1; every
      artifact `@keyframes` block has a reduced-motion fallback
      (comment-to-feedback-flow.html uses a single collective block covering all
      6 animations explicitly); state-coverage-grid.md enumerates all surfaces
      with the six-state matrix; revisit-modal-states.html renders the §error +
      §error-mid-commit rollback toast; stage-progress-strip.html distinguishes
      tabindex="-1" future-never-visited from tabindex="0" previously-visited;
      feedback-inline-mobile.html §FAB state coverage renders all six FAB
      states; annotation-popover-states.html §State 4b renders disabled-body
      Create; revisit-unit-list.html .locked-card:focus-visible renders focus
      ring on locked units; feedback-card-states.html §5b renders the explicit
      error card; DESIGN-BRIEF.md §2 carries the state-coverage-requirement
      amendment; DESIGN-TOKENS.md §1.10 documents the 44px rule + WCAG
      1.4.11/2.5.8 exceptions. ONLY issue: none of the 12 completion-criteria
      checkboxes in unit-15-state-coverage-and-motion.md lines 123-134 were
      ticked — harness rejected with `criteria_not_met, unchecked: 12`. Designer
      on the next bolt: do nothing except flip every `- [ ]` to `- [x]` in the
      Completion criteria section of the unit spec. No artifact edits needed.
  - hat: design-reviewer
    started_at: '2026-04-18T03:53:23Z'
    completed_at: null
    result: null
---
# Interactive state coverage, touch targets, and reduced-motion guards

## Scope

Three FB items all flag that the wireframes show happy-path states but skip the systematic state matrix. This unit produces the missing state grid, lifts every touch-activated control to 44px, and adds `prefers-reduced-motion` guards to every animation.

**FB-to-fix mapping:**

- **FB-12** (28px pin touch targets): the spec already requires 44px — enforce it. Make pins `w-11 h-11` (44px visual) OR wrap the 28px visual in a 44px invisible hit area. Affected: `feedback-inline-desktop.html:164/180/183`, `annotation-gesture-spec.html:195`, `annotation-popover-states.html` `.pin` CSS at :55-63. Tablet breakpoint (≥ 768px) keeps pins tappable, so the rule applies at desktop widths on touch tablets. Produce `touch-target-audit.md` measuring every touch-activated control.
- **FB-20** (reduced-motion guard): add `@media (prefers-reduced-motion: reduce) { .feedback-fab-pulse { animation: none; } }` to `feedback-inline-mobile.html:30-37` and DESIGN-BRIEF §7. Audit every other animation (`sheet-up`, `pop-in`, `review-pulse`, `feedback-status-change`, cross-flash, etc.) and add the same guard. `focus-ring-spec.html` already does this correctly for cross-flash (:78-82) — use that as the template. Produce `motion-and-reduced-motion-spec.md` listing every animation and its reduced-motion fallback.
- **FB-25** (state coverage incomplete): produce `state-coverage-grid.md` enumerating every interactive surface across all artifacts with all six columns (default, hover, focus, active, disabled, error). The following artifacts have known gaps and need explicit new state renderings:
  - `revisit-modal-states.html` — add error/failure-on-confirm state (what happens when `haiku_revisit` fails mid-commit); mirror the feedback-card toast+revert pattern.
  - `stage-progress-strip.html` — distinguish `tabindex="-1"` future stages (not in tab order) from focusable-but-no-action visited stages (in tab order but no activation).
  - `feedback-inline-desktop.html` + `feedback-inline-mobile.html` — FAB: break out default/hover/focus/active/disabled (currently rendered as one state).
  - `annotation-popover-states.html` — add an explicit disabled-popover state (empty-body Create behavior, called out in unit-04-design-review §5).
  - `revisit-unit-list.html` — focus ring documented for locked/completed units (read-only inspection).
  - `feedback-card-states.html` — error state rendered as an explicit card visual (not only as a toast copy).

## Approach

The designer hat will:

1. Produce `touch-target-audit.md` listing every touch-activated control and its measured dimensions; remediate any below 44px.
2. Produce `motion-and-reduced-motion-spec.md` listing every `@keyframes` block across DESIGN-BRIEF §7 and all artifacts, with the reduced-motion fallback spelled out.
3. Sweep every artifact to add the `@media (prefers-reduced-motion: reduce)` block next to each animation definition.
4. Produce `state-coverage-grid.md` tabulating every interactive surface with six-state coverage; render explicit new states in the artifacts listed above.
5. Amend DESIGN-BRIEF §2 (body text) to require state-coverage grids for all new components, and DESIGN-TOKENS.md (body text) with the touch-target rule.

The design-reviewer hat will walk the state-coverage grid row by row, verify every surface has all six states rendered or explicitly marked N/A (with rationale), and will check reduced-motion fallbacks in a motion-testing tool equivalent.

The feedback-assessor hat (auto-injected) will independently verify: every pin button measures ≥ 44px; every `@keyframes` has a sibling `prefers-reduced-motion` block; every surface flagged by FB-25 has all six state renderings now present.

## Completion criteria

- [ ] Every pin marker has a ≥ 44×44px hit area (visual OR invisible wrapper); `touch-target-audit.md` documents each
- [ ] DESIGN-TOKENS.md documents the 44px touch-target rule + WCAG 2.2 1.4.11 24px desktop minimum + explicit exceptions
- [ ] Every `@keyframes` block in DESIGN-BRIEF §7 and every artifact has a sibling `@media (prefers-reduced-motion: reduce)` block
- [ ] `motion-and-reduced-motion-spec.md` enumerates every animation with its reduced-motion fallback
- [ ] `state-coverage-grid.md` renders a six-column grid (default/hover/focus/active/disabled/error) for every interactive surface
- [ ] `revisit-modal-states.html` renders an error/failure-on-confirm state
- [ ] `stage-progress-strip.html` distinguishes `tabindex="-1"` future stages from focusable-but-no-action visited stages
- [ ] `feedback-inline-desktop.html` + `feedback-inline-mobile.html` render explicit FAB default/hover/focus/active/disabled states
- [ ] `annotation-popover-states.html` renders an explicit disabled-popover state
- [ ] `revisit-unit-list.html` renders focus ring on locked/completed units
- [ ] `feedback-card-states.html` renders an explicit error card visual (not only toast copy)
- [ ] DESIGN-BRIEF §2 body text amended to require state-coverage grids for new components

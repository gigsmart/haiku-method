---
title: Question page + Direction page refactors
type: implementation
depends_on:
  - unit-04-design-token-system
  - unit-05-a11y-foundations
  - unit-06-shell-and-routing
quality_gates:
  - typecheck
  - test
inputs:
  - knowledge/DESIGN-TOKENS.md
  - stages/design/DESIGN-BRIEF.md
  - stages/design/artifacts/aria-landmark-spec.md
  - stages/design/artifacts/aria-live-sequencing-spec.md
  - stages/design/artifacts/state-signaling-inventory.html
status: completed
bolt: 1
hat: reviewer
started_at: '2026-04-21T15:00:33Z'
hat_started_at: '2026-04-21T15:35:45Z'
iterations:
  - hat: planner
    started_at: '2026-04-21T15:00:33Z'
    completed_at: '2026-04-21T15:07:30Z'
    result: advance
  - hat: builder
    started_at: '2026-04-21T15:07:30Z'
    completed_at: '2026-04-21T15:35:45Z'
    result: advance
  - hat: reviewer
    started_at: '2026-04-21T15:35:45Z'
    completed_at: '2026-04-21T15:43:18Z'
    result: advance
outputs:
  - stages/development/artifacts/unit-14-tactical-plan.md
  - packages/haiku-ui/src/components/DesignPicker.tsx
  - packages/haiku-ui/src/components/QuestionPage.tsx
  - packages/haiku-ui/src/pages/direction/DirectionPage.tsx
  - packages/haiku-ui/src/pages/direction/__tests__/DirectionPage.test.tsx
  - packages/haiku-ui/src/pages/direction/index.tsx
  - packages/haiku-ui/src/pages/question/QuestionPage.tsx
  - packages/haiku-ui/src/pages/question/__tests__/QuestionPage.test.tsx
  - packages/haiku-ui/src/pages/question/index.tsx
  - packages/haiku-ui/test-fixtures/direction-session.json
  - packages/haiku-ui/test-fixtures/question-session-free-text.json
  - packages/haiku-ui/test-fixtures/question-session-multi-choice.json
  - packages/haiku-ui/test-fixtures/question-session.json
  - packages/haiku-ui/tests/__snapshots__/parity.spec.tsx.snap
  - packages/haiku-ui/tests/a11y-pages.spec.tsx
completed_at: '2026-04-21T15:43:18Z'
model: sonnet
---
# Question page + Direction page refactors

Bring the other two session-typed pages onto the new design foundation. Both are simpler than review, grouped into one unit.

**Note on visual baselines.** DESIGN-BRIEF does not include dedicated mockups for the question or direction pages. This unit does NOT assert "zero visual regression vs design mockups" — there are none. Instead, the completion criteria are functional (DOM structure, a11y tree, token compliance).

## Scope

### `packages/haiku-ui/src/pages/question/QuestionPage.tsx`

- Renders `QuestionSession` payload from `haiku-api`.
- Image carousel when multiple images — `role="region" aria-roledescription="carousel"`, arrow-key navigation between images.
- Response form: discriminated on `question.type`:
  - `multi-choice` → `<fieldset><legend>…</legend><input type="radio" ... /></fieldset>`.
  - `free-text` → `<textarea>` with label.
- Validated via `QuestionAnswerRequest` Zod schema.
- Submits via `ApiClient.answerQuestion(sessionId, ...)`. On 200: live-region announce "Answer submitted", close page.

### `packages/haiku-ui/src/pages/direction/DirectionPage.tsx`

- Renders `DirectionSession` payload.
- Card grid with preview images; each card is `<input type="radio" name="direction" />` inside a `<label>` with visible card content. Wrapping `<fieldset role="radiogroup" aria-labelledby="direction-prompt-title">`.
- Parameter controls (card density, group-by-visit, origin badge) use the canonical Input primitive from unit-04.
- Optional comment + annotations fields submit together.
- Validated via `DirectionSelectRequest` Zod.
- Submits via `ApiClient.selectDirection(sessionId, ...)`.

## Test fixtures committed in this unit

- `packages/haiku-ui/test-fixtures/question-session.json`:
  - Two variants: `multi-choice` (5 options, 2 images) and `free-text` (1 image).
- `packages/haiku-ui/test-fixtures/direction-session.json`:
  - Three direction cards, each with preview image + 3 params.

## Out of scope

- Backend question/direction payload shapes (owned by haiku-api).

## Completion Criteria

**Question page:**
- Renders against the committed fixtures at `/question/demo-multi-choice` and `/question/demo-free-text` — boots via the fixture server from unit-06.
- Multi-choice: `screen.getByRole('radiogroup', { name: /.+/ })` resolves; every radio is keyboard-navigable via Arrow keys; selected radio has `aria-checked="true"`.
- Free-text: textarea is labeled; submit enabled only when non-empty; label:for association verified.
- Carousel: arrow keys advance images; `aria-current="true"` on the active slide.
- On submit success: live-region announces "Answer submitted".

**Direction page:**
- Renders against `direction-session.json`.
- Radiogroup is keyboard-navigable; selection updates `aria-checked`.
- Parameter inputs use the canonical Input component (grep in `DirectionPage.tsx` for non-Input `<input>` tags returns zero).
- Submit posts the direction + optional comment.

**Shared:**
- Every interactive element has visible focus ring via `focusRingClass`.
- `audit-contrast.mjs --mode=tokens` passes for page text against token backgrounds.
- `audit-banned-patterns.mjs --profile=tokens` returns zero hits.
- `npx tsc --noEmit` passes.

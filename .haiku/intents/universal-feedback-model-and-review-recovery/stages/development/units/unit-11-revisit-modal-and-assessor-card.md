---
title: RevisitModal + AssessorSummaryCard
type: implementation
depends_on:
  - unit-01-extract-haiku-api-package
  - unit-05-a11y-foundations
  - unit-06-shell-and-routing
quality_gates:
  - typecheck
  - test
inputs:
  - knowledge/DESIGN-TOKENS.md
  - stages/design/DESIGN-BRIEF.md
  - stages/design/artifacts/revisit-modal-spec.html
  - stages/design/artifacts/revisit-modal-states.html
  - stages/design/artifacts/revisit-unit-list.html
  - stages/design/artifacts/assessor-summary-card.html
  - stages/design/artifacts/review-flow-with-feedback-assessor.html
  - stages/design/artifacts/rollback-reason-banner.html
status: completed
bolt: 1
hat: reviewer
started_at: '2026-04-21T15:00:31Z'
hat_started_at: '2026-04-21T15:29:25Z'
iterations:
  - hat: planner
    started_at: '2026-04-21T15:00:31Z'
    completed_at: '2026-04-21T15:08:49Z'
    result: advance
  - hat: builder
    started_at: '2026-04-21T15:08:49Z'
    completed_at: '2026-04-21T15:29:25Z'
    result: advance
  - hat: reviewer
    started_at: '2026-04-21T15:29:25Z'
    completed_at: '2026-04-21T15:41:46Z'
    result: advance
outputs:
  - stages/development/artifacts/unit-11-tactical-plan.md
  - packages/haiku-ui/package.json
  - packages/haiku-ui/src/api/client.ts
  - packages/haiku-ui/src/components/AssessorSummaryCard.tsx
  - packages/haiku-ui/src/components/RevisitModal.tsx
  - packages/haiku-ui/src/components/__tests__/AssessorSummaryCard.test.tsx
  - packages/haiku-ui/src/components/__tests__/RevisitModal.test.tsx
completed_at: '2026-04-21T15:41:46Z'
model: sonnet
---
# RevisitModal + AssessorSummaryCard

Two modal-adjacent components grouped because both need dialog/live-region semantics and share a11y patterns.

## Scope

### `packages/haiku-ui/src/components/RevisitModal.tsx`

- Native `<dialog>` with `role="dialog"`, `aria-modal="true"`, `aria-labelledby`.
- Collects revisit reasons (title + body per reason) validated against `haiku-api`'s `RevisitRequest` schema (includes title ≤ 200, body ≤ 10_000, reasons.length ≤ 50).
- Field-level validation via Zod; errors rendered per `revisit-modal-states.html` error state.
- Posts to `POST /api/revisit/:sessionId` (implemented in unit-02) via the typed `ApiClient`; on 200 the modal closes and user sees the outcome.
- Focus trap + Escape close + focus-return-to-trigger handled natively.

### `packages/haiku-ui/src/components/AssessorSummaryCard.tsx`

- Root element: `<article role="status" aria-live="polite">` — regression guard for missing-live-region-on-root class.
- Renders feedback-assessor outcome (closed / still-open / rejected counts + per-finding status) from session payload.
- Visual state per `assessor-summary-card.html` — no opacity on card root.
- Count transitions on re-render trigger a polite announcement — debounced to one announcement per 500ms to avoid chatter.

## Out of scope

- The feedback-assessor fix-loop logic (MCP-side, already shipped).

## Completion Criteria

### RevisitModal

- Opens with focus on the first reason-input field.
- Closes via Escape; backdrop click; cancel button. Focus returns to the trigger.
- Validation:
  - Empty reasons array → form submit disabled; submit attempt shows error "At least one reason required".
  - Title empty on a reason → inline error; submit disabled.
  - Body empty on a reason → inline error; submit disabled.
  - Title > 200 chars → error, submit disabled.
  - Body > 10,000 chars → error, submit disabled.
  - Reasons > 50 → error, submit disabled.
- On valid submit: POSTs `RevisitRequest` to `/api/revisit/:sessionId`, expects 200 with `RevisitResponse`, closes modal.
- RTL tests cover each validation case.

### AssessorSummaryCard

- Root element `<article>` has `role="status"` and `aria-live="polite"` — asserted via DOM snapshot.
- No `opacity-50/60/70` classes on root — `audit-banned-patterns.mjs --profile=tokens` returns zero hits on this component source.
- Count transition test: render card with `{closed: 3}`, rerender with `{closed: 5}`; within 500ms a polite live-region announcement appears with text matching `/5 (of \d+ )?findings? (addressed|resolved|closed)/i`.
- Accessibility tree: `screen.getByRole('status')` resolves.

- `npx tsc --noEmit` passes.

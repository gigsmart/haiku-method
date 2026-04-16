---
title: Review server CRUD endpoints and review app UI
type: implementation
depends_on:
  - unit-01-feedback-helpers-and-tool
  - unit-05-orchestrator-integration
quality_gates:
  - typecheck
  - test
inputs:
  - knowledge/DATA-CONTRACTS.md
  - knowledge/ACCEPTANCE-CRITERIA.md
  - knowledge/DESIGN-TOKENS.md
  - stages/design/DESIGN-BRIEF.md
  - stages/design/artifacts/feedback-inline-desktop.html
  - stages/design/artifacts/comment-to-feedback-flow.html
  - stages/design/artifacts/review-package-structure.html
  - stages/design/artifacts/stage-progress-strip.html
  - stages/design/artifacts/review-context-header.html
  - stages/design/artifacts/revisit-unit-list.html
  - features/review-ui-feedback.feature
status: active
bolt: 1
hat: planner
started_at: '2026-04-16T16:07:06Z'
hat_started_at: '2026-04-16T16:07:06Z'
---

# Review Server CRUD Endpoints and Review App UI

Implement Groups 11+12 from IMPLEMENTATION-MAP.md: HTTP CRUD endpoints for feedback files in `http.ts`, and the review app UI changes in `review-app/src/` for the feedback panel, inline annotations, stage progress strip, review context header, and revisit-mode unit presentation.

## Completion Criteria

### Group 11: Review Server CRUD Endpoints
- `GET /api/feedback/{intent}/{stage}` returns JSON array of feedback items, supports `?status=` filter
- `POST /api/feedback/{intent}/{stage}` creates feedback file (origin: user-visual, author: user), returns 201 with feedback item
- `PUT /api/feedback/{intent}/{stage}/{id}` updates feedback fields, returns 200
- `DELETE /api/feedback/{intent}/{stage}/{id}` deletes feedback file, returns 200 with confirmation. 409 for pending items. No author-type restriction (human context)
- All endpoints call `gitCommitState` on mutation
- 400 for missing required fields, 404 for nonexistent intent/stage/id
- Tests cover all 7 AC-11.* acceptance criteria

### Always-Available Review Pane
- The review UI is openable at ANY time, not just during gate reviews — user can ask "show me the review" or the agent can open it for status checking/testing
- New `haiku_review` MCP tool (or extend existing) that opens the review pane with zero required arguments — it auto-detects the active intent and stage from `.haiku/` state files (intent.md `active_stage` + stage `state.json` phase)
- New `GET /api/review/current` endpoint that returns the current intent state (active intent, active stage, phase, unit statuses, feedback summary) for the review app to render on load
- The review app loads showing the current position: stage progress strip highlights the active stage, review context header shows the current gate context, feedback panel shows all feedback for the active stage
- No "I am at unit X" arguments needed — the file-based state is the truth, the server reads it
- When opened outside a gate context: shows a read-only overview (no Approve/Request Changes buttons), stage progress strip is navigable (click completed stages to browse their artifacts)
- When opened during a gate: shows the full review UI with decision buttons (existing behavior, now with the stage progress strip and context header)

### Group 12: Review App UI
- Feedback panel in sidebar with segmented Feedback/Mine toggle
- Status filter pills (Pending/Addressed/All)
- Feedback item cards with status badges (pending=amber, addressed=blue, closed=green, rejected=gray) and origin badges (adversarial-review=rose, external-pr=violet, user-visual=sky, agent=teal)
- Stage progress strip (`● ─ ● ─ ◆ ─ ○ ─ ○`) at top of review page
- Review context header ("Review Intent", "Review Elaboration: {stage}", "Review Stage: {stage}", "Final Review: {title}")
- Revisit-mode unit list: completed units grayed/locked (read-only context), new units highlighted with `closes:` badges
- Inline comment → feedback file creation via POST endpoint (debounced)
- Pin annotation → feedback file creation via POST endpoint
- Edit/delete existing feedback via PUT/DELETE endpoints
- Pre-existing feedback (from agents, external PRs) rendered as read-only annotation cards
- Mobile FAB + bottom-sheet pattern
- Design tokens from DESIGN-TOKENS.md throughout, gray palette for SSR-style layout
- All 16 review-ui-feedback.feature scenarios pass
- `npx tsc --noEmit` passes
- Review app builds without errors

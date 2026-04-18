---
title: Feedback panel wireframes
type: design
depends_on: []
quality_gates: []
inputs:
  - knowledge/DISCOVERY.md
  - knowledge/DESIGN-TOKENS.md
  - stages/design/DESIGN-BRIEF.md
status: completed
bolt: 1
hat: design-reviewer
started_at: '2026-04-16T12:49:03Z'
hat_started_at: '2026-04-16T12:56:51Z'
outputs:
  - stages/design/artifacts/feedback-inline-desktop.html
  - stages/design/artifacts/feedback-inline-mobile.html
  - stages/design/artifacts/stage-progress-strip.html
  - stages/design/artifacts/review-context-header.html
  - stages/design/artifacts/revisit-unit-list.html
completed_at: '2026-04-16T13:00:18Z'
---

# Feedback Panel + Review Chrome Wireframes

Produce wireframes for the inline feedback annotations direction, the stage progress indicator, and the review context header. Selected direction: feedback items appear pinned inline to their source location (code lines, visual annotations on images, document sections) with a summary sidebar. Covers desktop, tablet, and mobile breakpoints.

## Completion Criteria

### Inline Feedback Annotations (selected direction)
- HTML wireframes at `stages/design/artifacts/feedback-inline-desktop.html` and `stages/design/artifacts/feedback-inline-mobile.html`
- Code-line feedback: annotation cards float adjacent to the referenced line with a connecting line, showing status badge + origin badge + author + collapsible body
- Visual/design feedback: annotation cards overlay images/mockups at the pin's x,y position (from AnnotationCanvas), with the same card format as code-line annotations
- Paragraph-level feedback: for prose/document findings, annotations anchor to the section header
- Unanchored feedback (general comments with no source_ref): shown in a "General" section at the top of the sidebar summary
- Sidebar summary: compact list of all feedback items with status filter pills (Pending/Addressed/All), click → scrolls to in-context annotation
- Mobile: FAB + bottom-sheet pattern, tap item → content scrolls to relevant section, no floating annotations (too cramped)
- All interactive states: default, hover, expanded, collapsed, loading, empty, error
- Design tokens from DESIGN-TOKENS.md throughout (no raw hex)
- Touch targets ≥ 44px on mobile
- Focus order for keyboard navigation documented
- **Landmark structure mandated (amendment from unit-13, 2026-04-17):** every page-level artifact renders `<header role="banner">`, `<nav aria-label="Stage progress">` around the stage-progress-strip, `<main id="main-content" role="main">`, `<aside role="complementary" aria-label="Review sidebar">` (desktop), `role="dialog" aria-modal="true" aria-labelledby="{titleId}"` on every modal, `role="status" aria-live="polite"` on assessor-summary-card root, plus a skip link as the first focusable element. See `artifacts/aria-landmark-spec.md` for the complete landmark map and per-surface table.
- **Focus ring canonical rule:** every `<button>`, `<a>`, `<input>`, `<textarea>`, `[tabindex="0"]` declares `focus-visible:ring-2 focus-visible:ring-teal-500` with 2px offset (1px offset for dense feedback cards). See `artifacts/focus-ring-spec.html`.
- **Emoji ↔ origin mapping:** canonical single-source — `🔍 adversarial-review`, `🔗 external-pr/mr`, `✎ user-visual`, `💬 user-chat`, `🤖 agent`. Every artifact and DESIGN-BRIEF §2 render the same code points. See `artifacts/aria-landmark-spec.md §6`.

### Stage Progress Indicator
- HTML wireframe at `stages/design/artifacts/stage-progress-strip.html`
- Horizontal pipeline strip at the top of the review screen: `● ─ ● ─ ◆ ─ ○ ─ ○`
- `●` = completed/reviewed stages (filled dot, clickable — opens that stage's review artifacts in a read-only view)
- `◆` = current stage being reviewed (highlighted, active)
- `○` = future stages (grayed, clickable ONLY if previously visited i.e. visits > 0, otherwise disabled)
- Stage names visible below each dot (abbreviated on mobile)
- Responsive: horizontal scroll or wrap on narrow viewports

### Review Context Header
- HTML wireframe at `stages/design/artifacts/review-context-header.html`
- Clear label at the top of the review page stating WHAT is being reviewed:
  - "Review Intent" — first-stage intent_review gate (approving the whole intent + first stage specs)
  - "Review Elaboration: {stage}" — specs gate on subsequent stages (approving units before execution)
  - "Review Stage: {stage}" — stage-end gate after adversarial review (approving execution output)
  - "Final Review: {intent title}" — last stage's gate (approving the complete intent for delivery)
- Visual hierarchy: the context label is prominent (large, colored by gate type) above the stage progress strip
- Gate type badge: ask (blue), external (purple), auto (amber — shown briefly before auto-advancing)

### Revisit-Mode Unit Presentation (visits > 0)
- HTML wireframe at `stages/design/artifacts/revisit-unit-list.html`
- When reviewing re-elaboration after a revisit (visits > 0), the unit list must clearly separate completed from new:
  - **Completed units**: shown grayed/locked with a "completed" badge, visually recessed (lower opacity or muted border), NOT expandable for editing. Present as **context only** — the user must not think these will be re-executed.
  - **New units**: highlighted with a "new" accent, each showing which feedback items it addresses (`closes: FB-01, FB-03`), fully expandable for review
  - **Section headers**: "Completed Units (7) — read-only" above the grayed list, "New Units (2) — addressing feedback" above the highlighted list
- The review context header for this case: "Review Elaboration: {stage} (visit {N})" with a visit badge showing "Revisit — {N} feedback items to address"
- The feedback items driving this revisit are listed prominently above the new units so the user can verify coverage: "Pending feedback: FB-01 XSS in archetype renderer, FB-02 postMessage wildcard → New units: unit-08-xss-fix (closes FB-01), unit-09-postmessage-fix (closes FB-02)"
- If any pending feedback has no owning new unit → show a warning: "FB-03 has no unit — elaboration cannot advance until all feedback is addressed"

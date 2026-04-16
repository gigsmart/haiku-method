---
title: Review UI package unification design
type: design
depends_on:
  - unit-01-feedback-panel-wireframes
quality_gates: []
outputs:
  - stages/design/artifacts/review-package-structure.html
inputs:
  - knowledge/DISCOVERY.md
  - knowledge/DESIGN-TOKENS.md
  - stages/design/DESIGN-BRIEF.md
status: active
bolt: 1
hat: design-reviewer
started_at: '2026-04-16T13:02:03Z'
hat_started_at: '2026-04-16T13:09:03Z'
---

# Review UI Package Unification Design

Design the extraction of the review UI into a standalone shared package that both the SPA (`packages/haiku/review-app/`) and the SSR website templates (`packages/haiku/src/templates/`) consume. Build on the existing `refactor/unified-review-sidebar` branch which already split `ReviewSidebar` into `CommentTray` + `DecisionForm` and simplified `ReviewPage`.

## Context

The review UI currently exists in two places:
1. **SPA** (`packages/haiku/review-app/src/`) — React app with Tailwind, serves the interactive review experience for intent/stage gates
2. **SSR templates** (`packages/haiku/src/templates/`) — server-rendered HTML templates for question forms, design direction picker, and the intent-review layout

The `refactor/unified-review-sidebar` branch (2 commits: `53442913`, `ac1faa34`) started unifying the sidebar: replaced `ReviewSidebar.tsx` with `CommentTray.tsx` + `DecisionForm.tsx`, removed the old Mermaid flow components. This branch should be merged into the intent's working branch as a starting point.

## Completion Criteria

### Package Structure
- Design document at `stages/design/artifacts/review-package-structure.html` showing the proposed package layout
- Package name: `@haiku/review-ui` (or similar monorepo-friendly name under `packages/`)
- Shared components inventory: which components move to the shared package vs. stay in the SPA or templates
- Import/export map: how each consumer (SPA, SSR templates) imports from the shared package
- Build strategy: does the package compile to ESM/CJS, or is it source-only with the consumer's bundler handling it?

### Component Migration Plan
- Which components from `review-app/src/components/` become shared (CommentTray, DecisionForm, StatusBadge, Tabs, Card, etc.)
- Which components stay SPA-only (App.tsx router, session hooks, etc.)
- Which SSR templates gain React islands or shared markup (intent-review.ts, question-form.ts)
- How the new feedback components (FeedbackItem, FeedbackList, FeedbackStatusBadge, StageProgressStrip, ReviewContextHeader) are authored as shared from day one

### Styling Strategy
- How Tailwind classes are shared across SPA and SSR consumers
- Whether the package ships its own Tailwind preset/plugin or relies on the consumer's Tailwind config
- Dark mode token consistency between SPA (`stone`-based) and SSR (`gray`-based) palettes (documented in DESIGN-TOKENS.md)

### Stage Progress Strip + Review Context Header in the shared package
- The stage progress indicator (`● ─ ● ─ ◆ ─ ○ ─ ○`) and the review context header ("Review Intent", "Review Elaboration", "Review Stage", "Final Review") are new shared components
- Design how they receive stage data (props contract) so both SPA and any future consumer can render them
- Responsive behavior: horizontal scroll on narrow viewports, abbreviated stage names on mobile

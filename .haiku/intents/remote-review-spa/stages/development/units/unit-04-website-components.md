---
title: Website — Stepped review UI component migration
type: frontend
status: completed
depends_on:
  - unit-03-website-review-shell
quality_gates:
  - All review-app components ported to website/app/components/review/
  - Stepped review flow with free navigation between sections
  - Steps marked as seen when visited
  - 'Comments collected per section in left sidebar, batched at decision'
  - Decision step auto-suggests action from comment state
  - Collapsible sidebar (expanded 280px / collapsed 64px)
  - Mobile layout collapses sidebar to top status bar
  - 'Color-coded session types (review=teal, question=amber, direction=indigo)'
  - AnnotationCanvas preserves pin and freehand drawing functionality
  - InlineComments preserves text selection commenting
  - ThemeToggle uses website next-themes (not custom)
  - MermaidDiagram uses website bundled mermaid (not CDN)
  - Direction picker shows thumbnail previews with radio selection
  - 'All binary file URLs use absolute tunnel URLs via /files/:sessionId/*path'
  - use client directives on all interactive components
  - bun run build succeeds
  - No TypeScript errors
bolt: 1
hat: reviewer
started_at: '2026-04-09T20:11:26Z'
hat_started_at: '2026-04-09T20:19:27Z'
completed_at: '2026-04-09T20:20:12Z'
---

# Website — Review Content Views (Browse Reuse + Standalone Forms)

## Architecture

```
ReviewShell (from Unit 3)
├── IntentReview → browse IntentDetailView (scoped to summary)
├── UnitReview → browse UnitDetailView (scoped to specific unit)
├── QuestionForm → ported from SPA, restyled
└── DirectionPicker → ported from SPA, restyled
```

## Reuse from browse (NOT ported from SPA)
- IntentDetailView — intent summary, stage pipeline, criteria
- UnitDetailView — unit spec, criteria checklist, fields
- BrowseMarkdown — markdown rendering with asset resolution
- AssetLightbox — image lightbox
- Mermaid — diagram rendering
- Status badges, card layouts, metadata grids

## Port from SPA (restyle to match website)
- QuestionPage.tsx → QuestionForm.tsx (multi-question form, radio/checkbox)
- DesignPicker.tsx → DirectionPicker.tsx (thumbnail previews, radio, sliders)
- AnnotationCanvas.tsx → AnnotationCanvas.tsx (overlay modal, pins, freehand)

## NOT ported (replaced by browse equivalents)
- ReviewPage.tsx, ReviewSidebar.tsx, Tabs.tsx, Card.tsx, StatusBadge.tsx
- MarkdownViewer.tsx, MermaidDiagram.tsx, ThemeToggle.tsx
- main.tsx, App.tsx, vite-env.d.ts, index.css

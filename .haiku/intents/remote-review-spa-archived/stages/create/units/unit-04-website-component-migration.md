---
title: Website — Component migration from review-app
type: content
status: pending
depends_on:
  - unit-03-website-review-page
quality_gates:
  - All 20 review-app components ported to website/app/components/review/
  - ReviewPage, QuestionPage, DesignPicker render correctly with remote session data
  - AnnotationCanvas and InlineComments preserve full annotation functionality
  - ThemeToggle replaced with website's next-themes system
  - MermaidDiagram uses website's bundled mermaid (not CDN script injection)
  - Sentry uses @sentry/nextjs instead of @sentry/react
  - All binary file URLs (mockups, wireframes, artifacts) use absolute tunnel URLs via /files/:sessionId/*path
  - types.ts shared between review components
  - use client directives on all interactive components
---

# Website — Component Migration

## What to Build

Port all components from `packages/haiku/review-app/src/` to `website/app/components/review/`:

### Direct ports (adapt imports, add "use client"):
- ReviewPage.tsx, ReviewSidebar.tsx, QuestionPage.tsx, DesignPicker.tsx
- AnnotationCanvas.tsx, InlineComments.tsx
- Tabs.tsx, Card.tsx, StatusBadge.tsx, CriteriaChecklist.tsx, SubmitSuccess.tsx
- types.ts

### Replace with website equivalents:
- ThemeToggle.tsx → use website's existing next-themes ThemeToggle
- MermaidDiagram.tsx → use website's existing bundled Mermaid.tsx component
- MarkdownViewer.tsx → use website's existing react-markdown setup or inline

### Adapt:
- All image/file `src` attributes: relative paths → absolute tunnel URLs via `/files/:sessionId/*path`
- Remove `main.tsx` (Next.js handles entry)
- Remove `App.tsx` routing (Next.js handles routing)
- Remove Vite-specific code (`vite-env.d.ts`, etc.)

## Key Files
- Source: `packages/haiku/review-app/src/components/*.tsx`
- Target: `website/app/components/review/*.tsx`

# Design Brief: Remote Review SPA

## Overview
Externalized review experience at haikumethod.ai/review/ — split panel layout with collapsible stepped sidebar.

## Layout
- **Split panel**: left sidebar (navigation + comments + actions) + right panel (read-only content)
- **Sidebar collapsible**: expanded (280px, step list + comments) ↔ collapsed (64px, progress dots)
- **Mobile**: sidebar collapses to thin top status bar

## Review Flow
Stepped walkthrough — reviewer advances through sections sequentially:
1. Each section displayed one at a time in the right panel
2. Comments entered in the left sidebar for the current step
3. Final "Decision" step summarizes all comments
4. Action auto-suggested based on comment state (has comments → Request Changes, no comments → Approve)

## Session Types
Color-coded accents distinguish session types:
- Review: teal (#14b8a6)
- Question: amber (#f59e0b)
- Direction: indigo (#6366f1)

## Entry Flow States
1. Loading — sidebar shows connection progress, right panel shows spinner
2. Connected — sidebar minimizes status to single dot, shows ToC
3. Error (expired/unreachable/malformed) — centered error card in right panel
4. Reconnecting — amber banner + pulsing sidebar indicator, content dimmed

## Key Interactions
- Sidebar collapse toggle (user-initiated or responsive)
- Step navigation (Back/Next buttons in sidebar)
- Comment textarea per step (in sidebar)
- Annotation canvas overlay for mockup images
- Direction picker: thumbnail previews with radio selection + parameter sliders

## Wireframes
- `stages/design/artifacts/entry-flow.html` — all connection states + mobile
- `stages/design/artifacts/review-ui.html` — stepped review, decision states, question/direction variants

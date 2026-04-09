# Design Decisions

## Core Principle: Review = Browse + Review Layer

The review experience reuses the website's existing browse components for content rendering. This gives us visual consistency for free and cuts the implementation scope significantly.

- IntentReview uses browse's `IntentDetailView` (scoped to intent summary, not all units expanded)
- UnitReview uses browse's `UnitDetailView` (scoped to the specific unit)
- QuestionForm and DirectionPicker are standalone (no browse equivalent)

## Layout: Browse Content + Review Sidebar

- **Right panel**: Browse's existing content views (IntentDetailView or UnitDetailView)
- **Left sidebar**: Review-specific overlay — stepped nav, comments, decision action
- Sidebar collapsible: expanded (280px, step list + comments) ↔ collapsed (64px, progress dots)
- User can toggle collapse at any viewport width
- Auto-collapses on narrow viewports, collapses to top status bar on mobile

## Review Flow: Stepped with Free Navigation
- Sections derived from the browse content (intent: Problem, Solution, Units, Criteria, etc.)
- Free navigation — click any step, Back/Next for convenience
- Steps marked as "seen" when visited
- Comments entered per section in left sidebar, stored locally
- Comments batched and sent with decision (not real-time per-step)
- Final "Decision" step summarizes comments, auto-suggests action:
  - Has comments → suggests "Request Changes" (primary), "Approve Anyway" (secondary)
  - No comments → suggests "Approve" (primary), "Request Changes" (secondary)

## Session Type Accents
- Review: teal (#14b8a6)
- Question: amber (#f59e0b)
- Direction: indigo (#6366f1)

## Scoped Content (NOT content overload)
- **Intent review**: shows intent-level content only — problem, solution, criteria, DAG overview. Units shown as a summary list, not expanded.
- **Unit review**: shows that specific unit only — spec, criteria, wireframes, risks.
- **Question**: dedicated question form, not a browse view
- **Direction**: archetype thumbnails with radio + parameter sliders, not a browse view

## Direction Picker
- Archetype cards with thumbnail HTML previews (rendered in iframes/containers)
- Radio button selection (single choice)
- Parameter sliders below the selected archetype

## Annotation Canvas
- Overlay modal on mockup image click (same as current SPA)
- Pin placement + freehand drawing
- Not integrated inline — pops up over browse content

## Error States
- Fill the right panel with centered error card
- Left sidebar shows failed connection with red dot
- States: expired token, tunnel unreachable, malformed token, session not found

## Reconnecting
- Amber banner at top
- Sidebar shows amber pulsing dot with "Reconnecting..."
- Content becomes read-only (dimmed)

## Design Tokens (inherited from website)
- Stone palette, teal primary, Inter font
- All tokens from the existing browse experience carry over automatically
- No new tokens needed — review sidebar uses the same palette

# Design Decisions

## Layout: Split Panel with Collapsible Sidebar
- Left sidebar: connection status (minimal once connected), stepped review navigation, comment textarea, action buttons
- Right panel: read-only document content for the current step
- Sidebar collapsible: user can toggle between expanded (step list + comments) and collapsed (progress dots)
- Auto-collapses on narrow viewports, collapses to top status bar on mobile

## Review Flow: Stepped
- Reviewer walks through each section sequentially (Problem → Solution → Units → Criteria → Decision)
- Each step shows one section in the right panel
- Comments are entered in the left sidebar for the current step
- Final "Decision" step summarizes all comments and auto-suggests action:
  - Has comments → suggests "Request Changes" (primary), "Approve Anyway" (secondary)
  - No comments → suggests "Approve" (primary), "Request Changes" (secondary)

## Session Type Accents
- Review: teal (#14b8a6)
- Question: amber (#f59e0b)
- Direction: indigo (#6366f1)
- Accent applied to: session type label, step icons, progress dots, action buttons

## Direction Picker
- Archetype cards with thumbnail HTML previews (rendered in iframes/containers)
- Radio button selection (single choice)
- Parameter sliders below the selected archetype
- NOT just text cards — each archetype has a live preview thumbnail

## Annotation Canvas
- Keeps current overlay behavior — appears as modal when clicking mockup images
- Not integrated inline in the document flow

## Error States
- Fill the right panel with centered error card
- Left sidebar shows failed step with red dot
- States: expired token, tunnel unreachable, malformed token, session not found

## Reconnecting
- Amber reconnecting banner at top
- Left sidebar shows amber pulsing dot with "Reconnecting..."
- Right panel content becomes read-only (dimmed)

## Design Tokens (from website)
- Stone palette (neutral): 50-950
- Teal: #14b8a6 (primary)
- Background: #1c1917 (content), #0c0a09 (sidebar)
- Borders: #292524 (subtle), #44403c (medium)
- Text: #e7e5e4 (primary), #d6d3d1 (prose), #a8a29e (secondary), #78716c (muted)
- Font: Inter, system-ui
- Card radius: 12px
- Sidebar width: 280px expanded, 64px collapsed

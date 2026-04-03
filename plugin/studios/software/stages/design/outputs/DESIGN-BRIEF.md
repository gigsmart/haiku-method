---
name: design-brief
location: .haiku/intents/{intent-slug}/stages/design/DESIGN-BRIEF.md
scope: stage
format: design
required: true
---

# Design Brief

Screen-by-screen design specifications for the intent's user-facing surfaces. This output is the contract between design and development — what gets built should match what's specified here.

## Content Guide

For each screen or view:

- **Layout structure** — columns, sections, positioning, and spacing
- **Component inventory** — each component with its location, purpose, and props
- **Interaction states** — default, hover, focus, active, disabled, error, loading, empty for each interactive element
- **Responsive behavior** — layout changes at each breakpoint (mobile 375px, tablet 768px, desktop 1280px)
- **Navigation flows** — how users move between screens, what triggers transitions
- **Accessibility requirements** — contrast ratios, label associations, keyboard navigation paths, focus management

Include a **design gaps** section documenting known missing states and their disposition (designed, deferred, out of scope).

## Quality Signals

- Every interactive element has all applicable states specified
- Responsive behavior is described per breakpoint, not just "it's responsive"
- Colors reference named tokens, never raw hex values
- Touch targets are at least 44px on mobile
- Keyboard navigation order is defined for complex interactions

---
name: design
description: Visual and interaction design for user-facing surfaces
hats: [designer, design-reviewer]
review: ask
unit_types: [design, frontend]
inputs:
  - stage: inception
    output: discovery
---

# Design

## Criteria Guidance

Good criteria examples:
- "Screen layouts specified for mobile (375px), tablet (768px), and desktop (1280px) breakpoints"
- "All interactive elements have specified states: default, hover, focus, active, disabled, error"
- "Design uses only named tokens from the design system — no raw hex values"
- "Touch targets are at least 44px on mobile"

Bad criteria examples:
- "Responsive design done"
- "States are defined"
- "Colors are consistent"

## Completion Signal

Design brief exists with screen layouts for all breakpoints. All interactive states are specified. Touch targets meet minimum size. Design tokens are defined (no raw hex values). Design reviewer has verified consistency, state coverage, and accessibility compliance.

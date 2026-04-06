---
name: design-artifacts
location: .haiku/intents/{intent-slug}/stages/design/artifacts/
scope: intent
format: design
required: true
---

# Design Artifacts

High-fidelity design deliverables for the intent's user-facing surfaces. These are the actual visual designs — mockups, wireframes, component specs — stored inside the intent as part of its specification.

Design artifacts live in the intent's stage directory because they ARE the spec. Downstream stages (product, development) reference them as inputs to understand what gets built.

## Content Guide

- Screen mockups at all specified breakpoints (e.g., login-screen-desktop.png, login-screen-mobile.png)
- Component library additions or modifications
- Icon/asset exports needed for development
- Interactive prototypes or flow diagrams
- Design tool source files (.pen, .fig, .sketch) when applicable

## Quality Signals

- Every screen specified in the design brief has a corresponding mockup
- Mockups match the design tokens (colors, spacing, typography)
- Interactive states are visually represented, not just documented
- Assets are in formats usable by development (PNG, SVG, or design tool native)

---
name: design
description: Visual and interaction design for user-facing surfaces
hats: [designer, design-reviewer]
review: [external, ask]
elaboration: collaborative
unit_types: [design]
inputs:
  - stage: inception
    discovery: discovery
---

# Design

## Phase Instructions (RFC 2119)

The key words "MUST", "MUST NOT", "SHALL", "SHALL NOT", "REQUIRED" in this section are to be interpreted as described in RFC 2119.

### Elaboration Phase

During elaboration, the agent **MUST** create **multiple low-fidelity wireframe variants** and present them for the user to choose a direction:

1. The agent **MUST** generate 2-3 distinct design approaches as HTML wireframe snippets (different layouts, interaction patterns, or visual hierarchies)
2. The agent **MUST** call `pick_design_direction` with the variants as `archetypes` — each with a `name`, `description`, `preview_html` (the rendered wireframe), and `default_parameters` (tunable values like spacing, column count, etc.)
3. The user selects their preferred direction and adjusts parameters
4. The agent **MUST** use the selected direction to create the final wireframes saved to `stages/design/artifacts/`
5. The agent **MUST NOT** produce ASCII art wireframes — all wireframes **MUST** be HTML or design provider files
6. If a design provider MCP is available (Pencil, OpenPencil, Figma), the agent **SHOULD** use it instead of raw HTML

### Execute Phase

During execute, the designer hat **MUST** produce **high-fidelity mockups** from the approved wireframes. The agent **MUST** apply real design tokens, specify all interactive states, and define responsive behavior at each breakpoint. The output **MUST** be production-ready design — polished, not sketched.

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

Design brief **MUST** exist with screen layouts for all breakpoints. All interactive states **MUST** be specified. Touch targets **MUST** meet minimum size. Design tokens are **REQUIRED** — the agent **MUST NOT** use raw hex values. Design reviewer **MUST** have verified consistency, state coverage, and accessibility compliance.

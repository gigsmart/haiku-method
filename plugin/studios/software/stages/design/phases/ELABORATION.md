---
skip: []
add: []
wireframe_fidelity: high
criteria_focus: design
---

# Design Stage — Elaboration

## Phase Instructions (RFC 2119)

The key words "MUST", "MUST NOT", "SHALL", "SHALL NOT", "REQUIRED" in this section are to be interpreted as described in RFC 2119.

During elaboration, the agent **MUST** create **multiple low-fidelity wireframe variants** and present them for the user to choose a direction:

1. The agent **MUST** generate 2-3 distinct design approaches as HTML wireframe snippets (different layouts, interaction patterns, or visual hierarchies)
2. The agent **MUST** call `pick_design_direction` with the variants as `archetypes` — each with a `name`, `description`, `preview_html` (the rendered wireframe), and `default_parameters` (tunable values like spacing, column count, etc.)
3. The user selects their preferred direction and adjusts parameters
4. The agent **MUST** use the selected direction to create the final wireframes saved to `stages/design/artifacts/`
5. The agent **MUST NOT** produce ASCII art wireframes — all wireframes **MUST** be HTML or design provider files
6. If a design provider MCP is available (Pencil, OpenPencil, Figma), the agent **SHOULD** use it instead of raw HTML

## Criteria Guidance

When generating criteria for this stage, focus on verifiable design deliverables:

- Screen layouts defined for all breakpoints (mobile 375px / tablet 768px / desktop 1280px)
- All interactive states specified (default, hover, focus, active, disabled, error)
- Color usage references only design system tokens — no raw hex values
- Touch targets meet 44px minimum on mobile breakpoints
- Empty states, loading states, and error states designed
- Contrast ratios meet WCAG AA (4.5:1 body text, 3:1 large text)
- Focus order documented for keyboard navigation
- Component hierarchy documented (which design system components to use/extend)
- Interaction specs complete for all user actions (tap, swipe, scroll, transition)

Design criteria are verified by **visual approval** — a reviewer inspects the deliverable against the criteria, not automated tests.

Bad criteria: "Design looks good", "It's responsive", "Accessible"

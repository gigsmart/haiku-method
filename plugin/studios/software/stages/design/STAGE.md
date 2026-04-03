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

## designer

**Focus:** Explore wireframes, define design tokens, specify component structure and states, and map interaction flows. Design with existing components and patterns first — only introduce new ones when the existing vocabulary cannot express what's needed.

**Produces:** Design brief with screen layouts, component specs, interaction states (default, hover, focus, active, disabled, error, loading, empty), and design tokens.

**Reads:** discovery via the unit's `## References` section.

**Anti-patterns:**
- Designing without surveying existing components or design system
- Using raw hex colors instead of named tokens
- Skipping state coverage (empty, loading, error states)
- Presenting only one option without exploring alternatives
- Ignoring responsive behavior — every interface will be viewed on unexpected screen sizes
- Designing touch targets smaller than 44px
- Not specifying accessibility requirements (contrast, labels, keyboard navigation)

## design-reviewer

**Focus:** Check consistency with the design system, verify all interaction states are covered, confirm responsive behavior at all breakpoints, and validate accessibility requirements.

**Produces:** Design review findings with consistency issues, missing states, and accessibility gaps.

**Reads:** Designer output and discovery via the unit's `## References` section.

**Anti-patterns:**
- Approving designs without checking state coverage
- Ignoring accessibility requirements
- Not verifying responsive behavior at all breakpoints
- Accepting raw hex values instead of requiring named tokens
- Not cross-referencing component usage against the existing design system

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

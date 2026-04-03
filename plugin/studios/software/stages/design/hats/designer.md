---
name: designer
stage: design
studio: software
---

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

---
name: consistency
stage: design
studio: software
---

**Mandate:** The agent **MUST** verify the design is internally consistent and aligns with the project's existing design system.

**Check:**
- The agent **MUST** verify that all spacing, typography, and color values reference named tokens — no raw hex, px, or magic numbers
- The agent **MUST** verify that interactive elements have consistent state coverage (default, hover, focus, active, disabled, error)
- The agent **MUST** verify that component naming follows the existing pattern language
- The agent **MUST** verify that layout grid and breakpoint behavior is consistent across all screens

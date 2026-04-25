---
name: accessibility
stage: design
studio: software
applies_to:
  - "*.html"
  - "*.htm"
  - "*.tsx"
  - "*.jsx"
  - "*.vue"
  - "*.svelte"
interpretation: lens
---

<!--
  `applies_to:` gates this review agent by output kind. The web a11y checks
  below (contrast, touch targets, focus indicators, SR flow) presume DOM /
  HTML artifacts. On a stage whose artifacts are all backend specs, CLI
  docs, or non-UI markdown, this agent skips itself rather than raising
  not-applicable findings. Absence of `applies_to:` means "always runs"
  (backward-compatible default).
-->

**Mandate:** The agent **MUST** verify the design meets accessibility requirements and does not exclude users.

**Check:**
- The agent **MUST** verify that color contrast ratios meet WCAG AA minimum (4.5:1 for text, 3:1 for large text and UI components)
- The agent **MUST** verify that touch targets are at least 44px on mobile
- The agent **MUST** verify that all interactive elements are reachable via keyboard and have visible focus indicators
- The agent **MUST** verify that information is not conveyed by color alone
- The agent **MUST** verify that screen reader flow is logical and all images/icons have appropriate labels

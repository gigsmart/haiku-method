---
title: Raw hex values leak into artifact CSS despite token mandate
status: pending
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-17T22:30:32Z'
iteration: 1
visit: 1
source_ref: null
addressed_by: null
---

The mandate requires "all spacing, typography, and color values reference named tokens — no raw hex, px, or magic numbers." DESIGN-TOKENS.md is the token source. But 125 raw hex-style occurrences remain across 10 artifact files.

Most egregious:
- `feedback-lifecycle-transitions.html:11-14` defines CSS classes with raw hex:
  ```
  .arrow-human { stroke: #2563eb; } /* blue-600 */
  .arrow-human-dark { stroke: #60a5fa; } /* blue-400 */
  .arrow-agent { stroke: #0d9488; } /* teal-600 */
  .arrow-agent-dark { stroke: #2dd4bf; } /* teal-400 */
  ```
  Each comment even names the token — just use the token directly (Tailwind `stroke-blue-600`, etc.).
- `feedback-lifecycle-transitions.html:45, 48` arrow markers: `fill="#0d9488"`, `fill="#2563eb"` — same raw hex.
- `review-flow-with-feedback-assessor.html` (44 occurrences), `annotation-gesture-spec.html` (15), `review-ui-mockup.html` (11), `focus-ring-spec.html` (8), `stage-progress-strip.html` (8) — all contain inline `#hex` values that should be Tailwind classes or CSS variables referencing the DESIGN-TOKENS palette.

The unit-04 design-review specifically called this out at §6 — "production uses the Tailwind classes enumerated in the token checklist" — but the underlying artifacts still carry the raw hex. If dev copy-pastes these SVGs/CSS into production, dark-mode theming breaks (raw hex ignores the `.dark` class) and the token system gains ghost values.

Fix: replace every `#rrggbb` in the 10 affected files with either a Tailwind class (for Tailwind contexts) or a CSS custom property referenced in DESIGN-TOKENS.md.

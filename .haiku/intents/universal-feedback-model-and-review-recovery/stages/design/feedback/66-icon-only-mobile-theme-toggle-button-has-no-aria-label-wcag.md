---
title: >-
  Icon-only mobile theme-toggle button has no aria-label — WCAG 4.1.2 Name,
  Role, Value fail
status: pending
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-19T17:56:55Z'
iteration: 2
visit: 2
source_ref: null
closed_by: null
---

**WCAG 4.1.2 Name, Role, Value (A):** every interactive element must expose an accessible name. Icon-only buttons (emoji/SVG/glyph content) need `aria-label` or visually-hidden text.

`.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/feedback-inline-mobile.html:88-91`:
```html
<button class="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 touch-target flex items-center justify-center">
  <span>&#x263E;</span>
</button>
```

No `aria-label`. The crescent-moon glyph is announced inconsistently across screen readers (VoiceOver says "crescent moon", NVDA/JAWS may skip or read the unicode name). The desktop version at `feedback-inline-desktop.html:94` gets it right (`aria-label="Toggle color theme"`).

Also related on the same mobile file:
- Line 144–152, FAB: `aria-label="Open feedback panel, 3 pending"` — OK.
- Line 161, sheet close: `aria-label="Close feedback panel"` — OK.
- Line 88 theme toggle: MISSING.

**Fix:** Add `aria-label="Toggle color theme"` to the mobile theme-toggle button. Sweep other artifacts for icon-only buttons without labels — particularly annotation-popover ✕ close buttons and any standalone glyph `<button>` or `<a>`.

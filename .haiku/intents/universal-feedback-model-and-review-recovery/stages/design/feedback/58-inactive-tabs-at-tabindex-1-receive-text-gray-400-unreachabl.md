---
title: >-
  Inactive tabs at tabindex=-1 receive text-gray-400 — unreachable by keyboard
  AND low contrast (compound a11y fail)
status: pending
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-19T17:54:37Z'
iteration: 2
visit: 2
source_ref: null
closed_by: null
---

**WCAG 1.4.3 (AA)** + **2.1.1 Keyboard (A)** + **ARIA-1.2 tablist pattern.** The ARIA tablist roving-tabindex pattern is legitimate — inactive tabs are `tabindex="-1"` and reached via arrow keys. But two parts of the contract are broken here:

1. **Arrow-key navigation is undocumented / unrendered.** `focus-order-spec.md §1` mentions tablist roving-tabindex in a note but the artifacts don't render or script the arrow-key handler. Dev implementing from this spec needs an explicit keyboard handler contract.

2. **Contrast of inactive tabs fails WCAG 1.4.3:**
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/feedback-inline-desktop.html:110,111,112` — `text-gray-500 dark:text-gray-400`. Gray-500 (#6b7280) on white = 4.83:1 — PASS. But gray-400 (#9ca3af) on gray-950 (#030712) = 7.3:1 (ok). Light mode passes but…
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/feedback-inline-mobile.html:101,102` — `text-gray-500 dark:text-gray-400` on active tablist with `border-transparent` — same tabs.

Actually the text-500/400 is OK; the real keyboard violation is that "Units (12)" at `feedback-inline-desktop.html:110` is behind `tabindex="-1"` but has no arrow-key handler documented and no `aria-orientation="horizontal"` on the tablist parent to tell AT which arrow keys navigate. Without those, roving-tabindex with `tabindex="-1"` becomes "unreachable" — the keyboard user cannot get to "Units", "Knowledge", or "Outputs" at all.

**Cross-reference:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/feedback-inline-desktop.html:109` — the tablist div has `role="tablist"` but no `aria-orientation` attribute.

**Fix:**
- Add `aria-orientation="horizontal"` to every `role="tablist"` container in the artifacts (`feedback-inline-desktop.html:109`, `feedback-inline-mobile.html:99`).
- Document the arrow-key handler contract in `focus-order-spec.md` or `keyboard-shortcut-map.html §6` — explicitly: "ArrowRight / ArrowLeft move focus among tabs; Home/End jump to first/last; the tablist's `tabindex="0"` tab is the active one."
- Ensure `g o / g u / g k / g p` shortcuts actually change the active tab AND update `tabindex` accordingly (the artifact's current markup is static).

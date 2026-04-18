---
title: Disabled button contrast fails AA for non-text UI
status: closed
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-17T22:30:45Z'
iteration: 1
visit: 1
source_ref: null
addressed_by: null
closed_by: unit-11-contrast-and-type-scale
---

The disabled "Create" button in the annotation popover states uses `bg-stone-200 text-stone-500` (light) and `bg-stone-700 text-stone-400` (dark).

- `artifacts/annotation-popover-states.html:164` — `bg-stone-200 dark:bg-stone-700 text-stone-500 dark:text-stone-400 cursor-not-allowed`

Contrast ratios:
- Light: stone-500 (#78716c) on stone-200 (#e7e5e4) = **2.9:1** (fails AA 4.5:1 for text)
- Dark: stone-400 (#a8a29e) on stone-700 (#44403c) = **3.2:1** (fails AA 4.5:1 for text)

Similarly in `artifacts/feedback-card-states.html:201-202` disabled "Re-open" is `border-gray-300 text-gray-400 bg-gray-50` (2.8:1) and disabled "Verify & Close" is `bg-green-600/50 text-white/80` (contrast collapses when the button is at 50% opacity).

WCAG 2.1 does exempt disabled controls from contrast requirements as of 1.4.3, BUT WCAG 2.2 (1.4.11 Non-Text Contrast) requires 3:1 for disabled-state indicators to be perceivable, AND the new WCAG 2.2 Success Criterion for disabled focus removes that exemption. More practically: low-vision users who can't distinguish disabled from enabled will repeatedly click a button that does nothing, which is a usability failure even if WCAG 2.1 allows it.

**Fix:**
- Raise disabled button text to `text-stone-500` on `bg-stone-100` (3.9:1) at minimum, or add a visible "disabled" icon/text indicator.
- For the half-opacity Verify button (`bg-green-600/50 text-white/80`) — use `bg-green-300 text-green-800` instead; never compose opacity with text color.
- Add `aria-disabled="true"` alongside `disabled` for screen readers.

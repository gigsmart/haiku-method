---
title: >-
  Pin markers have tabindex=-1 making keyboard users unable to reach inline
  annotations
status: pending
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-17T22:30:34Z'
iteration: 1
visit: 1
source_ref: null
addressed_by: null
---

In `artifacts/feedback-inline-desktop.html:193` and `artifacts/annotation-gesture-spec.html:193`, pin annotation buttons are rendered with `tabindex="-1"`, removing them from the keyboard focus order entirely. This violates WCAG 2.1.1 Keyboard — every interactive element must be reachable by keyboard.

The rationale appears to be "the sidebar feedback card is the canonical focusable surface — press Enter to cross-flash to the pin." That pattern works for users who know the shortcut exists. It fails for:
- First-time users who don't read the help overlay
- Screen reader users who navigate by interactive element (Tab, arrow keys in reading mode)
- Users who land on the main content area directly (via "skip to main" or deep link)

The keyboard-shortcut-map.html specifies `Enter` on a focused feedback card cross-flashes the target. But there's no specified way to Tab-focus a pin from the main content area.

**Fix:**
- Remove `tabindex="-1"` from pin buttons. Give them `tabindex="0"` with an `aria-label` that names the feedback ID and coordinate ("Feedback FB-12 at 42% 60% — press Enter to view details").
- Specify Tab order: page → header → tabs → main content (including pins interleaved in reading order) → sidebar (including feedback cards). Document this in unit-07's focus-order section.
- Pin button click/Enter should expand the linked feedback card in the sidebar and scroll it into view, reciprocal to the sidebar Enter cross-flash.

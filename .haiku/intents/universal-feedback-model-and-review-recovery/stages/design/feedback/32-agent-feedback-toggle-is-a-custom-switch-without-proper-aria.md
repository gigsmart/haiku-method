---
title: Agent-feedback toggle is a custom switch without proper ARIA
status: closed
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-17T22:32:01Z'
iteration: 1
visit: 1
source_ref: null
addressed_by: null
closed_by: unit-13-aria-and-semantic-structure
---

The agent-feedback toggle in `artifacts/comments-list-with-agent-toggle.html:65-76` (and the ON variant at line 170-185) is rendered as a `<label>` wrapping a styled `<span>` — not a native `<input type="checkbox">` or a `role="switch"` element.

```html
<label class="flex items-center gap-2 cursor-pointer group">
  <span class="relative inline-block w-8 h-4">
    <span class="absolute inset-0 rounded-full bg-gray-300 ..."></span>
    <span class="absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white ..."></span>
  </span>
  <span class="flex-1 text-xs font-medium text-gray-700">Show agent feedback</span>
  ...
</label>
```

Problems:
1. **No actual `<input>`** — the control is non-interactive to keyboard users. Tab doesn't reach it. Space/Enter don't toggle it.
2. **No `role="switch"`** — screen readers announce it as plain text.
3. **No `aria-checked`** — the state is visually conveyed (left vs right slider position) but inaccessible.
4. **Clickable span has no focus indicator** — even if wired up with JS, there's no `focus:` variant declared.

This violates WCAG 2.1.1 Keyboard, 4.1.2 Name/Role/Value, and 2.4.7 Focus Visible.

**Fix:** Use a real `<button role="switch" aria-checked="false" aria-label="Show agent feedback">` or wrap the visual in `<input type="checkbox" class="sr-only peer">` with visible state driven by `peer-checked:` Tailwind classes. Add `focus-visible:ring-2 focus-visible:ring-teal-500` on the control.

Also: the toggle at 8px × 4px rem (32px × 16px) is below the 44px touch target minimum. Wrap in a 44px hit area.

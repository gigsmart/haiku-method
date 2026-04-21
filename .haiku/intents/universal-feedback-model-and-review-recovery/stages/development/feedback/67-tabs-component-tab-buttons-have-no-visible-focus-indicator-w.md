---
title: Tabs component tab buttons have no visible focus indicator (WCAG 2.4.7)
status: pending
origin: adversarial-review
author: accessibility (from design)
author_type: agent
created_at: '2026-04-21T20:26:48Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 0
upstream_stage: null
---

**Severity:** major — WCAG 2.4.7 Focus Visible violated.

**File:** `packages/haiku-ui/src/components/Tabs.tsx:69-90`

The tab buttons that make up the review page's primary navigation have no `focusRingClass` applied:

```
className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
  disabled
    ? "border-transparent text-stone-600 dark:text-stone-300 cursor-not-allowed"
    : isActive
      ? "border-teal-600 text-teal-600 dark:border-teal-400 dark:text-teal-400"
      : "border-transparent text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:border-stone-300 dark:hover:border-stone-600 cursor-pointer"
}`}
```

The activate flow (lines 34-37) does call `tabRefs.current.get(id)?.focus()` on arrow-key navigation — so focus IS programmatically moved — but there is no visible indicator for where it landed. Keyboard users traversing tabs via arrow keys have no feedback.

The tabpanel wrapper (line 103) carries `focus:outline-none` — that only drops the outline on the panel, but it indicates the author's attention to the issue was panel-side, not tab-side. The tab buttons themselves need a focus ring.

Additionally, inactive-tab contrast on light mode:
- `text-stone-500` = #78716c on white → luminance ≈ 0.178 → contrast **4.83:1**. Passes 4.5:1 but by only 0.3 — one token shift away from failing. On `bg-white/80` header-adjacent surface (Header line 39) the effective bg is slightly darker, pushing this to marginal.
- Disabled tab `text-stone-600` (#57534e) on white → **7.58:1**. OK.

**Why the audit missed it.** No audit script covers "every `[role=tab]` has `:focus-visible` styling." `audit-banned-patterns` only looks for `focus:ring-1` (banned in favor of ring-2) — not for absence. The focus-ring spec is declared but enforcement is class-presence-based, not coverage-based.

**Fix direction:** add `focusRingClass` (or `focusRingCompactClass` for tight tab bars) to the tab button className. Add a `require-focus-ring-on-role-tab` presence check to the banned-patterns audit that fails when any `role="tab"` button is rendered without a `focus-visible:ring-*` class.

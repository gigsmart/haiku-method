---
title: Missing skip-to-main-content link in sticky-header layouts
status: pending
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-17T22:31:50Z'
iteration: 1
visit: 1
source_ref: null
addressed_by: null
---

None of the wireframes include a "skip to main content" link, which is standard WCAG 2.4.1 Bypass Blocks guidance for pages with sticky headers and multi-section layouts.

Every artifact (`feedback-inline-desktop.html`, `feedback-inline-mobile.html`, `comments-list-with-agent-toggle.html`, `assessor-summary-card.html`, `revisit-modal-spec.html`, etc.) renders:
1. Sticky header (`sticky top-0`)
2. Tabs strip (often also sticky at `top-[53px]`)
3. Main content
4. Sidebar with feedback list

A keyboard user landing on the page must Tab through the header's theme-toggle, tablist (3–4 tab buttons), and any nav anchors before reaching the main content. With feedback cards numbering 10–30 per stage, the sidebar becomes 30+ Tab stops deep. There's no bypass.

**Fix:**
- Add a visually-hidden-until-focused "Skip to feedback list" link as the first focusable element in the page:
```html
<a href="#feedback-list" class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:px-3 focus:py-2 focus:bg-teal-600 focus:text-white focus:rounded">Skip to feedback list</a>
```
- Add an "id=main-content" anchor and a "Skip to main content" link too.
- Update unit-01 (feedback-panel-wireframes) completion criteria to require skip links.
- Ensure the shortcut map's `g` sequences (g+o, g+u, g+k, g+p) are documented as the keyboard-native alternative to skip links for power users, but don't let those replace the visible skip link for first-time users who don't know shortcuts.

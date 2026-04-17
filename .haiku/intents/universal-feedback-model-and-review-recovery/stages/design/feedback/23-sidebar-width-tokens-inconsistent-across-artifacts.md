---
title: Sidebar width tokens inconsistent across artifacts
status: pending
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-17T22:31:05Z'
iteration: 1
visit: 1
source_ref: null
addressed_by: null
---

`DESIGN-BRIEF.md §4 Responsive Behavior` (lines 488-499) specifies:
- Desktop (≥1024px): sidebar `w-96` (384px)
- Tablet (768-1023px): sidebar `w-80` (320px)

And the sidebar layout pattern at line 38: `w-80 lg:w-96` (responsive growth via `lg:`).

But the artifacts ship inconsistent widths with no `lg:` responsive variant:
- `comments-list-with-agent-toggle.html:56` — `w-96 shrink-0` (desktop only, no `lg:` breakpoint handling)
- `feedback-inline-desktop.html` — search for sidebar `w-` classes
- `review-context-header.html` uses `max-w-[1400px]` for the page container but no sidebar width declared

Some artifacts also use `max-w-[1400px]` on the outer container (literal px in an arbitrary-value class). `[1400px]` is a magic number — DESIGN-TOKENS doesn't list `1400px` as a layout token. The existing review app uses standard Tailwind container widths (`max-w-7xl` = 1280px, etc.).

Also: artifacts use `max-w-[1400px]` (in `comments-list-with-agent-toggle.html`, `feedback-card-states.html`, `feedback-lifecycle-transitions.html`, and others) but some use different container max widths with no documented rationale. If the review app target container is 1280 or 1440, the mockups should render at that width.

Fix: declare a single canonical sidebar width responsive pattern and container max-width in DESIGN-BRIEF §4 (or DESIGN-TOKENS.md), then sweep artifacts to match.

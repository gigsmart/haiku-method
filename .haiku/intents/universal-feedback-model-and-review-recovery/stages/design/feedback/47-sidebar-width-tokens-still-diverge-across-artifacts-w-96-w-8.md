---
title: 'Sidebar width tokens still diverge across artifacts — w-96, w-80, w-80 lg:w-96'
status: pending
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-19T17:52:14Z'
iteration: 2
visit: 2
source_ref: null
closed_by: null
---

unit-10 gate line 158 requires "every sidebar container in every artifact uses the canonical responsive width pattern" — DESIGN-BRIEF §4 + DESIGN-TOKENS.md §1.3 line 83 set this to `w-80 lg:w-96`.

Three different width tokens appear on sidebar containers:

1. **Canonical (`w-80 lg:w-96`)** — appears only in DESIGN-TOKENS.md text; not in a single rendered artifact as a live class.

2. **Bare `w-96`** (no responsive step-down) — `comments-list-with-agent-toggle.html` lines 60, 168, 278 — three different aside elements:
   ```html
   <aside class="w-96 shrink-0 bg-white border-l border-gray-200 ..." aria-label="Review sidebar">
   ```
   
3. **Bare `w-80`** (no responsive step-up) — `feedback-inline-desktop.html:355`:
   ```html
   <div class="hidden lg:block w-80 shrink-0">
   ```
   This is *the* desktop artifact, and it ships a sidebar that is SMALLER at `lg:` than the DESIGN-BRIEF §4 mandate of `w-96` at `lg:`.

`rollback-reason-banner.html:213` has an HTML comment `<!-- Sidebar-footer simulation (w-80) -->` but then uses `max-w-[384px]` on the actual container — different width still (384px = 24rem = `w-96`, so the comment is misleading).

Consistency mandate violation: "layout grid and breakpoint behavior is consistent across all screens." The sidebar is the most-used layout element in the review UI, and it ships three different widths across the stage's own artifacts.

Fix: sweep every `<aside>` / sidebar container in every artifact to `w-80 lg:w-96 shrink-0` — that's the canonical per DESIGN-BRIEF §4 line 508 and DESIGN-TOKENS §1.3. Specifically:
- `comments-list-with-agent-toggle.html:60, 168, 278` → `w-80 lg:w-96`
- `feedback-inline-desktop.html:355` → `hidden lg:block w-80 lg:w-96 shrink-0`
- `rollback-reason-banner.html:214, 260` → swap `max-w-[384px]` for `w-80 lg:w-96`

Gate command to prove fix: `grep -rE '(w-96|w-80)[^ ]*' stages/design/artifacts/ | grep -iE 'aside|sidebar|ReviewSidebar'` must show only `w-80 lg:w-96` patterns.

---
title: Keyboard navigation for power users
status: pending
origin: agent
author: parent-agent
author_type: agent
created_at: '2026-04-17T03:04:19Z'
visit: 0
source_ref: null
addressed_by: null
---

Review is a dense surface; keyboard nav materially speeds up an experienced reviewer.

**Shortcut map (implemented in the mockup):**
- `j` / `k` — next / previous feedback card in sidebar (with visible focus ring)
- `[` / `]` — previous / next stage (skipping upcoming)
- `g` then `o` / `u` / `k` / `p` — jump to Overview / Units / Knowledge / outPuts (Gmail-style 2-key sequence)
- `Enter` — highlight / open focused feedback (cross-flashes target artifact)
- `n` — next unseen in active artifact tab
- `a` — approve (if available)
- `r` — request changes (opens revisit modal)
- `/` — focus the feedback textarea
- `Esc` — close modal / popover / blur active input
- `?` — toggle shortcuts help overlay

**Discoverability:** `?` in the header plus the overlay itself. No need for labels on every button.

**Design stage deliverable:** accept or adjust the shortcut map, then the development stage can wire it up 1:1.

**Reference implementation:** `artifacts/review-ui-mockup.html` — global `keydown` handler plus `navigateStage`, `focusNextFeedback`, `jumpToNextUnseenInActiveTab`, `clickApprove`, `clickRequestChanges`.

**Out of scope (deferred explicitly):** discussion/replies on feedback, diff-view for CHANGED artifacts, multi-reviewer presence, shareable deep links, review export, session history, unit DAG graph (react-flow candidate for future), mobile/a11y. Captured decisions logged.

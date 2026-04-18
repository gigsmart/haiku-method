---
title: >-
  Footer button copy drift — "Close" vs "Verify & Close" vs "Dismiss" vs
  "Reject" across artifacts
status: closed
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-17T22:32:18Z'
iteration: 1
visit: 1
source_ref: null
addressed_by: null
closed_by: unit-14-component-naming-and-copy
---

Per-status button labels differ across the stage's own outputs:

`DESIGN-BRIEF.md §2 FeedbackItem` (line 218-220) specifies:
- pending + agent-authored → "Reject"
- pending + human-authored → "Close"

`DESIGN-BRIEF.md §3 Feedback Status Transitions` (lines 472-480) uses:
- `pending` → "Close" or "Reject"
- `addressed` / `closed` / `rejected` → "Reopen"

`feedback-card-states.html §1 Footer Button Inventory` (lines 45-64) uses:
- `pending` → "Dismiss" (not "Reject" — different verb)
- `addressed` → "Verify & Close" (primary) + "Re-open" (secondary)
- `rejected` → "Re-open"
- `closed` → "Re-open"

`unit-05-feedback-lifecycle-ownership.md:37-39` uses:
- `pending` → "[Reject]"
- `addressed` → "[Verify & Close], [Re-open]"
- `rejected` / `closed` → "[Re-open]"

Four related documents, three different verbs for the same primary action:
- "Close" (DESIGN-BRIEF §2/§3)
- "Dismiss" (feedback-card-states.html)
- "Reject" (DESIGN-BRIEF §3 + unit-05 — but §3 uses it only for agent items, unit-05 uses it as the generic)

Also: "Re-open" (hyphenated, feedback-card-states + unit-05) vs "Reopen" (one word, DESIGN-BRIEF §3). Different CSS implementations will render different labels.

The DESIGN-BRIEF's pending-buttons depend on author_type (human=Close, agent=Reject). Unit-05 ships a single "Reject" (or feedback-card-states' "Dismiss") regardless of author. Those specs contradict on what the pending card's action should be and how it depends on who authored the feedback.

Fix: settle on one canonical vocabulary. Recommend:
- `pending` → "Dismiss" (covers both human and agent — simpler than split)
- `addressed` → "Verify & Close" + "Reopen"
- `closed`/`rejected` → "Reopen" (one word, no hyphen)

Sweep DESIGN-BRIEF §2/§3, unit-05, unit-05's three artifacts, and any other mock to match.

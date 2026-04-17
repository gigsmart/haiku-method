---
title: 'Feedback lifecycle: agent vs human ownership split'
status: pending
origin: agent
author: parent-agent
author_type: agent
created_at: '2026-04-17T03:04:19Z'
visit: 0
source_ref: null
addressed_by: null
---

The status transitions for feedback items need an ownership model that the design stage should codify.

**Agent-owned transitions (FSM-driven):**
- `pending → addressed` when a fix lands (agent marks this as part of execute phase).
- `pending → closed` when gate verification passes structurally (quality-gate-enforced, not UI).

**Human-owned transitions (review-UI buttons):**
- `pending → rejected` — reviewer dismisses the finding as not-a-real-issue.
- `addressed → closed` — reviewer verifies the fix (Verify & Close).
- `rejected|closed → pending` — re-open.

**UI surface:** each feedback card gets a compact footer row of lifecycle buttons contextual to current status. Agent-owned transitions should NOT be user-initiable from the UI.

**Reference implementation:** `artifacts/review-ui-mockup.html` — `setFeedbackStatus(fbId, newStatus)` plus the inline footer buttons per status. Author-type guards already exist at the tool layer; they need to enforce this split too (reject `pending → addressed` from origin=user-visual, etc.).

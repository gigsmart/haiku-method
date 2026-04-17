---
title: Revisit preview with confirmation modal
status: pending
origin: agent
author: parent-agent
author_type: agent
created_at: '2026-04-17T03:04:19Z'
visit: 0
source_ref: null
addressed_by: null
---

`haiku_revisit` is destructive (writes state, pushes branch, invalidates downstream work). UI must double-confirm before firing.

**Modal content (before fire):**
- Target stage (with `earliest unaddressed` justification if applicable)
- Downstream stages that will re-run (all stages with index > target.index and status != upcoming)
- New feedback from the textarea (if any), marked with target-stage and pending status
- Full list of open feedback in scope, grouped by stage
- [Cancel] [Confirm & Revisit]

**Behavior:**
- Esc / backdrop click cancels
- Confirm calls the same `haiku_revisit` code path as today; no change to side effects
- Approve button does NOT need a confirmation (reversible by the next gate if needed)

**Reference implementation:** `artifacts/review-ui-mockup.html` — `openRevisitModal` computes target/downstream/scope and populates the modal body; `doRevisit` fires the actual tool call on confirm.

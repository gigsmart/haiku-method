---
title: >-
  FeedbackItem docstring claims "Delete" is banned but the code renders it and
  the audit rule doesn't catch it
status: fixing
origin: adversarial-review
author: consistency (from design)
author_type: agent
created_at: '2026-04-21T20:24:20Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 2
upstream_stage: null
---

**Mandate check:** "component naming follows the existing pattern language" (canonical verbs).

`packages/haiku-ui/src/components/feedback/FeedbackItem.tsx:6-8` documents the canonical verb set:

> Action buttons inside the expanded body are status-scoped per DESIGN-TOKENS §2.6 canonical verb set (Dismiss / Verify & Close / Reopen) — the banned verbs (Close / Reject / **Delete** / Address / "Re" hyphen "open") are audit-enforced.

Three independent inconsistencies:

1. **The component itself renders `Delete`** on line 275 — button label literal. If Delete is banned, this is a violation.

2. **The audit rule does not actually ban `Delete`.** `audit-config.json:69` pattern is `<[Bb]utton[^>]*>\\s*(Reject|Close|Address|Re-open)\\s*</` — `Delete` is NOT in the alternation. The aria-label rule at line 77 also excludes `Delete`. The docstring's "audit-enforced" claim is false.

3. **DESIGN-TOKENS §2.6 does not actually ban `Delete`** (it's called out only for closed/rejected items as the destructive terminal action). The FeedbackItem docstring is overclaiming.

Either:
- "Delete" is a legitimate canonical verb for the terminal destructive action → update the FeedbackItem docstring to remove the "Delete is banned" claim.
- "Delete" really is banned → rename the literal at line 275 to `Remove` (or similar) AND add `Delete` to the audit alternation.

This needs resolution because the component ships a button that its own docstring calls banned. Downstream consumers reading the docstring will either (a) file bugs against other components that use "Delete" or (b) refuse to add Delete because "the audit bans it" and invent a less-clear verb.

**Fix:** pick one source of truth (DESIGN-TOKENS §2.6 is canonical), update the FeedbackItem docstring to match, and either add `Delete` to the banned alternation + rename the literal, or remove the claim entirely.

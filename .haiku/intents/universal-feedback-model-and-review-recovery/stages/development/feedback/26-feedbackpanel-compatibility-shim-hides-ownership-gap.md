---
title: FeedbackPanel "compatibility shim" hides ownership gap
status: fixing
origin: adversarial-review
author: architecture
author_type: agent
created_at: '2026-04-21T20:23:07Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 1
upstream_stage: null
---

`packages/haiku-ui/src/components/FeedbackPanel.tsx` is documented as a "compatibility shim" (line 1-19). It re-implements its own filter state machine (`FilterMode = "all" | "pending" | "addressed"`, `TabMode = "feedback" | "mine"`) internally rather than delegating to `FeedbackSummaryBar` + `FeedbackList`.

Consumers:
- `components/ReviewPage.tsx:38,511` — legacy monolith
- `components/ReviewCurrentPage.tsx:5,176`

The file comment says: *"When both units land [unit-09 AgentFeedbackToggle and unit-11 copy audit], this file can be deleted and consumers can import FeedbackList / FeedbackSummaryBar from ./feedback directly."*

Unit-09 (`AgentFeedbackToggle`) and unit-11 have already landed in this stage (units 09-11 are in `packages/haiku-ui/src/components/feedback/AgentFeedbackToggle.tsx` and the revisit/assessor components). The shim was not deleted.

**Why this matters architecturally:**

1. **Two filter state machines in the same package** — `FeedbackPanel` has its own `filter/tab` state; `FeedbackSummaryBar` + `FeedbackSidebar` have `activeStatus` and the new filter contract. A filter-scope change (e.g. adding a new `FeedbackStatus`) must be made in two places, and the two will drift.

2. **Tab semantics hard-coded inside the shim** — `tab === "mine" && item.author_type !== "human"` (line 48). That's a filter contract (author-type filter) encoded inline rather than flowing through the canonical filter API. The `AgentFeedbackToggle` component exists specifically to own this filter, but the shim bypasses it.

3. **"Compatibility" without deprecation signal** — there is no `@deprecated` JSDoc, no build-time warning, nothing to prevent new code from importing `FeedbackPanel` instead of `FeedbackList`. The shim's justification (avoid touching every consumer in unit-08) expired when unit-09 and unit-11 landed.

**Fix:** migrate `components/ReviewCurrentPage.tsx` and `components/ReviewPage.tsx` to `FeedbackList` + `FeedbackSummaryBar` + `AgentFeedbackToggle` directly, then delete `FeedbackPanel.tsx`. The legacy call sites are exactly two — this is not a large migration.

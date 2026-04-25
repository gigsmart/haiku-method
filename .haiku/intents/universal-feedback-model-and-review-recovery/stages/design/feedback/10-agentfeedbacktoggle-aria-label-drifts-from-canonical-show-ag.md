---
title: >-
  AgentFeedbackToggle aria-label drifts from canonical "Show agent feedback
  inline" across artifacts
status: closed
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-20T20:20:17Z'
iteration: 0
visit: 0
source_ref: null
closed_by: 'fix-loop:FB-10:bolt-1'
bolt: 1
upstream_stage: null
---

**WCAG 4.1.2 Name, Role, Value · 2.4.6 Headings and Labels · 3.2.4 Consistent Identification**

DESIGN-BRIEF §2 `AgentFeedbackToggle` spec (line 385) declares the canonical accessible name:

> `aria-label="Show agent feedback inline"` (the visible "Comments" label sits outside the switch, so the switch needs its own label).

Only two artifacts use the canonical string:
- `feedback-inline-mobile.html:276` — "Show agent feedback inline" ✓
- `feedback-inline-desktop.html:384` — "Show agent feedback inline" ✓

The rest drift to a shorter, non-canonical name that drops "inline":
- `agent-feedback-toggle-spec.html:68, 86, 108, 126, 144, 163, 181, 199` — "Show agent feedback" (8× in the spec that's supposed to define the pattern)
- `comments-list-with-agent-toggle.html:31, 143, 259` — "Show agent feedback"
- `comment-to-feedback-flow.html:863` — "Show agent feedback"
- `review-package-structure.html:837` — "Show agent feedback"

The accessible name matters because the visible "Comments" heading sits *outside* the switch; SR users hearing just "Show agent feedback, switch, off" don't know the effect is *inline interleaving* (as opposed to a separate tab or panel). The brief's rationale (§2 line 389) explicitly calls out that the toggle is an **opt-in overlay** — the word "inline" communicates that semantics. Dropping it changes the user's mental model.

Secondary spec mismatch: `comment-to-feedback-flow.html:863` has `aria-checked="true"` as the default, while DESIGN-BRIEF §2 line 337 ("default **OFF**") and the `AgentFeedbackToggleProps` type (line 350-356) specify `showAgent: false` as the default. A default-ON toggle inverts the agent-feedback surfacing contract (users see agent items by default, have to flip to hide). Not strictly an a11y fail, but a spec drift that will produce a different AT announcement on first paint.

**Remediation:** Grep-replace `aria-label="Show agent feedback"` → `aria-label="Show agent feedback inline"` across every artifact. Fix `comment-to-feedback-flow.html:863` to `aria-checked="false"`. Add a lint rule (grep-based, similar to the banned-pair audit) so future drift is caught.

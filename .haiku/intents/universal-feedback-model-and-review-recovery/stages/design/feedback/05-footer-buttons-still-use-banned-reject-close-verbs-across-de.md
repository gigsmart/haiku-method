---
title: >-
  Footer buttons still use banned "Reject"/"Close" verbs across desktop + mobile
  wireframes
status: closed
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-20T20:19:14Z'
iteration: 0
visit: 0
source_ref: null
closed_by: 'fix-loop:FB-05:bolt-1'
bolt: 1
upstream_stage: null
---

**WCAG 3.2.4 Consistent Identification · 4.1.2 Name/Role/Value · 3.3.2 Labels or Instructions**

DESIGN-BRIEF §2 (lines 536-585) makes the canonical verb table authoritative:
- `pending → rejected` = **Dismiss** (NEVER "Reject")
- `addressed → closed` = **Verify & Close** (NEVER standalone "Close")
- `*→ pending` = **Reopen**

The brief explicitly lists `"Close"` and `"Reject"` as banned variants ("must not appear anywhere in the stage outputs"). The SR-announcement templates (brief §6, lines 569-575) also tie screen-reader phrasing (`"Feedback <ID> marked as rejected"`, `"Feedback <ID> marked as closed"`) to those exact verbs.

Multiple artifacts still render the banned verbs — screen-reader users who hear "marked as rejected" after pressing a button labeled "Reject" receive mismatched feedback (ARIA name != announced action), and sighted users experience inconsistent labeling across mobile vs. desktop:

- `feedback-inline-mobile.html:354` — `>Reject<` (pending agent item)
- `feedback-inline-mobile.html:355` — `>Close<`
- `feedback-inline-desktop.html:299` — `>Reject<` (expanded state)
- `feedback-inline-desktop.html:300` — `>Close<`
- `comment-to-feedback-flow.html:636` — `>Close<`
- `comment-to-feedback-flow.html:662` — `>Reject<`
- `comment-to-feedback-flow.html:664` — `>Close<`
- `comment-to-feedback-flow.html:959-960` — `>Reject<` / `>Close<`
- `comment-to-feedback-flow.html:1027,1035,1089,1096` — "Close" / "Reject" in legend/explainer tables

**Remediation:** Replace every `>Reject<` with `>Dismiss<` and every `>Close<` (as a standalone transition button, NOT inside the compound verb "Verify & Close") with `>Verify & Close<`. Verify SR-announcement strings in the live region match the button labels exactly.

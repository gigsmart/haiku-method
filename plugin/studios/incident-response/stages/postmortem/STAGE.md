---
name: postmortem
description: Document timeline, root cause, action items, and prevention measures
hats: [postmortem-author, action-item-tracker]
review: external
unit_types: [postmortem, action-item]
inputs:
  - stage: resolve
    discovery: resolution-summary
---

# Postmortem

## Criteria Guidance

Good criteria examples:
- "Postmortem timeline includes every key event from trigger to resolution with timestamps and actors"
- "Each action item has an owner, priority, and due date — no unassigned items"
- "Prevention measures address systemic gaps, not just the specific failure that occurred"

Bad criteria examples:
- "Postmortem is written"
- "Action items are listed"
- "Lessons are documented"

## Completion Signal (RFC 2119)

Postmortem document **MUST** exist with blameless narrative, complete timeline, root cause analysis, and impact assessment. Action items are specific, owned, prioritized, and tracked. Prevention measures address systemic issues — not just "don't do that again." The postmortem **MUST** **MUST** have been reviewed by stakeholders and is ready for distribution to the broader organization.

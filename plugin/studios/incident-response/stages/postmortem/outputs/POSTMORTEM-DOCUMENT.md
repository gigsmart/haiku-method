---
name: postmortem-document
location: .haiku/intents/{intent-slug}/knowledge/
scope: intent
format: text
required: true
---

# Postmortem Document

Blameless incident narrative with timeline, action items, and prevention measures.

## Expected Artifacts

- **Blameless narrative** -- complete timeline from trigger to resolution with all key events
- **Impact assessment** -- quantified user and business impact
- **Action items** -- specific, owned, prioritized, and tracked items
- **Prevention measures** -- systemic improvements, not just "don't do that again"

## Quality Signals

- Timeline includes every key event with timestamps and actors
- Each action item has an owner, priority, and due date
- Prevention measures address systemic gaps, not just the specific failure
- Postmortem has been reviewed by stakeholders

---
name: postmortem
location: .haiku/intents/{intent-slug}/knowledge/POSTMORTEM.md
scope: intent
format: text
required: true
---

# Postmortem

Blameless retrospective document covering the full incident lifecycle. This output is the final artifact — it exists for organizational learning and systemic improvement.

## Content Guide

Structure the postmortem for both immediate stakeholders and future readers:

- **Summary** — one-paragraph description of what happened, who was affected, and how it was resolved
- **Impact** — quantified user and business impact (error counts, duration, revenue, SLA)
- **Complete timeline** — every key event from trigger to full resolution with timestamps and actors
- **Root cause** — clear explanation accessible to non-specialists
- **Detection** — how the incident was found and how long it took from trigger to detection
- **Response** — what went well, what went poorly, and where the response could improve
- **Mitigation and resolution** — what was done immediately and what was done permanently
- **Action items** — specific, owned, prioritized follow-ups with tracking references
- **Prevention measures** — systemic changes to prevent this class of incident, not just this specific one
- **Lessons learned** — insights for the team beyond the specific technical fix

## Quality Signals

- Narrative is blameless — focuses on systems and processes, not individuals
- Action items are specific, owned, and tracked in the team's work management system
- Prevention measures address the class of failure, not just this instance
- Detection story is told honestly, including delays or lucky catches
- Document is useful to someone encountering a similar incident in the future

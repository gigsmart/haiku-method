---
name: incident-brief
location: .haiku/intents/{intent-slug}/knowledge/INCIDENT-BRIEF.md
scope: intent
format: text
required: true
---

# Incident Brief

Initial assessment of the incident capturing severity, blast radius, and ownership. This output feeds all downstream stages as the foundational context for the incident response.

## Content Guide

Structure the brief to enable immediate action:

- **Severity classification** — SEV level with justification based on user impact, data integrity, and business criticality
- **Blast radius** — affected services, regions, customer segments, and estimated user count
- **Timeline so far** — when the issue started, when it was detected, and how it was detected
- **Current user impact** — what users are experiencing (errors, latency, data loss, etc.)
- **Ownership assignments** — who is investigating, who is communicating, who is the incident commander
- **Communication status** — who has been notified and through which channels
- **Initial diagnostic data** — error samples, relevant metrics, reproduction steps if known

## Quality Signals

- Severity rating is justified with specific impact data, not gut feeling
- Blast radius is scoped precisely — not "some users" but "users in region X hitting endpoint Y"
- Ownership is unambiguous — every role has exactly one person assigned
- Initial data is captured before it ages out of log retention

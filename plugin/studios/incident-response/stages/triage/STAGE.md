---
name: triage
description: Assess severity, identify blast radius, and assign ownership
hats: [incident-commander, first-responder]
review: auto
elaboration: collaborative
unit_types: [triage, communication]
inputs: []
---

# Triage

## Criteria Guidance

Good criteria examples:
- "Incident brief includes severity level (SEV1-4) with justification based on user impact"
- "Blast radius assessment identifies all affected services, regions, and customer segments"
- "Communication plan specifies who has been notified and through which channels"

Bad criteria examples:
- "Severity is assessed"
- "People are notified"
- "Incident is triaged"

## Completion Signal (RFC 2119)

Incident brief **MUST** exist with severity classification, blast radius assessment, and ownership assignment. Affected systems and user impact **MUST** be documented. Initial communication **MUST** **MUST** have been sent to stakeholders. First-responder **MUST** have confirmed the incident is reproducible and captured initial diagnostic data.

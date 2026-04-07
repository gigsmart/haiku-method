---
name: incident-brief
location: .haiku/intents/{intent-slug}/knowledge/
scope: intent
format: text
required: true
---

# Incident Brief

Severity classification, blast radius assessment, and ownership assignment.

## Expected Artifacts

- **Severity classification** -- SEV level with justification based on user impact
- **Blast radius assessment** -- all affected services, regions, and customer segments identified
- **Ownership assignment** -- incident commander and responders identified
- **Initial diagnostics** -- incident confirmed reproducible with diagnostic data captured

## Quality Signals

- Severity level has justification based on measurable user impact
- Blast radius identifies all affected systems and customer segments
- Initial communication has been sent to stakeholders
- Diagnostic data is captured for the investigation stage

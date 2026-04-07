---
name: investigate
description: Root cause analysis, log analysis, and timeline reconstruction
hats: [investigator, log-analyst]
review: auto
unit_types: [investigation, analysis]
inputs:
  - stage: triage
    discovery: incident-brief
---

# Investigate

## Criteria Guidance

Good criteria examples:
- "Timeline reconstructs the incident from first anomaly to detection with timestamps from at least 2 independent sources"
- "Root cause hypothesis is supported by log evidence with specific entries cited"
- "Contributing factors are distinguished from the root cause with evidence for each"

Bad criteria examples:
- "Root cause is found"
- "Logs are analyzed"
- "Investigation is thorough"

## Completion Signal (RFC 2119)

Root cause document **MUST** exist with a reconstructed timeline from first anomaly through detection and escalation. Root cause hypothesis is stated with supporting evidence from logs, metrics, or code. Contributing factors **MUST** be identified separately. Investigator **MUST** have ruled out at least 2 alternative hypotheses with evidence. The root cause is specific enough to inform a targeted mitigation.

---
name: root-cause
location: .haiku/intents/{intent-slug}/knowledge/
scope: intent
format: text
required: true
---

# Root Cause Analysis

Timeline reconstruction, root cause hypothesis, and contributing factors.

## Expected Artifacts

- **Timeline** -- reconstructed from first anomaly to detection with timestamps from independent sources
- **Root cause hypothesis** -- supported by log evidence with specific entries cited
- **Contributing factors** -- distinguished from root cause with evidence for each
- **Alternative hypotheses** -- at least 2 ruled-out alternatives with evidence

## Quality Signals

- Timeline uses timestamps from at least 2 independent sources
- Root cause hypothesis is supported by specific log evidence
- Contributing factors are distinguished from the root cause
- Alternative hypotheses are ruled out with evidence, not just dismissed

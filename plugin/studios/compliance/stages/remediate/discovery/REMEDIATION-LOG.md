---
name: remediation-log
location: .haiku/intents/{intent-slug}/knowledge/REMEDIATION-LOG.md
scope: intent
format: text
required: true
---

# Remediation Log

Track every gap from identification through resolution. This output drives the document stage's evidence collection.

## Content Guide

Structure the log for traceability:

- **Remediation summary** — overview of resolved/in-progress/deferred counts
- **Per-gap remediation** — each gap with:
  - Original gap reference (from gap report)
  - Remediation approach taken
  - Changes made (code, config, policy references)
  - Verification method and results
  - Residual risk (if any)
- **Policy inventory** — new or updated policies with ownership and review schedule
- **Configuration changes** — committed changes with references to gaps addressed
- **Deferred items** — gaps accepted as risk with business justification

## Quality Signals

- Every gap from the assessment has a remediation entry or documented deferral
- Changes are traceable — each remediation references the specific gap it addresses
- Verification evidence confirms the control now meets the requirement
- Deferred items have explicit risk acceptance with business justification

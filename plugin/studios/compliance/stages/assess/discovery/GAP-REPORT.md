---
name: gap-report
location: .haiku/intents/{intent-slug}/knowledge/GAP-REPORT.md
scope: intent
format: text
required: true
---

# Gap Report

Assessment findings for all in-scope controls. This output drives the remediate stage's implementation work.

## Content Guide

Organize findings by control area:

- **Control assessment summary** — overview of met/partial/unmet counts
- **Per-control findings** — each control with:
  - Determination (met, partially met, unmet)
  - Evidence reviewed
  - Gap description (for partial/unmet)
  - Specific deficiency detail
- **Risk scoring** — likelihood and impact for each gap using consistent methodology
- **Prioritized gap list** — gaps ranked by risk severity
- **Dependencies** — gaps that must be addressed before others
- **Compensating controls** — existing mitigations that reduce effective risk

## Quality Signals

- Every in-scope control has a determination with evidence references
- Risk scores use a consistent, documented methodology
- Gap descriptions are specific enough to drive remediation without re-assessment
- Prioritization reflects actual risk, not alphabetical or arbitrary ordering

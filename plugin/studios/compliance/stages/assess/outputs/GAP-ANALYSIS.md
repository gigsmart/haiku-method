---
name: gap-analysis
location: .haiku/intents/{intent-slug}/knowledge/
scope: intent
format: text
required: true
---

# Gap Analysis

Assessment findings documenting compliance gaps, risk ratings, and remediation priorities.

## Expected Artifacts

- **Gap report** -- every in-scope control with determination (met, partially met, unmet) and supporting evidence
- **Risk assessment** -- gaps ranked by severity using consistent scoring methodology
- **Evidence catalog** -- specific evidence reviewed for each control determination
- **Remediation priorities** -- gaps ordered by risk with recommended remediation approach

## Quality Signals

- Every in-scope control has a determination backed by specific evidence
- Risk scoring uses a consistent methodology across all gaps
- Each gap has a clear description of what is missing and what remediation looks like
- No controls are left unassessed

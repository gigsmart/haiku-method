---
name: screening
description: Resume review and initial candidate qualification
hats: [screener, assessor]
review: auto
elaboration: autonomous
unit_types: [screening, assessment]
inputs:
  - stage: sourcing
    discovery: candidate-pipeline
  - stage: requisition
    discovery: job-spec
---

# Screening

## Criteria Guidance

Good criteria examples:
- "Each candidate is scored against must-have criteria with pass/fail justification documented"
- "Screening report ranks candidates by composite fit score with clear methodology"
- "Disqualification reasons are specific and traceable to job spec requirements, not subjective impressions"

Bad criteria examples:
- "Candidates are screened"
- "Top candidates are identified"
- "Resumes are reviewed"

## Completion Signal (RFC 2119)

Screening report **MUST** exist with each candidate scored against role requirements, ranked by fit, and annotated with strengths and concerns. Assessor **MUST** have validated scoring consistency across candidates. Screener **MUST** have confirmed all pipeline candidates were evaluated against the same criteria.

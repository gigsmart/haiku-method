---
name: assess
description: Evaluate current state against controls, identify gaps and risks
hats: [auditor, risk-assessor]
review: ask
unit_types: [gap-analysis, risk-assessment]
inputs:
  - stage: scope
    discovery: control-mapping
---

# Assess

## Criteria Guidance

Good criteria examples:
- "Gap analysis evaluates every in-scope control with current implementation status (met/partial/unmet) and supporting evidence"
- "Risk assessment assigns likelihood and impact scores to each gap using a consistent methodology"
- "Assessment documents the specific evidence reviewed for each control determination"

Bad criteria examples:
- "Gaps are identified"
- "Risks are assessed"
- "Assessment is thorough"

## Completion Signal

Gap report exists covering every in-scope control with a determination (met, partially met, or unmet) backed by specific evidence. Risk assessment ranks all gaps by severity using consistent scoring. Each gap has a clear description of what is missing and what would constitute remediation. No controls are left unassessed.

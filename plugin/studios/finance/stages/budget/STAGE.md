---
name: budget
description: Allocate resources and set financial targets
hats: [budget-owner, allocator]
review: external
elaboration: collaborative
unit_types: [allocation, target-setting]
inputs:
  - stage: forecast
    discovery: forecast-model
---

# Budget

## Criteria Guidance

Good criteria examples:
- "Budget allocations sum to within 2% of the approved total envelope with variance explanations for each department"
- "Each line item maps to a specific forecast assumption and can be traced to a revenue or cost driver"
- "Contingency reserves are sized based on historical variance patterns, not arbitrary percentages"

Bad criteria examples:
- "Budget is allocated"
- "Numbers add up"
- "Targets are set"

## Completion Signal (RFC 2119)

Budget plan **MUST** exist with detailed allocations by department or cost center, each traceable to forecast assumptions. Targets are quantified with measurement criteria. Budget-owner **MUST** have approved the allocation framework and allocator **MUST** have confirmed resource availability against commitments.

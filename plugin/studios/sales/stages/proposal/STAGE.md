---
name: proposal
description: Create tailored proposals, demos, and business cases
hats: [proposal-writer, solution-architect]
review: [ask, await]
unit_types: [proposal, demo, business-case]
inputs:
  - stage: qualification
    output: deal-brief
gate-protocol:
  timeout: 7d
  timeout-action: escalate
  escalation: comms
---

# Proposal

## Criteria Guidance

Good criteria examples:
- "Proposal maps each prospect pain point to a specific solution capability with expected impact"
- "Business case includes quantified ROI with stated assumptions and a sensitivity analysis"
- "Demo script addresses the top 3 prospect priorities identified in the deal brief"

Bad criteria examples:
- "Proposal is written"
- "Business case looks compelling"
- "Demo is ready"

## Completion Signal

Proposal document exists with solution tailored to the prospect's specific pain points, business case with quantified ROI, and implementation approach. Solution architect has validated technical feasibility and mapped the solution to the prospect's environment. All deliverables are ready for prospect presentation.

---
name: decide
description: Apply decision framework and produce recommendation
hats: [advisor, facilitator]
review: external
elaboration: collaborative
unit_types: [decision, recommendation]
inputs:
  - stage: evaluate
    discovery: evaluation-report
  - stage: options
    discovery: options-matrix
---

# Decide

## Criteria Guidance

Good criteria examples:
- "Decision brief presents a clear recommendation with the 3 strongest supporting arguments and the 2 strongest counterarguments"
- "Decision framework documents the criteria weights, who set them, and how conflicts were resolved"
- "Dissenting perspectives are documented with their reasoning, not dismissed or omitted"

Bad criteria examples:
- "Decision is made"
- "Recommendation is clear"
- "Stakeholders agree"

## Completion Signal (RFC 2119)

Decision brief **MUST** exist with recommended option, supporting rationale, risk acknowledgment, and dissenting perspectives documented. Advisor **MUST** have confirmed the recommendation follows logically from the evaluation. Facilitator **MUST** have ensured all stakeholder perspectives were considered and decision criteria are transparent.

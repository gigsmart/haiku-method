---
name: evaluate
description: Assess vendors and score against criteria
hats: [evaluator, technical-reviewer]
review: ask
unit_types: [vendor-assessment, scoring]
inputs:
  - stage: requirements
    discovery: rfp-document
---

# Evaluate

## Criteria Guidance

Good criteria examples:
- "Vendor scorecard rates each vendor against every RFP criterion using the pre-defined scoring methodology"
- "Technical evaluation includes proof-of-concept results, reference checks, and architecture compatibility assessment"
- "Total cost of ownership analysis covers licensing, implementation, integration, training, and ongoing maintenance"

Bad criteria examples:
- "Vendors are evaluated"
- "Scores are calculated"
- "Best vendor is identified"

## Completion Signal

Vendor scorecard exists with all vendors rated against RFP criteria, technical evaluations complete, and total cost of ownership calculated. Evaluator has confirmed scoring consistency across vendors. Technical-reviewer has validated vendor claims against proof-of-concept results and reference feedback.

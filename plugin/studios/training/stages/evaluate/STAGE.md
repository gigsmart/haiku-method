---
name: evaluate
description: Measure training effectiveness and analyze feedback
hats: [evaluator, analyst]
review: ask
elaboration: autonomous
inputs:
  - stage: deliver
    discovery: delivery-log
  - stage: needs-analysis
    discovery: needs-assessment
  - stage: design
    discovery: curriculum-plan
---

# Evaluate

## Criteria Guidance

Good criteria examples:
- "Effectiveness report measures outcomes at all 4 Kirkpatrick levels: reaction, learning, behavior, and results"
- "Pre/post assessment comparison quantifies knowledge gain with statistical significance for each learning objective"
- "Improvement recommendations are prioritized by impact and effort with specific curriculum revision suggestions"

Bad criteria examples:
- "Training is evaluated"
- "Feedback is collected"
- "Effectiveness is measured"

## Completion Signal (RFC 2119)

Effectiveness report **MUST** exist with multi-level evaluation results, knowledge gain analysis, and improvement recommendations. Evaluator **MUST** have confirmed assessment instruments are valid and results are statistically meaningful. Analyst **MUST** have connected learning outcomes to the original needs assessment gaps to measure program impact.

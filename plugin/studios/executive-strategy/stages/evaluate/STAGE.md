---
name: evaluate
description: Analyze tradeoffs and model scenarios for each option
hats: [evaluator, risk-analyst]
review: ask
unit_types: [tradeoff-analysis, scenario-modeling]
inputs:
  - stage: options
    discovery: options-matrix
  - stage: landscape
    discovery: landscape-analysis
---

# Evaluate

## Criteria Guidance

Good criteria examples:
- "Tradeoff analysis scores each option against weighted criteria with explicit reasoning for each score"
- "Scenario modeling tests each option under at least 3 market conditions (bull, base, bear) with quantified outcomes"
- "Risk analysis identifies the top 3 risks per option with probability estimates and mitigation strategies"

Bad criteria examples:
- "Options are evaluated"
- "Tradeoffs are analyzed"
- "Risks are identified"

## Completion Signal

Evaluation report exists with multi-criteria scoring, scenario analysis results, and risk assessment for each option. Evaluator has confirmed the evaluation framework is consistent and comprehensive. Risk-analyst has validated probability estimates and stress-tested key assumptions.

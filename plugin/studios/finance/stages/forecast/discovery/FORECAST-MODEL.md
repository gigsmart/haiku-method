---
name: forecast-model
location: .haiku/intents/{intent-slug}/knowledge/FORECAST-MODEL.md
scope: intent
format: text
required: true
---

# Forecast Model

Revenue and cost projections with documented assumptions, multiple scenarios, and sensitivity analysis. This output feeds the budget stage for resource allocation decisions.

## Content Guide

Structure the forecast model around actionable projections:

- **Market conditions** -- current market state, trends, and leading indicators relevant to the forecast
- **Revenue projections** -- base, optimistic, and pessimistic scenarios with distinct assumption sets
- **Cost projections** -- fixed and variable cost forecasts with driver analysis
- **Key assumptions** -- every material assumption documented with data source and confidence level
- **Sensitivity analysis** -- which assumptions have the greatest impact on projections
- **Data sources** -- all sources cited with reliability assessment and refresh frequency

## Quality Signals

- Every projection traces to documented assumptions with supporting data
- Scenarios use genuinely different assumption sets, not just scaling factors
- Sensitivity analysis identifies the 3-5 assumptions that matter most
- A reader unfamiliar with the business can understand the forecast logic

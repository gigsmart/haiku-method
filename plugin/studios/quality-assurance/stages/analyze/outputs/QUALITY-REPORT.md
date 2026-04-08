---
name: quality-report
location: .haiku/intents/{intent-slug}/stages/analyze/artifacts/
scope: intent
format: text
required: true
---

# Quality Report

Test result analysis with quality metrics, root cause categorization, and release recommendation.

## Expected Artifacts

- **Quality metrics** -- defect density, severity distribution, and trend analysis
- **Root cause analysis** -- defects grouped by category (design, code, environment, data) with distribution
- **Risk assessment** -- unresolved defects mapped to business impact
- **Release recommendation** -- release, defer, or block with supporting rationale

## Quality Signals

- Defect density and severity distribution are computed with trend analysis
- Root causes are categorized with distribution percentages
- Unresolved defects are mapped to business impact
- Release recommendation is evidence-based with clear rationale

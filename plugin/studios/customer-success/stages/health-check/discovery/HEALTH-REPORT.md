---
name: health-report
location: .haiku/intents/{intent-slug}/knowledge/HEALTH-REPORT.md
scope: intent
format: text
required: true
---

# Health Report

Document the account's overall health assessment with risk analysis. This output feeds downstream stages (expansion, renewal) with a clear picture of account stability.

## Content Guide

Structure the report around health dimensions:

- **Health score summary** — overall rating (healthy/at-risk/critical) with confidence level
- **Dimensional assessment** — usage health, engagement health, support health, stakeholder health, contract alignment
- **Risk register** — severity-ranked churn indicators with leading vs lagging classification
- **Root cause analysis** — underlying drivers for any unhealthy dimensions
- **Mitigation plans** — specific actions per risk with owners, success criteria, and priority
- **Escalation items** — issues requiring immediate leadership attention
- **Expansion readiness** — whether the account is healthy enough to pursue growth

## Quality Signals

- Every health dimension has a rating backed by specific evidence
- Risks distinguish between leading indicators (predictive) and lagging indicators (reactive)
- Mitigation plans have measurable success criteria, not just action items
- Expansion readiness assessment is honest — unhealthy accounts are flagged, not glossed over

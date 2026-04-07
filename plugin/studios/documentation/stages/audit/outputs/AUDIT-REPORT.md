---
name: audit-report
location: .haiku/intents/{intent-slug}/knowledge/
scope: intent
format: text
required: true
---

# Audit Report

Documentation inventory with coverage status, gap analysis, and prioritized backlog.

## Expected Artifacts

- **Documentation inventory** -- coverage status (documented, outdated, missing) for each area
- **Gap analysis** -- missing, outdated, and incomplete documentation with severity ratings
- **Priority ranking** -- documentation needs ranked by user impact and effort
- **Backlog** -- ordered list of documentation work to be done

## Quality Signals

- Inventory covers all public-facing areas with explicit status for each
- Gaps are prioritized by user impact and frequency of support requests
- Each gap includes a severity rating and recommended documentation type
- Backlog is actionable with clear scope for each item

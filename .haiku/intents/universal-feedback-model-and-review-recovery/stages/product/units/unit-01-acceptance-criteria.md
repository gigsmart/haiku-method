---
title: Acceptance criteria and user stories
type: spec
depends_on: []
quality_gates: []
inputs:
  - knowledge/DISCOVERY.md
  - knowledge/IMPLEMENTATION-MAP.md
  - stages/design/DESIGN-BRIEF.md
outputs:
  - knowledge/ACCEPTANCE-CRITERIA.md
status: active
bolt: 1
hat: product
started_at: '2026-04-16T14:18:07Z'
hat_started_at: '2026-04-16T14:18:07Z'
---

# Acceptance Criteria and User Stories

Finalize and validate the ACCEPTANCE-CRITERIA.md produced during discovery. Ensure all 11 P0 user stories have complete Given/When/Then criteria, edge cases are enumerated, error paths are specific, and every criterion traces to an implementation group.

## Completion Criteria

- ACCEPTANCE-CRITERIA.md at `knowledge/ACCEPTANCE-CRITERIA.md` is finalized with no TODO/TBD markers
- All 11 P0 user stories have at least 3 acceptance criteria each in Given/When/Then format
- Edge cases section covers: empty feedback dir, concurrent writes, session restart, feedback on unelaborated stages, rejected feedback re-raised
- Error paths section covers: git commit failure, network failure, malformed files, missing dirs
- Traceability matrix at the bottom maps every AC to its implementation group from IMPLEMENTATION-MAP.md
- Coverage mapping gap GAP-1 (haiku_revisit with reasons) is addressed by adding AC items for it

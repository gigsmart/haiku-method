---
title: Data contracts and API schemas
type: spec
depends_on: [unit-01-acceptance-criteria]
quality_gates: []
inputs:
  - knowledge/DISCOVERY.md
  - knowledge/ACCEPTANCE-CRITERIA.md
---

# Data Contracts and API Schemas

Finalize DATA-CONTRACTS.md produced during discovery. Validate that every MCP tool and HTTP endpoint has complete input/output schemas with types, validation rules, error responses, and examples.

## Completion Criteria

- DATA-CONTRACTS.md at `knowledge/DATA-CONTRACTS.md` is finalized with no TODO/TBD markers
- All 6 MCP tools fully specified: haiku_feedback, haiku_feedback_update, haiku_feedback_delete, haiku_feedback_reject, haiku_feedback_list, extended haiku_revisit
- All 4 HTTP endpoints fully specified: GET/POST/PUT/DELETE /api/feedback/{intent}/{stage}[/{id}]
- Every field has explicit type, required/optional, and validation rules
- Every endpoint has success + error response shapes with status codes
- Feedback file schema with all 9 frontmatter fields documented with enum values and defaults
- State.json additions (visits field) documented with backward-compat behavior
- Unit frontmatter additions (closes field) documented with conditional requirement rule
- At least 3 example feedback files included

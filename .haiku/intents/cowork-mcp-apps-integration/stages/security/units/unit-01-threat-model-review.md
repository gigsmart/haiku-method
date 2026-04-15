---
title: Threat model review and validation
type: audit
model: sonnet
depends_on: []
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - knowledge/DATA-CONTRACTS.md
  - .haiku/knowledge/THREAT-MODEL.md
outputs:
  - knowledge/unit-01-threat-model-assessment.md
status: active
bolt: 1
hat: red-team
started_at: '2026-04-15T19:45:20Z'
hat_started_at: '2026-04-15T19:46:43Z'
---

# Unit 01 — Threat Model Review

Validate that `THREAT-MODEL.md` provides complete STRIDE coverage of the MCP Apps review path across all three trust boundaries and that no unmitigated high-severity threats remain.

## Scope

- **TB1: MCP client ↔ MCP server** — initialize handshake, `resources/list`, `resources/read`, `haiku_cowork_review_submit`
- **TB2: MCP host ↔ iframe** — postMessage bridge, `callServerTool` requests/responses
- **TB3: SPA iframe sandbox** — sandboxing attributes, content rendering, storage access

## Tasks

1. Read `.haiku/knowledge/THREAT-MODEL.md` in full.
2. Verify all three trust boundaries (TB1, TB2, TB3) are present with STRIDE coverage for each data flow listed in the unit description.
3. For each identified threat, confirm:
   - A mitigation is documented
   - A status is assigned: `Implemented`, `Accepted`, or `Pending`
4. Confirm no row in the Summary Table has severity `CRITICAL` or `HIGH` with status `pending`.
5. If any trust boundary is missing, any threat lacks a mitigation, or any HIGH+ threat is unmitigated, update `THREAT-MODEL.md` accordingly before marking this unit complete.

## Completion Criteria

- `rg -n '## Summary' .haiku/knowledge/THREAT-MODEL.md` returns exactly 1 match
- `rg '| pending |' .haiku/knowledge/THREAT-MODEL.md` returns 0 matches at CRITICAL or HIGH severity rows
- All three trust boundaries (TB1, TB2, TB3) are present as `##` or `###` sections
- Every row in the Summary Table has a non-empty Mitigation and Status column

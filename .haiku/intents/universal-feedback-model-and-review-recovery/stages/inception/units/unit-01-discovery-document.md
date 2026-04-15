---
title: Discovery document
type: research
depends_on: []
quality_gates: []
inputs:
  - intent.md
status: active
bolt: 1
hat: elaborator
started_at: '2026-04-15T20:37:07Z'
hat_started_at: '2026-04-15T20:37:44Z'
outputs:
  - knowledge/DISCOVERY.md
---

# Discovery Document

Produce the DISCOVERY.md knowledge artifact covering business context (two motivating defects), technical landscape (all affected code paths with line refs), entity schema (feedback file format, state.json additions), API surface (new MCP tools, review server CRUD endpoints), considerations/risks (backward compat, subagent tool access, name collision), and UI impact.

## Completion Criteria

- DISCOVERY.md exists at `.haiku/intents/universal-feedback-model-and-review-recovery/knowledge/DISCOVERY.md`
- Business context covers both defects (auto-completion bug, adversarial review soft gap) with file:line references
- Technical landscape documents all six affected code paths in orchestrator.ts, enforce-iteration.ts, sessions.ts, server.ts, state-tools.ts, and the review app
- Entity schema defines the feedback file frontmatter format with all fields
- API surface specifies all new MCP tools (create, update, delete, reject, list) and review server CRUD endpoints
- Risks section identifies the subagent-tool-access constraint and proposes the parent-mediated mitigation

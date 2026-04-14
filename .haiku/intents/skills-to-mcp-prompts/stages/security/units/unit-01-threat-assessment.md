---
name: unit-01-threat-assessment
status: completed
inputs:
  - knowledge/DISCOVERY.md
depends_on: []
bolt: 1
hat: threat-modeler
refs:
  - knowledge/PROMPTS-SERVER-DISCOVERY.md
  - knowledge/DATA-CONTRACTS.md
started_at: '2026-04-07T06:25:36Z'
completed_at: '2026-04-07T06:26:36Z'
---

# Threat Assessment

## Description

Assess security implications of the skills-to-MCP-prompts migration. The attack surface is narrow: local MCP server over stdio, no network endpoints, no authentication. Focus on prompt injection, path traversal, and command injection risks in prompt handlers.

## Completion Criteria

- [x] Path traversal: prompt handlers that read files (completions, state) cannot escape .haiku/ or plugin/ boundaries
- [x] Command injection: haiku:review's `execSync(git diff ...)` uses no user-controlled arguments in shell commands
- [x] Prompt injection: prompt handlers do not pass unsanitized user input into system-level operations
- [x] Error disclosure: McpError messages do not leak filesystem paths or internal state beyond what's needed
- [x] No new dependencies introduced that expand the attack surface

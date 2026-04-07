---
name: unit-01-threat-assessment
type: security
status: active
depends_on: []
bolt: 1
hat: threat-modeler
refs:
  - knowledge/PROMPTS-SERVER-DISCOVERY.md
  - knowledge/DATA-CONTRACTS.md
started_at: '2026-04-07T06:25:36Z'
---

# Threat Assessment

## Description

Assess security implications of the skills-to-MCP-prompts migration. The attack surface is narrow: local MCP server over stdio, no network endpoints, no authentication. Focus on prompt injection, path traversal, and command injection risks in prompt handlers.

## Completion Criteria

- [ ] Path traversal: prompt handlers that read files (completions, state) cannot escape .haiku/ or plugin/ boundaries
- [ ] Command injection: haiku:review's `execSync(git diff ...)` uses no user-controlled arguments in shell commands
- [ ] Prompt injection: prompt handlers do not pass unsanitized user input into system-level operations
- [ ] Error disclosure: McpError messages do not leak filesystem paths or internal state beyond what's needed
- [ ] No new dependencies introduced that expand the attack surface

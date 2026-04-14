---
title: Cowork environment detection research
depends_on: []
---

# Cowork Environment Detection

## Scope

Research and document how Cowork exposes runtime information to MCP servers. Map the environment variables, available tools, and capabilities that differ from CLI mode.

## Completion Criteria

- Document lists all Cowork-specific env vars (`CLAUDE_CODE_IS_COWORK`, `CLAUDE_CODE_WORKSPACE_HOST_PATHS`, others discovered)
- Document describes `request_cowork_directory` tool behavior and when it should be called
- Document identifies any other Cowork-specific MCP capabilities or restrictions (port binding, filesystem access, etc.)
- Findings written to `knowledge/COWORK-ENVIRONMENT.md`

# Conversation Context

User wants visibility into where token spend lands across H·AI·K·U intent runs. Decisions from prelaboration: surface = MCP tool (haiku_*), source = Claude Code session jsonl + Task subagent jsonl correlated together, breakdowns = per-intent total + per-stage/hat + per-subagent (Task spawns) + per-model split (full analysis). Project context: existing `packages/haiku/src/sessions.ts` and `session-metadata.ts` already exist and are likely relevant. Session logs live at `~/.claude/projects/<project-slug>/*.jsonl`. Default to continuous mode.

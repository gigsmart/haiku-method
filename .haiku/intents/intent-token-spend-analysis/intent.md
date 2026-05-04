---
title: Add intent token spend analysis
studio: libdev
mode: continuous
status: active
created_at: '2026-05-04'
stages:
  - inception
  - development
  - security
  - release
active_stage: inception
---

# Add intent token spend analysis

Add a new MCP tool (`haiku_*`) that produces a structured token-spend analysis for a H·AI·K·U intent by reading and correlating two jsonl sources: the parent Claude Code session logs at `~/.claude/projects/<project-slug>/*.jsonl` and the per-Task subagent jsonl files under the same project directory. The analysis must answer four breakdowns side by side: per-intent total spend, per-stage and per-hat spend (using stage/hat metadata recorded at dispatch time), per-subagent spend with parent-session correlation so a single hat dispatch shows parent plus spawned tokens together, and per-model split (Opus/Sonnet/Haiku) for routing decisions. Output is structured data the agent can present; the surface is a tool, not a CLI script or web report. Constraints: must work for both running and completed intents, must not require modifying jsonl contents, and must degrade gracefully when subagent logs are absent or partial.

User wants visibility into where token spend lands across H·AI·K·U intent runs. Decisions from prelaboration: surface = MCP tool (haiku_*), source = Claude Code session jsonl + Task subagent jsonl correlated together, breakdowns = per-intent total + per-stage/hat + per-subagent (Task spawns) + per-model split (full analysis). Project context: existing `packages/haiku/src/sessions.ts` and `session-metadata.ts` already exist and are likely relevant. Session logs live at `~/.claude/projects/<project-slug>/*.jsonl`. Default to continuous mode.

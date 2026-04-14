---
name: unit-01-prompts-server
status: completed
depends_on: []
bolt: 1
hat: decomposer
refs:
  - knowledge/DISCOVERY.md
  - knowledge/PROMPTS-SERVER-DISCOVERY.md
started_at: '2026-04-07T02:23:30Z'
completed_at: '2026-04-07T02:32:25Z'
---

# MCP Prompts Server Infrastructure

## Description

Add `prompts/list`, `prompts/get`, and `completion/complete` handlers to the MCP server. Register `prompts` and `completions` capabilities. Implement the prompt registry pattern where each prompt has a name, description, arguments schema, and a handler function that returns `PromptMessage[]`. Implement argument auto-completion for prompt arguments.

## Completion Criteria

- [x] MCP server declares `prompts: { listChanged: true }` and `completions: {}` capabilities
- [x] `prompts/list` returns all 21 prompts with name, title, description, arguments
- [x] `prompts/get` dispatches to the correct prompt handler by name
- [x] Prompt handlers receive parsed arguments and return `PromptMessage[]`
- [x] Multi-message format: user/assistant/user pattern with context baked in
- [x] `completion/complete` handles `ref/prompt` references for argument auto-completion
- [x] Completions for `intent-slug` argument: returns active intent slugs from `.haiku/intents/`
- [x] Completions for `stage` argument: returns stage names from the intent's studio, context-aware (uses previously resolved intent)
- [x] Completions for `studio` argument: returns available studio names
- [x] Completions for `template` argument: returns template names from the selected studio
- [x] Completions sorted by relevance, fuzzy matched, max 100 results
- [x] Error handling: invalid name → -32602, missing args → -32602

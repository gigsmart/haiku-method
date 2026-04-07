---
name: unit-01-prompts-server
type: backend
status: active
depends_on: []
bolt: 1
hat: architect
refs:
  - knowledge/DISCOVERY.md
started_at: '2026-04-07T02:23:30Z'
---

# MCP Prompts Server Infrastructure

## Description

Add `prompts/list`, `prompts/get`, and `completion/complete` handlers to the MCP server. Register `prompts` and `completions` capabilities. Implement the prompt registry pattern where each prompt has a name, description, arguments schema, and a handler function that returns `PromptMessage[]`. Implement argument auto-completion for prompt arguments.

## Completion Criteria

- [ ] MCP server declares `prompts: { listChanged: true }` and `completions: {}` capabilities
- [ ] `prompts/list` returns all 21 prompts with name, title, description, arguments
- [ ] `prompts/get` dispatches to the correct prompt handler by name
- [ ] Prompt handlers receive parsed arguments and return `PromptMessage[]`
- [ ] Multi-message format: user/assistant/user pattern with context baked in
- [ ] `completion/complete` handles `ref/prompt` references for argument auto-completion
- [ ] Completions for `intent-slug` argument: returns active intent slugs from `.haiku/intents/`
- [ ] Completions for `stage` argument: returns stage names from the intent's studio, context-aware (uses previously resolved intent)
- [ ] Completions for `studio` argument: returns available studio names
- [ ] Completions for `template` argument: returns template names from the selected studio
- [ ] Completions sorted by relevance, fuzzy matched, max 100 results
- [ ] Error handling: invalid name → -32602, missing args → -32602

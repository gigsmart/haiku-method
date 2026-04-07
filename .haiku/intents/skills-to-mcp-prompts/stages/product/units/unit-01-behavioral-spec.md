---
name: unit-01-behavioral-spec
type: product
status: active
depends_on: []
bolt: 1
hat: product-owner
refs:
  - knowledge/DISCOVERY.md
  - knowledge/PROMPTS-SERVER-DISCOVERY.md
  - knowledge/CORE-PROMPTS-DISCOVERY.md
  - knowledge/SUPPORTING-PROMPTS-DISCOVERY.md
  - stages/design/artifacts/PROMPT-CATALOG.md
started_at: '2026-04-07T03:37:59Z'
---

# Behavioral Spec

## Description

Write Given/When/Then behavioral specifications for the MCP prompts system. Cover the prompt lifecycle (list, get, complete), core prompt behaviors, and error scenarios.

## Completion Criteria

- [ ] Happy path for prompts/list: Given server running, When client calls prompts/list, Then returns 21 prompts with name, title, description, arguments
- [ ] Happy path for prompts/get: Given valid prompt name + arguments, When client calls prompts/get, Then returns PromptMessage[] with context/priming/instructions pattern
- [ ] Happy path for completion/complete: Given ref/prompt + argument name + partial value, When client calls, Then returns filtered, sorted values (max 100)
- [ ] Context-aware completion: Given intent argument resolved, When completing stage argument, Then returns only stages from that intent's studio
- [ ] Error: unknown prompt name returns -32602 with descriptive message
- [ ] Error: missing required argument returns -32602 with argument name
- [ ] haiku:run behavior: Given active intent, When invoked, Then calls orchestrator, constructs action-specific prompt with hat/stage context
- [ ] haiku:run gate_ask: Given orchestrator returns gate_ask, When constructing prompt, Then open_review is called as side effect before returning
- [ ] haiku:new behavior: Given description argument, When invoked, Then detects studio, uses elicitation for confirmation, creates intent
- [ ] Edge case: prompts/get with no arguments for a prompt that has optional args returns valid prompt with defaults

---
name: unit-01-behavioral-spec
type: product
status: completed
depends_on: []
bolt: 1
hat: specification-writer
refs:
  - knowledge/DISCOVERY.md
  - knowledge/PROMPTS-SERVER-DISCOVERY.md
  - knowledge/CORE-PROMPTS-DISCOVERY.md
  - knowledge/SUPPORTING-PROMPTS-DISCOVERY.md
  - stages/design/artifacts/PROMPT-CATALOG.md
started_at: '2026-04-07T03:37:59Z'
completed_at: '2026-04-07T03:45:11Z'
---

# Behavioral Spec

## Description

Write Given/When/Then behavioral specifications for the MCP prompts system. Cover the prompt lifecycle (list, get, complete), core prompt behaviors, and error scenarios.

## Completion Criteria

- [x] Happy path for prompts/list: Given server running, When client calls prompts/list, Then returns 21 prompts with name, title, description, arguments — Scenarios 1.1, 1.2
- [x] Happy path for prompts/get: Given valid prompt name + arguments, When client calls prompts/get, Then returns PromptMessage[] with context/priming/instructions pattern — Scenarios 2.1, 2.3, 7.1, 7.2
- [x] Happy path for completion/complete: Given ref/prompt + argument name + partial value, When client calls, Then returns filtered, sorted values (max 100) — Scenarios 3.1, 3.5, 3.11
- [x] Context-aware completion: Given intent argument resolved, When completing stage argument, Then returns only stages from that intent's studio — Scenario 3.2
- [x] Error: unknown prompt name returns -32602 with descriptive message — Scenario 2.4
- [x] Error: missing required argument returns -32602 with argument name — Scenario 2.5
- [x] haiku:resume behavior: Given active intent, When invoked, Then calls orchestrator, constructs action-specific prompt with hat/stage context — Scenarios 4.1, 4.4-4.11
- [x] haiku:resume gate_ask: Given orchestrator returns gate_ask, When constructing prompt, Then open_review is called as side effect before returning — Scenarios 4.2, 4.3, 5.1, 5.2
- [x] haiku:start behavior: Given description argument, When invoked, Then detects studio, uses elicitation for confirmation, creates intent — Scenarios 4.12-4.15, 5.3-5.5
- [x] Edge case: prompts/get with no arguments for a prompt that has optional args returns valid prompt with defaults — Scenario 2.2

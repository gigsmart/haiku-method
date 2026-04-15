---
name: unit-02-core-prompts
status: completed
depends_on:
  - unit-01-prompts-infrastructure
bolt: 1
hat: reviewer
refs:
  - knowledge/CORE-PROMPTS-DISCOVERY.md
  - knowledge/BEHAVIORAL-SPEC.md
  - knowledge/DATA-CONTRACTS.md
  - stages/design/artifacts/PROMPT-CATALOG.md
started_at: '2026-04-07T04:06:27Z'
completed_at: '2026-04-07T04:15:42Z'
---

# Core Workflow Prompts

## Description

Implement the 5 core prompt handlers: haiku:start, haiku:resume, haiku:refine, haiku:review, haiku:reflect. Each reads state and returns PromptMessage[].

## Completion Criteria

- [x] `haiku:resume` handler calls `runNext()`, constructs action-specific messages with hat/stage context inlined
- [x] `haiku:resume` calls `open_review` as side effect for `gate_ask` action before returning prompt
- [x] `haiku:resume` collaborative mode returns multi-turn instructions, autonomous mode returns concise directives
- [x] `haiku:start` handler uses elicitation for studio selection (with fallback to prompt-based question)
- [x] `haiku:refine` handler loads upstream stage context and constructs side-trip prompt
- [x] `haiku:review` handler computes git diff and loads review agent definitions
- [x] `haiku:reflect` handler loads completed intent metrics and constructs analysis prompt
- [x] All 5 prompts registered via `registerPrompt()` and appear in `prompts/list`
- [x] `npm run build` succeeds with no type errors

---
name: unit-02-core-prompts
type: backend
status: pending
depends_on:
  - unit-01-prompts-infrastructure
bolt: 0
hat: ""
refs:
  - knowledge/CORE-PROMPTS-DISCOVERY.md
  - knowledge/BEHAVIORAL-SPEC.md
  - knowledge/DATA-CONTRACTS.md
  - stages/design/artifacts/PROMPT-CATALOG.md
---

# Core Workflow Prompts

## Description

Implement the 5 core prompt handlers: haiku:new, haiku:run, haiku:refine, haiku:review, haiku:reflect. Each reads state and returns PromptMessage[].

## Completion Criteria

- [ ] `haiku:run` handler calls `runNext()`, constructs action-specific messages with hat/stage context inlined
- [ ] `haiku:run` calls `open_review` as side effect for `gate_ask` action before returning prompt
- [ ] `haiku:run` collaborative mode returns multi-turn instructions, autonomous mode returns concise directives
- [ ] `haiku:new` handler uses elicitation for studio selection (with fallback to prompt-based question)
- [ ] `haiku:refine` handler loads upstream stage context and constructs side-trip prompt
- [ ] `haiku:review` handler computes git diff and loads review agent definitions
- [ ] `haiku:reflect` handler loads completed intent metrics and constructs analysis prompt
- [ ] All 5 prompts registered via `registerPrompt()` and appear in `prompts/list`
- [ ] `npm run build` succeeds with no type errors

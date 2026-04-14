---
name: unit-02-core-prompts
status: completed
depends_on:
  - unit-01-prompts-server
bolt: 1
hat: decomposer
refs:
  - knowledge/DISCOVERY.md
  - knowledge/PROMPTS-SERVER-DISCOVERY.md
started_at: '2026-04-07T02:33:40Z'
completed_at: '2026-04-07T02:37:51Z'
---

# Core Workflow Prompts

## Description

Implement the 5 core workflow prompts: `haiku:start`, `haiku:resume`, `haiku:refine`, `haiku:review`, `haiku:reflect`. Each reads current state + stage metadata and returns a multi-message conversation.

`haiku:resume` is the most complex — it calls `haiku_run_next` internally, reads the action, loads hat definitions, stage config, elaboration mode, and constructs the appropriate prompt. For `gate_ask`, it calls `open_review` as a side effect before returning.

## Completion Criteria

- [x] `haiku:start` prompt: gathers description, detects studio, sets mode, creates intent, presents direction for review via ask_user_visual_question
- [x] `haiku:resume` prompt: calls orchestrator, reads action, constructs prompt with stage/hat/elaboration context inlined
- [x] `haiku:resume` enforces visual review: calls open_review for gate_ask before returning prompt
- [x] `haiku:resume` elaboration mode: collaborative prompts include multi-turn conversation instructions, autonomous prompts are concise
- [x] `haiku:refine` prompt: loads upstream stage context, constructs side-trip prompt
- [x] `haiku:review` prompt: loads diff + review agents, constructs review prompt
- [x] `haiku:reflect` prompt: loads completed intent, constructs analysis prompt

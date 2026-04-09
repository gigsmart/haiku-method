---
name: quick
description: Quick mode for small tasks — single-stage intent with auto-advance
---

# Quick Mode

A quick task is just a regular intent with a single stage. No special mode or workflow.

## Process

1. Prelaborate briefly — if the task description is vague, ask one clarifying question.
2. Call `haiku_intent_create` with `mode: "continuous"` and the description.
3. After studio selection via `haiku_select_studio`, the response includes `all_studio_stages`. Present these to the user via `ask_user_visual_question` and ask which stage to use.
4. Set the intent's `stages:` frontmatter to just the selected stage.
5. Call `haiku_run_next` — the FSM runs through the single stage and completes.

If the task turns out to be non-trivial (multiple stages needed), suggest `/haiku:start` instead.

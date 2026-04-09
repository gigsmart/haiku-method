---
name: quick
description: Quick mode for small tasks — single-stage intent with auto-advance
---

# Quick Mode

A quick task is just a regular intent with a pruned stage list. No special mode or workflow needed.

## Process

1. Prelaborate briefly — if the task description is vague, ask one clarifying question.
2. Call `haiku_intent_create` with `mode: "continuous"` and the description.
3. After studio selection, edit the intent's `stages:` frontmatter to keep only the relevant stage (usually `development`).
4. Call `haiku_run_next` — the FSM runs through the single stage and completes.

If the task turns out to be non-trivial (multiple stages needed, complex elaboration), suggest switching to `/haiku:start` instead.

---
name: quick
description: Quick mode for small tasks — single-stage intent with auto-advance
---

# Quick Mode

A quick task is a regular intent restricted to a single stage. No special FSM mode — just `intent.stages: [<one-stage>]` as an allow-list, which the orchestrator's `resolveIntentStages` honors.

## Process

1. **Prelaborate briefly.** If the task description is vague, ask ONE clarifying question via `AskUserQuestion` with `options[]`. Otherwise skip.
2. **Create the intent** with `haiku_intent_create`:
   - `mode: "continuous"`
   - `title`: 3–8 words, ≤80 chars, single line. NOT a truncated description. Good: `"Fix login button padding"`. Bad: `"Fix login button padding on mobile because…"`
   - `description`: 2–5 sentences of context.
3. **Pick the studio** with `haiku_select_studio`. The response includes `all_studio_stages`.
4. **Ask the user which stage to run** using `AskUserQuestion` (NOT `ask_user_visual_question` — no visual artifact here). Pass `all_studio_stages` as `options[]`.
5. **Restrict the intent to the chosen stage.** Direct-edit `intent.md` frontmatter to add `stages: [<chosen-stage>]`. This is an allow-list that narrows the studio's stage sequence — the FSM reads it via `resolveIntentStages` and filters out every other stage.
6. **Drive the lifecycle** by calling `haiku_run_next { intent: "<slug>" }`. The FSM starts at the chosen stage, runs its phases (elaborate → review → execute → review → gate), and completes the intent when that stage's gate passes.

## Guardrails

- If the task needs multiple stages, stop and suggest `/haiku:start` instead — don't cram it into a single stage.
- If the user's stage choice isn't in `all_studio_stages`, re-prompt with the real list.

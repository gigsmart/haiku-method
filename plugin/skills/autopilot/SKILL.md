---
name: autopilot
description: Full autonomous workflow — elaborate, plan, build, review, and deliver in one command
---

# Autopilot

Run the full H·AI·K·U lifecycle autonomously from description to delivery. Autopilot is an intent-level flag (not a mode) — it tells the FSM to promote `ask` review gates to `auto`, so the lifecycle advances without human intervention on stage gates. External gates and the intent-completion review still pause (structural signals the FSM can't synthesize).

## Process

1. **If no active intent exists**, create one with `/haiku:start`.
2. **Enable autopilot** by direct-editing `intent.md` frontmatter to set `autopilot: true`. Leave `mode` as-is (`continuous` / `discrete` / `hybrid`) — autopilot is an independent dimension from mode.
3. **Optional: skip the final intent review** by setting `skip_intent_completion_review: true` on intent.md frontmatter. Do NOT set this unless the user explicitly wants truly headless completion; the completion review is the bookend that prevents silent intent-completion on stage-gate pass.
4. **Drive the loop** by calling `haiku_run_next { intent: "<slug>" }`. Repeat on every return. When a subagent returns, re-call `haiku_run_next` to advance.

## What still pauses autopilot

- **External gates** (`external` or compound `[external, ask]`). They need a real PR/MR merge signal and cannot be auto-approved.
- **`await` gates.** Waiting for a non-review external event (customer response, pipeline, etc.).
- **Elicitation-required decisions.** Design-direction picks, visual approvals.
- **Scope explosions** (see guardrails below).
- **Intent-completion review** (unless `skip_intent_completion_review: true`).

## Guardrails

- **Pause on blockers or ambiguity.** If the FSM returns an error or a decision that can't be inferred from the intent's goals, stop and surface it to the user. Never guess.
- **Pause on scope explosion.** If elaborate produces more than 5 units in a single stage, stop and ask the user to confirm scope — that's a signal the task is bigger than it looked and autopilot may not be appropriate.
- **Pause before PR creation.** Even when `haiku_run_next` reaches `external_review_requested`, surface the PR creation step to the user — don't open PRs autonomously.
- **Stop on phase-level failures.** `error`, `max_bolts_exceeded`, `unit_scope_violation` not clearable after one retry, or any FSM rejection that persists across two calls → stop and report.

## Combined with other skills

- `/haiku:quick` + autopilot: edit `stages: [<one>]` AND `autopilot: true`. Single-stage, no pauses except external/completion gates.
- `/haiku:revisit` while in autopilot: the revisit action itself pauses autopilot until the user confirms the revisit target.

---
name: revisit
description: Revisit an earlier stage or phase to address issues
---

# Revisit

Return to a specific stage or phase to address issues found during execution. Revisit happens via the feedback path: log one or more `stage_revisit` feedback items at the target stage, then call `haiku_run_next`. The pre-tick gate sees the new findings and reroutes the cursor.

## Process

1. **Find the active intent.** Call `haiku_intent_list`. If multiple are active, ask the user which one.

2. **Confirm the target stage and reasons.** Ask the user (a) which stage to revisit (default: the current active stage — under v4 derived from the cursor walk as the first stage with `mergedIntoMain: false`) and (b) what should change. Each reason becomes one feedback item — short, actionable, scoped to a single concern.

3. **Log a stage_revisit feedback for each reason.** For each reason:

   ```
   haiku_feedback {
     intent: "<slug>",
     stage: "<target-stage>",
     title: "<one-line summary>",
     body: "<what's wrong, what should change, any file:line refs>",
     origin: "agent",
     resolution: "stage_revisit"
   }
   ```

   The `resolution: "stage_revisit"` is what tells the pre-tick gate to reroute the cursor on the next tick. Without it, the FB just sits in the stage's pending list and the gate keeps the agent on the current stage.

4. **Drive the lifecycle.** Call `haiku_run_next { intent: "<slug>" }`. The pre-tick gate sees the new stage_revisit FBs and emits a `revisited` action that reroutes the cursor to the target stage's elaborate phase. The agent picks up from there and addresses each finding as part of the next iteration.

## Why this shape

- **One pattern, not two.** Every "I want to change the workflow" expression — agent-blocked, reviewer-rejected, user-typed — flows through the same surface: write a feedback finding, call run_next, the pre-tick gate routes. There is no separate "revisit verb."
- **Audit trail.** Each reason becomes a durable on-disk feedback record showing exactly why the rewind happened and what needs to change. Future debugging gets the full why.
- **Consistent with the agent's contract.** The agent's universe is "receive instruction, do what it says, call run_next" — no extra workflow-routing tools. Revisit isn't special.

## Quick reference

| What you want | Tool calls |
|---|---|
| User wants to revisit current stage | `haiku_feedback {..., resolution: "stage_revisit"}` × N → `haiku_run_next` |
| User wants to revisit an earlier stage | `haiku_feedback {stage: "<earlier>", ..., resolution: "stage_revisit"}` × N → `haiku_run_next` |
| Agent is blocked, needs upstream rework | Same — log a stage_revisit FB at the upstream stage, call run_next |

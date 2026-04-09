---
name: dashboard
description: Show active intents and their status overview
---

# Dashboard

Show a status overview of all H·AI·K·U intents.

## Process

1. Call `haiku_intent_list` to get all intents
2. For each intent, call `haiku_intent_get { intent: "<slug>" }` to get status, studio, active stage, and mode
3. For each intent, call `haiku_stage_get` for each stage to get stage status and phase
4. Present a formatted dashboard with:
   - Intent name, status, studio, active stage, mode
   - Stage status table (stage | status | phase)
5. If no intents found, suggest `/haiku:start`

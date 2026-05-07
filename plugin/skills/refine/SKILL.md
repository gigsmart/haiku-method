---
name: refine
description: Refine intent, unit, or upstream stage outputs mid-execution
---

# Refine

1. Call `haiku_intent_list` to find the active intent.
2. Use `ask_user_visual_question` to ask what to refine: intent-level spec, specific unit, or upstream stage output.
3. For stage-scoped refinement: use `haiku_studio_stage_get` and `haiku_unit_list` to read current state. Create new units via `haiku_unit_write` for the additional work — do NOT mutate completed units (forward-only invariant). The cursor picks up new units automatically (units with empty `iterations[]` are wave-ready).
4. To target specific approvals for re-run, log a `haiku_feedback` finding with `targets.invalidates: [<role>]` against the affected unit. The terminal fix-hat clears those approvals on closure and the cursor reroutes through them.
5. Call `haiku_run_next` to drive the lifecycle.

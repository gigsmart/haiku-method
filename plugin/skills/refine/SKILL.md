---
name: refine
description: Refine intent, unit, or upstream stage outputs mid-execution
---

# Refine

1. Call `haiku_intent_list` to find the active intent.
2. Use `ask_user_visual_question` to ask what to refine: intent-level spec, specific unit, or upstream stage output.
3. For stage-scoped refinement: use `haiku_studio_stage_get` and `haiku_unit_list` to read current state, create new units, run hat sequence for new units only.
4. After refinement: re-queue affected units (set status: pending), commit changes.

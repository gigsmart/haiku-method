---
name: refine
description: Refine intent, unit, or upstream stage outputs mid-execution
---

# Refine

Refine an intent's specs, units, or upstream stage outputs while execution is in progress.

## Process

1. **Find active intent** — Call `haiku_intent_list` to find the active intent. If multiple, ask the user which one.

2. **Read intent state** — Call `haiku_intent_get { intent: "<slug>" }` to get the current studio, active stage, and phase.

3. **Ask what to refine** — Use `ask_user_visual_question` to present options:
   - **Intent-level spec** — Refine problem statement, solution approach, or success criteria
   - **Specific unit** — Refine a unit's spec, criteria, or boundaries
   - **Upstream stage output** — Add or update an output from a prior stage (specify which stage)

4. **For stage-scoped refinement:**
   - Read the target stage definition with `haiku_studio_stage_get`
   - List existing units with `haiku_unit_list`
   - Create a new unit in `.haiku/intents/<slug>/stages/<target-stage>/units/` for the new/updated output
   - Run the target stage's hat sequence for this unit only (do NOT re-run completed units)
   - Return to the current stage — this is a scoped side-trip
   - Commit changes

5. **After refinement:**
   - Preserve all frontmatter fields when rewriting files
   - Re-queue affected units (set status: pending, reset hat to first hat)
   - Commit changes

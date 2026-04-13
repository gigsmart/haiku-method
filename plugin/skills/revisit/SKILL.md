---
name: revisit
description: Revisit an earlier stage or phase to address issues
---

# Revisit

Return to a specific stage or phase to address issues found during execution.

## Process

1. **Find active intent** — Call `haiku_intent_list` to find the active intent. If multiple, ask the user.

2. **Revisit** — Call `haiku_revisit { intent: "<slug>" }` or `haiku_revisit { intent: "<slug>", stage: "<stage>" }`.

   - With `stage`: jumps directly to that stage (must be current or earlier)
   - Without `stage`: the FSM infers the target:
     - If in execute/review/gate phase → revisits elaborate in the current stage
     - If already in elaborate phase → revisits the previous stage

3. **Follow the returned instructions** — The tool returns what happened and what to do next.

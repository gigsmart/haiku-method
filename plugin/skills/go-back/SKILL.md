---
name: go-back
description: Go back to the previous stage or phase to address issues
---

# Go Back

Return to a previous stage or phase to address issues found during execution.

## Process

1. **Find active intent** — Call `haiku_intent_list` to find the active intent. If multiple, ask the user.

2. **Go back** — Call `haiku_go_back { intent: "<slug>" }`.

   The FSM determines the correct target based on current position:
   - If in execute/review/gate phase → goes back to elaborate in the current stage
   - If already in elaborate phase → goes back to the previous stage

3. **Follow the returned instructions** — The tool returns what happened and what to do next.

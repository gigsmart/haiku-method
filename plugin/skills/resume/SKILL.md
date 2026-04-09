---
name: resume
description: Resume an active H·AI·K·U intent — pick up where you left off
---

# Resume an Intent

## Process

1. **Find the active intent** — Call `haiku_intent_list` to find active intents. If multiple exist, ask the user which one to resume.

2. **Advance the lifecycle** — Call `haiku_run_next { intent: "<slug>" }` with the intent slug.

3. **Follow the instructions** — The tool returns the next action and detailed instructions. Execute them.

## Notes

- If no active intents exist, suggest starting a new one with `/haiku:start`
- The `haiku_run_next` tool handles all FSM logic — just call it and follow its response

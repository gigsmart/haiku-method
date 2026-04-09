---
name: reset
description: Reset an intent — delete all state and recreate from the same description
---

# Reset Intent

1. Call `haiku_intent_list` to find the intent. If multiple active, ask the user which one.
2. Call `haiku_intent_reset { intent: "<slug>" }` — the tool asks for confirmation via elicitation, preserves the description, deletes all state, and returns instructions to recreate.
3. Follow the returned instructions to call `haiku_intent_create` with the preserved description.

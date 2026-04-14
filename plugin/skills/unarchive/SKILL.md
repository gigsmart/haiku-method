---
name: unarchive
description: Unarchive an intent — restore a previously archived intent to default lists
---

# Unarchive Intent

1. If no slug was provided, call `haiku_intent_list { include_archived: true }`, filter to entries where `archived` is true, and ask the user in plain prose which intent to unarchive.
2. Call `haiku_intent_unarchive { intent: "<slug>" }` — the tool clears the `archived` flag and returns instructions.
3. Follow the returned instructions and report the result.

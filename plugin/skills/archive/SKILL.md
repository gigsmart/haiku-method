---
name: archive
description: Archive an intent — soft-hide it from default lists while preserving all state
---

# Archive Intent

1. If no slug was provided, call `haiku_intent_list` and ask the user in plain prose which intent to archive.
2. Call `haiku_intent_archive { intent: "<slug>" }` — the tool flips the `archived` flag and returns instructions.
3. Follow the returned instructions and report the result.

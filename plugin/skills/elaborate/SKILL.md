---
description: "Deprecated: use /haiku:new + /haiku:run instead"
user-invocable: true
argument-hint: "[intent-slug]"
---

## Deprecation Notice

> **This command is deprecated.** Use `/haiku:new` to create an intent, then `/haiku:run` to advance through stages.

`/haiku:elaborate` was the legacy elaboration flow that decomposed intents into units. This functionality is now handled by `/haiku:run`, which manages the full stage lifecycle including planning/decomposition.

**Action:** Invoke `/haiku:run` via the Skill tool with any arguments the user provided. Do not run any legacy elaboration logic.

```
Skill { skill: "haiku:run", args: "{original arguments}" }
```

---
description: "Deprecated: use /haiku:run instead"
user-invocable: true
argument-hint: "[intent-slug]"
---

## Deprecation Notice

> **This command is deprecated.** Use `/haiku:run` instead.

**Action:** Invoke `/haiku:run` via the Skill tool with any arguments the user provided. Do not run any legacy execution logic.

```
Skill { skill: "haiku:run", args: "{original arguments}" }
```

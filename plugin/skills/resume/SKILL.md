---
description: "Deprecated: use /haiku:run instead — it picks up where you left off"
user-invocable: true
argument-hint: "[intent-slug]"
---

## Deprecation Notice

> **This command is deprecated.** Use `/haiku:run` instead. It automatically detects active intents and resumes from where you left off.

`/haiku:resume` used to reload intent state after a session context loss. The MCP-based workflow persists all state via `haiku_intent_get`, `haiku_stage_get`, and `haiku_unit_get` tools, so `/haiku:run` can always pick up where it left off without a separate resume step.

**Action:** Invoke `/haiku:run` via the Skill tool with any arguments the user provided.

```
Skill { skill: "haiku:run", args: "{original arguments}" }
```

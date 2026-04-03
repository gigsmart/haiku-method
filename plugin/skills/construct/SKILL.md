---
description: (Deprecated) Alias for /ai-dlc:execute. Use /ai-dlc:execute instead.
argument-hint: "[intent-slug] [unit-name]"
user-invocable: true
---

## Deprecation Notice

`/ai-dlc:construct` is **deprecated**. Use `/ai-dlc:execute` instead.

The `/ai-dlc:construct` command has been renamed to `/ai-dlc:execute` to align with the AI-DLC methodology. All functionality is identical.

## Behavior

1. Display the following notice to the user:

```
DEPRECATION NOTICE: /ai-dlc:construct is deprecated. Use /ai-dlc:execute instead.
```

2. Invoke the `/ai-dlc:execute` skill with the same arguments passed to `/ai-dlc:construct`.

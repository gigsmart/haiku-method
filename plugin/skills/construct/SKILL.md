---
description: (Deprecated) Alias for /execute. Use /execute instead.
argument-hint: "[intent-slug] [unit-name]"
user-invocable: true
---

## Deprecation Notice

`/construct` is **deprecated**. Use `/execute` instead.

The `/construct` command has been renamed to `/execute` to align with the AI-DLC methodology. All functionality is identical.

## Behavior

1. Display the following notice to the user:

```
DEPRECATION NOTICE: /construct is deprecated. Use /execute instead.
```

2. Invoke the `/execute` skill with the same arguments passed to `/construct`.

---
description: (Deprecated) Alias for /haiku:execute. Use /haiku:execute instead.
argument-hint: "[intent-slug] [unit-name]"
user-invocable: true
---

## Deprecation Notice

`/haiku:construct` is **deprecated**. Use `/haiku:execute` instead.

The `/haiku:construct` command has been renamed to `/haiku:execute` to align with the H·AI·K·U methodology. All functionality is identical.

## Behavior

1. Display the following notice to the user:

```
DEPRECATION NOTICE: /haiku:construct is deprecated. Use /haiku:execute instead.
```

2. Invoke the `/haiku:execute` skill with the same arguments passed to `/haiku:construct`.

---
description: (Deprecated) Alias for /execute. Use /execute instead.
argument-hint: "[intent-slug] [unit-name]"
user-invocable: true
---

## Name

`ai-dlc:construct` - **(Deprecated)** Alias for `/execute`. Use `/execute` instead.

## Synopsis

```
/construct [intent-slug] [unit-name]
```

## Description

> **DEPRECATED:** `/construct` has been renamed to `/execute` to align with the H•AI•K•U methodology.
> This command still works but will display a deprecation notice. Use `/execute` going forward.

This is an alias for `/execute`. See `execute/SKILL.md` for the full implementation.

## Implementation

Display deprecation warning, then delegate to `/execute`:

```
DEPRECATION NOTICE: /construct is deprecated. Use /execute instead.
```

Then invoke `/execute` with the same arguments passed to `/construct`.

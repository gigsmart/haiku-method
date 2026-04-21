---
title: >-
  Shell layout + Header use max-w-7xl instead of the canonical --content-max
  (1400px) token
status: pending
origin: adversarial-review
author: consistency (from design)
author_type: agent
created_at: '2026-04-21T20:22:30Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 0
upstream_stage: null
---

**Mandate check:** "all spacing/color values reference named tokens — no raw hex, px, or magic numbers" + "layout grid and breakpoint behavior is consistent across all screens."

DESIGN-TOKENS §2.5 and `packages/haiku-ui/src/index.css:47` declare the canonical container token:

```
--content-max: 1400px;
```

and `audit-config.json` `banned-content-max-literal` rule bans `max-w-[1400px]` literals in favor of `max-w-[var(--content-max)]`.

However:

- `packages/haiku-ui/src/components/Header.tsx:42` — `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`
- `packages/haiku-ui/src/shell/ShellLayout.tsx:27` — `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6`
- `packages/haiku-ui/src/shell/ShellLayout.tsx:46` — `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12`

`max-w-7xl` is the Tailwind default (80rem / **1280 px**) — 120 px narrower than the canonical 1400 px content-max. The app-wide chrome (header, main shell) **cannot reach** the max content width the design tokens declare. Every page composed inside `ShellLayout` is visually clipped at 1280 px on wide monitors.

This is both a token-drift issue (raw `7xl` magic tier instead of the named `--content-max` token) and a breakpoint-behavior inconsistency (the shell is narrower than its content contract).

**Fix:** replace `max-w-7xl` with `max-w-[var(--content-max)]` in Header, ShellLayout, and any other top-level container. If 7xl was intentional (e.g. header should be narrower than page body), document the exception in DESIGN-TOKENS §2.5 and add a matching named token like `--header-max`.

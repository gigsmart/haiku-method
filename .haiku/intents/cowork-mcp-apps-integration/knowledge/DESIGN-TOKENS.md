---
name: design-tokens
stage: design
intent: cowork-mcp-apps-integration
scope: intent
---

# Design Tokens

**No new tokens.** This intent does not introduce any visual change.

The existing review SPA already consumes the project's Tailwind theme (configured in `packages/haiku/review-app/tailwind.config.js` and `packages/haiku/src/templates/styles.ts`) and the website's design tokens (`website/app/globals.css`). All colors, spacing, typography, and shadow scales remain unchanged.

## Token surface inventory (existing, unchanged)

- **Colors:** Tailwind `stone-*`, `teal-*` (review accent), `amber/yellow` (question accent), `indigo` (design direction accent), with light/dark variants. Used via `bg-*`, `text-*`, `border-*` classes.
- **Spacing:** Tailwind default scale (`p-*`, `m-*`, `gap-*`).
- **Typography:** Tailwind default sans/mono with `text-xs` through `text-lg` for review UI, `text-base` for body content.
- **Border radii:** `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-full` per existing usage.
- **Shadows:** None — review UI uses borders, not shadows.
- **Animations:** `animate-spin` (loading), `animate-pulse` (reconnecting indicator).

## Why no token work

This is a transport-layer intent. The user-visible surface (review SPA) is byte-identical pre and post intent. Adding new tokens for unchanged UI would be noise that downstream design-reviewer hats would correctly flag as wasted scope.

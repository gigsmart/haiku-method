---
name: design-tokens
location: .haiku/intents/{intent-slug}/knowledge/DESIGN-TOKENS.md
scope: intent
format: text
required: true
---

# Design Tokens

Named design values that downstream stages must use instead of raw values. All colors, spacing, typography, and other visual properties should be referenced by token name throughout the project.

## Content Guide

Define tokens for:

- **Color tokens** — primary, secondary, surface, error, warning, success, and semantic aliases
- **Spacing scale** — consistent spacing values (e.g., 4px, 8px, 12px, 16px, 24px, 32px, 48px)
- **Typography scale** — font families, sizes, weights, line heights for each usage context (heading, body, caption, etc.)
- **Border radii** — small, medium, large, pill, circle
- **Shadow definitions** — elevation levels with shadow values
- **Animation/transition values** — duration and easing for standard transitions

If the project has an existing design system, tokens should reference or extend it. If no design system exists, this document establishes one.

## Quality Signals

- All downstream stages use token names, never raw values
- Token names are semantic (e.g., `color-error` not `color-red-500`)
- The scale is consistent and complete — no gaps that force raw values
- Tokens are documented with their intended usage context

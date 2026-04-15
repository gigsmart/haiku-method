---
name: design-tokens
stage: design
intent: cowork-mcp-apps-integration
scope: intent
---

# Design Tokens — MCP Apps Iframe Mode

The existing review SPA already consumes the project's Tailwind theme. This intent **reuses every existing token** and adds a small set of **iframe-specific tokens** for the new iframe-context components and states.

## Existing tokens (reused, unchanged)

- **Color palette:** `stone-*` (neutrals), `teal-*` (review accent), `amber/yellow-*` (question accent), `indigo-*` (design direction accent), `red-*` (errors), `green-*` (success). Light/dark variants from the existing Tailwind config.
- **Spacing scale:** Tailwind default (`p-1` / `p-2` / `p-3` / `p-4` / `p-6` / `p-8` / `p-10`).
- **Typography:** Tailwind sans / mono. `text-xs` / `text-sm` / `text-base` / `text-lg` / `text-xl`.
- **Border radii:** `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-full`.
- **Shadows:** None — review UI uses borders, not shadows. Same in iframe mode.
- **Animations:** `animate-spin` (loading), `animate-pulse` (reconnecting indicator), respect `prefers-reduced-motion`.

## New tokens (iframe-specific)

### `--iframe-min-touch` — touch target floor

`44px`. Floor for any interactive element rendered inside the iframe. Some hosts (Cowork on touch-capable devices, future mobile MCP hosts) need this.

### `--iframe-narrow` / `--iframe-medium` / `--iframe-wide` — breakpoint thresholds

- `--iframe-narrow`: `481px`
- `--iframe-medium`: `769px`
- `--iframe-wide`: applied at any width above narrow

These are **iframe-relative** breakpoints, not viewport breakpoints. They're consumed via `ResizeObserver` on the iframe root, not via CSS media queries (which would observe the host viewport, not the iframe).

### `--host-bridge-connected` / `--host-bridge-reconnecting` / `--host-bridge-error`

Status pill foreground colors for `<HostBridgeStatus>`. Map to existing semantic tokens:

- `connected` → `teal-500` (matches review accent — the user is connected to a working review channel)
- `reconnecting` → `amber-400` (existing pulse pattern from the browser-tab `<ReconnectingBanner>`)
- `error` → `red-500` (matches existing error pill convention from `<StatusBadge status="blocked">`)

All three have ≥ 4.5:1 contrast against `bg-stone-950` (the iframe background).

### `--iframe-bg`

`stone-950`. Single fixed background for the iframe document. Not a theme token because the iframe doesn't have light/dark mode — it always renders dark to match the existing review SPA chrome and to reduce eye strain inside chat surfaces.

### `--iframe-padding-narrow` / `--iframe-padding-medium` / `--iframe-padding-wide`

- narrow: `12px` (`p-3`)
- medium: `16px` (`p-4`)
- wide: `24px` (`p-6`)

Replaces the browser-tab `p-10` outer padding on the `<main>` element. Tighter padding because iframe widths are constrained.

### Animation timing

- `--iframe-boot-fade`: `200ms ease-out` for the boot screen → main content fade.
- `--iframe-status-pulse`: existing `animate-pulse` (no new value).

## Token usage rules

- Every iframe-specific component MUST use the named tokens above. No raw hex.
- Existing components, when rendered in iframe mode, MAY continue using their existing Tailwind class names — they fall through to the existing tokens and don't need rewiring.
- Touch targets MUST be ≥ `--iframe-min-touch`. Verified by lint rule (or manual audit on the mockups).

## What is NOT a new token

- No new color hex values. Every iframe color maps to an existing Tailwind palette entry.
- No new typography. The iframe uses the same text scale.
- No new shadows.
- No new border styles.

The intent here is to **add semantic meaning** for iframe-context decisions, not to expand the visual vocabulary.

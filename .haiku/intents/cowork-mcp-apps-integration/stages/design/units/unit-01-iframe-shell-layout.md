---
title: Iframe shell layout — collapsed sidebar / topbar / sticky decision panel
type: feature
model: sonnet
depends_on: []
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - stages/design/DESIGN-BRIEF.md
  - knowledge/DESIGN-TOKENS.md
---

# Iframe shell layout

## Scope

Design the wrapper layout the review SPA uses when it detects it's running inside an MCP Apps iframe. The current `ReviewSidebar.tsx` assumes a fixed-width left sidebar; that doesn't work below ~768px iframe width. This unit produces the responsive shell that hosts every other screen.

In scope:
- High-fidelity mockups for the iframe shell at the three iframe-width breakpoints (`narrow ≤ 480px`, `medium 481–768px`, `wide ≥ 769px`).
- Topbar accordion (collapsed sidebar) showing intent slug + session type + `<HostBridgeStatus>` pill.
- Sticky-bottom decision panel anchored to the iframe scroll container.
- `ResizeObserver`-driven breakpoint logic spec (no CSS media queries on the iframe itself).
- All interactive states (default / hover / focus / active / disabled / error) for the topbar, accordion toggle, and decision buttons.

Out of scope:
- The browser-tab layout — preserved verbatim, no edits.
- The annotation canvas — separate unit (unit-04).
- Iframe boot / loading screen — separate unit (unit-02).

## Completion Criteria

1. **Mockups exist** for narrow / medium / wide breakpoints at `stages/design/artifacts/iframe-shell-narrow.html`, `iframe-shell-medium.html`, `iframe-shell-wide.html` — verified by `ls`.
2. **All interactive states documented.** Each state for topbar accordion + decision buttons named in the mockup with a visible variant — verified by manual count: 5 states × 4 elements = 20 visible variants.
3. **Touch targets ≥ 44px on every interactive element** at the narrow breakpoint — verified by inspecting the rendered HTML's `min-height`/`min-width`.
4. **Focus order documented** as a numbered list at the bottom of each mockup — verified by `grep -c "Tab order:" stages/design/artifacts/iframe-shell-*.html` returns 3.
5. **No raw hex values** — `rg -n '#[0-9a-fA-F]{3,6}' stages/design/artifacts/iframe-shell-*.html` returns zero hits inside style attributes (Tailwind classes only).
6. **Sticky-bottom decision panel** specified with a CSS spec sample showing how it survives iframe resize — included in the wide mockup.
7. **`prefers-reduced-motion` fallback** documented for the accordion expand/collapse.
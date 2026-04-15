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
status: active
bolt: 1
hat: designer
started_at: '2026-04-15T12:32:00Z'
hat_started_at: '2026-04-15T12:32:00Z'
outputs:
  - stages/design/artifacts/iframe-shell-narrow-collapsed.html
  - stages/design/artifacts/iframe-shell-narrow-expanded.html
  - stages/design/artifacts/iframe-shell-medium-collapsed.html
  - stages/design/artifacts/iframe-shell-medium-expanded.html
  - stages/design/artifacts/iframe-shell-wide-collapsed.html
  - stages/design/artifacts/iframe-shell-wide-expanded.html
---

# Iframe shell layout — bottom-sheet decision panel

## Selected design direction

**Bottom sheet (drag-to-expand)** — chosen via `pick_design_direction`. Content fills the iframe completely. The decision panel is a draggable bottom sheet anchored at the bottom of the iframe scroll container. Two states:

- **Collapsed** (default): shows just the Approve / Changes buttons + a small drag handle and the prompt "Drag up for feedback ↑". Sticks at the bottom of the iframe regardless of scroll position.
- **Half-pane expanded**: drags up to ~50% of the iframe height. Reveals the feedback textarea, optional annotations CTA, and the external-review escalation. The content area dims (semi-opaque overlay) but stays scrollable behind the sheet.

Tunable parameters (defaults from the picker):
- `section_gap`: `14px` between sections inside the content area
- `topbar_height`: `36px` for the minimal status strip
- `decision_panel_emphasis`: `3` (loud — top border in `teal-500`, drop shadow above the sheet)

## Scope

Design the bottom-sheet shell the review SPA uses when running inside an MCP Apps iframe. The current `ReviewSidebar.tsx` assumes a fixed-width left sidebar; that doesn't work in iframe mode. The bottom-sheet pattern replaces it entirely.

In scope:
- High-fidelity mockups for the iframe shell at the three iframe-width breakpoints (`narrow ≤ 480px`, `medium 481–768px`, `wide ≥ 769px`).
- **Minimal status strip** across the top (height `36px`) showing intent slug + session type + `<HostBridgeStatus>` pill. **Not** an accordion — just an info bar. The full sidebar metadata (units list, dependencies, etc.) lives inside the scrollable content area.
- **Bottom sheet** in both collapsed and expanded states. Drag handle, drag gesture (touch + mouse), keyboard `Up`/`Down` arrow expand/collapse.
- **Backdrop dim** when the sheet is expanded — the content stays scrollable behind the sheet at reduced opacity (no scroll trap).
- `ResizeObserver`-driven breakpoint logic spec (no CSS media queries on the iframe — the host viewport is unrelated).
- All interactive states (default / hover / focus / active / disabled / error) for the status pill, drag handle, and decision buttons.
- Bottom-sheet height capped at the iframe height (the sheet cannot escape the iframe even if dragged).

Out of scope:
- The browser-tab layout — preserved verbatim, no edits.
- The annotation canvas — separate unit (unit-04).
- Iframe boot / loading screen — separate unit (unit-02).
- Topbar accordion / sidebar drawer patterns — explicitly rejected by the design direction picker.

## Completion Criteria

1. **Mockups exist** for narrow / medium / wide breakpoints, each with **two states** (sheet collapsed and sheet expanded). Six files total: `stages/design/artifacts/iframe-shell-{narrow,medium,wide}-{collapsed,expanded}.html`. Verified by `ls`.
2. **All interactive states documented.** Each state for status pill, drag handle, and decision buttons named in the mockup with a visible variant — verified by manual count: 5 states × 3 elements = 15 visible variants per breakpoint.
3. **Touch targets ≥ 44px** on every interactive element at the narrow breakpoint, including the drag handle (44px tall hit zone even though the visible bar is 4px) — verified by inspecting `min-height`/`min-width` in the mockup HTML.
4. **Focus order documented** as a numbered list at the bottom of each mockup. Sheet collapse/expand is keyboard-accessible via `Up`/`Down` arrow on the drag handle. Verified by `grep -c "Tab order:" stages/design/artifacts/iframe-shell-*.html` returns 6.
5. **No raw hex values** — `rg -n '#[0-9a-fA-F]{3,6}' stages/design/artifacts/iframe-shell-*.html` returns zero hits inside style attributes (Tailwind classes only).
6. **Bottom sheet sticks at iframe bottom** specified with a CSS spec sample showing `position: sticky` (or fixed-within-iframe) behavior across all three breakpoints. Included in each mockup.
7. **Backdrop dim** documented in the expanded variants — content area at `opacity-60 pointer-events-auto` so the user can still scroll while the sheet is up.
8. **`prefers-reduced-motion` fallback** documented for the drag-to-expand animation: the sheet snaps to expanded/collapsed without a transition.
9. **Drag gesture** spec: minimum drag distance to trigger expand (`24px`), velocity threshold for fling-to-expand (`0.5px/ms`), snap points (`collapsed`, `half-pane`), no `full-pane` snap (the sheet never covers the entire iframe).
10. **Decision panel emphasis** matches the picked direction (`emphasis: 3`): top border `teal-500`, drop shadow `0 -8px 24px rgba(0,0,0,0.4)` above the sheet, button background `teal-500` for Approve.

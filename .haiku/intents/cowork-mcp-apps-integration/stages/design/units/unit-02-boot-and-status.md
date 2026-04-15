---
title: Iframe boot screen + HostBridgeStatus pill
type: feature
model: sonnet
depends_on:
  - unit-01-iframe-shell-layout
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - stages/design/DESIGN-BRIEF.md
  - knowledge/DESIGN-TOKENS.md
  - stages/design/units/unit-01-iframe-shell-layout.md
status: active
bolt: 1
hat: design-reviewer
started_at: '2026-04-15T12:44:12Z'
hat_started_at: '2026-04-15T12:49:13Z'
outputs:
  - stages/design/artifacts/boot-screen.html
  - stages/design/artifacts/host-bridge-status.html
  - >-
    ../../worktrees/cowork-mcp-apps-integration/unit-04-iframe-content-screens/.haiku/intents/cowork-mcp-apps-integration/stages/design/artifacts/question-narrow.html
  - >-
    ../../worktrees/cowork-mcp-apps-integration/unit-04-iframe-content-screens/.haiku/intents/cowork-mcp-apps-integration/stages/design/artifacts/question-medium.html
  - >-
    ../../worktrees/cowork-mcp-apps-integration/unit-04-iframe-content-screens/.haiku/intents/cowork-mcp-apps-integration/stages/design/artifacts/question-wide.html
  - >-
    ../../worktrees/cowork-mcp-apps-integration/unit-04-iframe-content-screens/.haiku/intents/cowork-mcp-apps-integration/stages/design/artifacts/design-picker-narrow.html
  - >-
    ../../worktrees/cowork-mcp-apps-integration/unit-04-iframe-content-screens/.haiku/intents/cowork-mcp-apps-integration/stages/design/artifacts/design-picker-medium.html
  - >-
    ../../worktrees/cowork-mcp-apps-integration/unit-04-iframe-content-screens/.haiku/intents/cowork-mcp-apps-integration/stages/design/artifacts/design-picker-wide.html
  - >-
    ../../worktrees/cowork-mcp-apps-integration/unit-04-iframe-content-screens/.haiku/intents/cowork-mcp-apps-integration/stages/design/artifacts/annotation-canvas-narrow.html
  - >-
    ../../worktrees/cowork-mcp-apps-integration/unit-04-iframe-content-screens/.haiku/intents/cowork-mcp-apps-integration/stages/design/artifacts/annotation-canvas-medium.html
  - >-
    ../../worktrees/cowork-mcp-apps-integration/unit-04-iframe-content-screens/.haiku/intents/cowork-mcp-apps-integration/stages/design/artifacts/annotation-canvas-wide.html
---

# Iframe boot screen + HostBridgeStatus pill

## Scope

Design the three-phase boot screen the user sees from `srcdoc` mount → host-bridge handshake → session data hydrated → first render. Plus the `<HostBridgeStatus>` pill that lives in the topbar (from unit-01) and reflects connection state for the rest of the session.

In scope:
- High-fidelity mockup for the boot screen at all three phases: `loading` / `connecting` / `ready` (the last one as a fade-out frame). Single file `stages/design/artifacts/boot-screen.html` with all three phases stacked.
- High-fidelity mockup for `<HostBridgeStatus>` in all three states (`connected` / `reconnecting` / `error`) at `stages/design/artifacts/host-bridge-status.html`.
- `aria-live="polite"` announcement copy for each state transition.
- `prefers-reduced-motion` fallback (no spinner; static label).
- Click behavior on the `error` state: triggers a retry of the host-bridge handshake. Document the visible feedback pattern.

Out of scope:
- The negotiation-error and sandbox-error full-screen states — separate unit (unit-03).
- The boot screen for the browser-tab path — unchanged.

## Completion Criteria

1. **Boot screen mockup exists** at `stages/design/artifacts/boot-screen.html` showing all three phases — verified by `grep -c "phase=" stages/design/artifacts/boot-screen.html` returns ≥ 3.
2. **HostBridgeStatus mockup exists** at `stages/design/artifacts/host-bridge-status.html` showing all three states — verified by `grep -c "state=" stages/design/artifacts/host-bridge-status.html` returns ≥ 3.
3. **`aria-live` copy documented** for each state transition — verified by `grep -c "aria-live" stages/design/artifacts/host-bridge-status.html` ≥ 1 plus a documentation block listing the announcement strings.
4. **Reduced-motion fallback** rendered as an alternate frame in the boot screen mockup — verified by `grep -q "prefers-reduced-motion" stages/design/artifacts/boot-screen.html`.
5. **Contrast ratio ≥ 4.5:1** for status pill text against the iframe background (`stone-950`) — verified by manually plugging the chosen colors into a contrast checker and noting the ratio in a comment.
6. **Touch target ≥ 44px** for the error-state retry click affordance — verified by mockup inspection.
7. **No raw hex** — `rg -n '#[0-9a-fA-F]{3,6}' stages/design/artifacts/boot-screen.html stages/design/artifacts/host-bridge-status.html` returns zero hits in style attributes.

---
title: Error states — capability-negotiation, sandbox-restricted, session-expired, stale-host
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
---

# Error states for the iframe review experience

## Scope

Design the four error screens the user can hit inside the iframe, each as a centered card that fits within the iframe at the narrow breakpoint:

1. **Capability-negotiation error** — the host advertised `experimental.apps` but `App.callServerTool` failed at runtime, OR the bridge handshake didn't complete after N retries.
2. **Sandbox-restricted error** — the iframe sandbox blocked a feature the SPA needs (clipboard write, file download, popup, navigation). Show what was blocked + a "Why this happens" disclosure.
3. **Session expired** — the JWT-derived session is stale. Show how to ask for a new link without browser-tab assumptions.
4. **Stale-host warning** — the host advertises the capability but its protocol version is older than what the SPA expects. Soft warning, not a hard block.

In scope:
- One mockup file per state at `stages/design/artifacts/error-{negotiation|sandbox|expired|stale}.html` showing the card layout, icon, message copy, and primary action.
- Disclosure-open variant for the sandbox-restricted error.
- Retry-pending and retry-failed variants for the negotiation error.
- Copy strings for each error — concrete, no placeholder text.
- Recovery action wired to the appropriate host-bridge call (`App.callServerTool` for retry, copy-to-clipboard for the new-link request, dismiss for the stale-host warning).

Out of scope:
- The success state after a decision is submitted — separate unit (unit-05).
- The browser-tab error screens — unchanged.

## Completion Criteria

1. **Four mockup files exist** at the named paths — verified by `ls stages/design/artifacts/error-*.html | wc -l` returns 4.
2. **Each mockup names a specific error code** in the visible card — verified by `grep -E "Error code: [A-Z_]+" stages/design/artifacts/error-*.html` returns ≥ 4 hits.
3. **Sandbox error has a disclosure-open variant** — verified by `grep -q 'aria-expanded="true"' stages/design/artifacts/error-sandbox.html`.
4. **Negotiation error has retry-pending and retry-failed variants** — verified by `grep -c 'variant=' stages/design/artifacts/error-negotiation.html` returns ≥ 3 (default + 2 retries).
5. **Touch targets ≥ 44px** on every interactive element across all four files — verified by mockup inspection.
6. **Concrete copy** — no `Lorem ipsum`, no `TODO`, no placeholder strings — verified by `! rg -i "lorem|placeholder|todo" stages/design/artifacts/error-*.html`.
7. **`aria-live="assertive"`** on the error message container so screen readers announce immediately — verified by `grep -c 'aria-live="assertive"' stages/design/artifacts/error-*.html` returns ≥ 4.
8. **No raw hex** — `rg -n '#[0-9a-fA-F]{3,6}' stages/design/artifacts/error-*.html` returns zero hits in style attributes.
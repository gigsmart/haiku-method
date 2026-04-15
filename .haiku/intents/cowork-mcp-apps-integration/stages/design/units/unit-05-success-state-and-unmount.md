---
title: Decision-submitted success state + iframe unmount choreography
type: feature
model: sonnet
depends_on:
  - unit-01-iframe-shell-layout
  - unit-04-iframe-content-screens
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - stages/design/DESIGN-BRIEF.md
  - knowledge/DESIGN-TOKENS.md
  - stages/design/units/unit-01-iframe-shell-layout.md
  - stages/design/units/unit-04-iframe-content-screens.md
status: active
bolt: 1
hat: designer
started_at: '2026-04-15T13:01:06Z'
hat_started_at: '2026-04-15T13:01:06Z'
---

# Decision-submitted success state and iframe unmount

## Scope

Design what the user sees from "decision submitted" → "iframe gone". The browser-tab path uses `window.close()` and `tryCloseTab()`; that doesn't apply inside the iframe. Instead, the SPA shows a brief success state and waits for the host to unmount the iframe. This unit specifies the timing, the visible content, and the focus management of that handoff.

In scope:
- Mockup at `stages/design/artifacts/success-approved.html` — green check, "Approved" headline, brief subtext, no buttons.
- Mockup at `stages/design/artifacts/success-changes-requested.html` — amber, "Changes requested" headline, the feedback the user typed echoed back, no buttons.
- Mockup at `stages/design/artifacts/success-external-review.html` — indigo, "External review requested" headline, the copy-to-clipboard external URL field, no buttons.
- Focus moves to the success heading as soon as the state renders.
- `aria-live="polite"` announces the success state.
- A 200ms fade-in animation that respects `prefers-reduced-motion`.
- The success state is **persistent** — it does not auto-dismiss. The host decides when to unmount based on the resolved tool call. The SPA must NOT call `window.close`, `window.history.back`, or any unmount API.

Out of scope:
- The decision panel itself (designed in unit-01 / unit-04).
- Server-side handling of the decision — already specified in the inception units (unit-05 of inception).
- Browser-tab success state — unchanged.

## Completion Criteria

1. **Three success-state mockups exist** at the named paths — verified by `ls stages/design/artifacts/success-{approved,changes-requested,external-review}.html | wc -l` returns 3.
2. **No buttons** in any success state — verified by `! grep -E '<button' stages/design/artifacts/success-*.html` (zero matches).
3. **No `window.close` references** anywhere in the mockup HTML — verified by `! grep -i "window.close\|history.back\|close()" stages/design/artifacts/success-*.html`.
4. **`aria-live="polite"`** on the success heading — verified by `grep -c 'aria-live="polite"' stages/design/artifacts/success-*.html` returns ≥ 3.
5. **Focus moves to the heading** documented in each mockup with a "Focus management:" comment — verified by grep.
6. **Reduced-motion fallback** documented for the fade-in — verified by `grep -q "prefers-reduced-motion" stages/design/artifacts/success-*.html`.
7. **External-review URL is a copy-to-clipboard input**, not a `target="_blank"` anchor — verified by `! grep 'target="_blank"' stages/design/artifacts/success-external-review.html`.
8. **No raw hex** — `rg -n '#[0-9a-fA-F]{3,6}' stages/design/artifacts/success-*.html` returns zero hits in style attributes.

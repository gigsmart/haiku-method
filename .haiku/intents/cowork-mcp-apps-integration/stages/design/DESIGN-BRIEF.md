---
name: design-brief
stage: design
intent: cowork-mcp-apps-integration
scope: intent
---

# Design Brief

## TL;DR

**No new user-facing UI, no new screens, no new components, no new tokens.**

This intent is a backend transport swap: replace the HTTP server + tunnel + browser-launch flow with an MCP Apps `ui://` resource delivery path when the connected MCP host advertises the MCP Apps capability. The existing review SPA at `packages/haiku/review-app/` is reused **verbatim** — same React tree, same styles, same components, same screens.

## Affected surfaces

| Surface | Change |
|---|---|
| Review SPA pages (`ReviewPage`, `QuestionPage`, `DesignPicker`, `AnnotationCanvas`, etc.) | None visually. Component tree is untouched. |
| Review SPA bundle | Wired through a new `host-bridge.ts` module (unit-04) that selects between `fetch`/WebSocket and `App.callServerTool` at runtime. No visual or interaction change. |
| Server-rendered HTML templates (`packages/haiku/src/templates/*`) | None. Already reused. |
| Website chrome (`Header`, `Footer`) | Already hidden on the review route by PR #213. |

## Layout / interaction states / responsive behavior / accessibility

**Unchanged from the existing review SPA.** This brief explicitly defers to the design baseline already established by the prior intents that built the review UI (`remote-review-spa`, `visual-review`, `design-direction-system`, etc.). All breakpoints, hover/focus/active/disabled/error states, contrast ratios, and keyboard navigation paths remain as they are on `main` today.

## Design gaps

None introduced by this intent. Existing gaps in the review SPA (catalogued in earlier design briefs) are out of scope for this transport swap.

## Why no design work

The design stage exists because the studio template includes it for every intent. For backend-only or transport-only intents, the honest output is: *"no new UI; the existing UI is preserved."* This brief documents that decision so downstream stages don't waste effort generating speculative wireframes for screens that don't exist.

The unit decomposition (`unit-01-no-design-work.md`) records the same decision in the FSM-tracked unit format.

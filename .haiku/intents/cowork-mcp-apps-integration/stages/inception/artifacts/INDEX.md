---
name: knowledge
stage: inception
intent: cowork-mcp-apps-integration
---

# Inception Stage Knowledge Index

Aggregates the research artifacts produced by the inception units. Each
referenced file lives under `.haiku/intents/cowork-mcp-apps-integration/knowledge/`.

## Discovery

- `DISCOVERY.md` — business context, technical landscape, success criteria, considerations and risks
- `CONVERSATION-CONTEXT.md` — original problem framing from the seeding conversation

## Per-Unit Research

- `unit-01-cowork-env-contract.md` — env vars, workspace handshake, multi-workspace policy options
- `unit-01-elaboration-notes.md` — folded-in researcher findings for unit-01
- `unit-02-cowork-timeout-research.md` — existing 30-min timeout constants, probe-tool shape, unknowns
- `unit-03-resource-registration-research.md` — capabilities gap, greenfield resource handlers, build script touchpoints
- `unit-03-elaboration-notes.md` — folded-in researcher findings for unit-03
- `unit-04-host-bridge-research.md` — bundled-vs-website SPA distinction, current transport surface, detection probe options
- `unit-05-open-review-handler-research.md` — `_openReviewAndWait` shape, contract pin, tool list pattern
- `unit-06-visual-question-design-direction-research.md` — handler line refs, single-tool submission recommendation
- `unit-07-scoping-decisions.md` — `get_review_status` doc-scrub inventory and exclusion list
- `unit-08-cowork-e2e-validation-research.md` — 15 numbered E2E checkpoints with `[M]`/`[A]` markers

## Detection: MCP capability negotiation, not env vars

Units 01, 05, 06, and 08 detect MCP Apps host support via the spec-
compliant **capability negotiation** path
(modelcontextprotocol.io/extensions/overview#negotiation):

1. Server advertises `experimental.apps` in its `Server` constructor
   capabilities block (`packages/haiku/src/server.ts:158`).
2. Client echoes back support during the `initialize` handshake.
3. The unit-01 accessor `hostSupportsMcpApps()` reads
   `server.getClientCapabilities()` and caches the result.
4. Units 05/06 branch on `hostSupportsMcpApps()` — **not** on any env
   variable.

This makes the feature work across **any** MCP host that ships the MCP
Apps extension (Cowork, Claude Desktop if it adopts, Goose, VS Code
Copilot, etc.), not just Cowork. The intent slug retains the historical
`cowork-` prefix for traceability, but the implementation is host-
agnostic.

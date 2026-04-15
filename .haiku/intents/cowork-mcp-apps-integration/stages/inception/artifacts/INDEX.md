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

## Note on Cowork detection

The unit specs currently describe Cowork detection via env var
(`CLAUDE_CODE_IS_COWORK`). A followup refinement will replace this with
**MCP capability negotiation** per the MCP spec
(modelcontextprotocol.io/extensions/overview#negotiation). The server
declares the MCP Apps extension in its capabilities; the client responds
during the `initialize` handshake; the server reads the negotiated
capability and chooses the transport accordingly. This makes the feature
work across any MCP host that supports the extension, not just Cowork.

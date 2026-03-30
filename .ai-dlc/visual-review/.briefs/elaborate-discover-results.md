---
status: success
error_message: ""
---

# Discovery Results

## Domain Model Summary

### Entities
- **Intent** — Core spec artifact with YAML frontmatter (workflow, git config, status, passes) and markdown body (Problem, Solution, Domain Model, Success Criteria)
- **Unit** — Discrete work item with frontmatter (status, depends_on, discipline, branch, wireframe, deployment/monitoring/operations configs) and body (Description, Technical Spec, Criteria, Risks, Boundaries)
- **DependencyDAG** — Computed graph from unit `depends_on` fields. Nodes = units, edges = dependencies. Rendered as Mermaid.js graphs.
- **DiscoveryLog** — Research findings from elaboration. Sectioned markdown with standardized headers.
- **Wireframe** — Self-contained HTML files for UI units in `mockups/` directory.
- **ReviewSession** — Live review session on MCP channel server. Contains intent/unit slug, review type, decision state.
- **ReviewDecision** — User's decision (approved/changes_requested) + feedback text. Pushed as channel event.
- **IterationState** — Construction progress tracked in `state/iteration.json`: current hat, iteration count, workflow, phase.
- **ProjectSettings** — Global config from `.ai-dlc/settings.yml`: workflow, quality gates, providers, stack, model profiles.
- **StaticDashboard** — Generated HTML artifact representing all intents as a browseable static site.

### Relationships
- Intent has many Units (1:N)
- Units form a DAG via `depends_on` references
- Intent has one DiscoveryLog (1:1)
- Units may have one Wireframe (1:0..1)
- ReviewSession targets one Intent or Unit
- StaticDashboard represents all Intents

### Data Sources
- **Filesystem (.ai-dlc/)** — Primary: intent.md, unit-*.md, discovery.md, mockups/, state/. Parsed via gray-matter.
- **Plugin definitions (plugin/)** — Hat definitions, workflow configs, schemas.
- **Git** — Branch state, commit history for intent/unit tracking.

### Data Gaps
- No structured API for .ai-dlc/ data — needs shared TypeScript parsing library
- No standardized review event schema — needs definition in technical spec
- No real-time file events — acceptable for agent-driven review model

## Key Findings

- **MCP Channel protocol** is well-suited for this use case. The `fakechat` plugin demonstrates the exact pattern: local HTTP server + WebSocket + channel events. Our server follows the same architecture but renders rich spec review pages instead of a chat UI.
- **Low-level Server class required** — The `McpServer` high-level class doesn't support `notification()` or `setNotificationHandler()`. Must use `Server` from `@modelcontextprotocol/sdk/server/index.js`.
- **Bun runtime recommended** — Matches official channel plugins. Built-in HTTP server, WebSocket, TypeScript without build step.
- **Plain HTML + Tailwind CDN + Mermaid CDN** is the right approach for both the review UI and static dashboard. No React/Next.js — too heavy for a local channel server.
- **gray-matter** already used by the website for frontmatter parsing — proven library, can be reused.
- **DAG visualization via Mermaid.js** client-side rendering is lightweight and doesn't need headless browser dependencies.
- **Existing website patterns** (workflow visualizer, big picture diagram, Mermaid component) provide design reference for styling and interaction patterns, though the review UI should be simpler (vanilla HTML, not React).
- **Two-audience design** needs tabbed views: "Overview" tab for product/business (Problem, Solution, Criteria) and "Technical" tab for engineers (Technical Spec, Domain Model, Data Sources, DAG).

## Open Questions

- Should the MCP server expose permission relay capability (`claude/channel/permission`) so review decisions can also approve/deny tool calls during construction?
- Should the static dashboard include the discovery log content, or only the spec artifacts (intent, units, DAG)?
- What port should the review server use by default? (fakechat uses 8787, webhook example uses 8788. Suggest 8789 for ai-dlc-review to avoid conflicts.)
- Should the CLI tool be `ai-dlc dashboard` (subcommand) or a standalone `ai-dlc-dashboard` binary?

## Mockups Generated

- UI Mockup: Review Page — Intent Overview (in discovery.md)
- UI Mockup: Review Page — Units & DAG Tab (in discovery.md)
- UI Mockup: Review Page — Unit Spec Detail (in discovery.md)
- UI Mockup: Static Dashboard — Intent List (in discovery.md)

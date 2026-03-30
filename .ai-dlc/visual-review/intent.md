---
workflow: default
git:
  change_strategy: intent
  auto_merge: true
  auto_squash: false
announcements: []
passes: []
active_pass: ""
iterates_on: ""
created: 2026-03-29
status: completed
epic: ""
---

# Visual Review & Intent Dashboard

## Problem

During AI-DLC elaboration and construction, all spec review happens in the terminal. Intent and unit frontmatter, domain models, success criteria, DAG visualizations, wireframes, and mockups are presented as raw markdown text. This creates two problems:

1. **Non-technical stakeholders can't meaningfully participate in spec review.** Product managers, designers, and business leads need a visual, intuitive interface to understand what's being built and approve scope — not a terminal full of YAML frontmatter.

2. **There's no persistent, browseable view of project intent status.** Once elaboration ends, the `.ai-dlc/` files are only readable by developers who know the directory structure. Teams lack a dashboard showing all intents, their progress, unit status, and dependency graphs.

## Solution

Build two complementary components under `plugin/`:

1. **MCP Channel Server** (`plugin/mcp-server/`) — A TypeScript MCP server using Claude Code Channels protocol. At each review boundary during elaboration, the agent calls an `open_review` tool that renders the spec as a rich HTML page and opens the browser. The reviewer sees formatted problem/solution statements, rendered success criteria checklists, interactive Mermaid.js DAG graphs, and embedded wireframes. They approve or request changes in the browser. The decision flows back via `notifications/claude/channel` event. The browser closes and the agent continues.

2. **Static Dashboard CLI** (`plugin/cli/`) — A TypeScript CLI tool that reads `.ai-dlc/` and generates a self-contained static HTML site. Intent cards with status badges, progress bars, unit tables, DAG visualizations, and full spec browsing. Deployable to GitHub Pages, Vercel, or any static host. Any team member can browse project status without needing Claude Code.

Both share a TypeScript parsing library (`plugin/shared/`) for reading intent.md, unit-*.md, discovery.md, computing DAGs, and extracting structured data from frontmatter and markdown bodies.

## Domain Model

### Entities
- **Intent** — Core spec artifact with YAML frontmatter (workflow, git config, status, passes, created, epic) and markdown body (Problem, Solution, Domain Model, Success Criteria, Context)
- **Unit** — Discrete work item with frontmatter (status, depends_on, discipline, branch, wireframe, deployment/monitoring/operations) and body (Description, Technical Spec, Criteria, Risks, Boundaries)
- **DependencyDAG** — Computed directed acyclic graph from unit `depends_on` fields. Nodes = units, edges = dependencies. Visualized via Mermaid.js.
- **DiscoveryLog** — Research findings from elaboration. Sectioned markdown with standardized headers.
- **Wireframe** — Self-contained HTML files in `mockups/` directory, referenced by unit `wireframe:` frontmatter field.
- **ReviewSession** — Live review on MCP channel server: intent/unit slug, review type, decision state.
- **ReviewDecision** — User's approve/changes_requested decision + feedback text, pushed as channel event.
- **IterationState** — Construction progress in `state/iteration.json`: current hat, iteration count, workflow, phase.
- **StaticDashboard** — Generated HTML artifact for browsing all intents.

### Relationships
- Intent has many Units (1:N, via unit-*.md files)
- Units form a DAG via `depends_on` references
- Intent has one DiscoveryLog (1:1, via discovery.md)
- Units may have one Wireframe (1:0..1, via wireframe: field)
- ReviewSession targets one Intent or Unit
- StaticDashboard represents all Intents

### Data Sources
- **Filesystem (.ai-dlc/)**: intent.md, unit-*.md, discovery.md, mockups/, state/. Parsed via gray-matter (YAML frontmatter) + marked (markdown body).
- **Plugin definitions (plugin/)**: Hat definitions (hats/*.md), workflow configs (workflows.yml), schemas (schemas/).
- **Git**: Branch state and worktree locations for intent/unit tracking.

### Data Gaps
- No structured API for .ai-dlc/ data — solved by shared TypeScript parsing library (unit-01)
- No standardized review event schema — defined in unit-02 technical spec

## Success Criteria
- [ ] MCP channel server declares `claude/channel` capability and connects to Claude Code via stdio
- [ ] MCP server exposes `open_review` tool that renders intent/unit specs as HTML and opens the browser
- [ ] Review page displays intent frontmatter metadata (status, workflow, strategy, dates) as visual badges
- [ ] Review page renders full intent body (Problem, Solution, Domain Model, Success Criteria) as formatted HTML
- [ ] Review page renders unit specs with tabbed views (Spec, Wireframe, Criteria, Risks)
- [ ] Review page renders unit dependency DAG as interactive Mermaid.js graph with status color-coding
- [ ] Review page provides Approve/Request Changes buttons that POST decisions back to the MCP server
- [ ] MCP server pushes review decisions as `notifications/claude/channel` events that Claude Code receives
- [ ] Review UI serves both audiences: Overview tab (product/business) and Technical Details tab (engineers)
- [ ] CLI tool reads `.ai-dlc/` directory and generates a static HTML site with intent list, intent details, unit details, and DAG visualizations
- [ ] Static site is self-contained (Tailwind CSS + Mermaid.js via CDN) and deployable to any static host
- [ ] Shared TypeScript library parses intent.md, unit-*.md, and discovery.md frontmatter and body sections correctly
- [ ] Review page loads in under 500ms on localhost
- [ ] Static site generates in under 5 seconds for a project with 20 intents
- [ ] Both review UI and static dashboard support light/dark themes via toggle with localStorage persistence
- [ ] All interactive elements are keyboard-navigable with visible focus indicators
- [ ] ARIA labels on all buttons, tabs, and status badges for screen reader support

## Context
- The MCP Channel protocol is a Claude Code research preview feature (v2.1.80+). Custom channels require `--dangerously-load-development-channels` during testing.
- The fakechat official plugin demonstrates the local web UI channel pattern (localhost HTTP + WebSocket + embedded HTML).
- Bun is the recommended runtime, matching all official channel plugins.
- Both the review UI and static dashboard use plain HTML + Tailwind CSS CDN + Mermaid.js CDN (no React/Next.js — too heavy for a local MCP server).
- gray-matter is already used by the existing website for frontmatter parsing.

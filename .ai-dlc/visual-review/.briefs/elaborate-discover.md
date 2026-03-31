---
intent_slug: visual-review
worktree_path: /Volumes/dev/src/github.com/thebushidocollective/ai-dlc/.ai-dlc/worktrees/visual-review
project_maturity: established
provider_config: {"spec":null,"ticketing":null,"design":null,"comms":null,"vcsHosting":"github","ciCd":"github-actions"}
---

# Intent Description

Build a visual review system for AI-DLC with two components:

1. **MCP Channel Server** — A TypeScript MCP server that serves a local web UI for reviewing AI-DLC specs (intents, units, domain models, DAGs, mockups). Uses Claude Code Channels protocol to push review decisions back into the running session. At each review boundary during elaboration, the agent opens the browser to the correct review page. The user approves/rejects in the browser, the decision flows back via MCP channel event, the browser window closes, and the agent continues.

2. **Static Site Generator CLI** — A TypeScript CLI tool (`ai-dlc dashboard`) that reads `.ai-dlc/` directory structure and generates a static site for browsing all intents, their status, unit specs, DAG visualizations, domain models, mockups, and success criteria. Per-project standalone, deployable to GitHub Pages, Vercel, etc.

Both components share rendering logic for frontmatter parsing, markdown rendering, DAG computation, and UI components.

**Target audience**: Both product/business stakeholders (non-technical, reviewing scope/criteria/UX) AND technical leads (reviewing technical spec, domain model, dependencies, architecture). The UI needs tabbed or layered views for both perspectives.

**Location**: Under `plugin/` directory (e.g., `plugin/mcp-server/`, `plugin/cli/`, `plugin/shared/`)

## Clarification Answers

**Q: MCP interaction model?**
A: Live review session. MCP server runs locally, serves web UI via HTTP. Agent opens browser at review boundaries. User reviews and decides. Decision flows back via Claude Code MCP channels.

**Q: Who are the primary reviewers?**
A: Both product/business stakeholders and technical leads equally. Needs tabbed/layered views.

**Q: Static site standalone or part of ai-dlc.dev?**
A: Per-project standalone. Each project generates its own static site from `.ai-dlc/`.

**Q: Technology?**
A: TypeScript. Matches website stack, rich MCP SDK support, npm distribution for CLI.

**Q: How do approvals flow back?**
A: Via Claude Code MCP channels (new feature). The MCP server declares `claude/channel` capability. When user approves/rejects in browser, the server pushes a `notifications/claude/channel` event back to Claude Code.

**Q: What views should the review interface present?**
A: Spec review (elaboration focus): Intent overview, unit specs, domain model, DAG visualization, success criteria, mockups/wireframes.

**Q: File-watching / live reload?**
A: Agent-driven flow. At each review boundary, the agent opens the browser to the correct page. When the user decides, the browser window closes. Repeats for each review boundary.

## Claude Code Channels Protocol (Key Technical Context)

A channel is an MCP server that:
- Declares `claude/channel` capability in `capabilities.experimental`
- Emits `notifications/claude/channel` events with `content` (string) and `meta` (Record<string, string>)
- Events arrive in Claude's context as `<channel source="name" attr="val">content</channel>`
- Can expose tools for two-way communication (e.g., `reply` tool)
- Runs as subprocess, communicates over stdio with Claude Code
- Can optionally declare `claude/channel/permission` for permission relay

The `fakechat` official plugin demonstrates a local web UI channel pattern — serves HTTP on localhost, browser sends messages, server pushes them as channel events.

For our use case:
1. Agent calls a tool on MCP server (e.g., `request_review`) with review data
2. MCP server renders review page, opens browser
3. User reviews and decides in browser
4. Browser POSTs decision to MCP server
5. MCP server pushes `<channel source="ai-dlc-review" decision="approved" unit="unit-01-foo">` event
6. Claude receives event and continues workflow

## Discovery File Path

/Volumes/dev/src/github.com/thebushidocollective/ai-dlc/.ai-dlc/worktrees/visual-review/.ai-dlc/visual-review/discovery.md

---
workflow: default
git:
  change_strategy: intent
  auto_merge: true
  auto_squash: false
announcements: []
passes: []
active_pass: ""
iterates_on: "visual-review"
created: 2026-03-30
status: active
epic: ""
---

# Visual Review Full Integration & Bug Fixes

## Problem

The Visual Review & Intent Dashboard (visual-review) shipped an MCP channel server with a review UI and static dashboard, but adoption is incomplete and the rendering has bugs:

1. **Review boundaries don't use the visual review channel.** Discovery confirmation, UI-related discussions, and other approval points still use the terminal-based `AskUserQuestion` tool. The visual review MCP was built to replace these interactions with a rich browser-based experience, but the elaboration and construction skills haven't been wired to use it at every review boundary.

2. **No general-purpose visual question tool.** The MCP server only exposes `open_review` for spec review. There's no `ask_user_visual_question` tool that can replace arbitrary `AskUserQuestion` calls with a rendered HTML page — meaning any review point that isn't a formal spec review still falls back to the terminal.

3. **Markdown rendering bugs.** The review UI has formatting issues where markdown content is not properly rendered — broken formatting, missing styling, or raw markdown appearing instead of formatted HTML.

4. **Mockups and designs not displayed.** Wireframe references and mockup images are not showing up in the review UI. Units with `wireframe:` frontmatter or mockup files in `mockups/` directories are not being resolved and embedded in the review page.

## Solution

Extend the visual-review MCP server and integrate it across all AI-DLC review boundaries:

1. **Add `ask_user_visual_question` MCP tool** — A general-purpose tool that renders any question/context as a rich HTML page with response options. This becomes the visual replacement for `AskUserQuestion` at all review boundaries, not just formal spec reviews.

2. **Wire all review boundaries** — Update elaboration skills (discovery confirmation, elaboration review, wireframe review) and construction skills (reviewer hat, integration) to use the visual review channel instead of `AskUserQuestion` for approval decisions.

3. **Fix markdown rendering** — Diagnose and fix the markdown-to-HTML conversion pipeline so all content (problem statements, technical specs, criteria lists, code blocks) renders correctly in the review UI.

4. **Fix mockup/wireframe display** — Ensure wireframe HTML files and mockup images referenced by units are properly resolved, embedded, or linked in the review page.

## Previous Intent Reference

This intent iterates on **Visual Review & Intent Dashboard** (`visual-review`).

### What was built previously
- **unit-01-shared-parser**: TypeScript parsing library for intent.md, unit-*.md, discovery.md (completed)
- **unit-02-mcp-channel-server**: MCP channel server with stdio transport and `open_review` tool (completed)
- **unit-03-review-ui**: Browser-based review UI with Tailwind CSS + Mermaid.js (completed)
- **unit-04-static-dashboard**: CLI tool generating static HTML site for intent browsing (completed)
- **unit-05-plugin-packaging**: Plugin packaging and `/dashboard` skill wiring (completed)

### What this iteration changes
- Adds a new `ask_user_visual_question` MCP tool for general-purpose visual questions
- Wires all AI-DLC review boundaries to use the visual channel instead of `AskUserQuestion`
- Fixes markdown rendering bugs in the review UI
- Fixes mockup/wireframe display issues so designs appear in review pages

## Success Criteria
- [ ] MCP server exposes `ask_user_visual_question` tool that renders arbitrary questions with context as HTML
- [ ] `ask_user_visual_question` supports options (single-select, multi-select) and free-text responses
- [ ] Discovery confirmation during elaboration uses visual review channel instead of `AskUserQuestion`
- [ ] Wireframe review during elaboration uses visual review channel
- [ ] Reviewer hat approval during construction uses visual review channel
- [ ] All markdown content in review UI renders correctly (headings, lists, code blocks, tables, bold/italic)
- [ ] Unit wireframe references resolve and display in the review UI (both HTML wireframes and image mockups)
- [ ] Mockup images from `mockups/` directories are embedded or linked in the review page
- [ ] Existing `open_review` tool continues to work unchanged
- [ ] Visual question responses flow back to the agent via channel events

## Context
- The visual-review intent is currently active with all 5 units completed — code is built but the intent branch hasn't been fully merged yet
- The MCP Channel protocol uses `notifications/claude/channel` events for bidirectional communication
- The review UI is plain HTML + Tailwind CSS CDN + Mermaid.js CDN (no framework)
- The shared parser library uses gray-matter for frontmatter and marked for markdown
- Bun is the runtime for the MCP server

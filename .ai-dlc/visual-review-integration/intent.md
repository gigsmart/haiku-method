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

1. **Markdown rendering is completely non-functional.** `renderMarkdownBlock()` stores raw markdown in a `data-markdown` HTML attribute for client-side rendering via marked.js CDN. Newlines get normalized in attributes, CDN scripts can fail silently, and large content may truncate. The result: raw markdown shows everywhere instead of formatted HTML.

2. **Wireframes never display.** Units lack the `wireframe:` frontmatter field (never populated during construction), the `mockups/` directory is empty when wireframe generation is skipped, and there is no fallback scan by filename convention. The wireframe tab exists in the UI but always says "No wireframe available."

3. **No general-purpose visual question tool.** The MCP server only exposes `open_review` for spec review. There is no tool that can replace `AskUserQuestion` with a rich browser-based experience for arbitrary review decisions.

4. **Elaboration review boundaries still use terminal.** Domain model confirmation, spec alignment, unit review, and wireframe review all fall back to `AskUserQuestion` in the terminal.

## Solution

Fix bugs and extend the visual-review MCP server for full elaboration review integration:

1. **Fix markdown rendering** — Switch from client-side marked.js CDN to server-side `markdownToHtml()` (already exists in `plugin/shared/src/markdown.ts`). Remove the fragile `data-markdown` attribute pattern. Apply the fix to both MCP server templates and static dashboard CLI templates.

2. **Fix wireframe display** — Add fallback wireframe resolution: scan `mockups/` directory by filename convention (e.g., `unit-01-*-wireframe.html`) when the `wireframe:` frontmatter field is empty. Also serve image files (.png, .jpg, .svg).

3. **Add `ask_user_visual_question` MCP tool** — A new tool alongside `open_review` that mirrors `AskUserQuestion`'s schema (questions array with options, multiSelect, header) rendered as rich HTML. Uses the same HTTP server, session store, and channel notification infrastructure.

4. **Wire 4 elaboration review boundaries** — Update the elaborate skill instructions so Domain Model validation, Spec Alignment Gate, Per-unit review, and Wireframe review use the visual question tool instead of `AskUserQuestion`.

## Domain Model

### Entities
- **VisualQuestion** — MCP tool input: questions array (options, multiSelect, header), optional context markdown
- **QuestionSession** — Session type: extends ReviewSession with question data and user's selected answers
- **ReviewSession** — Existing: intent_dir, intent_slug, review_type, target, status, decision, feedback, html
- **ChannelEvent** — Existing: `notifications/claude/channel` with content + meta

### Relationships
- VisualQuestion creates one QuestionSession (1:1)
- QuestionSession produces one ChannelEvent when user submits (1:1)
- Both QuestionSession and ReviewSession share HTTP server, session store, channel notifications

### Data Sources
- **MCP Server** (`plugin/mcp-server/`): Server class, tool handlers, session store (Map), HTTP server (Bun.serve on port 8789)
- **Templates** (`plugin/mcp-server/src/templates/`): HTML rendering functions as TypeScript string literals
- **Shared Parser** (`plugin/shared/src/markdown.ts`): `markdownToHtml()` using marked.parse()
- **Elaboration Skills** (`plugin/skills/elaborate/SKILL.md`): 4 review boundary AskUserQuestion call sites

### Data Gaps
- Channel event `meta` field needs a richer schema for question answers (selected options + free text per question)
- Skill files are static markdown — wiring requires modifying instruction text

## Success Criteria
- [ ] MCP server exposes `ask_user_visual_question` tool that accepts questions array (with options, multiSelect, header) and optional context markdown
- [ ] `ask_user_visual_question` renders a rich HTML page with radio buttons (single-select) or checkboxes (multi-select) for each question's options
- [ ] "Other" free-text option is always available for each question
- [ ] User's answers flow back to Claude Code via `notifications/claude/channel` event with structured response in meta
- [ ] All markdown content in review UI renders correctly — server-side via `markdownToHtml()` instead of client-side CDN
- [ ] Problem, Solution, Technical Spec, Domain Model sections render with proper headings, lists, code blocks, tables, bold/italic
- [ ] Unit wireframes resolve and display via mockups/ directory scan fallback when `wireframe:` frontmatter is empty
- [ ] Mockup images (.png, .jpg, .svg) in mockups/ directory are served and displayed alongside HTML wireframes
- [ ] Existing `open_review` tool continues to work unchanged
- [ ] Static dashboard CLI also uses server-side markdown rendering
- [ ] Visual question page loads in under 500ms on localhost
- [ ] All interactive elements (radio buttons, checkboxes, submit) are keyboard-navigable with ARIA labels

## Context
- This iterates on the visual-review intent (all 5 units completed, code on `ai-dlc/visual-review/main` branch)
- The MCP Channel protocol uses `notifications/claude/channel` events
- The review UI is plain HTML + Tailwind CSS CDN + Mermaid.js CDN
- The shared parser uses gray-matter for frontmatter and marked for markdown
- Bun is the runtime for the MCP server
- The `markdownToHtml()` function already exists and works — just needs to be called server-side in templates instead of relying on client-side CDN

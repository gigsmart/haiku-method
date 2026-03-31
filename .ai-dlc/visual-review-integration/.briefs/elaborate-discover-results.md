---
status: success
error_message: ""
---

# Discovery Results

## Domain Model Summary

### Entities

- **VisualQuestion** — New MCP tool input: questions array (mirroring AskUserQuestion schema), optional context markdown, session metadata
- **QuestionSession** — New session type: extends existing session model with question data and user's selected answers
- **ReviewSession** — Existing session: intent_dir, intent_slug, review_type, target, status, decision, feedback, pre-rendered HTML
- **ChannelEvent** — Existing notification: `notifications/claude/channel` with content string + meta object

### Relationships

- VisualQuestion creates one QuestionSession (1:1)
- QuestionSession produces one ChannelEvent when user submits (1:1)
- Both QuestionSession and ReviewSession share the HTTP server, session store, and channel notification infrastructure

### Data Sources

- **MCP Server** (`plugin/mcp-server/`): Server class, tool handlers, session store, HTTP server — all reusable for new tool
- **Templates** (`plugin/mcp-server/src/templates/`): HTML rendering functions — need new question form template
- **Shared Parser** (`plugin/shared/src/markdown.ts`): `markdownToHtml()` — should be used server-side to fix rendering bug
- **Elaboration Skills** (`plugin/skills/elaborate/SKILL.md`): 4 review boundary AskUserQuestion calls to rewire

### Data Gaps

- No schema for "question answer" channel events — needs to be designed (meta field must carry selected options + free text per question)
- Skill files are static markdown instructions — wiring requires text modification of skill SKILL.md files
- No fallback wireframe resolution when unit frontmatter lacks `wireframe:` field

## Key Findings

- **Markdown rendering bug root cause**: `renderMarkdownBlock()` stores raw markdown in a `data-markdown` HTML attribute for client-side rendering via marked.js CDN. This approach is fragile — newlines get normalized in attributes, CDN can fail, and large content may truncate. The shared parser already has `markdownToHtml()` that works server-side. Fix: render markdown to HTML server-side and inject directly.

- **Wireframe display bug root cause**: Units never have the `wireframe:` frontmatter field populated, and the mockups/ directory is empty when wireframe generation is skipped. The open_review tool only checks these two sources with no fallback. Fix: add filename-convention-based scanning of mockups/ directory as fallback.

- **MCP server architecture is reusable**: The existing server, HTTP server, session store, and channel notification pattern can all be reused for `ask_user_visual_question`. The new tool needs a new template (question form) and a richer channel event response format.

- **4 elaboration review boundaries identified**: Domain Model validation (Phase 2.5), Spec Alignment Gate (Phase 5.75), Per-unit review (Phase 6 Step D), and Wireframe review (Phase 6.25 Step 6). These are the integration points — the remaining ~13 AskUserQuestion calls are clarification/navigation questions that should stay as terminal.

- **Static dashboard CLI** (`plugin/cli/`) shares template patterns with the MCP server but has its own template files. Both need the markdown fix.

## Open Questions

- Should the `ask_user_visual_question` tool support passing additional rendered content (e.g., a full unit spec) alongside the question, or just the question with optional markdown context?
- Should the static dashboard CLI also get the markdown rendering fix, or is that a separate concern?
- When wiring elaboration review boundaries, should the skill text be modified to call the visual question tool directly, or should there be a conditional check (use visual if MCP server available, fall back to AskUserQuestion)?

## Mockups Generated

None — this intent has no new UI screens to mock up. It extends an existing UI (the review page) with a new page type (question form) and fixes rendering bugs in existing pages.

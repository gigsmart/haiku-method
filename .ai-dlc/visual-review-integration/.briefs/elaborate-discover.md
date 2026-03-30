---
intent_slug: visual-review-integration
worktree_path: /Volumes/dev/src/github.com/thebushidocollective/ai-dlc/.ai-dlc/worktrees/visual-review-integration
project_maturity: established
provider_config: {}
---

# Intent Description

Extend the visual-review MCP server and integrate it across all AI-DLC review boundaries. This is a follow-up to the `visual-review` intent which built the MCP channel server, review UI, static dashboard, and shared parser.

Four work areas:
1. Add `ask_user_visual_question` MCP tool — full replacement for `AskUserQuestion` (same schema: questions, options, multiSelect, header) rendered as rich HTML in the browser
2. Wire elaboration review boundaries to use the visual channel instead of `AskUserQuestion` (domain model confirmation, spec alignment gate, unit review, wireframe review)
3. Fix markdown rendering — appears to be completely non-functional (no markdown is being converted to HTML at all — raw markdown shows everywhere)
4. Fix mockup/wireframe display — wireframe tab never appeared during construction

## Clarification Answers

Q: Tool scope for ask_user_visual_question?
A: Full replacement — mirror AskUserQuestion's full schema (questions array, options, multiSelect, header) rendered as rich HTML.

Q: Which review boundaries to wire?
A: Elaboration reviews — domain model confirmation, spec alignment gate, unit review, wireframe review.

Q: Markdown rendering bugs?
A: Raw markdown showing everywhere. Code blocks broken. Lists/tables broken. It seems like there is no markdown renderer at all.

Q: Mockup/wireframe display issues?
A: Never saw any wireframe tab pop up during construction. Wireframes were never displayed.

## Previous Intent Context

This intent iterates on `visual-review`. The previous intent built:

- **Shared parser** (`plugin/shared/`): TypeScript library with parseIntent(), parseUnit(), parseAllUnits(), buildDAG(), toMermaidDefinition(), markdownToHtml(), extractSections(), parseCriteria()
- **MCP channel server** (`plugin/mcp-server/`): Server class with `open_review` tool, HTTP server on port 8789, review session management, channel event push
- **Review UI** (`plugin/mcp-server/src/templates/`): HTML templates for intent review (4 tabs), unit review (4 tabs), review decision form, dark mode, accessibility
- **Static dashboard** (`plugin/cli/`): CLI that reads .ai-dlc/ and generates static HTML site
- **Plugin packaging**: `.mcp.json`, `/dashboard` skill, workspace config

Key previous discovery findings:
- Bun runtime with low-level `Server` class (not `McpServer`)
- Channel events via `notifications/claude/channel`
- Templates are TypeScript string-literal functions returning full HTML docs
- gray-matter for frontmatter, marked for markdown-to-HTML
- Review data embedded in HTML as `<script>const reviewData = ...`

## Discovery Focus Areas

Since this is an iteration intent, discovery should focus on:

1. **Investigate markdown rendering failure**: Read the actual template code in `plugin/mcp-server/src/templates/` to understand why markdown is not being rendered. Check if `marked` is imported and used correctly. Check if markdown-to-HTML conversion is actually called in the template rendering pipeline.

2. **Investigate wireframe display**: Read the HTTP server routes and template code to understand why wireframes never appear. Check if the `/mockups/:path` route works, if wireframe paths are resolved correctly, and if the wireframe tab is conditionally shown.

3. **Map current `open_review` tool**: Understand the existing tool's implementation to determine where `ask_user_visual_question` should be added alongside it.

4. **Identify elaboration review boundaries**: Search the elaboration skills for all places that use `AskUserQuestion` for review/approval decisions. These are the integration points.

5. **Check the actual built code on the visual-review branch**: The visual-review intent is still active (not merged). The code lives on the `ai-dlc/visual-review/main` branch and its unit branches. The worktree is at `.ai-dlc/worktrees/visual-review/`.

## Discovery File Path

/Volumes/dev/src/github.com/thebushidocollective/ai-dlc/.ai-dlc/worktrees/visual-review-integration/.ai-dlc/visual-review-integration/discovery.md

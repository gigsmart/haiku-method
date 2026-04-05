---
intent: visual-review-integration
created: 2026-03-30
status: active
---

# Discovery Log: Visual Review Full Integration & Bug Fixes

Elaboration findings persisted during Phase 2.5 domain discovery.
Builders: read section headers for an overview, then dive into specific sections as needed.

## Codebase Pattern: Markdown Rendering Pipeline (BUG IDENTIFIED)

**The markdown rendering uses a client-side approach that appears to fail silently.**

### How it works

1. Server-side: `renderMarkdownBlock(id, markdown)` in `plugin/mcp-server/src/templates/components.ts:271-280` creates an **empty div** with markdown stored in a `data-markdown` attribute:

```typescript
export function renderMarkdownBlock(id: string, markdown: string): string {
  return `<div id="${escapeAttr(id)}"
    data-markdown="${escapeAttr(markdown)}"
    class="prose prose-sm dark:prose-invert max-w-none ...">
  </div>`;
}
```

2. Client-side: `layout.ts:136-146` loads marked.js from CDN and runs an IIFE:

```html
<script src="https://cdn.jsdelivr.net/npm/marked@15/marked.min.js"></script>
<script>
  (function() {
    document.querySelectorAll('[data-markdown]').forEach(function(el) {
      var md = el.getAttribute('data-markdown');
      if (md) { el.innerHTML = marked.parse(md); }
    });
  })();
</script>
```

### Root cause analysis

The `escapeAttr()` function (`layout.ts:159-161`) escapes `&`, `<`, `>`, `"`, `'` for the HTML attribute. When the browser parses the HTML, `getAttribute('data-markdown')` should unescape these back. However, several issues can cause failure:

1. **Newline handling in attributes**: Multi-line markdown stored in `data-markdown="..."` may get whitespace-normalized by the HTML parser, collapsing newlines that are critical for markdown rendering (headings, lists, code blocks all depend on newlines).

2. **Content truncation**: Large markdown content (full intent Problem/Solution sections with code blocks) stored as an escaped HTML attribute can be very large. Some browsers may have practical limits.

3. **CDN script failure**: If `https://cdn.jsdelivr.net/npm/marked@15/marked.min.js` fails to load (network, CDN downtime, CSP), the `marked.parse` call fails silently and all `data-markdown` divs remain empty.

4. **marked v15 API**: The CDN URL `marked@15` may not expose a global `marked` object as expected. The UMD build filename in marked v15 might differ.

### Recommended fix

**Server-side render markdown instead of client-side.** The shared parser already has `markdownToHtml()` in `plugin/shared/src/markdown.ts:7-9` which uses `marked.parse()` correctly. The templates should call `markdownToHtml(markdown)` and inject the resulting HTML directly, rather than storing raw markdown in a data attribute for fragile client-side rendering.

Change `renderMarkdownBlock` to:

```typescript
import { markdownToHtml } from "@ai-dlc/shared";

export function renderMarkdownBlock(id: string, markdown: string): string {
  const html = markdownToHtml(markdown);
  return `<div id="${escapeAttr(id)}" class="prose prose-sm dark:prose-invert max-w-none ...">${html}</div>`;
}
```

This eliminates the CDN dependency for markdown, the attribute encoding issues, and the timing/execution fragility.

## Codebase Pattern: Wireframe Display Pipeline (BUG IDENTIFIED)

**Wireframes never appear because the data flow has gaps.**

### How it works

1. `server.ts:139-168` scans for mockups:
   - **Intent mockups**: Reads `{intent_dir}/mockups/` directory for `.html` files
   - **Unit wireframes**: Reads `unit.frontmatter.wireframe` field for each unit

2. `unit-review.ts:71` checks `wireframeMockups.length > 0` to show/hide wireframe tab

3. `http.ts:89-118` serves mockup files from `{session.intent_dir}/mockups/`
4. `http.ts:120-148` serves wireframe files from `{session.intent_dir}/`

### Root cause analysis

1. **No `wireframe:` field set in unit frontmatter**: All 5 units in the visual-review intent have NO `wireframe:` field in their frontmatter. The field is optional (`wireframe?: string`) but never populated. The `unitMockups` Map is always empty.

2. **No mockup files in mockups/ directory**: The elaborate-wireframes skill generates wireframes as `.ai-dlc/{slug}/mockups/unit-NN-{name}-wireframe.html`, but if the wireframe generation phase was skipped, no files exist.

3. **Fallback missing**: The `open_review` tool has no fallback to scan `mockups/` by filename convention when the frontmatter field is empty.

### Recommended fix

1. Ensure the elaborate-wireframes skill sets the `wireframe:` frontmatter field on units after generating HTML files
2. Add a fallback in `open_review` to scan `mockups/` for unit-specific wireframes by naming convention (e.g., `unit-01-*-wireframe.html`) when the frontmatter field is empty
3. Better: also scan for image files (.png, .jpg, .svg) in mockups/ directory, not just HTML

## Codebase Pattern: MCP Server Architecture

### Server structure (`plugin/mcp-server/`)

- `server.ts` — MCP Server setup with `claude/channel` capability, two tools: `open_review`, `get_review_status`
- `http.ts` — Bun HTTP server (port 8789), routes: `GET /review/:id`, `POST /review/:id/decide`, `GET /mockups/:id/:path`, `GET /wireframe/:id/:path`
- `sessions.ts` — In-memory session store (Map), `ReviewSession` type: session_id, intent_dir, intent_slug, review_type, target, status, decision, feedback, html
- `templates/` — Server-side HTML generation as TypeScript string functions:
  - `layout.ts` — Full HTML shell with CDN scripts, dark mode, mermaid init
  - `components.ts` — Reusable UI: tabs, badges, criteria checklist, decision form, markdown blocks, mockup embeds
  - `intent-review.ts` — Intent review page (4 tabs: Overview, Units & DAG, Domain Model, Technical Details)
  - `unit-review.ts` — Unit review page (4 tabs: Spec, Wireframe, Criteria, Risks & Boundaries)
  - `styles.ts` — Tailwind config and status color mappings
  - `types.ts` — MockupInfo type
  - `index.ts` — Main entry rendering full review page

### Channel event flow

Browser POST `/review/:id/decide` → `http.ts:handleDecidePost()` → `mcp.notification({ method: "notifications/claude/channel", params: { content: feedback, meta: { decision, review_type, target, session_id } } })` → Claude Code receives channel event

### Where `ask_user_visual_question` fits

A new MCP tool alongside `open_review` using the same infrastructure:
- Same Server class, HTTP server, session store, channel notifications
- New template function for rendering question forms
- Richer channel event response (selected options + free text, not just approve/reject)

## Codebase Pattern: Elaboration Review Boundaries

17 `AskUserQuestion` occurrences in `elaborate/SKILL.md`. Categorized:

### Review Boundaries (candidates for visual review)

1. **Domain Model validation** (Phase 2.5) — "Does this domain model accurately capture the system?" Rich content with entities, relationships, data sources.

2. **Spec Alignment Gate** (Phase 5.75) — "Does this intent and unit breakdown generally align?" Full elaboration summary.

3. **Per-unit review** (Phase 6, Step D) — "Does this unit spec give a builder enough detail?" Full unit spec with technical details.

4. **Wireframe product review** (Phase 6.25, Step 6) — "I've generated low-fidelity wireframes... How do they look?" Visual artifacts.

### Clarification Questions (stay as terminal AskUserQuestion)

- Phase 0: Existing intent action
- Phase 1: Follow-up refinement
- Phase 2: Requirements exploration (2-4 questions at a time)
- Phase 3: Workflow selection
- Phase 4: Success criteria + NFR questions
- Phase 5.5: Cross-cutting concerns
- Phase 5.8: Git strategy (3 questions)
- Phase 5.9: Announcements
- Phase 5.95: Iteration passes

### Navigation/Flow (stay as terminal)

- Phase 7: Handoff decision

## Codebase Pattern: Shared Parser Types

Key types from `plugin/shared/src/types.ts`:

```typescript
interface Section {
  heading: string;
  level: 2 | 3;
  content: string;
  subsections: Section[];
}
```

Templates use `intent.sections.find(s => s.heading.toLowerCase() === name)` to locate sections by heading name.

## Architecture Decision: Question Form Design

For `ask_user_visual_question`, the HTML template renders:

1. **Context block** — Optional markdown rendered above the question (using server-side markdownToHtml after fix)
2. **Question form** — Per question: heading text, header chip, radio buttons (single-select) or checkboxes (multi-select), "Other" textarea
3. **Submit button** — POSTs answers to `/question/:sessionId/answer`
4. **Response flow** — Server pushes structured answers as channel event

Reuses: layout shell, card/sectionHeading components, HTTP server, session store, channel notification pattern.

## Domain Model

### Entities

- **VisualQuestion** — New: MCP tool input with questions array, optional context markdown, session metadata
- **QuestionSession** — New: extends session model with question data and selected answers
- **ReviewSession** — Existing: session with intent_dir, review_type, decision state, pre-rendered HTML
- **ChannelEvent** — Existing: `notifications/claude/channel` with content + meta fields

### Relationships

- VisualQuestion creates one QuestionSession (1:1)
- QuestionSession produces one ChannelEvent when user submits (1:1)
- Both QuestionSession and ReviewSession share HTTP server and session store

### Data Sources

- **MCP Server** (`plugin/mcp-server/`): Server class, tool handlers, session store, HTTP server
- **Templates** (`plugin/mcp-server/src/templates/`): HTML rendering functions
- **Shared Parser** (`plugin/shared/`): markdownToHtml(), types
- **Elaboration Skills** (`plugin/skills/elaborate/SKILL.md`): AskUserQuestion call sites

### Data Gaps

- Skill files are static markdown — wiring visual review requires modifying instruction text, not config
- Channel event `meta` field needs to carry richer response (selected options + free text per question)
- No schema for "question answer" channel events exists yet — needs to be designed

---
status: completed
hat: reviewer
last_updated: "2026-03-30T14:45:00Z"
depends_on: []
branch: ai-dlc/visual-review-integration/01-fix-rendering
discipline: backend
pass: ""
workflow: ""
ticket: ""
---

# unit-01-fix-rendering

## Description

Fix two rendering bugs in the existing visual review MCP server and static dashboard CLI: (1) markdown content is not rendered to HTML, and (2) wireframe/mockup files never display. Both bugs exist in the code built by the `visual-review` intent on the `ai-dlc/visual-review/main` branch.

This unit modifies existing code in `plugin/mcp-server/src/templates/` and `plugin/cli/src/templates/`. It does NOT add new features — only fixes broken rendering.

## Discipline

backend - Server-side template rendering fixes.

## Domain Entities

- **renderMarkdownBlock** — Template helper in `components.ts` that currently stores raw markdown in a `data-markdown` HTML attribute for fragile client-side rendering. Must be changed to render markdown server-side.
- **Wireframe resolution** — Logic in `server.ts` that scans for wireframes. Currently only checks `unit.frontmatter.wireframe` (never populated) and `mockups/` directory listing (often empty). Needs fallback by filename convention.

## Data Sources

- **Shared parser** (`plugin/shared/src/markdown.ts`): `markdownToHtml(md: string): string` — already exists and works. Uses `marked.parse(md, { async: false })`.
- **Template components** (`plugin/mcp-server/src/templates/components.ts`): `renderMarkdownBlock()` at line 271
- **Layout** (`plugin/mcp-server/src/templates/layout.ts`): marked.js CDN script at lines 136-146
- **Server** (`plugin/mcp-server/src/server.ts`): Wireframe scanning at lines 139-168
- **Static dashboard templates** (`plugin/cli/src/templates/`): Same markdown rendering pattern to fix

## Technical Specification

### Fix 1: Server-side markdown rendering

**In `plugin/mcp-server/src/templates/components.ts`:**

Change `renderMarkdownBlock` from storing raw markdown in `data-markdown` attribute to rendering HTML server-side:

```typescript
import { markdownToHtml } from "@ai-dlc/shared";

export function renderMarkdownBlock(id: string, markdown: string): string {
  const html = markdownToHtml(markdown);
  return `<div id="${escapeAttr(id)}"
    class="prose prose-sm dark:prose-invert max-w-none
           prose-code:bg-gray-100 prose-code:dark:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
           prose-pre:bg-gray-100 prose-pre:dark:bg-gray-800 prose-pre:rounded-lg
           prose-table:border-collapse prose-th:border prose-th:border-gray-300 prose-th:dark:border-gray-600 prose-th:px-3 prose-th:py-1.5
           prose-td:border prose-td:border-gray-300 prose-td:dark:border-gray-600 prose-td:px-3 prose-td:py-1.5">${html}</div>`;
}
```

**In `plugin/mcp-server/src/templates/layout.ts`:**

Remove the client-side marked.js CDN script and IIFE (lines 136-146):
```html
<!-- REMOVE these lines -->
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

The marked.js CDN is no longer needed since markdown is rendered server-side.

**In `plugin/cli/src/templates/`:**

Apply the same fix to the static dashboard templates. Find any `renderMarkdownBlock` equivalent and ensure it uses `markdownToHtml()` server-side.

### Fix 2: Wireframe fallback resolution

**In `plugin/mcp-server/src/server.ts`:**

After the existing unit wireframe frontmatter check (lines 157-168), add a fallback that scans the `mockups/` directory for unit-specific files by naming convention:

```typescript
// Existing: check frontmatter wireframe field
for (const unit of units) {
  const wireframe = unit.frontmatter.wireframe;
  if (wireframe && typeof wireframe === "string") {
    unitMockups.set(unit.slug, [
      { label: `Wireframe: ${wireframe}`, url: `/wireframe/${session.session_id}/${wireframe}` },
    ]);
  }
}

// NEW FALLBACK: scan mockups/ directory for unit-specific files by name convention
try {
  const mockupsDir = join(input.intent_dir, "mockups");
  const entries = await readdir(mockupsDir);
  for (const unit of units) {
    if (unitMockups.has(unit.slug)) continue; // already found via frontmatter
    const unitPrefix = unit.slug; // e.g., "unit-01-shared-parser"
    const matches = entries.filter(e =>
      e.startsWith(unitPrefix) &&
      (e.endsWith(".html") || e.endsWith(".htm") || e.endsWith(".png") || e.endsWith(".jpg") || e.endsWith(".svg"))
    );
    if (matches.length > 0) {
      unitMockups.set(unit.slug, matches.map(m => ({
        label: m.replace(/\.[^.]+$/, ""),
        url: `/mockups/${session.session_id}/${m}`,
      })));
    }
  }
} catch {
  // No mockups directory — that's fine
}
```

## Success Criteria

- [ ] `renderMarkdownBlock()` calls `markdownToHtml()` server-side and injects HTML directly (no `data-markdown` attribute)
- [ ] marked.js CDN script removed from `layout.ts`
- [ ] Problem, Solution, Technical Spec, Domain Model sections render with headings, lists, code blocks, tables, bold/italic
- [ ] Static dashboard CLI templates also render markdown server-side
- [ ] Wireframes resolve by mockups/ directory filename convention when `wireframe:` frontmatter is empty
- [ ] Image files (.png, .jpg, .svg) in mockups/ directory are served and displayed
- [ ] Existing `open_review` tool continues to work unchanged after fixes
- [ ] Review page loads in under 500ms on localhost

## Risks

- **marked version mismatch**: The shared parser uses `marked` as an ESM import. The CDN used `marked@15`. Ensure the server-side `markdownToHtml()` uses the same version. Mitigation: shared parser already has `marked` as a dependency — just import from there.
- **HTML injection via markdown**: Server-side markdown rendering could produce HTML that breaks the page layout. Mitigation: the `prose` Tailwind class already constrains styling; `marked` sanitizes by default in v15.
- **Mockup filename convention mismatch**: The fallback scan assumes files start with the unit slug. If wireframe files use a different naming convention, they won't be found. Mitigation: the elaborate-wireframes skill generates files as `unit-NN-{name}-wireframe.html` which matches.

## Boundaries

This unit does NOT handle:
- Adding the `ask_user_visual_question` MCP tool (unit-02)
- Modifying elaboration skill instructions (unit-03)
- Changing the review decision flow or channel events
- Adding new template pages or routes

## Notes

- The code to modify lives on the `ai-dlc/visual-review/main` branch in the worktree at `.ai-dlc/worktrees/visual-review/`. This unit's branch should be created from that branch (or from main after visual-review is merged).
- The `markdownToHtml()` function in `plugin/shared/src/markdown.ts` already works — it uses `marked.parse(md, { async: false })`. Just import and call it.
- Check `plugin/cli/src/templates/` for the same pattern — the static dashboard likely has similar markdown rendering code.
- The `@ai-dlc/shared` package is already a workspace dependency of both `@ai-dlc/mcp-server` and `@ai-dlc/cli`.

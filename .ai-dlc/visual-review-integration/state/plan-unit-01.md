# Plan: unit-01-fix-rendering

## Context

Two rendering bugs in the visual review system built by the `visual-review` intent (on `ai-dlc/visual-review/main` branch):

1. **Markdown not rendered to HTML** — MCP server templates store raw markdown in a `data-markdown` attribute and rely on client-side marked.js CDN to parse it. This breaks because HTML-escaping corrupts the markdown content in the attribute.
2. **Wireframe/mockup files never display** — Wireframes only load when `wireframe:` frontmatter is explicitly set. No fallback scans the `mockups/` directory by naming convention. Image files (`.png`, `.jpg`, `.svg`) are never collected.

The CLI static dashboard templates already use `markdownToHtml()` server-side for markdown — but they share the same wireframe/image gaps.

---

## Prerequisite Step: Merge visual-review code into this branch

The files to fix live on `ai-dlc/visual-review/main` but this branch was created from `main` (which doesn't have them). Before any fixes:

```sh
git merge ai-dlc/visual-review/main --no-edit
```

Resolve any conflicts if present. Verify `plugin/mcp-server/`, `plugin/cli/`, `plugin/shared/` directories exist after merge.

---

## Fix 1: Server-side markdown rendering

### Step 1.1 — Change `renderMarkdownBlock()` in MCP server

**File:** `plugin/mcp-server/src/templates/components.ts`

- Add import: `import { markdownToHtml } from "@ai-dlc/shared";`
- Change `renderMarkdownBlock()` from:
  ```ts
  export function renderMarkdownBlock(id: string, markdown: string): string {
    return `<div id="${escapeAttr(id)}"
      data-markdown="${escapeAttr(markdown)}"
      class="prose prose-sm dark:prose-invert max-w-none ...">
    </div>`;
  }
  ```
  To:
  ```ts
  export function renderMarkdownBlock(id: string, markdown: string): string {
    return `<div id="${escapeAttr(id)}"
      class="prose prose-sm dark:prose-invert max-w-none
             prose-code:bg-gray-100 prose-code:dark:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
             prose-pre:bg-gray-100 prose-pre:dark:bg-gray-800 prose-pre:rounded-lg
             prose-table:border-collapse prose-th:border prose-th:border-gray-300 prose-th:dark:border-gray-600 prose-th:px-3 prose-th:py-1.5
             prose-td:border prose-td:border-gray-300 prose-td:dark:border-gray-600 prose-td:px-3 prose-td:py-1.5">
      ${markdownToHtml(markdown)}
    </div>`;
  }
  ```

### Step 1.2 — Remove marked.js CDN from MCP layout

**File:** `plugin/mcp-server/src/templates/layout.ts`

Remove these two blocks (near end of the template string):
```html
<!-- Markdown rendering via marked.js -->
<script src="https://cdn.jsdelivr.net/npm/marked@15/marked.min.js"></script>
<script>
  (function() {
    document.querySelectorAll('[data-markdown]').forEach(function(el) {
      var md = el.getAttribute('data-markdown');
      if (md) {
        el.innerHTML = marked.parse(md);
      }
    });
  })();
</script>
```

### Step 1.3 — CLI templates: already fixed

The CLI templates (`plugin/cli/src/templates/intent-page.ts` and `unit-page.ts`) already call `markdownToHtml()` inline. The CLI layout has no marked.js script. **No changes needed.**

---

## Fix 2: Wireframe fallback resolution

### Step 2.1 — Add fallback wireframe scanning in MCP server

**File:** `plugin/mcp-server/src/server.ts`

After the existing wireframe frontmatter check loop (around line 157-168), add fallback logic for units without `wireframe:` frontmatter:

```ts
// Fallback: scan mockups/ for files matching unit slug by naming convention
if (!unitMockups.has(unit.slug)) {
  try {
    const mockupsDir = join(input.intent_dir, "mockups");
    const entries = await readdir(mockupsDir);
    const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif"];
    const HTML_EXTS = [".html", ".htm"];
    const ALL_EXTS = [...IMAGE_EXTS, ...HTML_EXTS];
    const matches = entries
      .filter((f) => {
        const name = f.substring(0, f.lastIndexOf("."));
        const ext = f.substring(f.lastIndexOf(".")).toLowerCase();
        return name === unit.slug && ALL_EXTS.includes(ext);
      })
      .sort();
    if (matches.length > 0) {
      unitMockups.set(
        unit.slug,
        matches.map((f) => ({
          label: `Wireframe: ${f}`,
          url: `/mockups/${session.session_id}/${f}`,
        })),
      );
    }
  } catch {
    // No mockups directory — skip
  }
}
```

### Step 2.2 — Handle image display in MCP templates

**File:** `plugin/mcp-server/src/templates/unit-review.ts`

In the wireframe tab rendering, detect image URLs and use `<img>` instead of `<iframe>`:

Replace the iframe-rendering block for wireframes with logic that checks the URL extension:
- If image extension (`.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`, `.gif`): render `<img>` tag
- If `.html`/`.htm`: render `<iframe>` as before

Similarly update `renderMockupEmbeds()` in `components.ts` to detect image URLs and use `<img>` tags.

### Step 2.3 — Add fallback wireframe scanning in CLI generator

**File:** `plugin/cli/src/generator.ts`

1. Expand `scanMockups()` to include image extensions:
   ```ts
   const MOCKUP_EXTS = [".html", ".htm", ".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif"];

   async function scanMockups(dir: string): Promise<string[]> {
     try {
       const entries = await readdir(dir);
       return entries.filter((f) => {
         const ext = f.substring(f.lastIndexOf(".")).toLowerCase();
         return MOCKUP_EXTS.includes(ext);
       }).sort();
     } catch {
       return [];
     }
   }
   ```

2. After the explicit `wireframe:` frontmatter check, add fallback slug-based scanning:
   ```ts
   // Fallback: scan intent-level mockups/ for unit-slug-named files
   if (unitMockups.length === 0) {
     const mockupsDir = join(intentDir, "mockups");
     try {
       const allFiles = await readdir(mockupsDir);
       const matches = allFiles.filter((f) => {
         const name = f.substring(0, f.lastIndexOf("."));
         return name === unit.slug && MOCKUP_EXTS.includes(f.substring(f.lastIndexOf(".")).toLowerCase());
       });
       for (const file of matches.sort()) {
         await copyFile(join(mockupsDir, file), join(unitsOutDir, "wireframes", file));
         unitMockups.push({ label: "Wireframe", src: `wireframes/${file}` });
       }
     } catch { /* no mockups dir */ }
   }
   ```

3. Update CLI `unit-page.ts` and `renderMockupEmbed()` in CLI `components.ts` to detect image extensions and render `<img>` instead of `<iframe>`.

---

## Verification Steps

1. **Build check:** Run `bun run build` (or `bun tsc --noEmit`) in `plugin/mcp-server` and `plugin/cli` to confirm no type errors
2. **Markdown rendering:** Visually confirm sections (Problem, Solution, Technical Spec, Domain Model) render headings, lists, code blocks, tables, bold/italic correctly in the generated HTML
3. **No marked.js:** Confirm no reference to `marked.min.js` or `data-markdown` in the built output
4. **Wireframe fallback:** Place a test image file named `{unit-slug}.png` in `mockups/` and confirm it appears in the wireframe tab
5. **Image display:** Confirm `.png`/`.jpg`/`.svg` files render as `<img>` tags, not inside iframes
6. **`open_review` tool:** Start the MCP server, call `open_review`, confirm the page loads
7. **Performance:** Confirm review page loads quickly (server-side rendering eliminates client-side CDN fetch)

---

## Files Modified (Summary)

| File | Change |
|------|--------|
| `plugin/mcp-server/src/templates/components.ts` | `renderMarkdownBlock()` → server-side `markdownToHtml()`, image-aware `renderMockupEmbeds()` |
| `plugin/mcp-server/src/templates/layout.ts` | Remove marked.js CDN script + IIFE |
| `plugin/mcp-server/src/server.ts` | Add fallback wireframe scanning by unit slug in `mockups/` |
| `plugin/mcp-server/src/templates/unit-review.ts` | Image-aware wireframe rendering (`<img>` vs `<iframe>`) |
| `plugin/cli/src/generator.ts` | Expand `scanMockups()` to images, add fallback slug-based wireframe scan |
| `plugin/cli/src/templates/components.ts` | Image-aware `renderMockupEmbed()` |
| `plugin/cli/src/templates/unit-page.ts` | Image-aware wireframe rendering |

## Files NOT Modified

| File | Reason |
|------|--------|
| `plugin/shared/src/markdown.ts` | `markdownToHtml()` already works correctly |
| `plugin/cli/src/templates/intent-page.ts` | Already uses `markdownToHtml()` server-side |
| `plugin/cli/src/templates/layout.ts` | No marked.js to remove (never had it) |
| `plugin/mcp-server/src/http.ts` | Already serves image MIME types correctly |

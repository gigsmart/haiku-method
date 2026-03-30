---
status: completed
last_updated: ""
depends_on:
  - unit-02-mcp-channel-server
branch: ai-dlc/visual-review/03-review-ui
discipline: frontend
pass: ""
workflow: ""
ticket: ""
---

# unit-03-review-ui

## Description

HTML/CSS/JS templates for the browser-based review pages served by the MCP channel server. Renders intent specs, unit specs, dependency DAGs, wireframe embeds, and success criteria as rich, accessible, visually intuitive pages for both product/business and technical reviewers. Uses Tailwind CSS via CDN, Mermaid.js for DAG visualization, and vanilla JavaScript for interactions. No framework — templates are string literals rendered server-side by the MCP server (unit-02).

## Discipline

frontend - HTML template design, CSS styling, client-side JavaScript interactions.

## Domain Entities

- **Intent Review Page** — Full intent spec rendered as HTML with tabbed sections
- **Unit Review Page** — Unit spec with tabbed views (Spec, Wireframe, Criteria, Risks)
- **DAG Visualization** — Mermaid.js graph rendered client-side from generated graph definition
- **Review Decision Form** — Approve/Request Changes buttons with optional feedback textarea

## Data Sources

- **Shared parser** (unit-01): `ParsedIntent`, `ParsedUnit`, `DAGGraph` types — data is already parsed by the MCP server and injected into templates as JSON
- **Mermaid.js CDN**: Client-side DAG rendering (`https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs`)
- **Tailwind CSS CDN**: Utility-first styling (`https://cdn.tailwindcss.com`)
- **marked CDN**: Client-side markdown rendering for body sections

## Technical Specification

### 1. Template System (`plugin/mcp-server/src/templates/`)

Templates are TypeScript functions that accept parsed data and return complete HTML strings. Each returns a full `<!DOCTYPE html>` document.

```typescript
// Main entry — routes to intent or unit review based on session
renderReviewPage(session: ReviewSession, data: ReviewData): string

// Intent review page
renderIntentReview(intent: ParsedIntent, units: ParsedUnit[], dag: DAGGraph, mermaidDef: string): string

// Unit review page
renderUnitReview(intent: ParsedIntent, unit: ParsedUnit, wireframePath?: string): string
```

### 2. Intent Review Page Layout

Four tabs accessible to both audiences:

**Tab 1: Overview** (default, product/business focused)
- Intent title as H1
- Status badges row: status (color-coded), workflow, git strategy, created date
- Problem section: rendered markdown
- Solution section: rendered markdown
- Success Criteria: rendered as interactive checklist (read-only, visual only)

**Tab 2: Units & DAG** (both audiences)
- Mermaid.js dependency graph with color-coded nodes:
  - `completed` = green (#22c55e)
  - `in_progress` = blue (#3b82f6)
  - `pending` = gray (#9ca3af)
  - `blocked` = red (#ef4444)
- Unit table below the graph: number, name, discipline, status badge, depends_on list
- Click unit row to navigate to unit detail page

**Tab 3: Domain Model** (technical focused)
- Entities, Relationships, Data Sources, Data Gaps sections from intent body
- Rendered as formatted markdown with code block highlighting

**Tab 4: Technical Details** (technical focused)
- Context section from intent body
- Git configuration details (change strategy, auto-merge, auto-squash)
- Workflow hat sequence visualization
- Announcement configuration

### 3. Unit Review Page Layout

Four tabs:

**Tab 1: Spec** (default)
- Breadcrumb: Intent Title > unit-NN-slug
- Status badges: status, discipline, depends_on
- Description section
- Technical Specification section (with syntax-highlighted code blocks)
- Domain Entities section

**Tab 2: Wireframe** (if wireframe exists)
- iframe embedding the HTML wireframe file from mockups/ directory
- Full-width, scrollable
- "Open in new tab" link

**Tab 3: Success Criteria**
- Criteria rendered as a numbered checklist with checkbox icons
- Each criterion in its own card

**Tab 4: Risks & Boundaries**
- Risks with severity indicators
- Boundaries as a clear "NOT in scope" list
- Notes section

### 4. Review Decision Component

Present at the bottom of every review page:

```html
<div class="review-actions">
  <button id="approve" class="btn-approve">✓ Approve</button>
  <button id="request-changes" class="btn-changes">✗ Request Changes</button>

  <div id="feedback-section" class="hidden">
    <textarea id="feedback" placeholder="Describe what needs to change..."></textarea>
  </div>

  <div id="confirmation" class="hidden">
    <p>Decision submitted. This window will close shortly.</p>
  </div>
</div>
```

JavaScript behavior:
- "Approve" → POST `{ decision: "approved" }` to `/review/:sessionId/decide`
- "Request Changes" → Show feedback textarea, require text, POST `{ decision: "changes_requested", feedback: "..." }`
- On successful POST → Show confirmation, auto-close window after 2 seconds via `window.close()` (may require user gesture in some browsers; show "You can close this tab" fallback)

### 5. Dark Mode

- Toggle button in header (sun/moon icon)
- Tailwind `dark:` variants for all color tokens
- Persist preference to `localStorage`
- Respect system preference via `prefers-color-scheme` media query on first load
- Apply by toggling `class="dark"` on `<html>` element

### 6. Accessibility

- All tabs use `role="tablist"`, `role="tab"`, `role="tabpanel"` with `aria-selected` and `aria-controls`
- Arrow key navigation between tabs
- Status badges have descriptive `aria-label` (e.g., "Status: pending")
- Approve/Request Changes buttons have clear `aria-label`
- Focus visible outlines on all interactive elements (`:focus-visible` ring)
- Skip-to-content link
- Semantic HTML: `<header>`, `<main>`, `<nav>`, `<article>`, `<section>`

### 7. Responsive Design

- Desktop (>1024px): Full-width with sidebar for unit list on intent page
- Tablet (768-1024px): Stack sidebar below main content
- Mobile (<768px): Single-column, tabs as horizontal scroll

### 8. Styling Tokens

Match the ai-dlc.dev website design language:
- Background: gray-50 (light), gray-950 (dark)
- Cards: white (light), gray-900 (dark) with subtle border
- Primary action: blue-600
- Approve: green-600
- Request Changes: amber-600
- Status colors: green (completed), blue (in_progress), gray (pending), red (blocked)
- Font: system-ui stack
- Code: monospace with gray-100/gray-800 backgrounds

## Success Criteria

- [ ] Intent review page renders all four tabs (Overview, Units & DAG, Domain Model, Technical Details)
- [ ] Unit review page renders all four tabs (Spec, Wireframe, Criteria, Risks & Boundaries)
- [ ] Mermaid.js DAG renders correctly with status-based color coding
- [ ] Success criteria display as a visual checklist with checked/unchecked icons
- [ ] Markdown content (Problem, Solution, Technical Spec) renders with proper formatting including code blocks, tables, and lists
- [ ] Approve and Request Changes buttons POST to the correct endpoint
- [ ] Request Changes requires feedback text before submitting
- [ ] Dark mode toggle works with localStorage persistence and system preference detection
- [ ] All tabs are keyboard-navigable with arrow keys and have proper ARIA attributes
- [ ] Pages are responsive across desktop, tablet, and mobile breakpoints
- [ ] Wireframe tab embeds the HTML wireframe via iframe when wireframe path exists
- [ ] Page loads in under 500ms on localhost

## Risks

- **Mermaid.js CDN availability**: If CDN is down, DAG won't render. Mitigation: show Mermaid source as fallback text.
- **Tailwind CDN performance**: CDN version is larger than production build. Mitigation: acceptable for local review tool; static dashboard can use a smaller build.
- **window.close() restrictions**: Browsers may not allow JS to close windows it didn't open. Mitigation: show "You can close this tab" message as fallback.

## Boundaries

This unit does NOT handle:
- MCP server setup or channel protocol (unit-02)
- Data parsing (unit-01)
- Static site generation (unit-04 adapts these templates for static output)
- Plugin packaging (unit-05)

## Notes

- Templates are TypeScript functions in `plugin/mcp-server/src/templates/`. They generate complete HTML documents as strings.
- Use Tailwind CDN via `<script src="https://cdn.tailwindcss.com">` — this includes the JIT compiler and works without a build step.
- Mermaid diagram definitions are generated by the shared parser's `toMermaidDefinition()` and embedded in a `<pre class="mermaid">` element.
- Markdown body content should be rendered client-side using marked.js CDN for consistency with how the website handles markdown.
- The review data (parsed intent/unit JSON) should be embedded in the HTML as a `<script>` tag: `<script>const reviewData = ${JSON.stringify(data)}</script>` — this avoids additional API calls.

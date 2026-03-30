---
status: completed
last_updated: ""
depends_on:
  - unit-01-shared-parser
  - unit-03-review-ui
branch: ai-dlc/visual-review/04-static-dashboard
discipline: backend
pass: ""
workflow: ""
ticket: ""
---

# unit-04-static-dashboard

## Description

CLI tool that reads `.ai-dlc/` directory structure and generates a self-contained static HTML site for browsing all intents, their units, dependency DAGs, success criteria, and domain models. Reuses the styling and layout patterns from unit-03's review templates adapted for static rendering. Output is deployable to any static host (GitHub Pages, Vercel, Netlify, etc.).

## Discipline

backend - CLI tool and static site generation logic.

## Domain Entities

- **StaticDashboard** — The generated output directory containing all HTML files
- **IntentIndex** — The dashboard landing page listing all intents with status, progress, and metadata
- **IntentDetail** — Per-intent page showing full spec, units, DAG, domain model
- **UnitDetail** — Per-unit page showing full spec, criteria, risks

## Data Sources

- **Shared parser** (unit-01): `listIntents()`, `parseIntent()`, `parseAllUnits()`, `parseDiscovery()`, `buildDAG()`, `toMermaidDefinition()`
- **Review UI templates** (unit-03): Styling patterns, color tokens, layout conventions (adapted, not directly imported — static pages don't need decision forms)
- **Filesystem**: `.ai-dlc/` directory, `mockups/` subdirectories

## Technical Specification

### 1. CLI Entry Point (`plugin/cli/src/dashboard.ts`)

```typescript
#!/usr/bin/env bun

// Usage: bun run plugin/cli/src/dashboard.ts [options]
// Options:
//   --input, -i   Path to .ai-dlc/ directory (default: .ai-dlc/)
//   --output, -o  Output directory (default: .ai-dlc/dashboard/)
//   --title, -t   Dashboard title (default: project directory name)

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputDir = args.input || ".ai-dlc";
  const outputDir = args.output || ".ai-dlc/dashboard";
  const title = args.title || path.basename(process.cwd());

  // 1. Discover and parse all intents
  const intents = await listIntents(inputDir);
  const parsed = await Promise.all(intents.map(parseIntentFull));

  // 2. Generate pages
  await generateIndex(parsed, outputDir, title);
  for (const intent of parsed) {
    await generateIntentPage(intent, outputDir);
    for (const unit of intent.units) {
      await generateUnitPage(intent, unit, outputDir);
    }
  }

  // 3. Copy mockup files
  await copyMockups(parsed, inputDir, outputDir);

  console.log(`Dashboard generated: ${outputDir}/`);
  console.log(`Open: file://${path.resolve(outputDir)}/index.html`);
}
```

### 2. Output Directory Structure

```
{outputDir}/
├── index.html                        # Intent list / dashboard landing page
├── intents/
│   ├── {slug}/
│   │   ├── index.html                # Intent detail + DAG + units table
│   │   ├── units/
│   │   │   ├── {unit-slug}.html      # Unit detail page
│   │   │   └── ...
│   │   └── mockups/                  # Copied wireframe HTML files
│   │       └── ...
│   └── ...
└── styles.css                        # Shared inline styles (or embedded in each page)
```

### 3. Index Page (Intent List)

Renders all intents as cards with:
- Intent title and slug
- Status badge (color-coded: active=blue, completed=green, blocked=red)
- Workflow name badge
- Unit count and completion progress (N/M completed)
- Progress bar visualization
- Created date
- Git strategy badge
- Click → navigate to intent detail page

Filter controls:
- Status filter: All | Active | Completed | Blocked
- Sort: by created date (newest first) or by name

Footer: Generated timestamp, AI-DLC version (if detectable from plugin.json).

### 4. Intent Detail Page

Same layout as review UI intent page (unit-03) but WITHOUT the review decision form. Sections:

**Tab 1: Overview** — Problem, Solution, Success Criteria
**Tab 2: Units & DAG** — Mermaid graph + unit table with links to unit detail pages
**Tab 3: Domain Model** — Entities, Relationships, Data Sources, Data Gaps
**Tab 4: Technical Details** — Context, Git config, workflow, announcements

Navigation: breadcrumb back to index.

### 5. Unit Detail Page

Same layout as review UI unit page (unit-03) but WITHOUT the review decision form. Sections:

**Tab 1: Spec** — Description, Technical Specification, Domain Entities
**Tab 2: Wireframe** — iframe embed (if wireframe file exists in mockups/)
**Tab 3: Success Criteria** — Checklist visualization
**Tab 4: Risks & Boundaries** — Risks, Boundaries, Notes

Navigation: breadcrumb back to intent detail.

### 6. Template Functions (`plugin/cli/src/templates/`)

Static page templates adapted from review UI patterns:

```typescript
// Dashboard index
renderDashboardIndex(intents: DashboardIntent[], title: string): string

// Intent detail (no review form)
renderStaticIntentPage(intent: ParsedIntent, units: ParsedUnit[], dag: DAGGraph, mermaidDef: string): string

// Unit detail (no review form)
renderStaticUnitPage(intent: ParsedIntent, unit: ParsedUnit, wireframePath?: string): string
```

Each function returns a complete `<!DOCTYPE html>` document with:
- Tailwind CSS via CDN `<script>` tag
- Mermaid.js via CDN `<script type="module">`
- Dark mode toggle with localStorage persistence
- Responsive design (same breakpoints as review UI)
- Data embedded directly in HTML (no API calls)

### 7. Self-Contained Pages

Each generated HTML file must be fully self-contained:
- All CSS via Tailwind CDN (no external stylesheet dependencies)
- Mermaid via CDN
- Navigation between pages uses relative links
- Mockup wireframes are copied to the output directory
- No server required to view — `file://` protocol works

### 8. Package Setup (`plugin/cli/package.json`)

```json
{
  "name": "@ai-dlc/cli",
  "version": "0.1.0",
  "type": "module",
  "bin": { "ai-dlc-dashboard": "src/dashboard.ts" },
  "dependencies": {
    "@ai-dlc/shared": "workspace:*"
  }
}
```

## Success Criteria

- [ ] CLI reads `.ai-dlc/` directory and discovers all intents
- [ ] Generated index.html lists all intents with status badges, progress bars, and metadata
- [ ] Generated intent detail pages render Problem, Solution, Success Criteria, DAG, and unit table
- [ ] Generated unit detail pages render Description, Technical Spec, Criteria, Risks, and embedded wireframes
- [ ] Mermaid DAG renders correctly in generated pages with status color-coding
- [ ] Status filter (All/Active/Completed/Blocked) works on index page via JavaScript
- [ ] All pages support dark mode with toggle and localStorage persistence
- [ ] All pages are keyboard-navigable with proper ARIA attributes
- [ ] Generated pages work with `file://` protocol (no server needed)
- [ ] Mockup HTML files from `mockups/` directories are copied to output and linked correctly
- [ ] Static site generates in under 5 seconds for a project with 20 intents
- [ ] CLI accepts `--input`, `--output`, and `--title` flags

## Risks

- **Template duplication with unit-03**: Review UI and static dashboard share styling/layout patterns. Mitigation: extract shared CSS tokens and layout HTML snippets into shared template helpers in `plugin/shared/src/templates/`. Unit-03 templates include review decision forms; unit-04 templates omit them.
- **Tailwind CDN in file:// context**: CDN script may not load from `file://` in some browsers. Mitigation: inline critical CSS or provide an option to bundle Tailwind output.

## Boundaries

This unit does NOT handle:
- MCP server or channel protocol (unit-02)
- Live review decision flow (unit-03)
- Plugin packaging (unit-05)
- Deployment to hosting providers (user's responsibility)

## Notes

- Consider extracting shared template helpers between unit-03 and unit-04 into `plugin/shared/src/templates/` during implementation. The builder should assess whether this reduces duplication without overcomplicating the architecture.
- The CLI should work standalone (no MCP server required). It only reads `.ai-dlc/` files and writes HTML.
- Progress bar calculations: `completedUnits.length / totalUnits.length * 100`.
- Relative links between pages: `../index.html` from intent pages, `../../index.html` from unit pages.

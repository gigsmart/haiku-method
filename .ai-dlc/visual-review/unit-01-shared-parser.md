---
status: completed
last_updated: ""
depends_on: []
branch: ai-dlc/visual-review/01-shared-parser
discipline: backend
pass: ""
workflow: ""
ticket: ""
---

# unit-01-shared-parser

## Description

TypeScript library for reading and parsing `.ai-dlc/` directory structures. Provides typed functions for loading intent.md, unit-*.md, and discovery.md files (frontmatter + body sections), computing the unit dependency DAG, and extracting structured data. This is the foundation — both the MCP channel server and the static dashboard CLI depend on it.

## Discipline

backend - Pure data parsing library with no UI concerns.

## Domain Entities

- **Intent** — Parsed from `intent.md`: typed frontmatter object + parsed body sections (Problem, Solution, Domain Model, Success Criteria, Context)
- **Unit** — Parsed from `unit-*.md`: typed frontmatter object + parsed body sections (Description, Technical Spec, Criteria, Risks, Boundaries, Notes)
- **DiscoveryLog** — Parsed from `discovery.md`: frontmatter + sectioned body
- **DependencyDAG** — Computed from unit `depends_on` fields. Adjacency list representation with topological sort and status-aware blocking detection.

## Data Sources

- **Filesystem**: `.ai-dlc/{slug}/intent.md`, `.ai-dlc/{slug}/unit-*.md`, `.ai-dlc/{slug}/discovery.md`, `.ai-dlc/{slug}/mockups/`, `.ai-dlc/{slug}/state/iteration.json`
- **gray-matter**: YAML frontmatter extraction from markdown files
- **marked**: Markdown body to HTML conversion

## Technical Specification

### 1. Module: `plugin/shared/src/parser.ts`

Core parsing functions:

```typescript
// Read and parse an intent file
parseIntent(intentDir: string): Promise<ParsedIntent>

// Read and parse a single unit file
parseUnit(filePath: string): Promise<ParsedUnit>

// Read all units in an intent directory
parseAllUnits(intentDir: string): Promise<ParsedUnit[]>

// Read and parse discovery log
parseDiscovery(intentDir: string): Promise<ParsedDiscovery | null>

// List all intent directories
listIntents(aiDlcDir: string): Promise<string[]>
```

### 2. Module: `plugin/shared/src/dag.ts`

DAG computation:

```typescript
// Build adjacency list from unit depends_on fields
buildDAG(units: ParsedUnit[]): DAGGraph

// Topological sort of units
topologicalSort(dag: DAGGraph): string[]

// Determine which units are ready (all deps completed)
getReadyUnits(dag: DAGGraph, units: ParsedUnit[]): string[]

// Generate Mermaid.js graph definition string
toMermaidDefinition(dag: DAGGraph, units: ParsedUnit[]): string
```

### 3. Module: `plugin/shared/src/types.ts`

TypeScript type definitions:

```typescript
interface IntentFrontmatter {
  workflow: string;
  git: { change_strategy: string; auto_merge: boolean; auto_squash: boolean };
  announcements: string[];
  passes: string[];
  active_pass: string;
  iterates_on: string;
  created: string;
  status: string;
  epic: string;
}

interface UnitFrontmatter {
  status: string;
  last_updated: string;
  depends_on: string[];
  branch: string;
  discipline: string;
  pass: string;
  workflow: string;
  ticket: string;
  wireframe?: string;
  design_ref?: string;
}

interface ParsedIntent {
  slug: string;
  frontmatter: IntentFrontmatter;
  title: string;
  sections: Record<string, string>;  // "Problem" -> markdown content
  rawContent: string;
}

interface ParsedUnit {
  slug: string;
  number: number;
  frontmatter: UnitFrontmatter;
  title: string;
  sections: Record<string, string>;
  rawContent: string;
}

interface DAGGraph {
  nodes: string[];       // unit slugs
  edges: [string, string][];  // [from, to] directed edges
  adjacency: Record<string, string[]>;  // slug -> depends_on slugs
}
```

### 4. Module: `plugin/shared/src/markdown.ts`

Markdown utilities:

```typescript
// Convert markdown string to HTML
markdownToHtml(md: string): string

// Extract H2 sections from markdown body
extractSections(body: string): Record<string, string>

// Parse success criteria checkboxes
parseCriteria(criteriaMarkdown: string): { text: string; checked: boolean }[]
```

### 5. Package setup: `plugin/shared/package.json`

```json
{
  "name": "@ai-dlc/shared",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "dependencies": {
    "gray-matter": "^4.0.3",
    "marked": "^15.0.0"
  }
}
```

Consumed by the MCP server and CLI via relative imports (monorepo workspace) or direct path imports.

## Success Criteria

- [ ] `parseIntent()` correctly extracts all frontmatter fields from real intent.md files in the repo
- [ ] `parseUnit()` correctly extracts all frontmatter fields including optional ones (wireframe, design_ref, deployment, monitoring, operations)
- [ ] `parseAllUnits()` returns units sorted by number (01, 02, 03...)
- [ ] `extractSections()` correctly splits markdown body into named sections (Problem, Solution, Domain Model, etc.)
- [ ] `parseCriteria()` correctly identifies checked (`[x]`) and unchecked (`[ ]`) criteria items
- [ ] `buildDAG()` produces correct adjacency list from unit depends_on fields
- [ ] `toMermaidDefinition()` generates valid Mermaid graph TD syntax with status-based CSS classes
- [ ] `listIntents()` discovers all intent directories, excluding `worktrees/` and `settings.yml`
- [ ] All functions handle missing or malformed files gracefully (return null or empty, no throws)

## Risks

- **gray-matter version compatibility**: The website uses gray-matter ^4.0.3. Same version should be used to avoid parsing differences. Mitigation: pin to same version.
- **Markdown section parsing fragility**: Splitting by `## ` headers may miss nested headers or unusual formatting. Mitigation: only split on top-level H2 headers, treat everything between them as section content.

## Boundaries

This unit does NOT handle:
- HTML rendering of review pages (unit-03)
- MCP server setup or channel protocol (unit-02)
- Static site generation or CLI commands (unit-04)
- Any network or HTTP concerns

## Notes

- The parser should work with both Bun and Node.js runtimes (no Bun-specific APIs).
- Test against real `.ai-dlc/` directories in the repo (operations-phase, design-backpressure, methodology-evolution, remove-hankeep-improve-state).
- The `extractSections()` function should handle both `## Section Name` and `### Subsection` patterns — subsections belong to their parent H2 section.

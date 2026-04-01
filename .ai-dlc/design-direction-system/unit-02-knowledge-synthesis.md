---
status: completed
last_updated: "2026-04-01T13:11:26Z"
depends_on: [unit-01-knowledge-infrastructure]
branch: ai-dlc/design-direction-system/02-knowledge-synthesis
discipline: backend
pass: ""
workflow: ""
ticket: ""
design_ref: ""
views: []
hat: ""
---

# unit-02-knowledge-synthesis

## Description
Create a knowledge synthesis subagent skill that scans a codebase and populates `.ai-dlc/knowledge/` artifacts. This skill runs during the first elaboration (or on demand) and reverse-engineers existing patterns into structured knowledge. For greenfield projects, it generates minimal scaffold artifacts. For brownfield projects, it performs deep analysis to extract design patterns, architecture conventions, product context, domain models, and coding conventions.

## Discipline
backend - This unit will be executed by backend-focused agents.

## Domain Entities
- **KnowledgeArtifact**: The output files in `.ai-dlc/knowledge/` (design, architecture, product, conventions, domain)
- **ProjectMaturity**: greenfield / early / established — determines synthesis depth

## Data Sources
- **Codebase files**: CSS/SCSS/Tailwind configs, component files, package.json, tsconfig.json, directory structure, README, test files, CI configs
- **`plugin/lib/config.sh`**: `detect_project_maturity()` function for maturity gating
- **`plugin/lib/knowledge.sh`**: Knowledge write API (from unit-01)
- **Existing discovery patterns**: The `elaborate-discover` skill pattern for brief-based subagent delegation

## Technical Specification

### Skill File: `plugin/skills/elaborate/subskills/knowledge-synthesize/SKILL.md`

A fork-context skill (not user-invocable). Invoked via `Agent()` subagent delegation from the elaborate skill (Phase 2.3). The calling skill passes a brief file path and the subagent reads the skill definition at `plugin/skills/elaborate/subskills/knowledge-synthesize/SKILL.md` before executing — following the same pattern as `elaborate-discover` and `elaborate-wireframes`.

**Frontmatter:**
```yaml
---
description: Synthesize project knowledge artifacts from codebase analysis
context: fork
agent: general-purpose
user-invocable: false
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
  - Write
---
```

### Input: Brief File

The calling skill writes a brief to `.ai-dlc/{intent-slug}/.briefs/knowledge-synthesize.md`:

```yaml
---
intent_slug: {slug}
worktree_path: {absolute path}
project_maturity: {greenfield|early|established}
existing_knowledge: [list of already-existing artifact types]
---
```

Body contains any additional context from the calling skill (intent description, domain model from discovery, etc.).

### Synthesis Process

The subagent performs 5 analysis passes, one per knowledge artifact type. Each pass:

1. **Scans** relevant files in the codebase
2. **Extracts** patterns and conventions
3. **Structures** findings into the knowledge artifact template
4. **Writes** the artifact via the knowledge library

#### Maturity-Based Synthesis Depth

The `project_maturity` field from the brief gates synthesis depth:

| Maturity | Synthesis Behavior |
|----------|-------------------|
| **greenfield** | Skip subagent entirely — the elaborate skill writes inline scaffold artifacts with empty sections. The design direction picker (Phase 2.75) will seed `design.md`. |
| **early** | Run synthesis but with shallow scanning — sample fewer files, set `confidence: low` on most findings. Treat "early" like greenfield for the design direction picker (the design direction is likely not established yet). |
| **established** | Full deep synthesis — scan comprehensively, produce high-confidence artifacts. Skip the design direction picker (existing design patterns are the source of truth). |

#### Pass 1: Design Knowledge (`design.md`)

**What to scan:**
- CSS/SCSS files — extract color values, spacing patterns, border-radius values, shadow definitions
- Tailwind config (`tailwind.config.js/ts`) — extract custom theme tokens
- CSS custom properties (`:root { --var: value }`) — extract design tokens
- Component library configs (Storybook, component index files)
- Package.json — detect UI frameworks (React, Vue, Svelte), component libraries (Radix, shadcn, Chakra, MUI)
- Image/icon directories — note icon system in use

**What to extract:**
- Color palette (group by semantic role: primary, secondary, accent, neutral, status)
- Spacing scale (detect if 4px, 8px, or custom base)
- Typography scale (font families, sizes, weights in use)
- Border radius values (detect shape language: rounded, sharp, mixed)
- Component patterns (cards, buttons, forms, navigation — what's already built)
- Layout patterns (grid system, flex patterns, responsive breakpoints)

**Greenfield behavior:** Write a scaffold `design.md` with empty sections and a note: "No design patterns detected — this project is greenfield. Design knowledge will be populated when a design direction is chosen."

#### Pass 2: Architecture Knowledge (`architecture.md`)

**What to scan:**
- Directory structure (top-level organization, naming patterns)
- Package.json / requirements.txt / go.mod / Cargo.toml — tech stack
- tsconfig.json / webpack.config / vite.config — build configuration
- `src/` or equivalent — module boundaries
- API route files — endpoint patterns
- Database schemas / migrations
- CI/CD configs (.github/workflows, .gitlab-ci.yml, Jenkinsfile)
- Dockerfile / docker-compose.yml — infrastructure

**What to extract:**
- Language and runtime versions
- Framework and key library choices
- Module organization pattern (monolith, monorepo, microservices, layered)
- Data flow patterns (REST, GraphQL, RPC, event-driven)
- State management approach
- Build and deployment pipeline

**Greenfield behavior:** Detect the initial tech stack from package.json/configs and write a minimal `architecture.md` noting the chosen stack.

#### Pass 3: Product Knowledge (`product.md`)

**What to scan:**
- README.md — project description, user-facing docs
- CONTRIBUTING.md — project values
- Existing `.ai-dlc/` intents — past feature descriptions
- Package.json description field
- App-level components — infer user-facing features from route/page structure
- Landing page content — product positioning

**What to extract:**
- Product description and purpose
- Target users (inferred from features, docs, or stated explicitly)
- Core features and their rationale
- Product principles (inferred from patterns — e.g., if the app has extensive keyboard shortcuts, "power users are a priority")

**Greenfield behavior:** Write a scaffold `product.md` with the project description from README/package.json and empty sections for personas and principles.

#### Pass 4: Conventions Knowledge (`conventions.md`)

**What to scan:**
- Linter configs (.eslintrc, .prettierrc, .stylelintrc, pylintrc, .golangci.yml)
- Editor configs (.editorconfig)
- Test files — testing framework, naming patterns, directory organization
- CI pipeline — what checks run on PRs
- Code review config (CODEOWNERS, PR templates)
- Git hooks (.husky, .git/hooks)
- Existing code — naming patterns (camelCase, snake_case), import ordering, module export patterns

**What to extract:**
- Code style conventions (formatting, naming, file organization)
- Testing philosophy (unit vs integration vs e2e ratio, coverage expectations)
- Error handling patterns (try/catch conventions, error types, logging)
- PR/review process (from templates and CI config)
- Commit message conventions (conventional commits, etc.)

**Greenfield behavior:** Detect any initial linter/formatter configs and document them. Scaffold empty sections for patterns not yet established.

#### Pass 5: Domain Knowledge (`domain.md`)

**What to scan:**
- Data models (database schemas, TypeScript interfaces/types, GraphQL schemas, API response shapes)
- Route/endpoint names — domain vocabulary
- Variable and function names — domain terms
- README and docs — business context
- Enum definitions — business states and categories
- Existing `.ai-dlc/` discovery logs — prior domain analysis

**What to extract:**
- Key domain terms and definitions (glossary)
- Entity model (core objects, their fields, relationships)
- Entity lifecycle (states, transitions)
- External integrations (APIs, services referenced in code)
- Business constraints (validation rules, invariants)

**Greenfield behavior:** Write a minimal `domain.md` from whatever context is available (README, initial data models if any).

### Output: Results Brief

Write to `.ai-dlc/{intent-slug}/.briefs/knowledge-synthesize-results.md`:

```yaml
---
status: success  # or error
error_message: ""
artifacts_created: [design, architecture, conventions]  # which artifacts were written
artifacts_skipped: [product, domain]  # which had insufficient data
confidence_scores:
  design: high
  architecture: high
  conventions: medium
  product: low
  domain: low
---
```

Body contains a summary of key findings per artifact.

### Commit

```bash
git add .ai-dlc/knowledge/
git commit -m "knowledge: synthesize project knowledge artifacts"
```

## Success Criteria
- [ ] `plugin/skills/elaborate/subskills/knowledge-synthesize/SKILL.md` exists with fork-context skill definition
- [ ] Design synthesis correctly detects CSS/Tailwind tokens, component libraries, and layout patterns from established codebases
- [ ] Architecture synthesis correctly identifies tech stack, module boundaries, and infrastructure from project config files
- [ ] Product synthesis extracts project description and infers product purpose from README and app structure
- [ ] Conventions synthesis detects linter configs, testing patterns, and PR process from tooling configuration
- [ ] Domain synthesis extracts entity models, glossary terms, and business rules from code and schemas
- [ ] Greenfield projects get scaffold artifacts with empty sections and appropriate notes
- [ ] Brownfield projects get populated artifacts with confidence scores reflecting extraction quality
- [ ] Results brief reports which artifacts were created, skipped, and their confidence levels
- [ ] All written artifacts conform to the knowledge artifact schema from unit-01

## Risks
- **Shallow extraction**: Automated scanning may miss nuanced conventions that are only visible in code review culture, not config files. Mitigation: Set `confidence: medium` or `confidence: low` for inferred patterns and note uncertainty explicitly in the artifact.
- **False patterns**: Small codebases may produce misleading generalizations from limited samples. Mitigation: Gate synthesis depth on `project_maturity` — greenfield gets scaffolds, not confident assertions.
- **Large codebases**: Scanning every file in a large monorepo could be slow. Mitigation: Use `Glob` and `Grep` with targeted patterns rather than reading every file. Sample representative files rather than exhaustive scanning.

## Boundaries
This unit does NOT handle:
- The knowledge directory API (that's unit-01)
- The design direction picker (that's unit-03)
- Design archetype definitions (that's unit-04)
- Integrating synthesis into the elaboration flow (that's unit-05)
- Teaching hats to read knowledge (that's unit-06)

This unit ONLY provides the synthesis skill that populates knowledge artifacts from codebase analysis.

## Notes
- Follow the `elaborate-discover` skill pattern: brief file in, results file out, work in the worktree
- The subagent should be thorough but not exhaustive — sample 5-10 representative files per pattern rather than reading every file
- Confidence scoring is critical — downstream consumers (hats, elaboration) need to know how much to trust each artifact
- The skill should be idempotent — running it twice produces the same result (overwrite, don't append)

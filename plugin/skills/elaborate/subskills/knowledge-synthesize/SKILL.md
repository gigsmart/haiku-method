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

# Knowledge Synthesize

Autonomous knowledge synthesis for AI-DLC. This skill runs as a forked subagent — it reads a brief file from disk, scans the codebase, and writes structured knowledge artifacts to `.ai-dlc/knowledge/`.

**You have NO access to `AskUserQuestion`.** All work is fully autonomous. Write artifacts to disk — the calling skill will handle user interaction.

---

## Step 1: Read Brief

Read the brief file passed as the first argument. The brief is at the path provided (e.g., `.ai-dlc/{intent-slug}/.briefs/knowledge-synthesize.md`).

Parse YAML frontmatter:

```yaml
intent_slug: my-feature
worktree_path: /path/to/.ai-dlc/worktrees/my-feature
project_maturity: established  # greenfield | early | established
existing_knowledge: [design, architecture]  # already-existing artifact types, may be empty
```

The markdown body contains additional context (intent description, domain model from discovery, etc.).

**Change directory to the worktree** before any file operations:

```bash
cd "{worktree_path}"
```

---

## Step 2: Maturity Gate

Check `project_maturity` from the brief:

| Maturity | Behavior |
|----------|----------|
| **greenfield** | Write scaffold artifacts with empty sections. Do NOT scan — there is no meaningful codebase to analyze. |
| **early** | Shallow scan — sample 3-5 files per pattern, set `confidence: low` on most findings. |
| **established** | Full deep scan — sample 5-10 files per pattern, produce high-confidence artifacts. |

### Greenfield Path (skip to Step 3, go directly to Step 4)

For greenfield projects, skip Step 3 (scanning). Instead, go directly to Step 4 and write scaffold artifacts for all 5 types using the templates there, but with empty section bodies and a note: "No patterns detected — project is greenfield."

Set frontmatter on each scaffold:
```yaml
source: synthesized
confidence: low
project_maturity: greenfield
```

After writing all 5 scaffold artifacts via Step 4, proceed to Step 5 (Write Results).

### Early / Established Path (continue to Step 3)

For early and established projects, proceed to Step 3 for codebase scanning.

---

## Step 3: Synthesis Passes

Run 5 passes, one per knowledge artifact type. Each pass scans relevant files, extracts patterns, and writes the artifact.

**Scanning rules:**
- Use `Glob` to find candidate files, then `Read` to sample representative ones
- Use `Grep` for pattern searching across many files (e.g., color values, import patterns)
- Sample 5-10 representative files per pattern for `established` projects, 3-5 for `early`
- Never read every file — be thorough but efficient
- If a pass finds insufficient data, skip the artifact and note it in results

**Confidence scoring:**
- **high**: Clear, consistent patterns found across multiple files with strong signals
- **medium**: Patterns found but with some ambiguity or limited sample size
- **low**: Inferred or sparse findings, few files matched, or early-maturity project

### Pass 1: Design Knowledge (`design.md`)

**Scan targets:**

| Pattern | What to find |
|---------|-------------|
| `Glob("**/tailwind.config.{js,ts,mjs,cjs}")` | Tailwind theme tokens (colors, spacing, fonts, border-radius) |
| `Glob("**/*.css")`, `Glob("**/*.scss")` | CSS custom properties (`:root { --var }`) and recurring values |
| `Grep(":root", glob: "*.css")` | CSS design tokens defined as custom properties |
| `Glob("**/package.json")` | UI framework detection (react, vue, svelte, angular, solid) |
| `Grep("(radix|shadcn|chakra|@mui|antd|mantine)", glob: "package.json")` | Component library detection |
| `Glob("**/storybook/**")`, `Glob("**/.storybook/**")` | Storybook configuration |
| `Glob("**/components/**")` | Component directory structure — note organization pattern |
| `Glob("**/icons/**")`, `Glob("**/assets/**")` | Icon system and asset organization |

**Extraction targets:**
- Color palette grouped by role (primary, secondary, accent, neutral, status/semantic)
- Spacing scale (detect base unit: 4px, 8px, or custom)
- Typography scale (font families, sizes, weights)
- Border radius values (shape language)
- Component patterns already built (list by name)
- Layout patterns (grid, flex, responsive breakpoints)

**Write artifact** using the template in Step 4 under "Design Knowledge Template".

### Pass 2: Architecture Knowledge (`architecture.md`)

**Scan targets:**

| Pattern | What to find |
|---------|-------------|
| `Glob("package.json")`, `Glob("**/package.json")` | Tech stack, dependencies, scripts |
| `Glob("go.mod")`, `Glob("Cargo.toml")`, `Glob("pyproject.toml")`, `Glob("Gemfile")` | Language/framework detection |
| `Glob("tsconfig*.json")` | TypeScript configuration |
| `Glob("**/vite.config.*")`, `Glob("**/webpack.config.*")`, `Glob("**/next.config.*")` | Build tool configuration |
| `Bash("ls -d */")` (top-level) | Directory structure and module organization |
| `Glob("**/routes/**")`, `Glob("**/api/**")`, `Glob("**/pages/**")`, `Glob("**/app/**")` | API and routing patterns |
| `Glob("**/*schema*")`, `Glob("**/migrations/**")` | Database schemas and migrations |
| `Glob(".github/workflows/**")`, `Glob(".gitlab-ci.yml")`, `Glob("Jenkinsfile")` | CI/CD configuration |
| `Glob("Dockerfile*")`, `Glob("docker-compose*")` | Container/infrastructure config |
| `Glob("**/Makefile")`, `Glob("**/justfile")` | Build automation |

**Extraction targets:**
- Language(s) and runtime versions
- Framework and key library choices (with versions)
- Module organization pattern (monolith, monorepo, microservices, layered, feature-based)
- Data flow patterns (REST, GraphQL, RPC, event-driven, SSR, SSG)
- State management approach (if frontend)
- Build and deployment pipeline summary

**Write artifact** using the template in Step 4 under "Architecture Knowledge Template".

### Pass 3: Product Knowledge (`product.md`)

**Scan targets:**

| Pattern | What to find |
|---------|-------------|
| `Read("README.md")` | Project description, purpose, features |
| `Read("CONTRIBUTING.md")` | Project values and contribution guidelines |
| `Glob(".ai-dlc/*/intent.md")` | Past intent descriptions (feature history) |
| Root `package.json` `description` field | Package description |
| `Glob("**/app/**")`, `Glob("**/pages/**")` | User-facing feature structure from routes/pages |
| `Glob("**/*landing*")`, `Glob("**/*home*")`, `Glob("**/*index*")` | Product positioning pages |

**Extraction targets:**
- Product description and purpose (from README or package.json)
- Target users (inferred from features, docs, or stated explicitly)
- Core features list (inferred from route structure, page names)
- Product principles (inferred from patterns — e.g., extensive a11y = "accessibility first")

**Write artifact** using the template in Step 4 under "Product Knowledge Template".

### Pass 4: Conventions Knowledge (`conventions.md`)

**Scan targets:**

| Pattern | What to find |
|---------|-------------|
| `Glob("**/.eslintrc*")`, `Glob("**/eslint.config.*")`, `Glob("**/biome.json*")` | Linter configuration |
| `Glob("**/.prettierrc*")`, `Glob("**/prettier.config.*")` | Formatter configuration |
| `Glob("**/.stylelintrc*")` | CSS linter configuration |
| `Glob("**/.editorconfig")` | Editor configuration |
| `Glob("**/*.test.*")`, `Glob("**/*.spec.*")`, `Glob("**/__tests__/**")` | Test file patterns and framework |
| `Glob("**/jest.config*")`, `Glob("**/vitest.config*")`, `Glob("**/pytest.ini")` | Test runner configuration |
| `Glob(".github/workflows/**")` | CI checks that run on PRs |
| `Glob("CODEOWNERS")`, `Glob(".github/PULL_REQUEST_TEMPLATE*")` | Review process config |
| `Glob("**/.husky/**")`, `Glob("**/.git/hooks/**")` | Git hooks |
| `Grep("^import ", glob: "*.{ts,tsx,js,jsx}")` | Import ordering patterns (sample 5 files) |

**Extraction targets:**
- Code style conventions (formatting tool, naming patterns, file organization)
- Testing philosophy (framework, naming pattern, directory structure, coverage config)
- Error handling patterns (try/catch conventions, error types, Result patterns)
- PR/review process (from templates, CI config, CODEOWNERS)
- Commit message conventions (from git log or config)
- Import ordering conventions

**Write artifact** using the template in Step 4 under "Conventions Knowledge Template".

### Pass 5: Domain Knowledge (`domain.md`)

**Scan targets:**

| Pattern | What to find |
|---------|-------------|
| `Glob("**/*.prisma")`, `Glob("**/schema.graphql")`, `Glob("**/schema.gql")` | Schema definitions |
| `Grep("(interface|type|enum|model)\\s+\\w+", glob: "*.{ts,tsx,prisma,graphql}")` | TypeScript interfaces, GraphQL types, Prisma models |
| `Glob("**/models/**")`, `Glob("**/entities/**")`, `Glob("**/types/**")` | Domain model directories |
| Route and endpoint names | Domain vocabulary from URL patterns |
| `Grep("enum\\s+\\w+", glob: "*.{ts,tsx,java,rs,go}")` | Enum definitions (business states/categories) |
| `Read("README.md")` | Business context and domain description |
| `Glob(".ai-dlc/*/discovery.md")` | Prior domain analysis from elaboration |
| `Glob("**/*service*")`, `Glob("**/*repository*")`, `Glob("**/*controller*")` | Service layer patterns |

**Extraction targets:**
- Key domain terms and definitions (glossary)
- Entity model (core objects with fields and types)
- Entity relationships (1:1, 1:N, M:N)
- Entity lifecycle (states, transitions — from enums and status fields)
- External integrations (API clients, SDK imports, webhook handlers)
- Business constraints (validation rules visible in code)

**Write artifact** using the template in Step 4 under "Domain Knowledge Template".

---

## Step 4: Write Knowledge Artifacts

For each pass that produced findings, write the artifact using the knowledge.sh library via Bash.

**CRITICAL:** Use heredoc syntax to avoid shell escaping issues. Source the knowledge library from the plugin root.

```bash
# Determine plugin root
CLAUDE_PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$(readlink -f "$0")")" && pwd)}"
source "${CLAUDE_PLUGIN_ROOT}/lib/knowledge.sh"

# Write an artifact (example for design)
dlc_knowledge_write "design" "$(cat <<'ARTIFACT_EOF'
---
type: design
version: 1
created: {ISO-8601 timestamp}
last_updated: {ISO-8601 timestamp}
source: synthesized
confidence: {high|medium|low}
project_maturity: {greenfield|early|established}
---

# Design Knowledge

## Design Tokens
{extracted tokens or "No design tokens detected."}

## Layout Principles
{extracted layout patterns or "No layout patterns detected."}

## Component Usage Guide
{extracted component patterns or "No component patterns detected."}

## Design Rationale
{inferred rationale or "Insufficient data to infer design rationale."}
ARTIFACT_EOF
)"
```

If `CLAUDE_PLUGIN_ROOT` is not set, locate knowledge.sh relative to the worktree's plugin directory:

```bash
# Try common locations in order
for candidate in \
  "${CLAUDE_PLUGIN_ROOT}/lib/knowledge.sh" \
  "$(git rev-parse --show-toplevel 2>/dev/null)/plugin/lib/knowledge.sh" \
  ; do
  if [ -f "$candidate" ]; then
    source "$candidate"
    break
  fi
done
```

### Artifact Templates

Each artifact must conform to the schema from unit-01. Required frontmatter fields: `type`, `version`, `created`. Additional fields: `last_updated`, `source`, `confidence`, `project_maturity`.

#### Design Knowledge Template

```markdown
# Design Knowledge

## Design Tokens
{Color palette with hex values grouped by role}
{Spacing scale with values}
{Typography: font families, size scale, weight scale}
{Border radii, shadows, other tokens}

## Layout Principles
{Grid system details}
{Responsive breakpoints}
{Content hierarchy patterns}
{Spacing philosophy (e.g., "8px base grid")}

## Component Usage Guide
{List of existing components with brief description}
{Composition patterns}
{Component organization (flat, atomic, feature-based)}

## Design Rationale
{Why these design choices were made, inferred from patterns}
{Design system source (Tailwind, custom, component library)}
```

#### Architecture Knowledge Template

```markdown
# Architecture Knowledge

## Tech Stack
{Languages with versions}
{Framework(s) with versions}
{Key libraries}
{Build tools}
{Runtime environment}

## Module Boundaries
{Top-level directory structure with purpose of each}
{Module dependency direction}
{Package/workspace organization}

## Data Flow Patterns
{Request lifecycle}
{State management approach}
{API patterns (REST endpoints, GraphQL schema, RPC)}
{Event/messaging patterns}

## Infrastructure Conventions
{CI/CD pipeline summary}
{Deployment target}
{Environment management}
{Configuration pattern (env vars, config files, etc.)}
```

#### Product Knowledge Template

```markdown
# Product Knowledge

## User Personas
{Who uses this product}
{Their goals and pain points}
{Inferred from features and docs}

## Product Principles
{Core values guiding feature decisions}
{Inferred from patterns in the codebase}

## Feature Rationale
{Key features and why they exist}
{Feature organization}

## Business Rules
{Domain-specific rules that constrain behavior}
{Validation rules visible in code}
```

#### Conventions Knowledge Template

```markdown
# Development Conventions

## Code Style
{Formatting tool and config}
{Naming patterns (camelCase, snake_case, etc.)}
{File organization conventions}
{Import ordering}

## Testing Philosophy
{Test framework}
{Test file naming and location}
{Coverage expectations}
{Unit vs integration vs e2e balance}

## Error Handling Patterns
{Error types and hierarchy}
{Try/catch or Result pattern conventions}
{Logging conventions}

## PR Process
{CI checks on PRs}
{Review requirements (CODEOWNERS, approvals)}
{Merge strategy}
{Commit message format}
```

#### Domain Knowledge Template

```markdown
# Domain Knowledge

## Glossary
{Term: definition — one per line}

## Entity Model
{Entity name: fields and types}
{Relationships between entities}
{Lifecycle states}

## External Integrations
{Third-party APIs and services}
{SDK/client library usage}

## Domain Constraints
{Business rules from validation logic}
{Invariants and constraints}
```

---

## Step 5: Write Results

Use the `Write` tool (not Bash) to write the results file to `.ai-dlc/{intent-slug}/.briefs/knowledge-synthesize-results.md`:

```markdown
---
status: success
error_message: ""
artifacts_created: [{list of types written}]
artifacts_skipped: [{list of types skipped due to insufficient data}]
confidence_scores:
  design: {high|medium|low|skipped}
  architecture: {high|medium|low|skipped}
  product: {high|medium|low|skipped}
  conventions: {high|medium|low|skipped}
  domain: {high|medium|low|skipped}
---

# Knowledge Synthesis Results

## Summary

{Brief overview of what was found and synthesized}

## Artifacts Created

### design.md
{2-3 sentence summary of design findings}
Confidence: {level} — {why this confidence level}

### architecture.md
{2-3 sentence summary of architecture findings}
Confidence: {level} — {why this confidence level}

### product.md
{2-3 sentence summary of product findings}
Confidence: {level} — {why this confidence level}

### conventions.md
{2-3 sentence summary of conventions findings}
Confidence: {level} — {why this confidence level}

### domain.md
{2-3 sentence summary of domain findings}
Confidence: {level} — {why this confidence level}

## Artifacts Skipped

{List any artifacts that were skipped and why}

## Notes

{Any observations, ambiguities, or recommendations for manual review}
```

**Commit artifacts after writing:**
```bash
git add .ai-dlc/knowledge/
git add .ai-dlc/{intent-slug}/.briefs/knowledge-synthesize-results.md
git commit -m "knowledge: synthesize project knowledge artifacts"
```

---

## Error Handling

If any critical error occurs during synthesis (e.g., worktree path doesn't exist, knowledge library not found):

1. Write the results file with `status: error` and `error_message` describing what went wrong
2. Include any partial findings (artifacts written before the error)
3. Exit — the calling skill will read the error status and handle it

If a single pass fails but others succeed, continue with remaining passes and note the failure in `artifacts_skipped` with an explanation.

---

## Idempotency

This skill is idempotent. Running it twice on the same codebase produces the same result. `dlc_knowledge_write` overwrites existing artifacts atomically (write to temp, then mv).

Existing knowledge artifacts listed in `existing_knowledge` from the brief are overwritten with fresh synthesis results. The calling skill decides whether to invoke synthesis based on whether re-synthesis is needed.

---
status: in_progress
last_updated: "2026-04-01T12:49:53Z"
depends_on: []
branch: ai-dlc/design-direction-system/01-knowledge-infrastructure
discipline: backend
pass: ""
workflow: ""
ticket: ""
design_ref: ""
views: []
hat: builder
---

# unit-01-knowledge-infrastructure

## Description
Create the `.ai-dlc/knowledge/` directory infrastructure — a persistent project-level knowledge layer that accumulates intelligence across intents. This unit builds the shell library for reading/writing knowledge artifacts, defines the schema for each artifact type, and provides the foundational API that all consuming units (hats, skills, synthesis) depend on.

## Discipline
backend - This unit will be executed by backend-focused agents.

## Domain Entities
- **KnowledgeDirectory**: The `.ai-dlc/knowledge/` directory structure
- **KnowledgeArtifact**: A single knowledge file (e.g., `design.md`, `architecture.md`) with YAML frontmatter + markdown body

## Data Sources
- **Filesystem**: `.ai-dlc/knowledge/*.md` — read/write knowledge artifacts
- **`plugin/lib/config.sh`**: Existing config library patterns to follow for function naming, error handling, sourcing conventions
- **`plugin/lib/parse.sh`**: Contains `dlc_frontmatter_get` and `dlc_frontmatter_set` functions for YAML frontmatter operations — use these for reading/writing knowledge artifact frontmatter fields

## Technical Specification

### Shell Library: `plugin/lib/knowledge.sh`

Core functions:

1. **`dlc_knowledge_dir()`** — Returns the absolute path to `.ai-dlc/knowledge/` for the current repo. Creates the directory if it doesn't exist.

2. **`dlc_knowledge_exists(artifact_type)`** — Returns 0 if `.ai-dlc/knowledge/{artifact_type}.md` exists, 1 otherwise. `artifact_type` is one of: `design`, `architecture`, `product`, `conventions`, `domain`.

3. **`dlc_knowledge_read(artifact_type)`** — Reads and outputs the full content of a knowledge artifact. Returns error if not found.

4. **`dlc_knowledge_read_section(artifact_type, section_heading)`** — Reads a specific `## Section` from a knowledge artifact. Uses `awk` or `sed` to extract content between section headings. Returns empty if section not found.

5. **`dlc_knowledge_write(artifact_type, content)`** — Writes a knowledge artifact. Validates that `artifact_type` is one of the 5 supported types. Content must include YAML frontmatter. Overwrites existing file.

6. **`dlc_knowledge_update_section(artifact_type, section_heading, new_content)`** — Replaces a specific section's content in an existing artifact. If the section doesn't exist, appends it. Preserves frontmatter and other sections.

7. **`dlc_knowledge_list()`** — Lists all existing knowledge artifacts (just the type names, e.g., `design`, `architecture`).

8. **`dlc_knowledge_load_for_hat(hat_name)`** — Convenience function that loads relevant knowledge artifacts for a given hat. Returns concatenated content of applicable artifacts. Mapping:
   - `designer` → `design`
   - `builder` → `architecture`, `conventions`, `domain`
   - `planner` → `product`, `domain`, `architecture`
   - `reviewer` → `conventions`, `architecture`
   - All other hats → `domain` (if exists)

### Knowledge Artifact Schema

Each knowledge artifact is a markdown file with YAML frontmatter:

```yaml
---
type: design  # one of: design, architecture, product, conventions, domain
version: 1  # schema version for future migrations
created: 2026-03-31T22:00:00Z
last_updated: 2026-03-31T22:00:00Z
source: synthesized  # one of: synthesized (from code), direction-picker (from design picker), manual (user-edited)
confidence: high  # one of: high, medium, low — how confident the synthesis was
project_maturity: greenfield  # maturity at time of creation
---
```

Body structure varies by type (documented in the knowledge artifact templates below).

### Knowledge Artifact Templates

**`design.md`** body structure:
```markdown
# Design Knowledge

## Design Tokens
{Color palette, spacing scale, type scale, border radii, shadows — the atomic values}

## Layout Principles
{Grid system, responsive breakpoints, content hierarchy, spacing philosophy}

## Component Usage Guide
{Which components exist, when to use each, composition rules}

## Design Rationale
{Why decisions were made — 'We use monospace for data-heavy views because...'}
```

**`architecture.md`** body structure:
```markdown
# Architecture Knowledge

## Tech Stack
{Languages, frameworks, key libraries, build tools, runtime}

## Module Boundaries
{How code is organized — packages, layers, service boundaries}

## Data Flow Patterns
{How data moves through the system — request lifecycle, state management, event flows}

## Infrastructure Conventions
{Deployment, CI/CD, environment management, configuration patterns}
```

**`product.md`** body structure:
```markdown
# Product Knowledge

## User Personas
{Who uses this product, their goals, pain points}

## Product Principles
{Core values that guide feature decisions — e.g., 'simplicity over power'}

## Feature Rationale
{Why key features exist and the problems they solve}

## Business Rules
{Domain-specific rules that constrain behavior}
```

**`conventions.md`** body structure:
```markdown
# Development Conventions

## Code Style
{Formatting, naming patterns, file organization}

## Testing Philosophy
{What to test, how to test, coverage expectations}

## Error Handling Patterns
{How errors are surfaced, logged, reported}

## PR Process
{Review conventions, merge strategy, CI requirements}
```

**`domain.md`** body structure:
```markdown
# Domain Knowledge

## Glossary
{Key business terms and their precise definitions}

## Entity Model
{Core domain entities, their relationships, lifecycle}

## External Integrations
{Third-party services, APIs, data sources the system depends on}

## Domain Constraints
{Business rules, regulatory requirements, invariants}
```

### Validation

- `artifact_type` must be one of: `design`, `architecture`, `product`, `conventions`, `domain`
- Knowledge artifacts must have valid YAML frontmatter with required fields (`type`, `version`, `created`)
- The `dlc_knowledge_write` function validates frontmatter before writing

## Success Criteria
- [ ] `plugin/lib/knowledge.sh` exists with all 8 functions implemented
- [ ] `dlc_knowledge_dir()` creates `.ai-dlc/knowledge/` if missing and returns its path
- [ ] `dlc_knowledge_exists()` correctly detects presence/absence of knowledge artifacts
- [ ] `dlc_knowledge_read()` returns full artifact content including frontmatter
- [ ] `dlc_knowledge_read_section()` extracts specific sections by heading
- [ ] `dlc_knowledge_write()` validates artifact type and writes with proper frontmatter
- [ ] `dlc_knowledge_update_section()` replaces or appends sections without corrupting other content
- [ ] `dlc_knowledge_list()` returns only existing artifact types
- [ ] `dlc_knowledge_load_for_hat()` returns correct artifacts for each hat type
- [ ] Invalid artifact types are rejected with clear error messages
- [ ] All functions follow existing `config.sh` conventions (error handling, return codes, output patterns)

## Risks
- **Section parsing fragility**: `dlc_knowledge_read_section()` relies on markdown heading patterns — malformed headings could cause incorrect extraction. Mitigation: Use strict `## ` prefix matching with `awk`.
- **Concurrent writes**: Two agents writing to the same knowledge artifact simultaneously could corrupt it. Mitigation: Atomic write (write to temp file, then `mv`) in `dlc_knowledge_write()`. For `dlc_knowledge_update_section()` which does read-modify-write, use `flock` around the critical section to prevent TOCTOU races. In practice, knowledge artifacts are typically written by a single synthesis subagent, so contention is rare — but the lock prevents corruption if it does occur.

## Boundaries
This unit does NOT handle:
- Creating or populating knowledge content (that's unit-02 Knowledge Synthesis)
- The design direction picker (that's unit-03)
- Integrating knowledge loading into hats or skills (that's unit-06)
- Any MCP server changes

This unit ONLY provides the filesystem API for knowledge artifacts.

## Notes
- Follow the function naming convention from `config.sh`: `dlc_` prefix for all public functions
- The library should be sourceable: `source "${CLAUDE_PLUGIN_ROOT}/lib/knowledge.sh"`
- Use `dlc_frontmatter_get` and `dlc_frontmatter_set` from the shared library for frontmatter operations where possible
- Keep the library stateless — no global variables, no side effects on source

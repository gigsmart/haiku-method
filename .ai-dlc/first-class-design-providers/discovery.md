---
intent: first-class-design-providers
created: 2026-04-01
status: active
---

# Discovery Log: First-Class Design Providers

Elaboration findings persisted during Phase 2.5 domain discovery.
Builders: read section headers for an overview, then dive into specific sections as needed.

## Codebase Context

**Stack:** TypeScript (Next.js 15 website, MCP server), Bash (plugin hooks/libs), JSON schemas
**Build Tools:** Bun (lockfile present), Biome (linting), Playwright (testing/screenshots)
**Architecture:** Monorepo with 4 workspaces: `website/`, `plugin/shared/`, `plugin/mcp-server/`, `plugin/cli/`
**Package Manager:** Bun (bun.lock present) with npm fallback (package-lock.json also present)
**Conventions:**
- Plugin skills in `plugin/skills/{name}/SKILL.md` (markdown-driven agent instructions)
- Hats in `plugin/hats/{name}.md` (role definitions for workflow phases)
- Providers in `plugin/providers/{category}.md` (tiered instruction system: built-in, inline, project override)
- Provider schemas in `plugin/schemas/providers/{type}.schema.json`
- Settings schema in `plugin/schemas/settings.schema.json`
- Shell libraries in `plugin/lib/*.sh` (sourced by hooks and CLI)
- MCP server in `plugin/mcp-server/src/server.ts` (Node.js, @modelcontextprotocol/sdk)
- Workflows in `plugin/workflows.yml` (named hat sequences)
- Passes in `plugin/passes/{name}.md` (discipline iteration definitions)
**Concerns:**
- `resolve-design-ref.sh` line 118: Provider URIs (e.g., `figma://`) are explicitly stubbed as "not yet supported" with a fallthrough
- `designProviderEntry` in settings schema only supports `"figma"` as a type enum value
- `_provider_mcp_hint` in config.sh only maps `figma` for the design category
- The design provider instructions (`plugin/providers/design.md`) are generic and don't reference any specific MCP tools
- No provider schemas exist for any design tool except Figma (`figma.schema.json`)
- The elaborate skill only mentions Figma when checking for design providers (line 353)

## Codebase Pattern: Provider Architecture

The existing provider system follows a three-tier instruction pattern:

### Provider Categories
Four categories exist: `spec`, `ticketing`, `design`, `comms`. Each has:
1. **Built-in default instructions** at `plugin/providers/{category}.md` (YAML frontmatter + markdown body)
2. **Inline instructions** from `providers.{category}.instructions` in `.ai-dlc/settings.yml`
3. **Project override** from `.ai-dlc/providers/{type}.md`

Instructions are merged by `load_provider_instructions()` in `config.sh` (lines 374-412).

### Provider Configuration Loading
`load_providers()` in `config.sh` (lines 503-558) implements a 3-source fallback:
1. Declared providers from `settings.yml` under `providers:`
2. Cached providers from filesystem state (`providers.json`)
3. Auto-detected VCS hosting and CI/CD

### MCP Hint Mapping
`_provider_mcp_hint()` in `config.sh` (lines 346-369) maps provider types to MCP tool glob patterns:
- `figma` -> `mcp__*figma*`
- Other design tools: **not mapped**

### Provider Schema Registration
Each provider type has a JSON Schema at `plugin/schemas/providers/{type}.schema.json`. The `designProviderEntry` in `settings.schema.json` (lines 218-244) references these conditionally via `allOf` with `if/then`.

### Key Integration Points
- `format_providers_markdown()` generates markdown tables injected into hat context
- `detect_project_maturity()` auto-detects greenfield/early/established
- `detect_vcs_hosting()` and `detect_ci_cd()` auto-detect infrastructure

### Pattern for Adding New Design Providers
To add a new design provider, the following files need changes:
1. `plugin/schemas/settings.schema.json` — Add type to `designProviderEntry.type.enum`
2. `plugin/schemas/providers/{type}.schema.json` — Create provider-specific config schema
3. `plugin/schemas/settings.schema.json` — Add `allOf` conditional for new type
4. `plugin/lib/config.sh` — Add `_provider_mcp_hint()` mapping
5. `plugin/providers/design.md` — Update default instructions (or create type-specific overrides)
6. `plugin/lib/resolve-design-ref.sh` — Handle provider URI scheme (currently stubbed)

## Codebase Pattern: Wireframe Generation Pipeline

The wireframe system is a two-phase pipeline:

### Phase 1: Elaboration (elaborate-wireframes skill)
- Runs as a forked subagent during Phase 6.25 of elaboration
- Reads brief from `.ai-dlc/{slug}/.briefs/elaborate-wireframes.md`
- Brief includes `design_provider_type` field (loaded from `config.sh` -> `load_providers()`)
- Generates self-contained HTML wireframes at `.ai-dlc/{slug}/mockups/unit-{NN}-{slug}-wireframe.html`
- Two modes: **Mode A** (styled, when design blueprint exists) and **Mode B** (gray-box, no blueprint)
- Updates unit frontmatter with `wireframe:` field pointing to generated file
- Currently: design provider type is noted but only used to add HTML comments referencing DS components

### Phase 2: Execution (designer hat)
- Runs in the `design` workflow: `[planner, designer, reviewer]`
- Surveys existing design resources (knowledge.sh, component libraries, brand guidelines)
- Generates design-spec.md with structured specs per unit
- Can invoke elaborate-wireframes skill to generate wireframes
- Saves wireframes to `.ai-dlc/{intent}/mockups/`

### Design Reference Resolution (resolve-design-ref.sh)
Three-level priority hierarchy:
1. **External design** (`design_ref:` field) — fidelity: high. Supports png/jpg/html/webp files and directories. Provider URIs (`figma://`, etc.) are **stubbed but not implemented** (line 118).
2. **Previous iteration screenshots** (`iterates_on`) — fidelity: medium
3. **Wireframe HTML** (`wireframe:` field) — fidelity: low

### Visual Gate Detection (detect-visual-gate.sh)
5-point heuristic: discipline=frontend/design, has design_ref, has wireframe, changed UI files, spec mentions UI terms.

### Visual Comparison Pipeline (run-visual-comparison.sh)
Orchestrates: gate detection -> reference resolution -> built output capture -> screenshot pairing -> comparison context for reviewer vision analysis.

## Codebase Pattern: MCP Server Tools

The AI-DLC MCP server (`plugin/mcp-server/src/server.ts`) currently exposes 4 tools:

1. **`open_review`** — Opens browser-based visual review for intent/unit
2. **`get_review_status`** — Polls review session status
3. **`ask_user_visual_question`** — Presents rich HTML questions in browser (used for visual Q&A)
4. **`pick_design_direction`** — Visual picker for design archetypes with tunable parameters

These tools serve the visual review and design direction flows. No tools currently wrap external design tool MCP servers or provide a unified design abstraction.


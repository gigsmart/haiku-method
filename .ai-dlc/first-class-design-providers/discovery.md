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

## External Research: Design Tool MCP Ecosystem

### 1. Canva MCP

**Status:** Production-ready, available as Claude platform connector
**Transport:** Remote HTTP (canva.dev hosted)
**Authentication:** Per-user Canva account required
**Available in this project:** YES — already connected via `mcp__claude_ai_Canva__*` tools (37 tools observed in deferred tool list)

**Key Capabilities:**
- `generate-design` / `generate-design-structured` — Create designs from text prompts
- `start-editing-transaction` / `perform-editing-operations` / `commit-editing-transaction` — Transactional editing workflow
- `get-design` / `get-design-content` / `get-design-pages` — Read design structure
- `get-design-thumbnail` — Get visual preview
- `export-design` — Export to PNG/JPG/PDF/PPTX/MP4
- `search-designs` — Discovery of existing designs
- `list-brand-kits` — Access brand tokens
- `create-design-from-candidate` — Programmatic design creation
- `comment-on-design` / `list-comments` / `list-replies` — Collaboration

**Strengths:** Fully headless, template-based, brand kit management, multi-format export
**Limitations:** Commercial service (requires Canva account), template-driven (less suited for precise pixel-level wireframes), Pro required for resize

### 2. OpenPencil (ZSeven-W/openpencil)

**Status:** Open-source (MIT), active development
**Transport:** stdio and HTTP MCP server
**File Format:** `.op` JSON format
**CLI:** `op design`, `op insert`, `op export`
**Export Targets:** React, Vue, Svelte, HTML, Flutter, SwiftUI, Compose, React Native (8 targets)

**Key Capabilities:**
- MCP server with stdio/HTTP transports for agent integration
- Design-as-Code: prompts generate UI directly on live canvas
- Concurrent Agent Teams support
- `.op` file manipulation via CLI
- Code export to 8 frontend frameworks
- Modular SDK: `pen-core`, `pen-codegen`, `pen-figma`, `pen-renderer`

**Strengths:** Open source, headless CLI, multi-framework export, Design-as-Code paradigm
**Limitations:** Newer project, smaller community than Figma/Penpot, separate from open-pencil/open-pencil (namespace confusion)

### 3. OpenPencil (open-pencil/open-pencil)

**Status:** Open-source, AI-native design editor
**Transport:** stdio and HTTP MCP server (90+ tools)
**File Format:** `.fig` file compatibility
**Desktop App:** ~7MB Tauri v2 app (macOS signed, Windows, Linux)

**Key Capabilities:**
- 90+ MCP tools across two transports
- Read/write `.fig` files headlessly
- Headless CLI for inspect, search, analyze, render
- AI-native with Figma file compatibility

**Strengths:** Figma file compatibility, extensive MCP tool surface, cross-platform desktop app
**Limitations:** Different project from ZSeven's openpencil, .fig format focus

### 4. Pencil.dev

**Status:** Commercial, free tier available
**Transport:** MCP server (port 3100 default)
**File Format:** `.pen` JSON format
**CLI:** `@pencil.dev/cli` with headless editor engine

**Key Capabilities:**
- Same MCP tools as desktop app and IDE extension
- Headless CLI runs full editor engine without GUI
- Interactive shell for direct MCP tool calls
- Batch processing of multiple designs
- Export to PNG/JPEG/WEBP/PDF
- Deep IDE integration (VS Code, Cursor, Claude Code)

**Strengths:** Mature tooling, headless CLI with full engine, interactive shell for scripting, IDE integration
**Limitations:** Commercial product (though currently free), potential future pricing changes

### 5. Penpot

**Status:** Open-source (MPL-2.0), 45K+ GitHub stars, official MCP server
**Transport:** HTTP (`localhost:4401/mcp`), legacy SSE, WebSocket (plugin connection on port 4402)
**Architecture:** MCP server <-> Penpot Plugin (WebSocket) <-> Penpot Plugin API
**Installation:** npm install + bootstrap + load plugin in Penpot

**Key Capabilities:**
- Design data retrieval and modification
- Create new design elements
- Design-to-design, code-to-design, design-to-code workflows
- Design tokens accessible as code
- Programmable canvas
- Self-hostable (important for enterprise)

**Strengths:** Open source with massive community, self-hostable, design-as-code philosophy
**Limitations:** Requires browser session for canvas operations (Penpot Plugin runs in browser), WebSocket bridge adds complexity, MCP repo archived (merged into main Penpot repo as of Feb 2026)

### 6. Figma

**Status:** Multiple MCP implementations available
**Implementations:**
- **Figma Official MCP** — First-party, supports VS Code, Cursor, Windsurf, Claude Code. Tools: `generate_figma_design` (Claude Code exclusive as of Feb 2026), live UI capture.
- **Framelink MCP** (14K stars) — Read-only, free, works with any Figma account. Tools: `get_figma_data` (layout/styling), `download_figma_images` (assets).
- **Figma Write Server** — Full write access, 24 tool categories, requires Figma Desktop app.
- **Figsor** — 45+ tools, AI SVG generation.

**Key Capabilities:**
- Read design structure, styling, layout
- Download image assets
- Write/modify designs (Write Server, Official MCP)
- Generate designs from live UI (Official MCP, Claude Code only)
- AI SVG generation (Figsor)

**Strengths:** Industry standard, multiple MCP options, massive ecosystem, design-to-code mature
**Limitations:** Read-only in free tier (Framelink), Write Server requires Desktop app, some features Claude-Code-exclusive

### Provider Capability Matrix

| Provider | Headless | MCP | Read | Write | Export | Open Source | File Format |
|----------|----------|-----|------|-------|--------|-------------|-------------|
| Canva | Yes | Remote | Yes | Yes (transactional) | PNG/JPG/PDF/PPTX | No | Proprietary |
| OpenPencil (ZS) | Yes | stdio/HTTP | Yes | Yes | 8 frameworks | Yes (MIT) | .op JSON |
| OpenPencil (OP) | Yes | stdio/HTTP (90+) | Yes | Yes | Yes | Yes | .fig |
| Pencil.dev | Yes | stdio/HTTP | Yes | Yes | PNG/JPEG/WEBP/PDF | No | .pen JSON |
| Penpot | Partial* | HTTP/WS | Yes | Yes | Yes | Yes (MPL-2.0) | SVG-native |
| Figma (Official) | Partial** | Remote | Yes | Yes | PNG/SVG | No | Proprietary |
| Figma (Framelink) | Yes | stdio | Yes | No | PNG | Yes (OSS) | Proprietary |

*Penpot requires browser for canvas operations (plugin runs in browser context)
**Figma Official MCP requires Figma Desktop for write operations

## Codebase Pattern: Current Design Integration Points

Four integration points need design provider support. Here is their current state:

### 1. Elaboration Phase (elaborate-wireframes skill)

**Current:** The elaborate-wireframes skill (`plugin/skills/elaborate-wireframes/SKILL.md`) accepts `design_provider_type` in its brief frontmatter but only uses it to add HTML comments referencing design system components (e.g., `<!-- DS: ButtonPrimary -->`). The wireframe is always generated as self-contained HTML, never delegated to an external design tool.

**Gap:** No code path exists to delegate wireframe generation to an external design tool. The `design_provider_type` field is informational only.

**What's needed:** When a design provider is available and capable of wireframe generation, the skill should be able to create wireframes in the provider's native format (e.g., a Canva design, an OpenPencil .op file, an Excalidraw diagram) instead of or alongside the HTML wireframe.

### 2. Execution Phase (designer hat)

**Current:** The designer hat (`plugin/hats/designer.md`) loads design knowledge via `knowledge.sh`, surveys design resources, and produces `design-spec.md`. It can invoke the `elaborate-wireframes` skill for HTML wireframes. No code interacts with external design tool MCP servers.

**Gap:** The designer hat has no awareness of available design tool MCP tools. It cannot create designs in Figma, Canva, OpenPencil, etc.

**What's needed:** The designer hat should discover available design tool MCP tools and use them to create higher-fidelity design artifacts. The design-spec.md should reference provider-native design files.

### 3. Visual Review Integration (ask_user_visual_question MCP tool)

**Current:** The MCP server's `ask_user_visual_question` tool presents HTML pages with questions. The `open_review` tool serves visual review pages that can display mockup files from `.ai-dlc/{intent}/mockups/`. Screenshot comparison is handled by `run-visual-comparison.sh` which orchestrates gate detection, reference resolution, and screenshot pairing.

**Gap:** Two modes described in the brief aren't fully realized:
- **Present-for-review (creating from scratch):** Design provider creates artifact -> present to user for review. This flow works for HTML wireframes (via mockups directory) but not for provider-native formats.
- **Auto-compare against design_ref:** `resolve-design-ref.sh` handles this for files on disk, but provider URIs (`figma://file/xxx`) are explicitly stubbed (line 118: "provider URI not yet supported").

**What's needed:**
- Provider-native design files need to be exportable to PNG for visual comparison
- `resolve-design-ref.sh` needs to handle provider URIs by calling the provider's export tool
- Review pages need to be able to embed or link to provider-native design views

### 4. Design Reference Resolution (resolve-design-ref.sh)

**Current:** Three-level hierarchy resolves to local files only. `_resolve_design_ref_field()` (line 106-158) checks for `design_ref:` in unit frontmatter. Provider URIs matching `^[a-z]+://` are detected but return error: "provider URI not yet supported" (line 117-119).

Supported formats: png, jpg, html, webp, directory. Does NOT support: `.op`, `.pen`, `.excalidraw`, `.fig`, or any provider-native format.

**Gap:** Cannot resolve provider URIs or native design file formats to screenshots for comparison.

**What's needed:**
- URI scheme handlers for each provider (e.g., `canva://design/{id}`, `figma://file/{key}`, `excalidraw://{id}`)
- Native format handlers that call provider export APIs to get PNG/SVG output
- Registration mechanism so new providers can plug in resolution logic


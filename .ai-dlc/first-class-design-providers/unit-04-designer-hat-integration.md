---
status: completed
last_updated: "2026-04-01T20:08:11Z"
depends_on:
  - unit-01-schema-config-capabilities
  - unit-02-design-ref-resolution
branch: ai-dlc/first-class-design-providers/04-designer-hat-integration
discipline: backend
pass: ""
workflow: ""
ticket: ""
design_ref: ""
views: []
hat: reviewer
---

# unit-04-designer-hat-integration

## Description
Update the designer hat to discover and use available design tool MCP tools during execution. When a design provider is available, the designer hat should create design artifacts in the provider's native format instead of (or in addition to) producing only text-based design specs and HTML wireframes. This gives builders higher-fidelity design references to implement against.

## Discipline
backend - This unit will be executed by backend-focused agents.

## Domain Entities
- **DesignProvider**: The active provider, used to determine which MCP tools or CLI to invoke
- **DesignCapability**: The designer hat should check capabilities before attempting operations — particularly `write_design`, `generate_wireframe`, `design_tokens`, and `export_png`
- **DesignArtifact**: The output — provider-native design files saved to `.ai-dlc/{intent}/designs/` or mockups/
- **ProviderInstructions**: The merged instruction text injected into the designer hat's context

## Data Sources
- **designer.md** (`plugin/hats/designer.md`): The designer hat definition. Currently loads design knowledge via `knowledge.sh`, surveys resources, produces `design-spec.md`, and can invoke `elaborate-wireframes`. No awareness of external design tools.
- **inject-context.sh** (`plugin/hooks/inject-context.sh`): Injects provider config into hat context via `format_providers_markdown()`. Already handles the `design` provider category.
- **knowledge.sh** (`plugin/lib/knowledge.sh`): Synthesizes design knowledge from various sources. Could be extended to include provider-specific design system tokens.
- **config.sh** (`plugin/lib/config.sh`): `load_providers()`, `detect_design_provider()`, `provider_has_capability()`, `get_provider_capabilities()` from unit-01.

## Technical Specification

### 1. Designer Hat Context Enhancement (`plugin/hats/designer.md`)

Add a new section to the designer hat that checks for available design tools before starting work:

**Design Tool Discovery Step** (insert before the existing "Survey available design resources" step):

```markdown
### Step 0: Discover Design Tools

Before surveying design resources, check if a design provider is available:

1. Read the provider config from the injected context (look for the `## Design Provider` section)
2. If a design provider is configured:
   a. Note the provider type and its capabilities
   b. Check which MCP tools are available via ToolSearch using the provider's MCP hint pattern
   c. If tools are found: use them throughout this hat phase for creating and modifying designs
   d. If tools are NOT found: log a warning and proceed with text-based design specs only
3. If no design provider is configured: proceed with existing behavior (text specs + HTML wireframes)
```

### 2. Provider-Aware Design Creation

When a design provider is available, the designer hat's workflow changes:

**Current flow:**
1. Survey resources → 2. Understand problem → 3. Explore alternatives → 4. Refine → 5. Verify states → 6. Write design-spec.md → 7. Optionally generate HTML wireframes

**Enhanced flow (when provider available):**
1. Survey resources (including provider design tokens) → 2. Understand problem → 3. Explore alternatives **using provider tools** → 4. Create design **in provider** → 5. Refine **using provider edit tools** → 6. Verify states **with provider export + visual review** → 7. Write design-spec.md **referencing provider artifacts** → 8. Export PNG previews for review

### 3. Per-Provider Design Instructions

Add conditional instruction blocks based on provider type:

**When provider is Canva:**
- Use `generate-design-structured` for initial design creation with structured input matching the unit spec
- Use transactional editing (`start-editing-transaction` → `perform-editing-operations` → `commit-editing-transaction`) for refinements
- Access brand kit tokens via `list-brand-kits` for design system alignment
- Export previews via `export-design` for review cycles
- Store design ID in `design_ref: canva://design/{id}` on the unit

**When provider is OpenPencil:**
- Use MCP `design_skeleton` → `design_content` → `design_refine` layered workflow
- Or use CLI: `op design --prompt "{spec}" --out {path}.op`
- Access design variables for token alignment
- Export via `op export --format png`
- Store .op file path in `design_ref:`

**When provider is Pencil.dev:**
- Use MCP tools: `create_element`, `modify_element` for canvas manipulation
- Or use CLI interactive shell for scripted design creation
- Use `get_style_guide` for design system token access
- Export via CLI `--export png`
- Store .pen file path in `design_ref:`

**When provider is Penpot:**
- Use Penpot MCP to create design elements in the open canvas
- Access design tokens as CSS custom properties
- Export via MCP export tool
- Store Penpot project/file URI in `design_ref:`

**When provider is Excalidraw:**
- Use Excalidraw MCP for hand-drawn style wireframes and diagrams
- Good for rapid iteration and architecture diagrams
- Export to PNG for review
- Store .excalidraw file or scene URI in `design_ref:`

**When provider is Figma:**
- Use Figma Write MCP tools for design creation
- Use Framelink MCP for reading existing designs and extracting specs
- Access styles and variables for token alignment
- Export via Figma export tools
- Store figma:// URI in `design_ref:`

### 4. Design Token Integration

When the active provider supports the `design_tokens` capability, the designer hat should:
1. Query the provider's design tokens (brand colors, typography, spacing) before starting design work
2. Use these tokens in the design spec and wireframes
3. Document the token mapping in `design-spec.md` so builders use the correct tokens

This connects to `knowledge.sh` which already synthesizes design knowledge — extend it to call provider token APIs when available.

### 5. Context Injection Enhancement (`plugin/hooks/inject-context.sh`)

The `format_providers_markdown()` function already generates a markdown table for providers. Enhance it to include:
- Provider capabilities (which operations are available)
- MCP tool hints (so the designer hat can find the right tools)
- Provider-specific instructions (from the three-tier merge)

### 6. Design Artifact Storage

Provider-native design files should be stored in `.ai-dlc/{intent}/designs/` (not mockups/) to distinguish them from wireframe previews:
- `.ai-dlc/{intent}/designs/unit-{NN}-{slug}.op` (OpenPencil)
- `.ai-dlc/{intent}/designs/unit-{NN}-{slug}.pen` (Pencil.dev)
- `.ai-dlc/{intent}/designs/unit-{NN}-{slug}.excalidraw` (Excalidraw)
- `.ai-dlc/{intent}/mockups/unit-{NN}-{slug}-design.png` (PNG export for review)

Cloud-only providers (Canva, Figma) don't produce local files — only the URI reference in unit frontmatter.

## Success Criteria
- [ ] Designer hat checks for available design providers before starting work
- [ ] When a provider is available, the hat creates designs using provider MCP tools or CLI
- [ ] Provider-native design artifacts are saved to `.ai-dlc/{intent}/designs/`
- [ ] PNG exports are saved to mockups/ for visual review
- [ ] Unit frontmatter `design_ref` is updated to point to provider-native artifact
- [ ] Design tokens from the provider are used when the `design_tokens` capability is available
- [ ] When no provider is available, existing behavior (text specs + HTML wireframes) works unchanged
- [ ] Context injection includes provider capabilities and MCP hints

## Risks
- **Context window pressure**: Per-provider instruction blocks add tokens to the hat context. Mitigation: only inject instructions for the active provider, not all providers.
- **MCP tool availability in execution context**: Builder agents spawned during execution may not have the same MCP connections. Mitigation: check tool availability at the start of each hat phase, not just during elaboration.
- **Design quality variance**: AI-generated designs via MCP may vary in quality across providers. Mitigation: the reviewer hat's visual fidelity gate catches quality issues; the designer hat iterates until approved.

## Boundaries
This unit does NOT handle: provider config/detection (unit-01), URI resolution (unit-02), elaboration wireframes (unit-03), visual review pipeline (unit-05), or provider schemas (unit-06). It only modifies the designer hat's behavior during execution.

## Notes
- The designer hat is only used in the `design` workflow (`planner → designer → reviewer`). Units with `discipline: design` auto-route to this workflow.
- The `knowledge.sh` library already has a `synthesize_design_knowledge()` function that could be extended to query provider design tokens.
- Provider-specific instruction blocks should be modular — stored as separate sections that the hat loads conditionally, not inline in the hat definition.

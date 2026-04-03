---
workflow: default
git:
  change_strategy: intent
  auto_merge: true
  auto_squash: false
announcements: []
passes: []
active_pass: ""
iterates_on: ""
created: 2026-04-01
status: completed
epic: ""
quality_gates:
  - name: build
    command: bun run build
  - name: lint
    command: bun run lint
---

# First-Class Design Providers

## Problem
AI-DLC's design tooling is limited to generating low-fidelity HTML wireframes during elaboration and producing text-based design specs during execution. The `resolve-design-ref.sh` explicitly stubs provider URI resolution. The settings schema only supports `figma` as a design provider type. This means agents cannot leverage the rich ecosystem of AI-controllable design tools (Canva, OpenPencil, Pencil.dev, Penpot, Excalidraw, Figma) that offer MCP servers, headless CLIs, and native design formats — tools that would produce dramatically higher-fidelity design outputs.

## Solution
Add a capability-based design provider abstraction that supports 6 external design tools through auto-detection and explicit configuration. Integrate providers into both the elaboration phase (wireframe generation) and execution phase (designer hat), with dual-mode visual review (present-for-review when creating from scratch, auto-compare when design_ref exists). HTML wireframes remain as the fallback when no provider is configured.

## Domain Model

### Entities
- **DesignProvider**: A configured design tool backend — Key fields: `type` (canva|openpencil|pencil|penpot|excalidraw|figma|auto), `config`, `capabilities`, `mcp_hint`, `uri_scheme`, `detected`
- **DesignCapability**: An atomic operation a provider can perform — Key fields: `name` (read_design|write_design|export_png|generate_wireframe|design_tokens|code_export|collaboration), `required_tools`, `fallback`
- **DesignArtifact**: A design file or reference produced by a provider — Key fields: `path` (local file or provider URI), `format`, `fidelity` (low|medium|high), `provider_type`, `exportable`
- **DesignProviderRegistry**: Runtime registry of available providers — Key fields: `configured_provider`, `detected_providers`, `active_provider`, `fallback_mode`
- **ProviderSchema**: JSON Schema for provider-specific config — Key fields: `provider_type`, `schema_path`
- **ProviderInstructions**: Merged three-tier instruction text — Key fields: `builtin`, `inline`, `project_override`

### Relationships
- DesignProviderRegistry has many DesignProviders (one configured, zero or more detected)
- DesignProvider has many DesignCapabilities
- DesignProvider has one ProviderSchema and one ProviderInstructions
- DesignArtifact belongs to one DesignProvider (or HTML fallback)
- Unit references DesignArtifact via `design_ref:` or `wireframe:` frontmatter

### Data Sources
- **Settings YAML** (`.ai-dlc/settings.yml`): Provider type, config, instructions
- **MCP Tool Registry** (runtime ToolSearch): Auto-detection of available providers
- **Provider Schemas** (`plugin/schemas/providers/*.schema.json`): Provider-specific config validation
- **Provider Instructions** (`plugin/providers/design.md`): Three-tier merged instructions
- **Unit Frontmatter**: `design_ref:`, `wireframe:`, `discipline:`, `views:` fields

### Data Gaps
- No `detect_design_provider()` function exists
- Only `figma.schema.json` provider schema exists; 5 new schemas needed
- `_provider_mcp_hint()` only maps figma; 6 new mappings needed
- Provider URI resolution stubbed in `resolve-design-ref.sh`
- No capability discovery mechanism
- HTML wireframe fallback chain is implicit

## Success Criteria
- [ ] Settings schema accepts all 7 design provider types (canva, openpencil, pencil, penpot, excalidraw, figma, auto) with provider-specific config schemas
- [ ] `detect_design_provider()` auto-detects available design providers via MCP tool patterns and CLI presence
- [ ] `_provider_mcp_hint()` maps all 6 provider types to their MCP tool glob patterns
- [ ] `resolve-design-ref.sh` handles provider URIs by calling provider export capabilities to produce PNG
- [ ] `elaborate-wireframes` skill delegates to configured design provider when available, falling back to HTML
- [ ] Designer hat discovers and uses available design tool MCP tools for native artifacts
- [ ] Visual review works in both modes: present-for-review and auto-compare
- [ ] Provider-native file formats (.op, .pen, .excalidraw) recognized and exported to PNG for comparison
- [ ] HTML wireframe generation continues as fallback when no design provider available
- [ ] All existing tests pass
- [ ] Provider instructions follow existing three-tier merge pattern
- [ ] Website docs updated to document design provider configuration

## Context
- Canva MCP is already connected with 37 tools via `mcp__claude_ai_Canva__*`
- The existing provider architecture (three-tier instructions, JSON Schema conditionals, auto-detect) provides a clear extension template
- Provider URI resolution in `resolve-design-ref.sh` is the critical convergence point — all 4 integration surfaces depend on it
- Providers differ significantly in capabilities (Framelink is read-only, Penpot needs browser, Canva is cloud-only) — capability-based model handles this heterogeneity
- JSON-based formats (.op, .pen, .excalidraw) are VCS-friendly; cloud-only formats (Canva, Figma) require URI references

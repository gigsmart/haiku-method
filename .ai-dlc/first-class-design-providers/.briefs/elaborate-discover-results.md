---
status: success
error_message: ""
---

# Discovery Results

## Domain Model Summary

### Entities
- **DesignProvider**: A configured design tool backend — Fields: type, config, instructions, capabilities, mcp_hint, uri_scheme, detected
- **DesignCapability**: An atomic operation a provider can perform — Fields: name (read_design|write_design|export_png|generate_wireframe|design_tokens|code_export|collaboration), required_tools, fallback
- **DesignArtifact**: A design file or reference produced by a provider — Fields: path, format, fidelity, provider_type, exportable
- **DesignProviderRegistry**: Runtime registry of available providers — Fields: configured_provider, detected_providers, active_provider, fallback_mode
- **ProviderSchema**: JSON Schema for provider-specific configuration — Fields: provider_type, schema_path, properties
- **ProviderInstructions**: Merged instruction text (three-tier: builtin, inline, project override)

### Relationships
- DesignProviderRegistry has many DesignProviders (one configured, zero or more detected)
- DesignProvider has many DesignCapabilities
- DesignProvider has one ProviderSchema and one ProviderInstructions
- DesignArtifact belongs to one DesignProvider (or HTML fallback)
- DesignArtifact is referenced by Unit via `design_ref:` or `wireframe:` frontmatter

### Data Sources
- **Settings YAML** (`.ai-dlc/settings.yml`): Provider type, config, instructions. Currently only supports `figma` enum value.
- **MCP Tool Registry** (runtime ToolSearch): Available MCP tools for auto-detection. Not cached.
- **Provider Schemas** (`plugin/schemas/providers/`): Only `figma.schema.json` exists. Five new schemas needed.
- **Provider Instructions** (`plugin/providers/design.md`): Generic instructions only. No provider-specific overrides.
- **Unit Frontmatter**: `design_ref:`, `wireframe:`, `discipline:`, `views:` fields.

### Data Gaps
- No auto-detection function for design providers (VCS hosting and CI/CD have these, design does not)
- Only Figma has a provider schema; 5 new schemas needed
- `_provider_mcp_hint()` only maps figma; 6 new mappings needed
- Provider URI resolution stubbed but not implemented in `resolve-design-ref.sh`
- No capability discovery mechanism to determine provider features at runtime
- HTML wireframe fallback chain is implicit, not codified

## Key Findings

- **Canva MCP is already connected** with 37 tools available via `mcp__claude_ai_Canva__*`. It supports full design generation, transactional editing, export, brand kits, and collaboration — making it the most immediately usable provider.
- **Six design tools researched**, all with MCP server support: Canva (remote, 37 tools), OpenPencil ZS (stdio/HTTP, CLI), OpenPencil OP (stdio/HTTP, 90+ tools, .fig compat), Pencil.dev (stdio/HTTP, headless CLI), Penpot (HTTP/WS, requires browser for canvas), Excalidraw (HTTP/stdio, hand-drawn style).
- **The existing provider architecture is extensible** — the three-tier instruction merge pattern, JSON Schema conditional refs, and auto-detect pattern provide a clear template for adding new providers.
- **Provider URI resolution is the critical gap** — `resolve-design-ref.sh` explicitly detects but stubs provider URIs. This is the single point where all four integration points converge: without URI resolution, design references can't be compared, reviewed, or resolved.
- **Capability heterogeneity is real** — providers differ in what they support (Framelink is read-only, Penpot needs browser, Canva is cloud-only). A capability-based model handles this better than a uniform interface.
- **File format split** — JSON-based formats (.op, .pen, .excalidraw) are VCS-friendly and can be committed. Cloud-only formats (Canva, Figma) require API access and URI references. Both need support.
- **Fallback to HTML wireframes must be explicit** — the current behavior (generate HTML wireframes regardless of provider) should become the documented fallback when no provider is available, not the only path.

## Open Questions

- Should all six providers be implemented in a single intent, or should the work be phased (e.g., Canva + Figma first since they have the most mature MCP, then the others)?
- For cloud-only providers (Canva, Figma), should design_ref URIs be persisted to unit frontmatter, or should a local export/cache be created?
- How should provider auto-detection handle multiple available providers? Precedence order? User prompt to choose?
- Should the design provider abstraction live in shell (config.sh extension) or TypeScript (MCP server extension), given that MCP tool discovery requires ToolSearch which is only available to agents, not shell scripts?
- For Penpot's browser-session requirement: should it be classified differently (e.g., `semi-headless`) and given different fallback behavior?
- How should the `auto` type handle environment differences (CI has no MCP tools, local dev does)?

## Mockups Generated

No UI mockups generated — this intent involves plugin infrastructure (provider abstraction, schema extensions, shell libraries), not user-facing interfaces.

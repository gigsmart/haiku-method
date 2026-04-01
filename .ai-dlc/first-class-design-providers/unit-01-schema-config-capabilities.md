---
status: completed
last_updated: "2026-04-01T19:15:23Z"
depends_on: []
branch: ai-dlc/first-class-design-providers/01-schema-config-capabilities
discipline: backend
pass: ""
workflow: ""
ticket: ""
design_ref: ""
views: []
hat: reviewer
---

# unit-01-schema-config-capabilities

## Description
Extend the AI-DLC settings schema and config.sh to support 6 design tool providers (Canva, OpenPencil, Pencil.dev, Penpot, Excalidraw, Figma) plus an `auto` type that auto-detects available providers. Implement a capability-based provider model so consuming units can check what operations a provider supports before attempting them.

## Discipline
backend - This unit will be executed by backend-focused agents.

## Domain Entities
- **DesignProvider**: Extends the existing `designProviderEntry` type enum from `["figma"]` to `["canva", "openpencil", "pencil", "penpot", "excalidraw", "figma", "auto"]`. Note: `openpencil` refers specifically to ZSeven-W/openpencil (MIT, .op JSON format, `op` CLI, 8-framework export). The separate open-pencil/open-pencil project (.fig format, Tauri app) is NOT included — it can be added as a separate provider type in a follow-up intent if needed.
- **DesignCapability**: New entity representing atomic operations (read_design, write_design, export_png, generate_wireframe, design_tokens, code_export, collaboration)
- **DesignProviderRegistry**: Runtime registry resolved from configured + detected providers

## Data Sources
- **settings.schema.json** (`plugin/schemas/settings.schema.json`): The `designProviderEntry` at line ~218-244 needs its `type.enum` extended and new `allOf` conditional refs added for each provider type
- **config.sh** (`plugin/lib/config.sh`): `_provider_mcp_hint()` at line ~346-369 needs 6 new MCP tool glob pattern mappings. `load_providers()` at line ~503-558 needs design provider auto-detection
- **MCP Tool Registry** (runtime ToolSearch): Used for auto-detection. Patterns: `mcp__*Canva*`, `mcp__*openpencil*`, `mcp__*pencil*`, `mcp__*penpot*`, `mcp__*excalidraw*`, `mcp__*figma*`

## Technical Specification

### 1. Settings Schema Extension (`plugin/schemas/settings.schema.json`)

Extend the `designProviderEntry.type.enum` from `["figma"]` to:
```json
["canva", "openpencil", "pencil", "penpot", "excalidraw", "figma", "auto"]
```

Add `allOf` conditional schema refs for each new provider type, following the existing pattern used for figma:
```json
{
  "if": { "properties": { "type": { "const": "canva" } } },
  "then": { "properties": { "config": { "$ref": "providers/canva.schema.json" } } }
}
```

### 2. MCP Hint Mappings (`plugin/lib/config.sh`)

Extend `_provider_mcp_hint()` with glob patterns for each provider:

| Provider | MCP Hint Pattern |
|----------|-----------------|
| canva | `mcp__*Canva*` |
| openpencil | `mcp__*openpencil*\|mcp__*open_pencil*` |
| pencil | `mcp__*pencil*` (exclude openpencil matches) |
| penpot | `mcp__*penpot*` |
| excalidraw | `mcp__*excalidraw*\|mcp__*Excalidraw*` |
| figma | `mcp__*figma*\|mcp__*Figma*` (already exists) |

### 3. Auto-Detection Function (`plugin/lib/config.sh`)

Create `detect_design_provider()` following the pattern of `detect_vcs_hosting()`:
- Check for explicitly configured provider in settings.yml first (return immediately if found)
- Check for MCP tools matching each provider's hint pattern (via `_provider_mcp_hint()`)
- Check for CLI tools in PATH (`op` for OpenPencil, `pencil` for Pencil.dev)
- Return the first detected provider, or empty string if none found
- When `type: auto`, call this function to resolve the active provider

Priority order for auto-detection: configured > canva (already connected) > figma > openpencil > pencil > penpot > excalidraw

### 4. Capability Registry (`plugin/lib/config.sh`)

Create `get_provider_capabilities()` that returns a JSON object of capabilities for a given provider type:

```bash
get_provider_capabilities() {
  local provider_type="$1"
  case "$provider_type" in
    canva)     echo '{"read_design":true,"write_design":true,"export_png":true,"generate_wireframe":true,"design_tokens":true}' ;;
    openpencil) echo '{"read_design":true,"write_design":true,"export_png":true,"generate_wireframe":true,"design_tokens":true}' ;;
    pencil)    echo '{"read_design":true,"write_design":true,"export_png":true,"generate_wireframe":true,"design_tokens":true}' ;;
    penpot)    echo '{"read_design":true,"write_design":false,"export_png":false,"generate_wireframe":false,"design_tokens":true,"requires_browser":true}' ;;
    excalidraw) echo '{"read_design":true,"write_design":true,"export_png":true,"generate_wireframe":true,"design_tokens":false}' ;;
    figma)     echo '{"read_design":true,"write_design":false,"export_png":true,"generate_wireframe":false,"design_tokens":true}' ;;
    *)         echo '{}' ;;
  esac
}
```

Create `provider_has_capability()` that checks a single capability:
```bash
provider_has_capability() {
  local provider_type="$1" capability="$2"
  local caps=$(get_provider_capabilities "$provider_type")
  echo "$caps" | jq -r --arg cap "$capability" '.[$cap] // false'
}
```

### 5. Provider URI Scheme Registry (`plugin/lib/config.sh`)

Create `get_provider_uri_scheme()` returning the URI prefix for a provider:

| Provider | URI Scheme |
|----------|-----------|
| canva | `canva://` |
| openpencil | `openpencil://` |
| pencil | `pencil://` |
| penpot | `penpot://` |
| excalidraw | `excalidraw://` |
| figma | `figma://` |

## Success Criteria
- [ ] `designProviderEntry.type.enum` in settings.schema.json includes all 7 values (canva, openpencil, pencil, penpot, excalidraw, figma, auto)
- [ ] `_provider_mcp_hint()` returns correct glob patterns for all 6 provider types
- [ ] `detect_design_provider()` returns the first available provider when type is `auto`
- [ ] `get_provider_capabilities()` returns correct capability JSON for all 6 provider types
- [ ] `provider_has_capability()` returns true/false for valid capability checks
- [ ] `get_provider_uri_scheme()` returns correct URI prefix for all 6 providers
- [ ] Settings schema validates correctly with `ajv` or equivalent for all provider types
- [ ] Existing `figma` provider configuration continues to work unchanged
- [ ] `detect_design_provider()` returns providers in documented priority order (canva > figma > openpencil > pencil > penpot > excalidraw) when multiple are available simultaneously

## Risks
- **MCP tool naming inconsistency**: Provider tools may use different naming conventions across Claude platform connectors vs local MCP servers. Mitigation: use broad glob patterns with `|` alternation.
- **Auto-detection false positives**: A tool like `pencil` CLI could match both Pencil.dev and OpenPencil. Mitigation: check OpenPencil-specific patterns first, then exclude from Pencil.dev match.
- **CLI binary name conflicts**: The `op` command collides with 1Password CLI. Mitigation: when `op` is found in PATH, run a version check (`op --version`) and verify the output contains "openpencil" before treating it as the OpenPencil CLI. Similarly verify `pencil --version` for Pencil.dev. The npm package `@pencil.dev/cli` may install as a different binary name — check the package bin field.

## Boundaries
This unit does NOT handle: URI resolution/export logic (unit-02), elaboration skill integration (unit-03), designer hat integration (unit-04), visual review integration (unit-05), or provider-specific schemas/instructions content (unit-06).

## Notes
- The `auto` type is the recommended default — it gives users zero-config design provider support when tools are available
- Capability model is intentionally static (hardcoded per provider type) rather than runtime-discovered, since provider capabilities are well-known and don't change dynamically
- The `code_export` and `collaboration` capabilities from the original research are excluded from this implementation — they are not exercised by any integration unit in this intent. They can be added in a follow-up.
- Figma defaults to `write_design:false` and `generate_wireframe:false` because the most common MCP (Framelink, 14K stars) is read-only. Users with Figma Write Server should override capabilities via provider config.
- Penpot defaults to `write_design:false`, `export_png:false`, `generate_wireframe:false` with `requires_browser:true` flag because write operations need an active browser session. When a browser session is active, these capabilities become available.
- The `format_providers_markdown()` function in config.sh generates the markdown table injected into hat context — it may need updating to include design provider capabilities

---
name: unit-02-design-ref-resolution
type: backend
status: completed
depends_on: []
bolt: 0
hat: ""
started_at: 2026-04-01T19:50:39Z
completed_at: 2026-04-01T19:50:39Z
---


# unit-02-design-ref-resolution

## Description
Extend `resolve-design-ref.sh` to handle provider URIs (canva://, figma://, openpencil://, etc.) and native design file formats (.op, .pen, .excalidraw) by calling provider export capabilities to produce PNG screenshots for visual comparison. This is the critical convergence point — all four integration surfaces (elaboration, execution, visual review, design reference) depend on URI resolution working.

## Discipline
backend - This unit will be executed by backend-focused agents.

## Domain Entities
- **DesignArtifact**: Design files or references that need resolution to PNG — local files (.op, .pen, .excalidraw, .html) or provider URIs (canva://design/xxx, figma://file/xxx)
- **DesignProvider**: Used to determine which export method to call for URI resolution

## Data Sources
- **resolve-design-ref.sh** (`plugin/lib/resolve-design-ref.sh`): The `_resolve_design_ref_field()` function at line ~106-158 handles `design_ref:` frontmatter. Provider URIs matching `^[a-z]+://` are detected at line ~117-119 but return error "provider URI not yet supported"
- **Unit Frontmatter**: `design_ref:` field contains either a local path or a provider URI
- **Provider config**: Loaded via `load_providers()` from config.sh — needed to know which provider's tools to call

## Technical Specification

### 1. Provider URI Resolution (`plugin/lib/resolve-design-ref.sh`)

Replace the stub at line ~117-119 with actual URI resolution. The function should:

1. Parse the URI scheme (e.g., `canva://` → provider type `canva`)
2. Extract the resource identifier (e.g., `canva://design/DAGFx12345` → design ID `DAGFx12345`)
3. Generate an agent instruction block that tells the calling agent how to export the design to PNG using the provider's MCP tools or CLI

**CRITICAL DESIGN DECISION**: `resolve-design-ref.sh` is a shell script called from other shell scripts and agent contexts. It cannot directly call MCP tools (those are only available to agents via ToolSearch). Instead of calling MCP tools directly, the resolution function should:
- For provider URIs: Output an **instruction block** that the calling agent executes to export the design
- For local native formats: Use CLI tools (if available) to export directly to PNG

### 2. URI Scheme Handlers

Each provider URI scheme maps to a resolution strategy:

| URI Scheme | Example | Resolution Strategy |
|------------|---------|-------------------|
| `canva://design/{id}` | `canva://design/DAGFx12345` | Agent instruction: call `mcp__claude_ai_Canva__export-design` with design ID → returns download URL → download file to `{screenshots_dir}/ref.png` |
| `figma://file/{key}` | `figma://file/abc123XYZ` | Agent instruction: call Figma MCP `download_figma_images` or `export-design`, save PNG |
| `openpencil://{path}` | `openpencil://designs/main.op` | CLI: `op export --format png --input {path} --output {screenshots_dir}/ref.png` OR agent instruction if CLI unavailable |
| `pencil://{path}` | `pencil://designs/dash.pen` | CLI: `pencil --in {path} --export png --out {screenshots_dir}/ref.png` OR agent instruction |
| `penpot://project/{pid}/file/{fid}` | `penpot://project/abc/file/def` | Agent instruction: call Penpot MCP export tool |
| `excalidraw://{id}` | `excalidraw://scene/abc123` | Agent instruction: call Excalidraw MCP export tool |

### 3. Native File Format Recognition

Extend `_resolve_design_ref_field()` to recognize native design file formats alongside existing png/jpg/html/webp:

| Extension | Provider | Resolution |
|-----------|----------|-----------|
| `.op` | OpenPencil | CLI export: `op export --format png` if `op` in PATH; else treat as high-fidelity ref with agent instruction |
| `.pen` | Pencil.dev | CLI export: `pencil --export png` if `pencil` in PATH; else agent instruction |
| `.excalidraw` | Excalidraw | Agent instruction to render via MCP; or parse JSON and render basic SVG |
| `.fig` | Figma/OpenPencil | Agent instruction — binary format, needs tool to export |

For CLI-resolvable formats: run the export command, write PNG to `{screenshots_dir}/ref-{unit_slug}.png`, return the path.

For formats requiring MCP tools: write an instruction file at `{screenshots_dir}/ref-{unit_slug}.instructions.md` containing the MCP tool call the agent should execute. The calling agent reads this file and performs the export.

### 4. Fallback Behavior

When a provider URI or native format cannot be resolved (CLI not available, MCP tool not connected):
1. Log warning: "Cannot resolve {uri_scheme} design reference — provider tools not available"
2. Skip the reference (do not fail the build)
3. Set fidelity to `none` in the comparison context (reviewer knows no reference was available)
4. Continue with any lower-priority references (previous iteration screenshots, wireframes)

### 5. Output Format

The resolution function should output a JSON object (consistent with existing behavior) containing:
```json
{
  "ref_path": "/path/to/ref-screenshot.png",
  "fidelity": "high",
  "source": "design_ref",
  "provider": "canva",
  "format": "png",
  "resolved_from": "canva://design/DAGFx12345",
  "needs_agent_export": true,
  "export_instructions": "path/to/ref-unit-slug.instructions.md"
}
```

The `needs_agent_export` flag tells the calling context whether the PNG is ready or requires an additional agent step to produce.

## Success Criteria
- [ ] Provider URIs (canva://, figma://, openpencil://, pencil://, penpot://, excalidraw://) no longer return "not yet supported" error
- [ ] Native file formats (.op, .pen, .excalidraw) are recognized and resolved to PNG when CLI tools are available
- [ ] When CLI tools are unavailable, instruction files are generated for agent-based export
- [ ] Fallback behavior gracefully skips unresolvable references without failing the build
- [ ] Resolution output includes provider type, fidelity level, and export instruction path
- [ ] Existing file-based resolution (png, jpg, html, webp, directory) continues to work unchanged
- [ ] The three-level priority hierarchy (design_ref > previous iteration > wireframe) is preserved
- [ ] Instruction file format is explicitly specified (YAML frontmatter with tool name, parameters, expected output path, timeout) and documented for consuming agents
- [ ] Exported PNG cache uses URI-derived hash naming (SHA-256 truncated to 8 hex chars) and invalidates on new bolt iteration

## Risks
- **CLI tool availability**: Headless export via CLI requires tools installed on the user's system. Mitigation: instruction file fallback for agent-based export.
- **Provider API rate limits**: Cloud providers (Canva, Figma) may rate-limit export calls. Mitigation: cache exported PNGs in screenshots dir; skip re-export if cached file exists and is newer than a threshold.
- **Large design files**: Exporting complex designs to PNG may be slow or produce very large files. Mitigation: support a `--scale` or `--quality` parameter to control output size.

## Boundaries
This unit does NOT handle: provider configuration or detection (unit-01), elaboration skill changes (unit-03), designer hat changes (unit-04), visual review workflow changes (unit-05), or provider schema/instruction content (unit-06). It only handles the resolution of design references to PNG for comparison.

## Notes
- The instruction file approach is a pragmatic bridge: shell scripts can't call MCP tools, but agents can. By writing instruction files, we let the shell script prepare everything and the agent execute the final step.
- Cached exports should use a naming convention like `ref-{unit_slug}-{hash}.png` where hash is derived from the URI to enable cache invalidation when the source design changes.
- The `comparison-context.json` consumer in `run-visual-comparison.sh` already handles the `ref_path` and `fidelity` fields — this unit extends the producer, not the consumer.

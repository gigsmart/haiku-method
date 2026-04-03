---
status: completed
last_updated: "2026-04-01T19:35:01Z"
depends_on:
  - unit-01-schema-config-capabilities
branch: ai-dlc/first-class-design-providers/06-provider-instructions-schemas
discipline: backend
pass: ""
workflow: ""
ticket: ""
design_ref: ""
views: []
hat: reviewer
---

# unit-06-provider-instructions-schemas

## Description
Create provider-specific JSON schemas for all 6 design tool types and update the design provider instructions to include provider-specific guidance. This unit populates the schema and instruction infrastructure that unit-01 wired up.

## Discipline
backend - This unit will be executed by backend-focused agents.

## Domain Entities
- **ProviderSchema**: JSON Schema files at `plugin/schemas/providers/{type}.schema.json` — one per provider type
- **ProviderInstructions**: The `plugin/providers/design.md` file with provider-specific instruction sections, plus optional per-provider override files

## Data Sources
- **figma.schema.json** (`plugin/schemas/providers/figma.schema.json`): The existing Figma provider schema — use as a template for new schemas
- **design.md** (`plugin/providers/design.md`): The existing generic design provider instructions — needs provider-specific sections added
- **settings.schema.json** (`plugin/schemas/settings.schema.json`): References provider schemas via `allOf` conditionals. Unit-01 adds the `if/then` refs; this unit creates the target schema files.

## Technical Specification

### 1. Provider JSON Schemas

Create 5 new JSON schema files (Figma already exists) at `plugin/schemas/providers/`:

**canva.schema.json:**
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "brand_kit_id": {
      "type": "string",
      "description": "Canva Brand Kit ID to use for design token alignment"
    },
    "default_folder": {
      "type": "string",
      "description": "Canva folder to organize generated designs in"
    },
    "export_format": {
      "type": "string",
      "enum": ["png", "jpg", "pdf"],
      "default": "png",
      "description": "Default export format for design previews"
    }
  },
  "additionalProperties": false
}
```

**openpencil.schema.json:**
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "cli_path": {
      "type": "string",
      "description": "Path to the `op` CLI binary (if not in PATH)"
    },
    "default_export_target": {
      "type": "string",
      "enum": ["react", "vue", "svelte", "html", "flutter", "swiftui", "compose", "react-native"],
      "default": "react",
      "description": "Default framework for code export"
    },
    "mcp_transport": {
      "type": "string",
      "enum": ["stdio", "http"],
      "default": "stdio",
      "description": "MCP server transport mode"
    }
  },
  "additionalProperties": false
}
```

**pencil.schema.json:**
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "cli_path": {
      "type": "string",
      "description": "Path to the `pencil` CLI binary (if not in PATH)"
    },
    "mcp_port": {
      "type": "integer",
      "default": 3100,
      "description": "Port for Pencil.dev MCP server"
    },
    "model": {
      "type": "string",
      "default": "claude-opus-4-6",
      "description": "AI model for CLI design generation"
    }
  },
  "additionalProperties": false
}
```

**penpot.schema.json:**
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "instance_url": {
      "type": "string",
      "format": "uri",
      "description": "URL of the Penpot instance (e.g., https://design.penpot.app or self-hosted URL)"
    },
    "project_id": {
      "type": "string",
      "description": "Penpot project ID for organizing design files"
    },
    "mcp_port": {
      "type": "integer",
      "default": 4401,
      "description": "Port for Penpot MCP server"
    }
  },
  "additionalProperties": false
}
```

**excalidraw.schema.json:**
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "mcp_mode": {
      "type": "string",
      "enum": ["remote", "local"],
      "default": "remote",
      "description": "Use remote MCP server (mcp.excalidraw.com) or local stdio"
    },
    "style": {
      "type": "string",
      "enum": ["hand-drawn", "architect", "artist", "cartoonist"],
      "default": "hand-drawn",
      "description": "Excalidraw visual style for generated diagrams"
    }
  },
  "additionalProperties": false
}
```

### 2. Provider Instructions Update (`plugin/providers/design.md`)

Update the design provider instructions to include provider-specific sections. The three-tier merge system means:
- Built-in instructions (this file) provide defaults
- Inline instructions in settings.yml can override
- Project-level `.ai-dlc/providers/{type}.md` files can further override

Add conditional sections for each provider after the existing generic instructions:

```markdown
## Provider-Specific Instructions

### When provider is `canva`
- Use `generate-design-structured` for precise control over layout and content
- Always check brand kit alignment via `list-brand-kits` before generating designs
- Use transactional editing for modifications — never attempt direct canvas manipulation
- Export previews as PNG for review; use PDF for print deliverables
- Store Canva design URLs in `design_ref` as `canva://design/{id}`

### When provider is `openpencil`
- Prefer the layered MCP workflow: `design_skeleton` → `design_content` → `design_refine`
- Use the CLI `op design` for batch/headless generation
- Export to the framework matching the project's frontend stack via `op export`
- Commit .op files to the repo — they are JSON and version-control friendly
- Store local file paths in `design_ref`

### When provider is `pencil`
- Use the MCP server tools when Pencil is running in the IDE
- Use the CLI with `--out` for headless batch design generation
- Export to PNG/JPEG for review; use SVG for scalable assets
- Commit .pen files to the repo — they are JSON and version-control friendly
- Store local file paths in `design_ref`

### When provider is `penpot`
- Penpot requires a browser session — ensure the Penpot plugin is loaded before using MCP tools
- Use the official MCP server (`@penpot/mcp`) for design operations
- Access design tokens via the Penpot variables system
- Penpot is SVG-native — designs export cleanly to web formats
- Store Penpot project/file URIs in `design_ref` as `penpot://project/{id}/file/{id}`

### When provider is `excalidraw`
- Best for quick wireframes, architecture diagrams, and flow charts — not for high-fidelity UI design
- Use the hand-drawn style for rapid iteration; switch to architect style for cleaner output
- The community MCP toolkit (mcp_excalidraw) has a feedback loop: AI can screenshot its own work to verify
- Commit .excalidraw files to the repo — they are JSON and version-control friendly
- Store local file paths or scene URIs in `design_ref`

### When provider is `figma`
- Use Framelink MCP (read-only) for extracting design specs from existing Figma files
- Use Figma Write Server or Official MCP for creating new designs (requires Figma Desktop)
- Access styles and variables for design token alignment
- Store Figma file URIs in `design_ref` as `figma://file/{key}`
```

### 3. Frontmatter Enhancement for design.md

Update the frontmatter of `plugin/providers/design.md` to document all supported provider types:

```yaml
---
name: Design Provider
category: design
supported_types:
  - canva
  - openpencil
  - pencil
  - penpot
  - excalidraw
  - figma
default_type: auto
---
```

## Success Criteria
- [ ] 5 new JSON schema files created (canva, openpencil, pencil, penpot, excalidraw) following the existing figma.schema.json pattern
- [ ] Each schema defines provider-specific config properties with descriptions and defaults
- [ ] design.md includes provider-specific instruction sections for all 6 providers
- [ ] Provider instructions cover: design creation, editing, token access, export, and design_ref storage
- [ ] Schemas validate correctly — each provider's config properties are accepted by the schema
- [ ] The existing figma.schema.json is unchanged (backward compatible)
- [ ] design.md frontmatter documents all supported types

## Risks
- **Schema accuracy**: Provider config properties may not match actual tool configuration needs (e.g., OpenPencil may need additional config fields not yet known). Mitigation: keep schemas minimal with `additionalProperties: false` that can be relaxed later; start with well-documented fields only.
- **Instruction staleness**: Provider-specific instructions may become outdated as tools evolve. Mitigation: instructions reference capability names rather than specific tool versions; the three-tier merge system lets projects override stale built-in instructions.

## Boundaries
This unit does NOT handle: schema wiring in settings.schema.json (unit-01), URI resolution (unit-02), elaboration/execution integration (units 03, 04), visual review (unit-05), or website docs (unit-07). It only creates the schema files and updates provider instructions.

## Notes
- Schema files must be valid JSON Schema draft 2020-12 to match the existing figma.schema.json
- The three-tier instruction system means provider instructions are a starting point — projects can customize via `.ai-dlc/providers/canva.md` etc.
- Each schema should be minimal — only include config fields that are actually needed for the provider to function. Avoid speculative fields.

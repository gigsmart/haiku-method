---
title: Design Providers
description: Configure and use design providers — Canva, Figma, OpenPencil, Pencil, Penpot, and Excalidraw
order: 10
---

AI-DLC supports six design providers, each connecting your workflow to a different design tool through MCP (Model Context Protocol). Design providers enable automatic design reference resolution, component spec lookups, and asset exports during elaboration and execution.

## Supported Providers

| Provider | Type | License | Best For |
|----------|------|---------|----------|
| **Canva** | Cloud | Commercial | Brand-focused design, marketing assets, team templates |
| **Figma** | Cloud | Commercial | Component systems, design tokens, collaborative UI design |
| **OpenPencil** | Local/Cloud | Open source | Code-first design, multi-framework export |
| **Pencil** | Local | Open source | Lightweight design with AI generation |
| **Penpot** | Self-hosted/Cloud | Open source | Self-hosted design, SVG-native workflows |
| **Excalidraw** | Local/Cloud | Open source | Quick diagrams, architecture sketches, low-fidelity wireframes |

## Configuration

Set your design provider in `.ai-dlc/settings.yml`:

```yaml
providers:
  design:
    type: figma
    config:
      project_id: "your-project-id"
      team_id: "your-team-id"
      file_key: "your-file-key"
    instructions: |
      - Only reference designs marked "Ready for Dev"
      - Export at 2x for retina displays
```

### Auto-Detection

Set `type: auto` (the default) and AI-DLC detects your provider from available MCP tools:

```yaml
providers:
  design:
    type: auto
```

Detection checks for MCP tools in this priority order:

1. **Canva** — `mcp__*Canva*`
2. **Figma** — `mcp__*figma*` or `mcp__*Figma*`
3. **OpenPencil** — `mcp__*openpencil*` or `mcp__*open_pencil*`
4. **Pencil** — `mcp__*pencil*`
5. **Penpot** — `mcp__*penpot*`
6. **Excalidraw** — `mcp__*excalidraw*` or `mcp__*Excalidraw*`

The first matching provider wins. If no MCP tools are detected, design provider features are skipped silently.

## Capability Reference

Not all providers support the same operations. AI-DLC checks capabilities before attempting provider-specific actions.

| Capability | Canva | Figma | OpenPencil | Pencil | Penpot | Excalidraw |
|------------|-------|-------|------------|--------|--------|------------|
| **read** | yes | yes | yes | yes | yes | yes |
| **write** | yes | yes | yes | yes | yes | yes |
| **export** | yes | yes | yes | yes | yes | yes |
| **comment** | yes | yes | — | — | yes | — |
| **components** | — | yes | — | — | yes | — |
| **variables** | — | yes | yes | yes | — | — |
| **prototyping** | — | yes | — | — | yes | — |
| **generate** | yes | — | yes | yes | — | — |

**What these mean:**

- **read/write** — View and modify design files
- **export** — Export assets (PNG, SVG, PDF, etc.)
- **comment** — Read and write design comments
- **components** — Access reusable component libraries
- **variables** — Read and write design tokens/variables
- **prototyping** — Access interactive prototype flows
- **generate** — AI-powered design generation

## Design References

Each provider uses a URI scheme for storing design references in unit frontmatter:

| Provider | URI Format | Example |
|----------|-----------|---------|
| Canva | `canva://<design_id>` | `canva://DAFx1234#page=2` |
| Figma | `figma://<file_key>` | `figma://abc123#node=1:42` |
| OpenPencil | `openpencil://<document_id>` | `openpencil://doc-456#node=btn-1` |
| Pencil | `pencil://<document_id>` | `pencil://doc-789#node=header` |
| Penpot | `penpot://<host>/<project>/<file>` | `penpot://app.penpot.app/proj-1/file-2#component=btn` |
| Excalidraw | `excalidraw://<drawing_id>` | `excalidraw://drawing-1` or `excalidraw://local/path.excalidraw` |

References are stored in unit `design_ref` fields and resolved automatically during execution.

## Provider Setup

### Canva

**MCP server:** Canva MCP (available through Claude Code integrations)

```yaml
providers:
  design:
    type: canva
    config:
      team_id: "your-team-id"
      brand_kit_id: "your-brand-kit-id"
      default_folder: "AI-DLC Designs"
      export_format: png        # png, jpg, or pdf
```

**Config options:**

| Field | Description |
|-------|-------------|
| `team_id` | Canva team ID |
| `brand_kit_id` | Brand Kit ID for consistent branding |
| `folder_id` | Canva folder ID |
| `default_folder` | Default folder path for new designs |
| `export_format` | Export format: `png` (default), `jpg`, or `pdf` |

**How AI-DLC uses Canva:**

- Creates designs using brand kit styling
- Organizes designs into the configured folder
- Uses the editing transaction workflow: start → perform operations → commit
- Exports in the configured format

### Figma

**MCP server:** Figma MCP

```yaml
providers:
  design:
    type: figma
    config:
      project_id: "your-project-id"
      team_id: "your-team-id"
      file_key: "your-file-key"
```

**Config options:**

| Field | Description |
|-------|-------------|
| `project_id` | Figma project ID |
| `team_id` | Figma team ID |
| `file_key` | Primary design file key |

**How AI-DLC uses Figma:**

- References design specs for implementation
- Accesses components, variables, and styles through the Figma API
- Exports assets at specified scales (1x, 2x, 3x)
- Supports branch-specific references via `figma://<file_key>?branch=<branch_key>`

### OpenPencil

**MCP server:** OpenPencil MCP

```yaml
providers:
  design:
    type: openpencil
    config:
      project_id: "your-project-id"
      document_id: "your-document-id"
      default_export_target: react    # react, vue, svelte, html, flutter, swiftui, compose, react-native
```

**Config options:**

| Field | Description |
|-------|-------------|
| `project_id` | OpenPencil project ID |
| `document_id` | OpenPencil document ID |
| `cli_path` | Path to OpenPencil CLI binary |
| `default_export_target` | Framework target: `react` (default), `vue`, `svelte`, `html`, `flutter`, `swiftui`, `compose`, `react-native` |
| `mcp_transport` | MCP transport: `stdio` (default) or `http` |

**How AI-DLC uses OpenPencil:**

- Creates designs with `design_skeleton` → `design_content` → `design_refine`
- Reads and writes design tokens via `get_variables` / `set_variables`
- Exports to your framework target (supports 8 frameworks)
- Applies theme presets for consistent styling

### Pencil

**MCP server:** Pencil MCP

```yaml
providers:
  design:
    type: pencil
    config:
      project_id: "your-project-id"
      document_id: "your-document-id"
      mcp_port: 3100
```

**Config options:**

| Field | Description |
|-------|-------------|
| `project_id` | Pencil project ID |
| `document_id` | Pencil document ID |
| `cli_path` | Path to Pencil CLI binary |
| `mcp_port` | MCP server port (default: `3100`) |
| `model` | AI model for generation (default: `claude-opus-4-6`) |

**How AI-DLC uses Pencil:**

- Creates designs with `batch_design` for efficient multi-element creation
- Uses `get_guidelines` to understand design system constraints
- Reads and writes design tokens via `get_variables` / `set_variables`
- Uses `get_screenshot` for quick visual verification

### Penpot

**MCP server:** Penpot MCP

```yaml
providers:
  design:
    type: penpot
    config:
      instance_url: "https://design.penpot.app"
      project_id: "your-project-id"
      mcp_port: 4401
```

**Config options:**

| Field | Description |
|-------|-------------|
| `instance_url` | URL of the Penpot instance |
| `project_id` | Penpot project ID |
| `team_id` | Penpot team ID |
| `file_id` | Penpot file ID |
| `mcp_port` | MCP server port (default: `4401`) |

**How AI-DLC uses Penpot:**

- Accesses designs through the configured instance
- Leverages Penpot's native component and library system
- Exports as SVG, PNG, or PDF
- URI includes instance host for multi-instance support

### Excalidraw

**MCP server:** Excalidraw MCP

```yaml
providers:
  design:
    type: excalidraw
    config:
      mcp_mode: remote
      style: hand-drawn
```

**Config options:**

| Field | Description |
|-------|-------------|
| `file_path` | Path to `.excalidraw` file or directory |
| `mcp_mode` | Mode: `remote` (default) or `local` |
| `style` | Drawing style: `hand-drawn` (default), `architect`, `artist`, `cartoonist` |

**How AI-DLC uses Excalidraw:**

- Creates quick diagrams and architecture sketches
- Applies the configured drawing style consistently
- Exports as SVG or PNG
- Local mode files (`.excalidraw`) can be version-controlled directly

## How Providers Are Used

### During Elaboration

The design provider pulls existing designs, components, and mockups relevant to the intent. When generating wireframes (elaboration Phase 6.25), it references component names from the design system.

### During Building

The builder hat references design specs for UI implementation and verifies component usage matches the design system.

### During Review

The reviewer cross-references UI implementation against design specs from the provider.

### Graceful Degradation

Design provider interactions are advisory. If MCP tools aren't available for a configured provider, AI-DLC skips the integration silently. Missing providers never block your workflow.

## Three-Tier Instructions

Design provider behavior is customized through three tiers of instructions, merged at runtime:

1. **Built-in defaults** — Ship with the plugin. Cover universal behaviors for each provider.
2. **Inline instructions** — The `instructions:` field in your settings.yml.
3. **Project overrides** — Markdown file at `.ai-dlc/providers/design.md`.

Later tiers supplement earlier ones. For detailed customization, create a project-level override:

```markdown
---
provider: figma
type: design
---

# Design Provider Conventions

## Required
- Only reference frames marked "Ready for Dev"
- Export at 2x for all raster assets
- Use component variants, not detached instances

## Naming
- Frame names: "{Feature} - {Viewport} - {State}"
- Component names: PascalCase matching React component names
```

## Next Steps

- **[Providers](/docs/providers/)** — Overview of all provider categories
- **[Designer Guide](/docs/guide-designer/)** — Working with design in AI-DLC
- **[Workflows](/docs/workflows/)** — The design workflow and per-unit workflows
- **[Tech Lead Guide](/docs/guide-tech-lead/)** — Configuring providers for your team

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

# Design Provider — Default Instructions

## During Elaboration
- Pull existing designs, components, and mockups relevant to the intent
- Reference design files in unit Technical Specification sections
- When generating wireframes (Phase 6.25), reference component names from the design system in HTML comments but maintain low-fidelity aesthetic

## During Building
- Reference design specs for UI implementation
- Verify component usage matches design system

## During Review
- Cross-reference UI implementation against design specs

## Provider-Specific Instructions

### Canva

**Design creation:** Use the Canva MCP tools to create designs. Leverage brand kits (`brand_kit_id`) for consistent styling. Organize new designs into the configured `default_folder`.

**Editing:** Start an editing transaction, perform batch operations, then commit. Use `start-editing-transaction` → `perform-editing-operations` → `commit-editing-transaction` workflow. Never leave transactions uncommitted.

**Token/variable access:** Access brand colors, fonts, and logos through the Brand Kit API (`list-brand-kits`, `get-assets`). Map design tokens from the brand kit to implementation variables.

**Export:** Export using the configured `export_format` (default: png). Use `export-design` with the appropriate format. For multi-page designs, export individual pages as needed.

**design_ref storage:** Store as `canva://<design_id>` — the design ID from Canva's API. Include page references as `canva://<design_id>#page=<n>` when referencing specific pages.

### OpenPencil

**Design creation:** Use the OpenPencil MCP tools to create designs. Start with `design_skeleton` for layout structure, then populate with `design_content`. Use `design_refine` for iterative improvements.

**Editing:** Modify designs through `update_node`, `replace_node`, and `insert_node` operations. Use `batch_design` for multiple changes in a single operation. Retrieve current state with `get_design_md` before making changes.

**Token/variable access:** Use `get_variables` to read design tokens and `set_variables` to update them. Variables cover colors, spacing, typography, and component-level tokens. Apply theme presets with `load_theme_preset`.

**Export:** Export to the configured `default_export_target` framework (default: react). Use `export_nodes` to export specific components or `export_design_md` for the full design as markdown. Supports 8 framework targets.

**design_ref storage:** Store as `openpencil://<document_id>` — the document identifier from the OpenPencil instance. Reference specific nodes as `openpencil://<document_id>#node=<node_id>`.

### Pencil

**Design creation:** Use the Pencil MCP tools to create designs. Start with `batch_design` for efficient multi-element creation. Use `get_guidelines` to understand the design system constraints before creating.

**Editing:** Modify elements through `replace_all_matching_properties` for bulk style changes or `batch_design` for structural changes. Use `search_all_unique_properties` to discover existing patterns before editing. Always `get_editor_state` first to understand current canvas state.

**Token/variable access:** Use `get_variables` to read design tokens and `set_variables` to update them. Reference the guidelines (`get_guidelines`) for the design system's token definitions.

**Export:** Export components with `export_nodes`. Use `get_screenshot` for quick visual verification during development. Export targets are determined by the implementation stack.

**design_ref storage:** Store as `pencil://<document_id>` — the document identifier from the Pencil instance. Reference specific elements as `pencil://<document_id>#node=<node_id>`.

### Penpot

**Design creation:** Use the Penpot MCP tools via the configured `instance_url`. Create designs within the specified `project_id`. Penpot supports components, design tokens, and collaborative editing natively.

**Editing:** Access the Penpot API through the MCP server on the configured `mcp_port` (default: 4401). Modify designs using Penpot's component and layer structure. Leverage Penpot's built-in version history for change tracking.

**Token/variable access:** Access Penpot's design tokens through the library system. Penpot supports color, typography, and component libraries at the project level. Sync tokens between Penpot libraries and implementation variables.

**Export:** Export assets through Penpot's export API. Supports SVG, PNG, and PDF formats. Export individual components or full pages. Use SVG for scalable assets, PNG for rasterized previews.

**design_ref storage:** Store as `penpot://<instance_host>/<project_id>/<file_id>` — includes the instance host for multi-instance support. Reference specific components as `penpot://<instance_host>/<project_id>/<file_id>#component=<id>`.

### Excalidraw

**Design creation:** Use the Excalidraw MCP tools in the configured `mcp_mode` (default: remote). Apply the configured `style` (default: hand-drawn) for consistent aesthetics. Excalidraw excels at quick diagrams, architecture sketches, and low-fidelity wireframes.

**Editing:** Modify drawings through the Excalidraw API. Elements are JSON-based and support direct manipulation. Use Excalidraw's grouping and frame features to organize complex drawings.

**Token/variable access:** Excalidraw uses a simplified token model — primarily stroke colors, fill colors, font families, and stroke widths. Map project design tokens to Excalidraw's style properties. Use the style preset (hand-drawn/architect/artist/cartoonist) as the base.

**Export:** Export as SVG for vector output or PNG for rasterized output. Excalidraw's native format (.excalidraw) is JSON and can be version-controlled directly. Export with background or transparent as needed.

**design_ref storage:** Store as `excalidraw://<drawing_id>` for remote mode or `excalidraw://local/<file_path>` for local mode. Local mode files (.excalidraw) can be committed to the repository directly.

### Figma

**Design creation:** Use the Figma API to create and manage designs. Organize within the configured `project_id` and `team_id`. Leverage Figma's component and auto-layout system for responsive designs.

**Editing:** Edit through the Figma API using the `file_key` to identify the design file. Use Figma's branching feature for non-destructive design iterations. Apply changes through component overrides and variant swapping.

**Token/variable access:** Access Figma Variables API for design tokens — colors, spacing, typography, and component properties. Sync Figma variables with implementation tokens. Use Figma's published styles and local styles for team-wide consistency.

**Export:** Export through the Figma Export API. Supports SVG, PNG, JPG, and PDF. Export at specified scales (1x, 2x, 3x) for responsive assets. Use node IDs to export specific components or frames.

**design_ref storage:** Store as `figma://<file_key>` — the file key from Figma's URL. Reference specific nodes as `figma://<file_key>#node=<node_id>`. For branch-specific references, use `figma://<file_key>?branch=<branch_key>#node=<node_id>`.

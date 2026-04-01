---
intent_slug: first-class-design-providers
worktree_path: /Volumes/dev/src/github.com/thebushidocollective/ai-dlc/.ai-dlc/worktrees/first-class-design-providers
---

# Intent

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
status: active
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

# Units

## unit-01-schema-config-capabilities.md
depends_on: []
discipline: backend
Schema extensions, config.sh (provider types, auto-detection, MCP hints, capability registry, URI scheme registry). 8 success criteria. Foundational unit.

## unit-02-design-ref-resolution.md
depends_on: [unit-01-schema-config-capabilities]
discipline: backend
URI scheme handlers for all 6 providers, native format recognition (.op, .pen, .excalidraw), CLI export when available, instruction file fallback for MCP-based export. 7 success criteria.

## unit-03-elaboration-integration.md
depends_on: [unit-01-schema-config-capabilities, unit-02-design-ref-resolution]
discipline: backend
elaborate-wireframes skill provider delegation, per-provider generation instructions, fallback chain, dual output. 8 success criteria.

## unit-04-designer-hat-integration.md
depends_on: [unit-01-schema-config-capabilities, unit-02-design-ref-resolution]
discipline: backend
Designer hat discovery step, provider-aware design creation, per-provider MCP/CLI instructions, design token integration. 8 success criteria.

## unit-05-visual-review-integration.md
depends_on: [unit-01-schema-config-capabilities, unit-02-design-ref-resolution]
discipline: backend
Both review modes (present-for-review + auto-compare), visual gate enhancement, comparison pipeline updates, reviewer hat provider-awareness. 8 success criteria.

## unit-06-provider-instructions-schemas.md
depends_on: [unit-01-schema-config-capabilities]
discipline: backend
5 new JSON schemas, provider-specific instruction sections in design.md. 7 success criteria.

## unit-07-website-docs.md
depends_on: [unit-02, unit-03, unit-04, unit-05, unit-06]
discipline: documentation
New design providers guide, provider comparison table, config examples, updates to existing docs. 7 success criteria.

# Discovery Context

See .ai-dlc/first-class-design-providers/discovery.md for full discovery log including codebase patterns, provider architecture, wireframe pipeline, MCP ecosystem research, and domain model.

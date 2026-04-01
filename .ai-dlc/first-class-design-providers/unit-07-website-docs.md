---
status: completed
last_updated: "2026-04-01T20:31:38Z"
depends_on:
  - unit-01-schema-config-capabilities
  - unit-02-design-ref-resolution
  - unit-03-elaboration-integration
  - unit-04-designer-hat-integration
  - unit-05-visual-review-integration
  - unit-06-provider-instructions-schemas
branch: ai-dlc/first-class-design-providers/07-website-docs
discipline: documentation
pass: ""
workflow: ""
ticket: ""
design_ref: ""
views: []
hat: reviewer
retries: 1
---

# unit-07-website-docs

## Description
Update the AI-DLC website documentation to cover design provider configuration, supported tools, capability model, and usage patterns. Users need to know how to configure and use design providers in their projects.

## Discipline
documentation - This unit will be executed by documentation-focused agents.

## Domain Entities
- **DesignProvider**: All 6 supported providers need documentation with setup instructions
- **DesignCapability**: The capability model needs explanation so users understand what each provider offers
- **DesignProviderRegistry**: Auto-detection behavior needs documentation

## Data Sources
- **website/content/docs/**: Existing documentation structure. Key files:
  - `concepts.md` — AI-DLC concepts reference
  - `workflows.md` — Workflow documentation
  - `guide-designer.md` — Designer guide
  - `guide-tech-lead.md` — Tech lead guide
- **plugin/providers/design.md**: Provider instructions (source of truth for provider behavior)
- **plugin/schemas/providers/*.schema.json**: Provider config schemas (source of truth for config fields)

## Technical Specification

### 1. New Documentation Page: Design Providers Guide

Create `website/content/docs/guide-design-providers.md` covering:

**Introduction:**
- What design providers are and why they matter (higher fidelity than HTML wireframes)
- The capability model — not all providers support all operations
- Auto-detection — zero-config when tools are already connected

**Provider Comparison Table:**

| Provider | License | Headless | MCP | CLI | Code Export | Best For |
|----------|---------|----------|-----|-----|-------------|----------|
| Canva | Commercial | Yes | Yes (platform) | No | No | Template-based designs, brand alignment |
| OpenPencil | MIT | Yes | Yes | Yes (`op`) | 8 frameworks | Open-source, multi-framework projects |
| Pencil.dev | Commercial | Yes | Yes | Yes (`pencil`) | React/HTML | IDE-integrated design workflow |
| Penpot | MPL-2.0 | Partial | Yes | No | No | Open-source, self-hosted, Figma alternative |
| Excalidraw | -- | Yes | Yes | No | No | Quick wireframes, architecture diagrams |
| Figma | Commercial | Partial | Yes (multiple) | No | Yes | Industry standard, team collaboration |

**Configuration:**
```yaml
# .ai-dlc/settings.yml
providers:
  design:
    type: auto          # auto-detect available provider
    # type: canva       # or explicitly set one
    config:             # provider-specific config
      brand_kit_id: "abc123"
```

Show config examples for each provider type, referencing the schema docs.

**Capability Reference:**
Document each capability (read_design, write_design, export_png, generate_wireframe, design_tokens, code_export, collaboration) with which providers support it.

**Usage in Elaboration:**
- How wireframe generation changes when a provider is available
- The fallback chain: configured provider → auto-detected → HTML wireframes
- Dual output: provider-native + HTML for universal viewing

**Usage in Execution:**
- How the designer hat uses providers to create designs
- Design token integration
- Design artifact storage conventions

**Design Reference Resolution:**
- How `design_ref:` works with provider URIs
- Supported file formats and URI schemes
- PNG export for visual comparison

### 2. Update Existing Pages

**concepts.md:** Add a "Design Providers" section explaining the provider abstraction, capability model, and auto-detection.

**guide-designer.md:** Add a section on "Using Design Tools" explaining how the designer hat interacts with providers and what changes when a provider is available vs not.

**guide-tech-lead.md:** Add a section on "Configuring Design Providers" for setup guidance — which providers to choose, how to configure, and how auto-detection works.

**workflows.md:** Update the `design` workflow documentation to mention provider integration.

### 3. Documentation Standards

- All code examples must be valid YAML/JSON matching the actual schemas
- Provider-specific config examples must match the corresponding `.schema.json` file
- Feature descriptions must match actual plugin behavior (not aspirational)
- Include "Prerequisites" sections noting what needs to be installed for each provider
- Include "Troubleshooting" tips for common setup issues (MCP not connecting, CLI not found, etc.)

## Success Criteria
- [ ] New `guide-design-providers.md` page covers all 6 providers with setup instructions
- [ ] Provider comparison table accurately reflects capabilities
- [ ] Configuration examples match the JSON schemas from unit-06
- [ ] Capability reference documents which providers support which operations
- [ ] Existing docs (concepts.md, guide-designer.md, guide-tech-lead.md, workflows.md) updated with provider references
- [ ] All code examples are valid and match actual implementation
- [ ] Documentation follows existing site conventions (frontmatter, heading structure, linking)

## Risks
- **Documentation drift**: Docs could become stale if provider capabilities change. Mitigation: reference schemas as source of truth; include "last updated" frontmatter.
- **Over-documentation**: Too much detail per provider could be overwhelming. Mitigation: keep the main guide focused on common setup patterns; link to external provider docs for deep configuration.

## Boundaries
This unit does NOT handle: any plugin code changes (units 01-06). It only creates and updates website documentation.

## Notes
- The website is a Next.js 15 static site. Documentation lives in `website/content/docs/` as markdown files.
- Follow existing doc conventions: frontmatter with title/description, heading hierarchy, code blocks with language tags.
- The sync check rule applies: claims about the plugin must be accurate to the implementation.

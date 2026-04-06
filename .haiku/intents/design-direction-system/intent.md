---
title: "Design Direction System & Project Knowledge Layer"
studio: software
stages: [inception, design, product, development, operations, security]
mode: continuous
active_stage: development
status: completed
started_at: 2026-03-31T22:08:00Z
completed_at: 2026-04-01T13:21:44Z
---


# Design Direction System & Project Knowledge Layer

## Problem
AI-generated interfaces converge on the same visual patterns — the same sidebar+header+card-grid layout, the same Tailwind-default aesthetic, the same component choices. Every AI-built product looks like every other AI-built product. There's no mechanism for injecting genuine design variation, and no persistent knowledge layer to accumulate project-specific design decisions, architectural conventions, or domain understanding across intents.

## Solution
Introduce a two-part system:

1. **Design Direction System** — During elaboration of greenfield projects, present a visual design direction picker (browser-based, via MCP server) where users browse design archetypes (Brutalist, Editorial, Dense/Utilitarian, Playful/Warm), tune parameters (Density, Expressiveness, Shape Language, Color Mood), and choose a direction. The chosen direction produces a design blueprint that drives styled wireframe generation.

2. **Project Knowledge Layer** — A persistent `.ai-dlc/knowledge/` directory that accumulates project intelligence across intents. Five knowledge artifact types: `design.md`, `architecture.md`, `product.md`, `conventions.md`, `domain.md`. For greenfield projects, the design direction picker seeds `design.md`. For brownfield projects, a reverse-engineering pass synthesizes knowledge artifacts from existing code patterns. Hats and skills read these artifacts for context.

Design belongs in elaboration (forethought), not construction (afterthought). The knowledge layer ensures every subsequent intent builds on accumulated understanding rather than starting from zero.

## Domain Model

### Entities
- **DesignArchetype**: Named design direction template — Fields: name, description, cssTokens, layoutGuidelines, typographyRules, componentGuidelines, previewHtml
- **DesignParameter**: Tunable axis of variation — Fields: name, type (slider|enum), min, max, default
- **DesignBlueprint**: Output artifact from direction choice — Fields: archetype, parameters, CSS variables, layout guidelines, typography, component guidelines
- **DesignKnowledge**: Persistent project-level design intelligence — Lives at `.ai-dlc/knowledge/design.md`
- **KnowledgeDirectory**: `.ai-dlc/knowledge/` — extensible artifact types (design, architecture, product, conventions, domain)
- **DesignDirectionSession**: MCP session type for browser-based picker
- **ProjectMaturity**: greenfield / early / established — gates direction picker activation

### Relationships
- DesignArchetype has many DesignParameters (each defines defaults)
- DesignDirectionSession produces one DesignBlueprint (user's choice)
- DesignBlueprint feeds into WireframeBrief (via `design_blueprint_path` field)
- DesignBlueprint seeds DesignKnowledge (first intent creates it)
- DesignKnowledge is read by designer hat and elaboration phases
- ProjectMaturity gates DesignDirectionSession (greenfield = picker, brownfield = reverse-engineer)

### Data Sources
- **MCP Server** (in-memory sessions): Picker state and user selections
- **Project maturity detection** (`config.sh`): Commit count + source file heuristics
- **Existing codebase** (CSS/tokens/package.json): Reverse-engineering source for brownfield
- **`.ai-dlc/knowledge/`** (filesystem): Persistent knowledge artifacts
- **`.ai-dlc/{slug}/design-blueprint.md`** (filesystem): Per-intent design direction

### Data Gaps
- Archetype definitions must be authored from scratch with preview HTML, CSS tokens, layout rules
- Slider/range UI component must be built for MCP templates
- Reverse-engineering capability must scan CSS, tokens, component files
- Knowledge directory infrastructure is entirely new

## Success Criteria
- [ ] A `.ai-dlc/knowledge/` directory infrastructure exists with defined schema for knowledge artifacts (YAML frontmatter + markdown body)
- [ ] Five knowledge artifact types are supported: `design.md`, `architecture.md`, `product.md`, `conventions.md`, `domain.md`
- [ ] For greenfield projects, a design direction phase activates during elaboration (Phase 2.75)
- [ ] The MCP server exposes a `pick_design_direction` tool that opens a browser-based visual picker with archetype previews and parameter controls
- [ ] Users can browse 4 design archetypes (Brutalist, Editorial, Dense/Utilitarian, Playful/Warm) with visual previews
- [ ] Users can tune 4 parameters (Density, Expressiveness, Shape Language, Color Mood) via interactive controls
- [ ] The chosen direction produces a `design-blueprint.md` in `.ai-dlc/{intent-slug}/` and seeds the initial `knowledge/design.md`
- [ ] For brownfield projects, a reverse-engineering pass scans existing code and synthesizes `knowledge/design.md` from detected patterns
- [ ] The elaborate-wireframes skill reads the design blueprint and produces styled wireframes instead of generic gray boxes
- [ ] The designer hat reads `knowledge/design.md` when available and uses it as design system reference
- [ ] The builder hat reads relevant knowledge artifacts (`architecture.md`, `conventions.md`, `domain.md`) when available for context
- [ ] The elaboration skill reads `knowledge/product.md` and `knowledge/domain.md` when available to inform clarification questions and domain discovery
- [ ] Knowledge artifacts are populated via a dedicated synthesis subagent that runs during first elaboration or on demand
- [ ] When the MCP server is unavailable, the design direction system falls back to terminal-based `AskUserQuestion` (graceful degradation)
- [ ] The direction picker UI is keyboard-navigable with appropriate ARIA labels
- [ ] All existing tests pass

## Context
- The MCP server already has `ask_user_visual_question` with browser-based forms, session management, and channel notifications — the direction picker follows this pattern but needs a richer template with visual previews and sliders
- Project maturity is detected via `detect_project_maturity()` in `config.sh` — returns greenfield/early/established
- Current wireframes are hardcoded gray-box HTML in `elaborate-wireframes` skill — design blueprint tokens need to be injected
- All MCP templates use server-side HTML with Tailwind CDN, `renderLayout()` shell, inline scripts — no build step
- The designer hat already has an "Explore Design Options" step (Step 3) that says "generate 2-3 alternatives" but gives no guidance on genuine variation
- Natural insertion point for the design direction phase is Phase 2.75 (after domain discovery, before workflow selection)

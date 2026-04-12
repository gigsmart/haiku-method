---
name: unit-01-haiku-foundation
type: documentation
status: completed
inputs: ["knowledge/DISCOVERY.md"]
depends_on: []
bolt: 0
hat: ""
started_at: null
completed_at: null
---


# unit-01: H•AI•K•U Foundation

## Description
Establish the H•AI•K•U brand identity and create the foundational manifesto that all other units reference. H•AI•K•U = Human AI Knowledge Unification. This unit produces the core document that defines what H•AI•K•U is, why it exists, and how it relates to domain-specific implementations like AI-DLC (software) and SWARM (marketing/sales).

## Discipline
documentation

## Domain Entities
- H•AI•K•U (the universal framework)
- Profile (domain-specific implementations)
- Phase (the 4-phase lifecycle)

## Data Sources
- Discovery log at `.ai-dlc/methodology-evolution/discovery.md` — contains detailed analysis of current AI-DLC methodology, paper, and plugin architecture
- SWARM brief from the user's friend — marketing/sales framework that independently validated the 4-phase pattern

## Technical Specification

### New Repository
Create a new repository for H•AI•K•U (e.g., `thebushidocollective/haiku-method` or similar). All H•AI•K•U work happens here, NOT in the AI-DLC repo.

### H•AI•K•U Manifesto (`HAIKU.md` at repo root)
Write the foundational document covering:
- **What is H•AI•K•U**: Human AI Knowledge Unification — a universal framework for human-AI collaboration
- **The 4-phase lifecycle**: Elaboration (define intent) -> Execution (do the work) -> Operation (manage what was built) -> Reflection (learn and evolve)
- **Core principles**: Disciplined structure, iterative refinement, domain-agnostic, learning loops
- **The profile model**: H•AI•K•U is the universal core. Domain-specific profiles implement it:
  - AI-DLC = software development profile (git, tests, PRs, deployment)
  - SWARM = marketing/sales profile (briefs, campaigns, close-outs)
  - Custom profiles for any domain
- **Why "H•AI•K•U"**: Japanese-inspired disciplined structure. Like haiku poetry — constrained form that produces clarity. The unification of human creativity and AI capability.
- **Key terminology**: Intent, Unit, Bolt, Hat, Workflow, Quality Gate, Phase
- **Domain**: haikumethod.ai

### Naming Constants
Create a reference file (`brand/naming.md` or similar) with:
- Full name: H•AI•K•U
- Expanded: Human AI Knowledge Unification
- Tagline (suggest options, user confirms)
- Domain: haikumethod.ai
- Relationship to AI-DLC and SWARM

## Success Criteria
- [x] New H•AI•K•U repository exists with initial structure
- [x] HAIKU.md manifesto defines the framework, 4-phase lifecycle, profile model, and terminology
- [x] Naming constants document exists with brand identity
- [x] The relationship between H•AI•K•U, AI-DLC, and SWARM is clearly articulated

## Risks
- **Name collision**: Other projects may use "H•AI•K•U" (Haiku OS exists). Mitigation: "H•AI•K•U Method" or "H•AI•K•U Framework" as the full name, "haikumethod.ai" as the domain.

## Boundaries
This unit does NOT build the plugin, write the paper, or create the website. It establishes the identity that all other units build upon.

## Notes
- The H•AI•K•U repo should be initialized with a basic structure: `README.md`, `HAIKU.md`, `brand/`, `plugin/`, `paper/`, `website/`
- Keep the manifesto concise — it's a reference document, not the full paper (that's unit-05)

---
status: completed
depends_on: []
branch: ai-dlc/methodology-evolution/01-haiku-foundation
discipline: documentation
workflow: ""
ticket: ""
---

# unit-01: HAIKU Foundation

## Description
Establish the HAIKU brand identity and create the foundational manifesto that all other units reference. HAIKU = Human AI Knowledge Unification. This unit produces the core document that defines what HAIKU is, why it exists, and how it relates to domain-specific implementations like AI-DLC (software) and SWARM (marketing/sales).

## Discipline
documentation

## Domain Entities
- HAIKU (the universal framework)
- Profile (domain-specific implementations)
- Phase (the 4-phase lifecycle)

## Data Sources
- Discovery log at `.ai-dlc/methodology-evolution/discovery.md` — contains detailed analysis of current AI-DLC methodology, paper, and plugin architecture
- SWARM brief from the user's friend — marketing/sales framework that independently validated the 4-phase pattern

## Technical Specification

### New Repository
Create a new repository for HAIKU (e.g., `thebushidocollective/haiku-method` or similar). All HAIKU work happens here, NOT in the AI-DLC repo.

### HAIKU Manifesto (`HAIKU.md` at repo root)
Write the foundational document covering:
- **What is HAIKU**: Human AI Knowledge Unification — a universal framework for human-AI collaboration
- **The 4-phase lifecycle**: Elaboration (define intent) -> Execution (do the work) -> Operation (manage what was built) -> Reflection (learn and evolve)
- **Core principles**: Disciplined structure, iterative refinement, domain-agnostic, learning loops
- **The profile model**: HAIKU is the universal core. Domain-specific profiles implement it:
  - AI-DLC = software development profile (git, tests, PRs, deployment)
  - SWARM = marketing/sales profile (briefs, campaigns, close-outs)
  - Custom profiles for any domain
- **Why "HAIKU"**: Japanese-inspired disciplined structure. Like haiku poetry — constrained form that produces clarity. The unification of human creativity and AI capability.
- **Key terminology**: Intent, Unit, Bolt, Hat, Workflow, Quality Gate, Phase
- **Domain**: haikumethod.ai

### Naming Constants
Create a reference file (`brand/naming.md` or similar) with:
- Full name: HAIKU
- Expanded: Human AI Knowledge Unification
- Tagline (suggest options, user confirms)
- Domain: haikumethod.ai
- Relationship to AI-DLC and SWARM

## Success Criteria
- [ ] New HAIKU repository exists with initial structure
- [ ] HAIKU.md manifesto defines the framework, 4-phase lifecycle, profile model, and terminology
- [ ] Naming constants document exists with brand identity
- [ ] The relationship between HAIKU, AI-DLC, and SWARM is clearly articulated

## Risks
- **Name collision**: Other projects may use "HAIKU" (Haiku OS exists). Mitigation: "HAIKU Method" or "HAIKU Framework" as the full name, "haikumethod.ai" as the domain.

## Boundaries
This unit does NOT build the plugin, write the paper, or create the website. It establishes the identity that all other units build upon.

## Notes
- The HAIKU repo should be initialized with a basic structure: `README.md`, `HAIKU.md`, `brand/`, `plugin/`, `paper/`, `website/`
- Keep the manifesto concise — it's a reference document, not the full paper (that's unit-05)



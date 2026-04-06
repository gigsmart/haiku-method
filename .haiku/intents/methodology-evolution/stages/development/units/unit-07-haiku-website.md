---
name: unit-07-haiku-website
type: documentation
status: completed
depends_on: [unit-01-haiku-foundation, unit-05-haiku-paper]
bolt: 0
hat: ""
started_at: null
completed_at: null
---


# unit-07: H•AI•K•U Website

## Description
Build the website for H•AI•K•U at haikumethod.ai. This is the public-facing home for the universal methodology — explaining what H•AI•K•U is, the 4-phase lifecycle, the profile model, and how to get started.

## Discipline
documentation (frontend implementation, but the primary deliverable is content/documentation)

## Domain Entities
- H•AI•K•U (framework), Phase, Profile

## Data Sources
- H•AI•K•U manifesto (unit-01 output)
- H•AI•K•U paper (unit-05 output)
- AI-DLC website (`website/` in AI-DLC repo) — reference for design patterns and tech stack
- Brand constants from unit-01

## Technical Specification

### Tech Stack
Use the same stack as the AI-DLC website for consistency:
- Next.js 15 App Router
- Static export (SSG)
- Deployed to haikumethod.ai

### Site Structure
```
/                       # Homepage: What is H•AI•K•U? The 4-phase lifecycle.
/methodology            # Deep dive into the methodology (adapted from paper)
/phases/elaboration     # Phase detail: Elaboration
/phases/execution       # Phase detail: Execution
/phases/operation       # Phase detail: Operation
/phases/reflection      # Phase detail: Reflection
/profiles               # The profile model: how domains implement H•AI•K•U
/profiles/ai-dlc        # AI-DLC software development profile (links to ai-dlc.dev)
/profiles/swarm         # SWARM marketing/sales profile
/getting-started        # How to adopt H•AI•K•U incrementally
/paper                  # The full methodology paper
```

### Homepage Content
- Hero: "H•AI•K•U — Human AI Knowledge Unification"
- Subtitle: The universal framework for human-AI collaboration
- 4-phase lifecycle diagram: Elaboration -> Execution -> Operation -> Reflection (with loop back)
- "Not just for software" messaging — works for any structured initiative
- Profile showcase: AI-DLC (software), SWARM (marketing), Custom (your domain)
- Getting started CTA

### Phase Pages
Each phase page:
- What it does
- Key artifacts produced
- How human and AI collaborate in this phase
- Domain-agnostic examples
- Related hats and workflows

### Profile Pages
- Explain the profile concept
- AI-DLC profile: what it adds, link to ai-dlc.dev
- SWARM profile: the marketing/sales implementation
- "Build your own profile" guide

## Success Criteria
- [x] Website deployed at haikumethod.ai
- [x] Homepage clearly communicates H•AI•K•U's purpose and 4-phase lifecycle
- [x] All 4 phase pages exist with domain-agnostic content
- [x] Profile model explained with AI-DLC and SWARM examples
- [x] Getting started guide enables incremental adoption
- [x] Paper accessible on the website
- [x] Site uses static export (no server required)

## Risks
- **Design overhead**: A new website needs design work. Mitigation: start with minimal design, leverage existing AI-DLC website patterns.
- **Content overlap with paper**: Website and paper may duplicate content. Mitigation: website provides concise summaries with links to the full paper for depth.

## Boundaries
This unit builds the H•AI•K•U website. It does NOT modify the AI-DLC website (unit-08) or build the plugin (units 02-04).

## Notes
- The website should be in the H•AI•K•U repo (not the AI-DLC repo)
- Consider a simple, clean design that communicates "universal framework" not "dev tool"
- Domain registration for haikumethod.ai should happen early (unit-01 or as a prerequisite)

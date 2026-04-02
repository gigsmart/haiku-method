---
status: pending
last_updated: ""
depends_on: [unit-04-studio-infrastructure]
branch: ai-dlc/haiku-rebrand/05-stage-definitions
discipline: backend
stage: ""
workflow: ""
ticket: ""
---

# unit-05-stage-definitions

## Description

Create the full stage definitions for both the ideation studio (4 stages) and the software studio (6 stages). Each stage gets a STAGE.md file with frontmatter defining hats, review mode, requires/produces contracts, and a body with per-hat guidance, criteria examples, and completion signals.

## Discipline

backend - Stage definition files with structured frontmatter and instructional body content.

## Domain Entities

### Ideation Studio Stages

- `plugin/studios/ideation/stages/research/STAGE.md`
- `plugin/studios/ideation/stages/create/STAGE.md`
- `plugin/studios/ideation/stages/review/STAGE.md`
- `plugin/studios/ideation/stages/deliver/STAGE.md`

### Software Studio Stages

- `plugin/studios/software/stages/inception/STAGE.md`
- `plugin/studios/software/stages/design/STAGE.md`
- `plugin/studios/software/stages/product/STAGE.md`
- `plugin/studios/software/stages/development/STAGE.md`
- `plugin/studios/software/stages/operations/STAGE.md`
- `plugin/studios/software/stages/security/STAGE.md`

## Technical Specification

### STAGE.md Schema

Each stage follows this structure:

```yaml
---
name: <stage-name>
description: <one-line description>
hats: [<ordered list of hat roles>]
review_mode: auto | ask | external
requires: [<artifact names from prior stages>]
produces: [<artifact names for subsequent stages>]
---

# <Stage Name>

<Free-form purpose and philosophy>

## <hat-name>

<Guidance for this hat when active in this stage>

## Criteria Guidance

<How to write good criteria for this stage>

## Completion Signal

<When this stage is done>
```

### Ideation Studio Stages

#### research

```yaml
---
name: research
description: Gather context, explore prior art, and understand the problem space
hats: [researcher, analyst]
review_mode: auto
requires: []
produces: [research-brief, problem-definition, prior-art-summary]
---
```

- **researcher** hat: explore sources, gather data, synthesize findings
- **analyst** hat: evaluate findings, identify patterns, surface insights
- Review mode `auto` — research naturally flows into creation
- Produces a research brief that the create stage consumes

#### create

```yaml
---
name: create
description: Generate the primary deliverable using research insights
hats: [creator, editor]
review_mode: ask
requires: [research-brief, problem-definition]
produces: [draft-deliverable, supporting-materials]
---
```

- **creator** hat: produce the primary output (document, design, plan, etc.)
- **editor** hat: refine, restructure, improve clarity and quality
- Review mode `ask` — the user decides when the draft is ready for formal review

#### review

```yaml
---
name: review
description: Adversarial quality review of the deliverable
hats: [critic, fact-checker]
review_mode: ask
requires: [draft-deliverable]
produces: [review-report, revision-list]
---
```

- **critic** hat: identify weaknesses, gaps, inconsistencies
- **fact-checker** hat: verify claims, check sources, validate logic
- Review mode `ask` — review findings are presented for the user to act on

#### deliver

```yaml
---
name: deliver
description: Finalize and package the deliverable for its audience
hats: [publisher]
review_mode: auto
requires: [draft-deliverable, review-report]
produces: [final-deliverable]
---
```

- **publisher** hat: format, package, and deliver
- Review mode `auto` — once review is addressed, delivery completes

### Software Studio Stages

#### inception

```yaml
---
name: inception
description: Understand the problem, define success, and decompose into units
hats: [architect, decomposer]
review_mode: auto
requires: []
produces: [intent-spec, unit-specs, dependency-graph, success-criteria]
---
```

- **architect** hat: understand the problem space, define scope, identify technical constraints
- **decomposer** hat: break the intent into units with dependencies and criteria
- Review mode `auto` — inception flows directly into design
- This stage maps to the existing elaboration sub-skills: gather, discover, decompose, criteria, DAG

#### design

```yaml
---
name: design
description: Visual and interaction design for user-facing surfaces
hats: [designer, design-reviewer]
review_mode: ask
requires: [intent-spec, unit-specs]
produces: [design-tokens, wireframes, component-specs, interaction-flows]
---
```

- **designer** hat: explore wireframes, define tokens, specify component structure and states, map interaction flows
- **design-reviewer** hat: check consistency with design system, verify all states covered (default, hover, focus, active, disabled, error), confirm responsive behavior
- Review mode `ask` — design direction needs human approval before product proceeds
- Criteria guidance: screen layouts for all breakpoints, interactive states specified, touch targets >= 44px, design tokens only (no raw hex)
- Design criteria are verified by visual approval, not automated tests

#### product

```yaml
---
name: product
description: Define behavioral specifications and acceptance criteria
hats: [product-owner, specification-writer]
review_mode: external
requires: [intent-spec, unit-specs, design-tokens, wireframes]
produces: [behavioral-specs, acceptance-criteria, data-contracts, api-contracts]
---
```

- **product-owner** hat: define user stories, prioritize, make scope decisions
- **specification-writer** hat: write behavioral specs, define data contracts, specify API contracts
- Review mode `external` — this is the go/no-go decision boundary where the team decides whether to actually build the thing. In practice: creates a PR or review request for team approval.
- Criteria guidance: behavioral specs per user flow, data contracts defined, API contracts specified, edge cases documented

#### development

```yaml
---
name: development
description: Implement the specification through code
hats: [planner, builder, reviewer]
review_mode: ask
requires: [behavioral-specs, acceptance-criteria, data-contracts]
produces: [implementation, test-suite, documentation]
---
```

- **planner** hat: read unit spec + prior stage artifacts, plan implementation approach
- **builder** hat: write code, implement features, fix issues. Guided by behavioral specs from product stage.
- **reviewer** hat: code review, check criteria compliance, verify test coverage. Hard-gated on criteria.
- Review mode `ask` — pause for user review before operations
- This stage maps to the existing execute skill's bolt loop: plan -> build -> quality gates -> review

#### operations

```yaml
---
name: operations
description: Deployment, monitoring, and operational readiness
hats: [ops-engineer, sre]
review_mode: auto
requires: [implementation, test-suite]
produces: [deployment-config, monitoring-setup, runbook]
---
```

- **ops-engineer** hat: configure deployment, set up CI/CD, define infrastructure
- **sre** hat: define SLOs, set up monitoring, write runbooks
- Review mode `auto` — operational setup advances automatically when complete
- Criteria guidance: deployment pipeline defined, monitoring covers key metrics, runbook exists for common failure modes

#### security

```yaml
---
name: security
description: Threat modeling, security review, and vulnerability assessment
hats: [threat-modeler, red-team, blue-team, security-reviewer]
review_mode: external
requires: [implementation, behavioral-specs, data-contracts]
produces: [threat-model, security-requirements, vulnerability-report, mitigation-plan]
---
```

- **threat-modeler** hat: STRIDE threat modeling for all data flows and trust boundaries
- **red-team** hat: attack surface analysis, injection testing, auth bypass attempts
- **blue-team** hat: defense verification, security control validation, monitoring coverage
- **security-reviewer** hat: verify all threats have mitigations, check OWASP Top 10 coverage
- Review mode `external` — security findings require team review before the intent ships
- This stage is always adversarial — the hat sequence IS the review
- Criteria guidance: OWASP Top 10 coverage, auth boundary testing, data protection requirements, input validation

### Hat Section Content

Each hat section in the STAGE.md body follows this pattern:

```markdown
## <hat-name>

### Focus
- Bullet points describing what this hat does

### Produces
- Artifact types this hat generates

### Reads
- What prior artifacts this hat consumes

### Anti-patterns
- What this hat should NOT do
```

This replaces the old `plugin/hats/*.md` files — all hat instructions live inline in the stage that uses them.

## Success Criteria

- [ ] All 4 ideation studio stage files exist with complete frontmatter and body
- [ ] All 6 software studio stage files exist with complete frontmatter and body
- [ ] Every stage has `hats`, `review_mode`, `requires`, and `produces` in frontmatter
- [ ] Every stage body has sections for each hat defined in frontmatter
- [ ] Every stage body has `## Criteria Guidance` and `## Completion Signal` sections
- [ ] requires/produces chains are consistent: every `requires` reference appears in a prior stage's `produces`
- [ ] Software stage review modes match spec: inception=auto, design=ask, product=external, development=ask, operations=auto, security=external
- [ ] Ideation stage review modes match spec: research=auto, create=ask, review=ask, deliver=auto
- [ ] Hat sections provide actionable guidance (not just labels)
- [ ] Criteria guidance sections include good/bad examples

## Risks

- **Content quality**: Hat instructions need to be genuinely useful, not placeholder text. Mitigation: adapt content from existing `plugin/hats/*.md` files and `plugin/passes/*.md` (now stages) which have battle-tested guidance.
- **requires/produces mismatch**: If stage A produces `[x, y]` but stage B requires `[x, z]`, the pipeline has a gap. Mitigation: trace the full artifact chain for each studio before writing files.
- **Ideation generality**: The ideation studio must work for ANY domain (marketing, hardware, legal, etc.). Mitigation: keep hat descriptions generic and outcome-focused rather than domain-specific.

## Boundaries

This unit writes STAGE.md content for both studios. It does NOT create the studio infrastructure (unit-04), the orchestrator (unit-06), or remove the old hats directory (unit-07). The stage files are passive definitions — they become active when the orchestrator reads them.

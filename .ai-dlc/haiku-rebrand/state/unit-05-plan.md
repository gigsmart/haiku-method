# Unit-05 Plan: Stage Definitions

## Overview

Replace all 25 stub files (10 STAGE.md + 15 output docs) with full content. Each STAGE.md gets complete frontmatter and body. Each output doc gets corrected frontmatter and guidance body.

## Stub Corrections Required

The unit-04 stubs have several values that conflict with the unit-05 spec and architecture spec. These must be corrected during replacement:

### Output Doc Frontmatter Fixes

| Field | Stub Value | Correct Value | Reason |
|-------|-----------|---------------|--------|
| `name` | UPPERCASE (`DRAFT-DELIVERABLE`) | lowercase (`draft-deliverable`) | Architecture spec examples use lowercase; inputs reference lowercase names |
| `format` | `markdown` | `text`, `code`, or `design` | Architecture spec defines only three format values |
| `location` | (missing) | scope-based path template | Required by output doc schema |

### Scope Corrections (per unit-05 spec)

| Output | Stub Scope | Correct Scope |
|--------|-----------|---------------|
| DESIGN-BRIEF | `intent` | `stage` |
| CODE | `intent` | `repo` |
| ARCHITECTURE | `intent` | `project` |
| DEPLOYMENT-CONFIG | `intent` | `repo` |

---

## File-by-File Plan

### Ideation Studio Stages

#### 1. `plugin/studios/ideation/stages/research/STAGE.md`

**Frontmatter:**
```yaml
name: research
description: Gather context, explore prior art, and understand the problem space
hats: [researcher, analyst]
review: auto
unit_types: [research]
inputs: []
```

**Body sections:**
- `## researcher` — Focus: explore sources, gather data, synthesize findings. Produces: raw research notes, source annotations. Reads: intent problem statement, any existing project knowledge. Anti-patterns: diving into creation before research is complete, relying on single sources, not documenting sources.
- `## analyst` — Focus: evaluate findings, identify patterns, surface insights, assess gaps. Produces: structured analysis, pattern identification. Reads: researcher's findings from unit's `## References`. Anti-patterns: over-analyzing without synthesizing, ignoring contradictory evidence.
- `## Criteria Guidance` — Good: "Research brief covers at least 3 competing approaches with pros/cons." Bad: "Research is thorough." Good: "All claims cite a specific source." Bad: "Sources are included."
- `## Completion Signal` — Research brief exists with synthesized findings, sources documented, and analyst has identified key patterns and gaps.

**Output:** `outputs/RESEARCH-BRIEF.md`

---

#### 2. `plugin/studios/ideation/stages/research/outputs/RESEARCH-BRIEF.md`

**Frontmatter:**
```yaml
name: research-brief
location: .haiku/intents/{intent-slug}/knowledge/RESEARCH-BRIEF.md
scope: intent
format: text
required: true
```

**Body:** Guide for documenting research findings — key questions explored, sources consulted, findings per question, competing approaches with tradeoffs, identified patterns, knowledge gaps, and recommended areas for deeper investigation.

---

#### 3. `plugin/studios/ideation/stages/create/STAGE.md`

**Frontmatter:**
```yaml
name: create
description: Generate the primary deliverable using research insights
hats: [creator, editor]
review: ask
unit_types: [content]
inputs:
  - stage: research
    output: research-brief
```

**Body sections:**
- `## creator` — Focus: produce the primary output (document, design, plan, analysis, etc.) using research insights as foundation. Produces: first draft of the deliverable. Reads: research-brief via unit's `## References`. Anti-patterns: starting from scratch ignoring research, producing a skeleton without substance, gold-plating before the draft is solid.
- `## editor` — Focus: refine structure, improve clarity, strengthen arguments, ensure coherence. Produces: polished draft. Reads: creator's draft, research-brief. Anti-patterns: rewriting instead of editing, prioritizing style over substance, making changes without preserving the creator's intent.
- `## Criteria Guidance` — Good: "Draft addresses all 5 key questions from the research brief." Bad: "Draft is complete." Good: "Each section has a clear thesis statement supported by evidence." Bad: "Writing is good quality."
- `## Completion Signal` — Draft deliverable exists, addresses the research findings, has been refined by the editor, and is ready for adversarial review.

**Output:** `outputs/DRAFT-DELIVERABLE.md`

---

#### 4. `plugin/studios/ideation/stages/create/outputs/DRAFT-DELIVERABLE.md`

**Frontmatter:**
```yaml
name: draft-deliverable
location: .haiku/intents/{intent-slug}/knowledge/DRAFT-DELIVERABLE.md
scope: intent
format: text
required: true
```

**Body:** Guide for the primary draft output — structure depends on intent type (document, plan, analysis, design brief, etc.). Should clearly address the problem statement from the intent, incorporate research findings, present a coherent argument or solution, and identify areas of uncertainty.

---

#### 5. `plugin/studios/ideation/stages/review/STAGE.md`

**Frontmatter:**
```yaml
name: review
description: Adversarial quality review of the deliverable
hats: [critic, fact-checker]
review: ask
unit_types: [review]
inputs:
  - stage: create
    output: draft-deliverable
```

**Body sections:**
- `## critic` — Focus: identify weaknesses, logical gaps, missing perspectives, structural problems. Produces: critique with severity-ranked findings. Reads: draft-deliverable via unit's `## References`. Anti-patterns: nitpicking style over substance, providing only negative feedback without constructive alternatives, being vague ("this section is weak").
- `## fact-checker` — Focus: verify claims, check sources, validate reasoning, confirm data accuracy. Produces: fact-check report with verified/unverified/false classifications. Reads: draft-deliverable, research-brief via unit's `## References`. Anti-patterns: accepting claims at face value, only checking easy-to-verify facts, not tracing claims to primary sources.
- `## Criteria Guidance` — Good: "Review report identifies at least 3 substantive issues with specific remediation suggestions." Bad: "Review is complete." Good: "All factual claims are verified against original sources." Bad: "Facts are checked."
- `## Completion Signal` — Review report exists with severity-ranked findings, all factual claims verified, and findings are actionable (not just "this is wrong" but "this is wrong because X, fix by Y").

**Output:** `outputs/REVIEW-REPORT.md`

---

#### 6. `plugin/studios/ideation/stages/review/outputs/REVIEW-REPORT.md`

**Frontmatter:**
```yaml
name: review-report
location: .haiku/intents/{intent-slug}/knowledge/REVIEW-REPORT.md
scope: intent
format: text
required: true
```

**Body:** Guide for the review report — findings organized by severity (critical/major/minor), each finding with: description, location in deliverable, evidence/reasoning, suggested remediation. Separate sections for structural issues, factual issues, and completeness gaps. Summary verdict: approve / revise / reject.

---

#### 7. `plugin/studios/ideation/stages/deliver/STAGE.md`

**Frontmatter:**
```yaml
name: deliver
description: Finalize and package the deliverable for its audience
hats: [publisher]
review: auto
unit_types: [delivery]
inputs:
  - stage: create
    output: draft-deliverable
  - stage: review
    output: review-report
```

**Body sections:**
- `## publisher` — Focus: incorporate review feedback, finalize formatting, ensure deliverable is audience-ready, package for delivery method (file, presentation, document, etc.). Produces: final deliverable. Reads: draft-deliverable, review-report via unit's `## References`. Anti-patterns: ignoring review findings, over-polishing at the expense of substance, changing content meaning during formatting.
- `## Criteria Guidance` — Good: "All critical and major review findings are addressed in the final version." Bad: "Review feedback incorporated." Good: "Deliverable is formatted for the target audience (e.g., executive summary for leadership, technical detail for engineering)." Bad: "Formatting is done."
- `## Completion Signal` — Final deliverable exists, all critical/major review findings addressed, formatted for target audience, and ready for consumption.

**Output:** `outputs/FINAL-DELIVERABLE.md`

---

#### 8. `plugin/studios/ideation/stages/deliver/outputs/FINAL-DELIVERABLE.md`

**Frontmatter:**
```yaml
name: final-deliverable
location: .haiku/intents/{intent-slug}/knowledge/FINAL-DELIVERABLE.md
scope: intent
format: text
required: true
```

**Body:** Guide for the final packaged deliverable — incorporates all review feedback, audience-appropriate formatting and tone, executive summary if applicable, clear structure with navigable sections, attribution of sources from research phase.

---

### Software Studio Stages

#### 9. `plugin/studios/software/stages/inception/STAGE.md`

**Frontmatter:**
```yaml
name: inception
description: Understand the problem, define success, and decompose into units
hats: [architect, decomposer]
review: auto
unit_types: [research, backend, frontend]
inputs: []
```

**Body sections:**
- `## architect` — Focus: understand the problem space, map the existing codebase, define scope and constraints, identify technical risks and architectural implications. Produces: discovery document with domain model, technical landscape, and constraint analysis. Reads: intent problem statement, codebase. Anti-patterns: jumping to solutions before understanding the problem, assuming architecture without reading existing code, ignoring non-functional requirements.
  - Content adapted from the existing elaborate skill's discover sub-skill.
- `## decomposer` — Focus: break the intent into units with clear boundaries, define dependency DAG, write completion criteria for each unit. Produces: unit specs with criteria and dependencies. Reads: architect's discovery output via unit's `## References`. Anti-patterns: creating units that are too large (>1 bolt), creating units with circular dependencies, writing vague criteria ("it works").
  - Content adapted from elaborate skill's decompose and criteria sub-skills.
- `## Criteria Guidance` — Good: "Discovery document maps all entities with their fields and relationships." Bad: "Domain is understood." Good: "Each unit has ≤5 completion criteria, each verifiable by a specific command or test." Bad: "Units have criteria."
- `## Completion Signal` — Discovery document exists with domain model and technical landscape. All units have specs with dependencies and verifiable completion criteria. Unit DAG is acyclic.

**Output:** `outputs/DISCOVERY.md`

---

#### 10. `plugin/studios/software/stages/inception/outputs/DISCOVERY.md`

**Frontmatter:**
```yaml
name: discovery
location: .haiku/intents/{intent-slug}/knowledge/DISCOVERY.md
scope: intent
format: text
required: true
```

**Body:** Guide for the discovery output — document every entity and its fields, every API endpoint and its behavior, architecture patterns and constraints, existing code structure relevant to the intent, technical risks and unknowns, non-functional requirements (performance, security, accessibility).

---

#### 11. `plugin/studios/software/stages/design/STAGE.md`

**Frontmatter:**
```yaml
name: design
description: Visual and interaction design for user-facing surfaces
hats: [designer, design-reviewer]
review: ask
unit_types: [design, frontend]
inputs:
  - stage: inception
    output: discovery
```

**Body sections:**
- `## designer` — Focus: explore wireframes, define design tokens, specify component structure and states, map interaction flows. Produces: design brief with screen layouts, component specs, interaction states (default, hover, focus, active, disabled, error, loading, empty), design tokens. Reads: discovery via unit's `## References`. Anti-patterns: designing without surveying existing components/design system, using raw hex colors instead of named tokens, skipping state coverage (empty, loading, error), presenting only one option without exploring alternatives.
  - Content heavily adapted from existing `designer.md` hat.
- `## design-reviewer` — Focus: check consistency with design system, verify all states covered, confirm responsive behavior, validate accessibility requirements. Produces: design review findings. Reads: designer output, discovery via unit's `## References`. Anti-patterns: approving designs without checking state coverage, ignoring accessibility, not verifying responsive behavior at all breakpoints.
- `## Criteria Guidance` — Good: "Screen layouts specified for mobile (375px), tablet (768px), and desktop (1280px) breakpoints." Bad: "Responsive design done." Good: "All interactive elements have specified states: default, hover, focus, active, disabled, error." Bad: "States are defined." Good: "Design uses only named tokens from the design system — no raw hex values." Bad: "Colors are consistent."
- `## Completion Signal` — Design brief exists with screen layouts for all breakpoints, all interactive states specified, touch targets ≥ 44px, design tokens defined (no raw hex), and design reviewer has verified consistency and completeness.

**Outputs:** `outputs/DESIGN-BRIEF.md`, `outputs/DESIGN-TOKENS.md`

---

#### 12. `plugin/studios/software/stages/design/outputs/DESIGN-BRIEF.md`

**Frontmatter:**
```yaml
name: design-brief
location: .haiku/intents/{intent-slug}/stages/design/DESIGN-BRIEF.md
scope: stage
format: design
required: true
```

**Body:** Guide for the design brief — screen-by-screen specifications including layout structure, component inventory, interaction states for each element, responsive behavior at each breakpoint, navigation flows between screens, accessibility requirements (contrast ratios, label associations, keyboard navigation paths). Design gaps section documenting known missing states and their disposition.

---

#### 13. `plugin/studios/software/stages/design/outputs/DESIGN-TOKENS.md`

**Frontmatter:**
```yaml
name: design-tokens
location: .haiku/intents/{intent-slug}/knowledge/DESIGN-TOKENS.md
scope: intent
format: text
required: true
```

**Body:** Guide for design token definitions — named color tokens (primary, secondary, surface, error, etc.), spacing scale, typography scale (font families, sizes, weights, line heights), border radii, shadow definitions, animation/transition values. Tokens should reference the existing design system if one exists, or establish one if not. All downstream stages must use token names, never raw values.

---

#### 14. `plugin/studios/software/stages/product/STAGE.md`

**Frontmatter:**
```yaml
name: product
description: Define behavioral specifications and acceptance criteria
hats: [product-owner, specification-writer]
review: [external, ask]
unit_types: [product, backend, frontend]
inputs:
  - stage: inception
    output: discovery
  - stage: design
    output: design-tokens
```

**Body sections:**
- `## product-owner` — Focus: define user stories, prioritize features, make scope decisions, specify acceptance criteria from the user's perspective. Produces: prioritized user stories with acceptance criteria. Reads: discovery, design-tokens via unit's `## References`. Anti-patterns: writing implementation details instead of user behavior, skipping edge cases, not defining what "done" looks like from the user's perspective.
- `## specification-writer` — Focus: write behavioral specs (given/when/then), define data contracts (API schemas, database models), specify API contracts (endpoints, methods, request/response shapes). Produces: behavioral spec, data contracts. Reads: product-owner's stories, discovery via unit's `## References`. Anti-patterns: writing specs that describe implementation rather than behavior, leaving contracts ambiguous ("returns data"), not specifying error responses.
- `## Criteria Guidance` — Good: "Behavioral spec covers happy path and at least 3 error scenarios per user flow." Bad: "Specs are written." Good: "Data contracts define request/response schemas with field types, required/optional, and validation rules." Bad: "API is specified." Good: "Each acceptance criterion is testable with a specific scenario (Given X, When Y, Then Z)." Bad: "Criteria are clear."
- `## Completion Signal` — Behavioral spec exists with user flows and error scenarios. Data contracts define all API schemas. Every acceptance criterion has a testable given/when/then scenario. Product owner has approved scope.

**Outputs:** `outputs/BEHAVIORAL-SPEC.md`, `outputs/DATA-CONTRACTS.md`

---

#### 15. `plugin/studios/software/stages/product/outputs/BEHAVIORAL-SPEC.md`

**Frontmatter:**
```yaml
name: behavioral-spec
location: .haiku/intents/{intent-slug}/knowledge/BEHAVIORAL-SPEC.md
scope: intent
format: text
required: true
```

**Body:** Guide for the behavioral specification — organized by user flow. Each flow: title, actor, preconditions, happy path (given/when/then), error scenarios (given/when/then for each), edge cases, acceptance criteria. Cross-references to design tokens and discovery output where relevant.

---

#### 16. `plugin/studios/software/stages/product/outputs/DATA-CONTRACTS.md`

**Frontmatter:**
```yaml
name: data-contracts
location: .haiku/intents/{intent-slug}/knowledge/DATA-CONTRACTS.md
scope: intent
format: text
required: true
```

**Body:** Guide for data contracts — API endpoints (method, path, request schema, response schema, error responses), database models (entity, fields with types, relationships, indexes, constraints), event schemas (event name, payload schema, producer, consumers). Each contract should specify field types, required vs optional, validation rules, and example values.

---

#### 17. `plugin/studios/software/stages/development/STAGE.md`

**Frontmatter:**
```yaml
name: development
description: Implement the specification through code
hats: [planner, builder, reviewer]
review: ask
unit_types: [backend, frontend, fullstack]
inputs:
  - stage: product
    output: behavioral-spec
  - stage: product
    output: data-contracts
```

**Body sections:**
- `## planner` — Focus: read unit spec and prior stage outputs, plan implementation approach, identify files to modify, assess risks, search for relevant learnings. Produces: tactical plan saved as state. Reads: unit spec, behavioral-spec, data-contracts via unit's `## References`. Anti-patterns: planning without reading the completion criteria, copying a previous failed plan, not identifying risks, skipping verification steps.
  - Content adapted from existing `planner.md` hat — include git history analysis, learning retrieval, rule-based decision filtering.
- `## builder` — Focus: implement code to satisfy completion criteria, work in small verifiable increments, use quality gate feedback as guidance. Produces: working code committed to branch. Reads: planner's tactical plan, unit spec via unit's `## References`. Anti-patterns: building without reading criteria, disabling lint/type checks, continuing past 3 failed attempts without documenting blocker, not committing working increments.
  - Content adapted from existing `builder.md` hat — include quality gate awareness, node repair operator (retry → decompose → prune → escalate), incremental commits, provider sync.
- `## reviewer` — Focus: verify implementation satisfies completion criteria via multi-stage review (spec compliance → code quality → operational readiness). Produces: structured review decision (APPROVED / REQUEST CHANGES). Reads: unit criteria, implementation code, quality gate results. Anti-patterns: approving without running verification, trusting claims over evidence, blocking on low-confidence style issues.
  - Content adapted from existing `reviewer.md` hat — include chain-of-verification, review delegation to specialized agents, confidence-scored findings.
- `## Criteria Guidance` — Good: "All API endpoints return correct status codes for success (200/201), validation errors (400), auth failures (401/403), and not-found (404)." Bad: "API works correctly." Good: "Test coverage ≥80% for new code, with unit tests for business logic and integration tests for API boundaries." Bad: "Tests are written." Good: "No TypeScript `any` types in new code without a documented justification comment." Bad: "Types are correct."
- `## Completion Signal` — All completion criteria pass verification (tests, lint, typecheck). Code committed to branch. Reviewer has approved. All quality gates pass. No high-confidence blocking issues remain.

**Outputs:** `outputs/CODE.md`, `outputs/ARCHITECTURE.md`

---

#### 18. `plugin/studios/software/stages/development/outputs/CODE.md`

**Frontmatter:**
```yaml
name: code
location: (project source tree)
scope: repo
format: code
required: true
```

**Body:** Guide for implementation output — code is written directly to the project source tree. Follow existing project patterns for file organization, naming conventions, and module boundaries. Include appropriate tests alongside implementation. Commit working increments with clear messages. This output is "complete" when all unit completion criteria pass and the reviewer approves.

---

#### 19. `plugin/studios/software/stages/development/outputs/ARCHITECTURE.md`

**Frontmatter:**
```yaml
name: architecture
location: .haiku/knowledge/ARCHITECTURE.md
scope: project
format: text
required: false
```

**Body:** Guide for architecture documentation — document significant architectural decisions made during development (module boundaries, data flow patterns, infrastructure conventions, dependency choices). Update when development introduces new patterns or changes existing ones. This is a living document that persists across intents, so write for future readers who need to understand the system's architecture. Include: module map, data flow diagrams (text), key abstractions, dependency graph, and rationale for non-obvious decisions.

---

#### 20. `plugin/studios/software/stages/operations/STAGE.md`

**Frontmatter:**
```yaml
name: operations
description: Deployment, monitoring, and operational readiness
hats: [ops-engineer, sre]
review: auto
unit_types: [ops, backend]
inputs:
  - stage: development
    output: code
  - stage: development
    output: architecture
```

**Body sections:**
- `## ops-engineer` — Focus: configure deployment pipeline, define infrastructure as code, set up CI/CD, ensure deployment is repeatable and rollback-safe. Produces: deployment configuration, CI/CD pipeline definitions, infrastructure manifests. Reads: code, architecture via unit's `## References`. Anti-patterns: manual deployment steps, hardcoded secrets, no rollback strategy, skipping health checks.
- `## sre` — Focus: define SLOs (availability, latency, error rate), set up monitoring and alerting, write runbooks for common failure modes. Produces: runbook, monitoring configuration, alert definitions. Reads: code, architecture, deployment config via unit's `## References`. Anti-patterns: alerting on symptoms instead of causes, SLOs without error budgets, runbooks that say "page the oncall" without diagnostic steps.
- `## Criteria Guidance` — Good: "Deployment pipeline runs `terraform plan` in CI and requires approval before `apply`." Bad: "Deployment is automated." Good: "Runbook covers: service restart, database failover, cache flush, and certificate rotation with step-by-step commands." Bad: "Runbook exists." Good: "Alerts fire when error rate exceeds 1% over 5 minutes, with PagerDuty routing." Bad: "Monitoring is set up."
- `## Completion Signal` — Deployment pipeline defined and validated. Monitoring covers key metrics (latency, error rate, throughput). Runbook exists for common failure modes with step-by-step remediation. SLOs defined with alert thresholds.

**Outputs:** `outputs/RUNBOOK.md`, `outputs/DEPLOYMENT-CONFIG.md`

---

#### 21. `plugin/studios/software/stages/operations/outputs/RUNBOOK.md`

**Frontmatter:**
```yaml
name: runbook
location: .haiku/intents/{intent-slug}/knowledge/RUNBOOK.md
scope: intent
format: text
required: true
```

**Body:** Guide for the operational runbook — organized by failure scenario. Each entry: symptom description, diagnostic steps (specific commands to run), remediation steps (specific commands/actions), escalation criteria (when to page), rollback procedure. Include: service restart, database failover, cache invalidation, dependency failure handling, and any intent-specific operational scenarios.

---

#### 22. `plugin/studios/software/stages/operations/outputs/DEPLOYMENT-CONFIG.md`

**Frontmatter:**
```yaml
name: deployment-config
location: (project source tree — e.g., deploy/, .github/workflows/, infrastructure/)
scope: repo
format: code
required: true
```

**Body:** Guide for deployment configuration — infrastructure-as-code manifests (Terraform, CloudFormation, Pulumi), container definitions (Dockerfile, docker-compose), CI/CD pipeline definitions (GitHub Actions, GitLab CI), and environment configuration. Written directly to the project source tree in the appropriate location for the project's deployment tooling.

---

#### 23. `plugin/studios/software/stages/security/STAGE.md`

**Frontmatter:**
```yaml
name: security
description: Threat modeling, security review, and vulnerability assessment
hats: [threat-modeler, red-team, blue-team, security-reviewer]
review: [external, ask]
unit_types: [security, backend]
inputs:
  - stage: product
    output: behavioral-spec
  - stage: development
    output: code
```

**Body sections:**
- `## threat-modeler` — Focus: STRIDE threat modeling for all data flows and trust boundaries, identify attack surface, categorize threats by severity. Produces: threat model with identified threats and their risk ratings. Reads: behavioral-spec, code via unit's `## References`. Anti-patterns: only modeling external threats, ignoring insider threats, not mapping trust boundaries, treating threat modeling as a checklist.
- `## red-team` — Focus: attack surface analysis, injection testing (SQL, XSS, command), auth bypass attempts, privilege escalation testing, data exposure checks. Produces: vulnerability findings with reproduction steps. Reads: code, behavioral-spec via unit's `## References`. Anti-patterns: only testing happy paths, not testing auth boundaries, executing destructive payloads in shared environments, stopping after first finding.
  - Content adapted from existing `red-team.md` hat.
- `## blue-team` — Focus: defense verification, implement security controls for identified threats, add security tests, validate monitoring coverage for security events. Produces: mitigations with tests proving effectiveness. Reads: red-team findings, code via unit's `## References`. Anti-patterns: patching symptoms instead of root causes, not adding regression tests, implementing security controls without testing them.
  - Content adapted from existing `blue-team.md` hat.
- `## security-reviewer` — Focus: verify all identified threats have documented mitigations, check OWASP Top 10 coverage, validate security test coverage, ensure no critical/high findings remain unaddressed. Produces: security review verdict (approve / request changes). Reads: threat model, vulnerability findings, mitigations. Anti-patterns: approving with unaddressed high-severity findings, not cross-referencing OWASP Top 10, trusting mitigation claims without verifying tests exist.
- `## Criteria Guidance` — Good: "OWASP Top 10 coverage verified: each category has at least one test or documented N/A justification." Bad: "Security review done." Good: "All SQL queries use parameterized statements — verified by grep for string concatenation in query construction." Bad: "No SQL injection." Good: "Authentication tokens expire after 1 hour and refresh tokens after 30 days, verified by test." Bad: "Auth is secure."
- `## Completion Signal` — All identified threats have documented mitigations. Security tests cover the attack surface. No critical or high findings remain unaddressed. OWASP Top 10 coverage verified. Security reviewer has approved.

**Outputs:** `outputs/THREAT-MODEL.md`, `outputs/VULN-REPORT.md`

---

#### 24. `plugin/studios/software/stages/security/outputs/THREAT-MODEL.md`

**Frontmatter:**
```yaml
name: threat-model
location: .haiku/intents/{intent-slug}/knowledge/THREAT-MODEL.md
scope: intent
format: text
required: true
```

**Body:** Guide for the threat model — organized by trust boundary. For each boundary: data flows crossing it, STRIDE analysis (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege), identified threats with severity rating (critical/high/medium/low), attack vectors, impact assessment, and required mitigations. Summary table mapping threats to mitigations and their implementation status.

---

#### 25. `plugin/studios/software/stages/security/outputs/VULN-REPORT.md`

**Frontmatter:**
```yaml
name: vuln-report
location: .haiku/intents/{intent-slug}/knowledge/VULN-REPORT.md
scope: intent
format: text
required: false
```

**Body:** Guide for vulnerability findings — each vulnerability: title, severity (critical/high/medium/low/info), OWASP category, description, reproduction steps, affected component, evidence (request/response, code snippet), recommended fix, and mitigation status (open/mitigated/accepted risk). Summary statistics and trend analysis if this is a repeat assessment.

---

## Input/Output Chain Verification

Verify all cross-stage references are consistent:

| Stage | Inputs (stage.output) | Outputs (name) |
|-------|----------------------|-----------------|
| **Ideation** | | |
| research | (none) | research-brief |
| create | research.research-brief ✓ | draft-deliverable |
| review | create.draft-deliverable ✓ | review-report |
| deliver | create.draft-deliverable ✓, review.review-report ✓ | final-deliverable |
| **Software** | | |
| inception | (none) | discovery |
| design | inception.discovery ✓ | design-brief, design-tokens |
| product | inception.discovery ✓, design.design-tokens ✓ | behavioral-spec, data-contracts |
| development | product.behavioral-spec ✓, product.data-contracts ✓ | code, architecture |
| operations | development.code ✓, development.architecture ✓ | runbook, deployment-config |
| security | product.behavioral-spec ✓, development.code ✓ | threat-model, vuln-report |

All chains verified — every input reference resolves to an output defined in the referenced stage.

## Review Mode Verification

| Stage | Review Mode | Spec Match |
|-------|------------|------------|
| research | auto | ✓ |
| create | ask | ✓ |
| review | ask | ✓ |
| deliver | auto | ✓ |
| inception | auto | ✓ |
| design | ask | ✓ |
| product | [external, ask] | ✓ |
| development | ask | ✓ |
| operations | auto | ✓ |
| security | [external, ask] | ✓ |

## Execution Order

Files should be written in dependency order (stages before their downstream consumers):

**Phase 1 — Ideation studio (4 STAGE.md + 4 outputs = 8 files):**
1. research/STAGE.md + research/outputs/RESEARCH-BRIEF.md
2. create/STAGE.md + create/outputs/DRAFT-DELIVERABLE.md
3. review/STAGE.md + review/outputs/REVIEW-REPORT.md
4. deliver/STAGE.md + deliver/outputs/FINAL-DELIVERABLE.md

**Phase 2 — Software studio (6 STAGE.md + 11 outputs = 17 files):**
5. inception/STAGE.md + inception/outputs/DISCOVERY.md
6. design/STAGE.md + design/outputs/DESIGN-BRIEF.md + design/outputs/DESIGN-TOKENS.md
7. product/STAGE.md + product/outputs/BEHAVIORAL-SPEC.md + product/outputs/DATA-CONTRACTS.md
8. development/STAGE.md + development/outputs/CODE.md + development/outputs/ARCHITECTURE.md
9. operations/STAGE.md + operations/outputs/RUNBOOK.md + operations/outputs/DEPLOYMENT-CONFIG.md
10. security/STAGE.md + security/outputs/THREAT-MODEL.md + security/outputs/VULN-REPORT.md

**Phase 3 — Verification:**
- Verify all frontmatter fields present in every file
- Verify all input/output chain references are consistent
- Verify all hat sections exist for each hat in frontmatter
- Verify all Criteria Guidance sections have good/bad examples
- Verify all Completion Signal sections exist

## Key Content Sources

Hat section content should draw from existing hat files where applicable:

| Stage Hat | Source Hat File | Adaptation Notes |
|-----------|----------------|------------------|
| development/planner | `plugin/hats/planner.md` | Keep git analysis, learning retrieval, rule-based filtering; remove lib/ calls |
| development/builder | `plugin/hats/builder.md` | Keep quality gate awareness, node repair, incremental commits; remove lib/ calls |
| development/reviewer | `plugin/hats/reviewer.md` | Keep multi-stage review, CoVe, delegation; remove lib/ calls |
| design/designer | `plugin/hats/designer.md` | Keep state coverage, design tokens, a11y; remove lib/ calls |
| security/red-team | `plugin/hats/red-team.md` | Keep STRIDE, injection testing, auth testing |
| security/blue-team | `plugin/hats/blue-team.md` | Keep mitigation patterns, defense-in-depth |

All other hats (researcher, analyst, creator, editor, critic, fact-checker, publisher, architect, decomposer, design-reviewer, product-owner, specification-writer, ops-engineer, sre, threat-modeler, security-reviewer) are new — write from first principles based on the unit-05 spec descriptions.

**Important:** Hat files are guidance documents, not procedural scripts. They should NOT include `source` commands, library calls, or bash code blocks. Keep the hat files focused on: Focus, Produces, Reads, Anti-patterns. The detailed procedural content (quality gate hooks, telemetry, provider sync) stays in the skills that orchestrate execution — not in the stage definitions.

---
title: The Hat System
description: Understanding the hat-based role system within stages
order: 4
---

H·AI·K·U uses a "hat" metaphor to separate concerns. Each hat represents a distinct mindset, set of responsibilities, and communication style. Hats are organized within **stages** -- each stage has a `hats/` directory containing per-hat instruction files (e.g., `stages/development/hats/builder.md`). Different stages use different hat combinations depending on the type of work being done.

## Why Hats?

The hat system prevents:

- **Context drift**: Accidentally switching between planning and building
- **Scope creep**: Building features that weren't planned
- **Quality shortcuts**: Skipping review to "just ship it"
- **Role confusion**: Trying to attack and defend code at the same time

By explicitly switching hats, you maintain focus and ensure each phase gets proper attention. Domain research happens during inception (`/haiku:start`), before execution begins.

## Software Studio Stages

The software studio organizes hats into discipline-specific stages. Each stage runs its hat sequence independently.

### Inception Stage

Hats used during `/haiku:start` to define the intent and elaborate work.

#### Researcher

Understands the problem space at a business level — what problem are we solving, who benefits, and what does success look like.

- Feature goal & vision — the problem today, desired outcome, and why now
- Origin context — where the request came from and strategic alignment
- Competitive landscape — how competitors handle this problem space
- Considerations & risks — technical constraints, business considerations, open questions
- UI impact — which screens, flows, or surfaces are affected
- Success criteria — functional and outcome-based measures
- Technical landscape — existing code structure, architecture patterns, and constraints

#### Elaborator

Elaborates the intent into cohesive, independently deliverable units.

- Creates units with clear boundaries and minimal coupling
- Defines dependency edges between units (DAG)
- Assigns disciplines and success criteria per unit
- Ensures each unit is independently deployable

### Design Stage

Hats used when the studio includes a design stage for UI/UX work.

#### Designer

Creates visual designs, UI mockups, and user experience flows.

- Clarifies the design problem and identifies user goals and pain points
- Generates multiple design alternatives and presents trade-offs
- Incorporates user feedback and documents design decisions
- Specifies responsive behavior, interaction states, and accessibility requirements
- Creates design specifications referencing named tokens from the project's design system

#### Design Reviewer

Validates design artifacts for completeness and implementability.

- Checks that design specs reference design tokens, not hard-coded values
- Verifies responsive breakpoints and interaction states are defined
- Confirms accessibility contrast ratios and focus management are specified
- Makes a clear APPROVE or REQUEST CHANGES decision

### Product Stage

Hats used when the studio includes a product stage for behavioral specifications.

#### Product Owner

Defines behavioral requirements and acceptance criteria from the user's perspective.

- Translates business goals into specific, testable user stories
- Identifies edge cases and error scenarios
- Prioritizes requirements by user impact
- Validates that specs match the original intent

#### Specification Writer

Creates detailed behavioral specifications that bridge design and development.

- Writes formal acceptance criteria for each user story
- Documents state transitions, validation rules, and error handling
- Creates data flow diagrams and API contracts
- Ensures specs are unambiguous enough for autonomous implementation

### Development Stage

The core execution stage with the primary hat sequence: **Planner -> Builder -> Reviewer**.

#### Planner

Creates tactical execution plans for upcoming bolts based on unit requirements.

- Reviews the current unit and identifies remaining completion criteria
- Creates a concrete, actionable plan for the next bolt
- Prioritizes high-impact criteria and breaks work into verifiable steps
- Flags potential blockers and suggests fallback approaches
- Saves the plan so the Builder can follow it without ambiguity

#### Builder

Implements code to satisfy completion criteria using backpressure as feedback.

- Follows the Planner's plan and works in small, verifiable increments
- Runs backpressure checks (tests, lint, types) after each change
- Treats test failures and lint errors as implementation guidance
- Documents progress and blockers in the scratchpad
- Commits working increments and signals completion or iterates

#### Reviewer

Verifies implementation satisfies completion criteria with code review and testing verification.

- Checks each completion criterion individually with programmatic verification
- Runs the full test suite and confirms all new code has corresponding tests
- Reviews code quality, security considerations, and edge case handling
- Provides specific, actionable feedback prioritized by severity
- Makes a clear APPROVE or REQUEST CHANGES decision with rationale

### Operations Stage

Hats used for ongoing maintenance and production operations.

#### Ops Engineer

Defines and manages operational tasks -- scheduled jobs, monitoring, and maintenance routines.

- Creates operation spec files with triggers, schedules, and success criteria
- Configures monitoring and alerting thresholds
- Defines runbook procedures for common incidents
- Manages deployment pipelines and rollback procedures

#### SRE

Focuses on reliability, performance, and incident response.

- Defines SLOs and error budgets
- Creates incident response playbooks
- Monitors system health and capacity
- Conducts post-incident reviews and implements preventive measures

### Security Stage

Hats used for security-focused development with attack-and-defend cycles.

#### Threat Modeler

Analyzes the system's attack surface and identifies potential threats.

- Maps trust boundaries, data flows, and entry points
- Identifies threat categories using STRIDE or equivalent framework
- Prioritizes threats by likelihood and impact
- Creates a threat model document for the team

#### Red Team

Attempts to break the implementation through security testing and vulnerability discovery.

- Enumerates the attack surface: inputs, API parameters, headers, auth boundaries
- Tests for injection vulnerabilities (SQL injection, XSS, command injection, path traversal)
- Attempts authentication bypass and privilege escalation (horizontal and vertical)
- Checks for information disclosure in errors, logs, and URL parameters
- Documents every finding with severity rating and reproduction steps -- does not fix anything

#### Blue Team

Fixes vulnerabilities identified by Red Team with proper security controls and tests.

- Prioritizes findings by severity, addressing Critical and High issues first
- Fixes root causes using secure coding patterns, not just symptoms
- Adds security tests that reproduce each vulnerability (fail before fix, pass after)
- Implements defense in depth with multiple layers of protection
- Re-runs Red Team attacks to verify all previous attacks now fail

#### Security Reviewer

Validates that security controls are properly implemented and no regressions were introduced.

- Reviews all security fixes for completeness and correctness
- Verifies security tests cover the identified vulnerabilities
- Checks for common security anti-patterns in the codebase
- Makes a clear APPROVE or REQUEST CHANGES decision

## Ideation Studio Stages

The ideation studio is designed for content creation, research, and non-code work.

### Research Stage

#### Researcher

Gathers information, data, and source material relevant to the intent.

- Identifies and evaluates primary and secondary sources
- Synthesizes findings into structured research notes
- Highlights key insights, contradictions, and knowledge gaps

#### Analyst

Evaluates research findings and identifies patterns and implications.

- Analyzes data for trends, correlations, and outliers
- Creates frameworks for organizing complex information
- Provides evidence-based recommendations

### Create Stage

#### Creator

Produces the primary deliverable -- articles, reports, presentations, or other content.

- Synthesizes research into coherent narrative or structure
- Follows established style guides and conventions
- Creates drafts iteratively, incorporating feedback

#### Editor

Refines content for clarity, accuracy, and consistency.

- Reviews for grammar, style, and tone consistency
- Verifies factual claims against research sources
- Suggests structural improvements for readability

### Review Stage

#### Critic

Provides substantive feedback on content quality and effectiveness.

- Evaluates argument strength, evidence quality, and logical flow
- Identifies gaps, weak points, and unsupported claims
- Suggests improvements with specific, actionable recommendations

#### Fact Checker

Verifies factual accuracy of all claims in the content.

- Cross-references claims against primary sources
- Identifies unverified or unverifiable claims
- Flags potential misinformation or outdated data

### Deliver Stage

#### Publisher

Prepares content for distribution and publication.

- Formats content for the target platform
- Creates metadata, tags, and descriptions
- Manages publication workflow and scheduling

## Other Studio Hats

H·AI·K·U ships with hats for all built-in studios. Each studio's stages define their own hat sequences tailored to the domain:

- **Data Pipeline**: data-architect, schema-analyst, extractor, transformer, data-modeler, validator, pipeline-engineer, sre
- **Migration**: migration-analyst, risk-assessor, schema-mapper, migration-engineer, validator, cutover-coordinator, rollback-engineer
- **Incident Response**: incident-commander, first-responder, investigator, log-analyst, mitigator, verifier, engineer, postmortem-author
- **Compliance**: compliance-analyst, auditor, risk-assessor, remediation-engineer, policy-writer, evidence-collector, audit-liaison
- **Sales**: prospect-researcher, qualifier, deal-strategist, proposal-writer, solution-architect, negotiator, closer
- **Marketing**: market-researcher, audience-analyst, strategist, content-creator, copy-editor, campaign-manager, analyst
- **Customer Success**: onboarding-lead, adoption-coach, health-monitor, growth-strategist, renewal-manager
- **Product Strategy**: market-explorer, user-researcher, prioritizer, roadmap-architect, presenter
- **Documentation**: auditor, gap-analyst, architect, writer, editor, subject-matter-expert, publisher

See [Studios](/docs/studios/) for the full stage pipelines and [Customization](/docs/customization/) for creating your own hats.

## Cross-Stage Hats

Some hats operate across stages or at the intent level.

### Integrator

Final intent-level validation that verifies all units work together on the merged intent branch.

- Confirms the merged intent branch is clean with all unit branches merged
- Runs the full backpressure suite (tests, lint, types) on the combined codebase
- Verifies intent-level success criteria that span multiple units
- Checks cross-unit boundaries, shared state, APIs, and data flows for integration gaps
- Makes a clear ACCEPT or REJECT decision, identifying specific units for rework if needed

## Hat Transitions

Hat transitions are defined by the stage being executed. Each stage defines its own sequence:

- **Development**: Planner -> Builder -> Reviewer
- **Design**: Designer -> Design Reviewer
- **Product**: Product Owner -> Specification Writer
- **Security**: Threat Modeler -> Red Team -> Blue Team -> Security Reviewer

Within any stage, you can transition backward when needed:

- **Builder -> Planner**: When the plan needs revision based on new discoveries
- **Reviewer -> Builder**: When review identifies issues to fix
- **Blue Team -> Red Team**: When fixes reveal new attack vectors

The key is making transitions *intentional*. Don't drift -- explicitly switch. See the [Studios & Stages](/docs/studios/) documentation for details on each studio's full stage pipeline.

## Tips for Effective Hat Usage

1. **Announce your hat**: Start each phase by explicitly stating which hat you're wearing
2. **Stay in character**: Resist the urge to jump ahead to building while planning
3. **Trust the process**: Even when you "know" the answer, earlier phases often reveal surprises
4. **Respect the boundaries**: Red Team documents vulnerabilities but does not fix them; Blue Team fixes but does not discover new ones
5. **Let backpressure guide you**: Tests, lint, and types are feedback mechanisms, not obstacles

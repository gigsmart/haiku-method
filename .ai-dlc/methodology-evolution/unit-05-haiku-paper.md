---
status: completed
depends_on: [unit-01-haiku-foundation]
branch: ai-dlc/methodology-evolution/05-haiku-paper
discipline: documentation
workflow: ""
ticket: ""
---

# unit-05: HAIKU Methodology Paper

## Description
Write the HAIKU methodology paper — the canonical articulation of the universal human-AI collaboration framework. This builds on the existing AI-DLC 2026 paper but generalizes it for any domain, adds the Operation and Reflection phases, and uses domain-agnostic language throughout. AI-DLC and SWARM are referenced as concrete domain implementations.

## Discipline
documentation

## Domain Entities
- HAIKU (framework), Phase (all 4), Profile, Quality Gate, Hat, Workflow

## Data Sources
- Existing AI-DLC paper: `website/content/papers/ai-dlc-2026.md` in the AI-DLC repo (~1400 lines)
- HAIKU manifesto from unit-01
- Discovery log: detailed analysis of current paper terminology and gaps
- SWARM brief: the marketing/sales framework that validates universality

## Technical Specification

### Paper Structure (in HAIKU repo at `paper/haiku-method.md` or similar)

**Section 1: Introduction**
- The problem: structured work requires disciplined human-AI collaboration, not ad-hoc prompting
- HAIKU = Human AI Knowledge Unification
- The 4-phase lifecycle: Elaboration -> Execution -> Operation -> Reflection
- Who this is for: any team running structured initiatives with AI collaboration

**Section 2: Core Principles**
Adapt from AI-DLC paper but generalize:
- Collapse of traditional phase handoffs (not just SDLC — any workflow)
- Context preservation through artifacts (not just code — any deliverable)
- Iterative refinement through quality enforcement (not just tests — configurable gates)
- Human oversight at strategic moments (HITL/OHOTL/AHOTL modes apply universally)

**Section 3: The 4-Phase Lifecycle**
- **Elaboration**: Define intent, decompose into units, set success criteria, build domain model. Same core concept as AI-DLC's Mob Elaboration but domain-agnostic. Works for software features, marketing campaigns, strategic plans, research projects.
- **Execution**: Do the work. Autonomous execution loop with hat-based workflows (planner -> executor -> reviewer). Quality gates provide backpressure. Executor produces both the deliverable AND an operational plan.
- **Operation**: Manage what was built. Follow the operational plan: recurring tasks, reactive responses, manual human activities. Can be automated (agent-driven) or guided (human with AI assistance).
- **Reflection**: Learn and evolve. Analyze the full cycle: execution metrics, operational outcomes, criteria satisfaction. Produce reflection artifacts. Feed forward into: (a) next iteration of the same intent, (b) organizational memory for all future work.

**Section 4: Operating Modes**
Adapt HITL/OHOTL/AHOTL from AI-DLC:
- Supervised: Human reviews every deliverable
- Observed: Human monitors but doesn't block
- Autonomous: AI runs the full cycle, human reviews at phase boundaries
- These modes apply to ALL phases, not just Execution

**Section 5: The Profile Model**
- HAIKU is the universal core
- Domain profiles add specialized hats, quality gates, workflows, and tooling
- AI-DLC profile: software development (git, tests, lint, PRs, deployment)
- SWARM profile: marketing/sales (briefs, campaigns, Slack reminders, close-outs)
- How to create custom profiles for any domain

**Section 6: Practical Examples**
- Example 1: Software feature (using AI-DLC profile) — show all 4 phases
- Example 2: Marketing campaign (using SWARM profile) — show all 4 phases
- Example 3: Strategic planning / business process — show HAIKU core without a profile

**Section 7: Adoption**
- Starting with Elaboration only (planning tool for humans)
- Adding Execution (AI does the work or AI guides humans)
- Growing into Operation and Reflection
- Incremental adoption path — don't need all 4 phases to start

### Language Guidelines
From discovery log — terms that MUST be generalized:
| AI-DLC Term | HAIKU Term |
|---|---|
| Construction | Execution |
| Builder (hat) | Executor |
| Code, codebase | Artifacts, deliverables, work output |
| Tests, lint, typecheck | Quality gates (configurable) |
| Deployment | Operationalization, release |
| Backpressure | Quality enforcement |
| Commit, branch, PR | Checkpoint, version, review |

### Non-Software Examples Required
The paper MUST include at least 2 fully-worked non-software examples:
1. Marketing campaign using SWARM mapping (Scope -> Workstreams -> Execute -> Remind -> Close-out/Memory)
2. Business strategy or process design (showing Elaboration -> Execution -> Operation -> Reflection without any code)

## Success Criteria
- [ ] Paper articulates all 4 phases with equal depth: Elaboration, Execution, Operation, Reflection
- [ ] Domain-agnostic language throughout — no software-specific assumptions in core sections
- [ ] AI-DLC referenced as the software development profile
- [ ] SWARM referenced as marketing/sales validation
- [ ] At least 2 non-software worked examples
- [ ] Operating modes (HITL/OHOTL/AHOTL) described for all phases
- [ ] Profile model clearly explained with instructions for creating custom profiles
- [ ] Incremental adoption path described

## Risks
- **Paper becomes too abstract**: Generalizing everything may lose the concreteness that makes AI-DLC's paper compelling. Mitigation: use specific domain examples throughout, not just abstract principles.
- **Length**: A comprehensive paper covering 4 phases + profiles + examples could be very long. Mitigation: keep sections focused; link to detailed guides rather than inlining everything.

## Boundaries
This unit writes the paper. It does NOT build the plugin (unit-02), website (unit-07), or modify AI-DLC (unit-06).

## Notes
- The AI-DLC 2026 paper is the reference template — same quality and depth, broader scope
- Consider the paper living at `paper/` in the HAIKU repo, published to haikumethod.ai
- The paper should be the "source of truth" that the plugin implements

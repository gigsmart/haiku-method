---
title: 'H•AI•K•U: Evolve AI-DLC into a Universal Human-AI Collaboration Framework'
studio: software
stages:
  - inception
  - design
  - product
  - development
  - operations
  - security
mode: continuous
active_stage: security
status: completed
started_at: 2026-03-06T06:49:58.000Z
completed_at: 2026-04-01T13:21:44.000Z
created_at: '2026-04-12T23:20:53.047Z'
---


# H•AI•K•U: Evolve AI-DLC into a Universal Human-AI Collaboration Framework

## Problem

AI-DLC is a powerful methodology for AI-driven software development, but its concepts (elaboration, construction, quality gates, iterative execution) are fundamentally domain-agnostic. The methodology is artificially limited by software-specific language, git-dependent infrastructure, and the absence of two critical lifecycle phases: Operation (automated management of what was built) and Reflection (learning from outcomes to improve future cycles).

Businesses need a universal framework for running any initiative — software, marketing, strategy, operations — through disciplined human-AI collaboration. The current AI-DLC plugin cannot serve this need because it assumes git, hardcodes tests/lint/types as quality gates, and stops at code delivery with no operational or learning phases.

## Solution

Create **H•AI•K•U** (Human AI Knowledge Unification) — a universal human-AI collaboration framework with a 4-phase lifecycle: Elaboration, Execution, Operation, Reflection. H•AI•K•U is the domain-agnostic core; AI-DLC becomes the software development implementation of H•AI•K•U.

Architecture:
- **H•AI•K•U core plugin** — universal, works in repos (git) and folders (cowork), domain-agnostic hats/gates/workflows
- **AI-DLC plugin** — extends H•AI•K•U with software-specific features (git worktrees, tests/lint/types, PRs, deployment)
- **SWARM** — referenced as the marketing/sales validation of H•AI•K•U's universality
- **haikumethod.ai** — website for the universal framework

## Domain Model

### Entities
- **H•AI•K•U** — The universal framework. Human AI Knowledge Unification. Domain-agnostic methodology for any structured work.
- **Phase** — One of four lifecycle stages: Elaboration, Execution, Operation, Reflection. Each has distinct mechanics, artifacts, and quality gates.
- **Intent** — The thing being accomplished. Domain-agnostic: feature, campaign, strategy, process, research.
- **Unit** — A discrete piece of work within an intent. Has discipline, dependencies, workflow.
- **Bolt** — The iteration cycle an agent runs within a unit.
- **Hat** — A behavioral role (planner, executor, reviewer, etc.). Domain-agnostic.
- **Workflow** — Ordered sequence of hats defining how a unit progresses.
- **Quality Gate** — Configurable verification mechanism. Software: tests/lint/types. Marketing: stakeholder sign-off. Domain-specific.
- **Storage Backend** — How state persists. Git mode (branches/worktrees) or folder mode (subdirectories/files). Auto-detected.
- **Profile** — A domain-specific implementation of H•AI•K•U. AI-DLC (software), SWARM (marketing/sales), future profiles.
- **Operational Plan** — Defines what needs to happen to run/manage what was built. Created during Execution, automated during Operation.
- **Reflection Artifact** — Learnings from a completed cycle. Feeds forward into next iteration and organizational memory.

### Relationships
- H•AI•K•U defines 4 Phases (Elaboration -> Execution -> Operation -> Reflection -> loop)
- Profiles implement H•AI•K•U for specific domains (AI-DLC for software, SWARM for marketing)
- Intent contains Units (DAG-ordered by dependencies)
- Unit is executed through Bolts, each wearing a Hat from its Workflow
- Quality Gates validate during Execution (domain-configurable)
- Execution produces an Operational Plan alongside the deliverable
- Operation follows the Operational Plan automatically
- Reflection produces Reflection Artifacts that feed into: (a) next version of same Intent, (b) organizational memory
- Storage Backend auto-detects: git repo -> git mode, plain folder -> folder mode

### Data Sources
- **AI-DLC Plugin** (`plugin/`) — 14 hats, 17 skills, 4 hooks, 2 core libs (~2500 lines), 4 workflows
- **Paper** (`website/content/papers/ai-dlc-2026.md`) — Current methodology (~1400 lines)
- **Website** (`website/`) — Next.js 15 App Router, static export
- **Settings/Schemas** (`plugin/schemas/`) — Configuration validation, 8 provider schemas
- **Discovery log** (`.ai-dlc/methodology-evolution/discovery.md`) — Detailed technical findings from elaboration

### Data Gaps
- No H•AI•K•U core plugin exists — must be built from scratch (informed by AI-DLC patterns)
- No Operation phase implementation — conceptual in paper, zero code
- No Reflection phase — not in paper, not in plugin
- No folder-based storage — han keep is entirely git-dependent
- No domain-agnostic quality gate configuration

## Success Criteria
- [ ] H•AI•K•U framework is defined: Human AI Knowledge Unification, with 4-phase lifecycle
- [ ] H•AI•K•U methodology paper articulates Elaboration, Execution, Operation, Reflection with domain-agnostic language
- [ ] H•AI•K•U core plugin works in both git repos and plain folders (auto-detect)
- [ ] Quality gates are configurable per domain, not hardcoded to tests/lint/typecheck
- [ ] `/reflect` skill produces reflection artifacts that feed forward into next iteration and org memory
- [ ] `/operate` skill reads operational plans and automates tasks
- [ ] AI-DLC plugin extends or depends on H•AI•K•U core for software-specific features
- [ ] Existing AI-DLC git-based workflows function identically (backward compatibility)
- [ ] Reflection and Operation phases are opt-in (teams can use Elaboration + Execution only)
- [ ] Custom quality gates and hats definable per-project without modifying plugin core
- [ ] Website at haikumethod.ai reflects the universal methodology
- [ ] Paper includes non-software domain examples (marketing/SWARM validation)
- [ ] All existing tests pass
- [ ] Announcements generated: changelog, release notes, social posts, blog draft

## Context
- H•AI•K•U name: Human AI Knowledge Unification. Domain: haikumethod.ai
- Japanese-inspired, bushido-adjacent: disciplined structure, intentional form (like haiku poetry)
- SWARM (Scope Workstreams Accountability Results Memory) — a friend's marketing framework that independently validated the same 4-phase pattern
- AI-DLC terminology preserved: Intent (epic), Unit (ticket/story), Bolt (sprint iteration)
- Discovery log contains detailed technical analysis of current plugin architecture, paper content, and config system

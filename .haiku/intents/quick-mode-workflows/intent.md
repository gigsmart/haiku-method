---
title: Quick Mode Workflows + Intelligent Routing
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
started_at: 2026-03-30T23:13:58.000Z
completed_at: 2026-03-31T07:15:57.000Z
created_at: '2026-04-14T22:17:30.379Z'
---


# Quick Mode Workflows + Intelligent Routing

## Problem
The current `/quick` skill skips all AI-DLC workflow machinery — no hats, no planner/builder/reviewer cycle, no structured review. This means even trivial tasks miss the backpressure benefits of hat-based workflows. Meanwhile, users who describe tasks without invoking a slash command get no guidance on whether `/quick` or `/elaborate` is the appropriate path.

## Solution
Evolve `/quick` into a lightweight, workflow-aware execution mode and add intelligent routing at task intake:

1. **Workflow-aware quick mode**: `/quick` accepts an optional workflow name as first argument (e.g., `/quick tdd fix the validator`), reads the hat sequence from `workflows.yml`, and runs an in-memory hat loop. No state files, no worktrees, no elaboration artifacts — but full hat-based discipline with one commit per hat cycle.

2. **Intelligent routing**: When users describe tasks without a slash command, the agent assesses scope using heuristics and suggests `/quick` (with a workflow recommendation) or `/elaborate`. User always confirms.

## Domain Model

### Entities
- **QuickTask**: User's task description with selected workflow and scope classification
- **Workflow**: Named sequence of hats from `workflows.yml`
- **Hat**: Behavioral role with instructions for a specific phase of work
- **HatCycle**: One pass through a hat during quick mode execution (commits when applicable)
- **RoutingSuggestion**: Agent's scope assessment suggesting quick vs elaborate

### Relationships
- QuickTask runs through exactly one Workflow
- Workflow contains ordered Hat sequence
- Each Hat produces zero or one HatCycles (builder hats commit, reviewer hats don't)
- Reviewer rejection loops back to builder for additional HatCycles (max 3 cycles)
- RoutingSuggestion references both QuickTask and available Workflows

### Data Sources
- **Workflow definitions** (`plugin/workflows.yml` + `.ai-dlc/workflows.yml`): Named workflows with hat sequences
- **Hat definitions** (`plugin/hats/*.md`): Full hat behavioral instructions — quick mode uses inline behavioral guidelines derived from these
- **Task description** (user input): Raw text from skill argument

### Data Gaps
- Workflow reading at skill time: solved by direct YAML file reading in the skill
- Lightweight hat summaries: solved by inline behavioral guidelines tailored for stateless operation
- Scope classification: solved by heuristic guidelines for agent judgment

## Success Criteria
- [ ] `/quick` accepts an optional workflow name as first argument (e.g., `/quick tdd fix the input validator`) and falls back to `default` workflow when not specified
- [ ] Quick mode reads workflow definitions from `plugin/workflows.yml` (and `.ai-dlc/workflows.yml` if present) to resolve the hat sequence for the selected workflow
- [ ] Quick mode creates a temporary `.ai-dlc/quick/` artifact (intent.md + iteration.json) that enables the existing hook system to inject hat context into subagents
- [ ] The `.ai-dlc/quick/` artifact is gitignored and cleaned up after completion (never committed)
- [ ] Each hat phase spawns a subagent that receives hat context via the existing hook system — hat files are the single source of truth
- [ ] Builder hats produce one git commit per cycle; non-builder hats (planner, reviewer) produce no commits
- [ ] Reviewer rejection loops back to the builder hat for an additional cycle, with an iteration limit (max 3 cycles) before recommending `/elaborate`
- [ ] Quick mode still rejects cowork mode (`CLAUDE_CODE_IS_COWORK=1`)
- [ ] Scope validation still triggers — if the task turns out to be too complex during any hat phase, the skill recommends `/elaborate`
- [ ] Routing heuristics are added to the SessionStart context injection so the agent suggests `/quick` or `/elaborate` when a user describes a task without an explicit slash command
- [ ] Lint passes (`bun run lint`) after all changes

## Context
Key design decisions from elaboration:
- One commit per hat cycle (not squashed) — reviewer approval = no commit, reviewer rejection = builder fixes and commits again
- Temporary `.ai-dlc/quick/` artifact enables hook system integration — gitignored, cleaned up after completion
- Subagent delegation — each hat phase spawns a subagent with hat context injected by the existing hook system
- Hat files are the single source of truth — read at runtime by hooks, never inlined in the skill
- Agent suggests routing, user confirms — never auto-routes
- Work happens in current directory — no worktree isolation
- Workflow selection via positional argument: `/quick [workflow] <task description>`
- Max 3 builder->reviewer cycles before recommending `/elaborate` to prevent scope creep

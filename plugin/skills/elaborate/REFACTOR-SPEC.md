---
title: Elaborate Skill Refactor — Composable Sub-Skill Architecture
status: planned
---

# Elaborate Skill Refactor

## Problem

The elaborate skill is a single massive file (~2400 lines) that runs the same phases regardless of whether the intent uses single-pass (collaborative) or multi-pass (disciplinary) mode. The two modes have fundamentally different elaboration needs, but the skill doesn't differentiate.

## Goal

Refactor the elaborate skill into a dispatcher + composable sub-skills, where each collaboration mode composes the phases it needs in the right order with the right context.

## Architecture

```
elaborate/SKILL.md (dispatcher)
  Phases 0-1: Pre-check, gather intent, detect mode
  Route based on: passes config + active_pass
  │
  ├── subskills/single-pass/SKILL.md
  │     Full collaborative elaboration — all disciplines, one session
  │     Composes shared sub-skills in order
  │
  └── subskills/pass-elaborate/SKILL.md
        Per-pass elaboration — parameterized by active_pass
        Loads pass definition file for context
        Composes subset of shared sub-skills based on pass type
```

### Shared Sub-Skills (composable building blocks)

Each is a self-contained sub-skill that either mode can invoke:

| Sub-Skill | Already Exists? | Purpose |
|---|---|---|
| `discover` | Yes | Deep technical exploration, write discovery.md |
| `knowledge-synthesize` | Yes | Bootstrap/update knowledge layer |
| `wireframes` | Yes | Generate HTML wireframes (fidelity-aware) |
| `ticket-sync` | Yes | Sync units to ticketing provider |
| `adversarial-review` | Yes | Probe for spec gaps |
| `design-direction` | **New** | Extract from Phase 2.75 — archetype picker, blueprint generation |
| `criteria` | **New** | Extract from Phase 4 — success criteria definition with NFRs |
| `decompose` | **New** | Extract from Phase 5 — unit decomposition with DAG |
| `workflow-select` | **New** | Extract from Phase 3 — hat/workflow discovery and selection |
| `git-strategy` | **New** | Extract from Phase 5.8 — delivery strategy, branching |
| `load-prior-artifacts` | **New** | Read completed pass artifacts as context for subsequent passes |

### Mode Routing

The dispatcher detects mode after Phase 1:

```bash
# From intent frontmatter (existing intent) or project defaults (new intent)
PASSES=$(...)
ACTIVE_PASS=$(...)

if [ -z "$PASSES" ] || [ -z "$ACTIVE_PASS" ]; then
  # Single-pass collaborative mode
  route → subskills/single-pass/SKILL.md
else
  # Multi-pass — elaborate for the active pass
  route → subskills/pass-elaborate/SKILL.md (with ACTIVE_PASS context)
fi
```

## Single-Pass Composition

All disciplines contribute. The elaboration is longer and more thorough.

```
1. discover
2. knowledge-synthesize
3. design-direction          ← full design contribution
4. workflow-select
5. criteria                  ← all discipline types (design + product + dev)
6. decompose                 ← all unit types
7. git-strategy
8. wireframes (HIGH fidelity) ← this is the only design work, go deep
9. ticket-sync
10. adversarial-review
11. handoff
```

Wireframe fidelity: **High** — styled, interaction states, responsive breakpoints, error/empty/loading states. This is the designer's only shot. No design pass refines these later.

## Multi-Pass Composition (per active_pass)

### Design Pass Elaboration

```
1. discover (or load-prior-artifacts if not first pass)
2. knowledge-synthesize (if first elaboration)
3. design-direction          ← full
4. workflow-select           ← constrained to design pass workflows
5. criteria                  ← design criteria only
6. decompose                 ← design units only
7. wireframes (LOW fidelity) ← structural, gray-box; bolt cycles will refine
8. adversarial-review
9. handoff
```

### Product Pass Elaboration

```
1. load-prior-artifacts      ← read design pass outputs as context
2. workflow-select           ← constrained to product pass workflows
3. criteria                  ← product/behavioral criteria only
4. decompose                 ← acceptance units only
5. adversarial-review
6. handoff
```

### Dev Pass Elaboration

```
1. load-prior-artifacts      ← read design + product pass outputs as context
2. workflow-select           ← constrained to dev pass workflows
3. criteria                  ← dev criteria only (may reference prior criteria)
4. decompose                 ← dev units only
5. git-strategy
6. ticket-sync
7. adversarial-review
8. handoff
```

### Custom Pass Elaboration

For custom passes (not design/product/dev), the pass definition file controls composition:

```yaml
# .haiku/passes/security.md frontmatter
---
name: security
description: Threat modeling and penetration testing
available_workflows: [adversarial]
default_workflow: adversarial
skip: [wireframes, design-direction]
add: [threat-model]  # custom sub-skill in .haiku/subskills/
---
```

The pass-elaborate sub-skill reads `skip` and `add` from the pass definition to customize its phase composition.

## Wireframe Fidelity

The wireframe sub-skill already has Mode A (styled) and Mode B (gray-box). Map these to collaboration model:

| Context | Fidelity | Wireframe Mode | Rationale |
|---|---|---|---|
| Single-pass | High | Mode A (styled) + interaction states + responsive | Only design work — go deep |
| Multi-pass, design pass | Low | Mode B (gray-box, structural) | Bolt cycles during execute will refine |
| Multi-pass, other passes | Skip | N/A | Design artifacts already exist |

The fidelity parameter is passed in the wireframe brief file that the parent sub-skill writes.

## Pass Definition File Extensions

Add optional elaboration-specific frontmatter to pass definition files:

```yaml
---
name: design
description: Visual and interaction design
available_workflows: [design]
default_workflow: design
# New: elaboration composition hints
skip: []           # sub-skills to skip during this pass's elaboration
add: []            # custom sub-skills to add
criteria_focus: design    # what type of criteria to emphasize
unit_types: [design, frontend]  # what unit disciplines to create
---
```

This lets the pass definition file influence elaboration behavior without hard-coding pass-specific logic in the sub-skill.

## Migration Path

1. Extract shared phases into new sub-skills (criteria, decompose, design-direction, workflow-select, git-strategy, load-prior-artifacts)
2. Create single-pass sub-skill that composes them
3. Create pass-elaborate sub-skill that composes them per-pass
4. Refactor main SKILL.md into dispatcher (Phases 0-1 + routing)
5. Keep existing sub-skills (discover, wireframes, etc.) as-is — they already work as composable units
6. Add fidelity parameter to wireframe brief
7. Add elaboration hints to pass definition frontmatter schema

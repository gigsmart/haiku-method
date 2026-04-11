---
name: elaborator
stage: inception
studio: software
---

**Focus:** Break the intent into units with clear boundaries, define the dependency DAG, and write verifiable completion criteria for each unit. Each unit should be completable within a single bolt.

**Produces:** Unit specs with completion criteria, dependencies, scope boundaries, and `model:` field assignments.

**Reads:** Researcher's discovery output via the unit's `## References` section.

**Anti-patterns (RFC 2119):**
- The agent **MUST NOT** create units that are too large (more than one bolt to complete)
- The agent **MUST NOT** create units with circular dependencies
- The agent **MUST NOT** write vague criteria ("it works", "tests pass")
- The agent **MUST** define clear boundaries between units
- The agent **MUST NOT** elaborate by layer (all backend, then all frontend) instead of by feature slice

## Model Assignment

Every unit **MUST** be assigned a `model:` field during elaboration. The model selection reflects the cognitive complexity of the work, not its importance or urgency.

### Three Model Tiers

**opus** — Architectural decisions, competing approaches, no established pattern to follow, high cascading-failure risk.
- Signals: "How should we structure this?", "Should we use X or Y approach?", "What's the safest design here?", "This could break other systems if we get it wrong."
- Example: "Redesign the state machine for intent lifecycle" — requires architectural judgment.

**sonnet** — Known patterns with judgment calls, standard feature additions, cross-file changes requiring coordination.
- Signals: "Here's the pattern, apply it consistently", "This feature uses our normal flow", "Multiple files change but integration is clear", "We've done similar work before."
- **Default when uncertain.** If you can't decide between sonnet and opus, pick sonnet — the elaborator can always escalate upward.
- Example: "Add a new field to unit frontmatter and wire it through the orchestrator" — standard pattern, clear scope.

**haiku** — Purely mechanical execution, copy-paste-adapt patterns, additive-only changes, no decision-making required.
- Signals: "Just repeat what we already do here", "No design choices involved", "Following a single clear path", "Zero risk of breaking other systems."
- Example: "Add a new hat to the development stage" — copy existing hat template, update names, done.

### Decision Heuristic

Start at **sonnet**. Justify upward to **opus** if the unit involves architectural or trade-off decisions. Justify downward to **haiku** if the unit is purely mechanical with no judgment calls.

### Anti-patterns (RFC 2119)

- The agent **MUST NOT** assign `opus` to units with fully-specified mechanical execution paths.
- The agent **MUST NOT** leave the `model:` field unset — every unit spec **MUST** include the field.
- The agent **MUST NOT** assign the same model to all units without assessing each individually.
- The agent **MUST NOT** use "this is important work" as justification for `opus` — importance and complexity are different concepts.

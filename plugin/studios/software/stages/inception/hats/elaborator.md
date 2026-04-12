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

Every unit **MUST** have a `model:` field in its frontmatter, set during elaboration based on complexity assessment. The elaborator assesses each unit individually and assigns one of three tiers:

### Complexity Tiers

| Model | When to use | Signals |
|-------|-------------|---------|
| `opus` | Complex architectural work | No existing pattern to follow, competing design approaches, high cascading-failure risk, core orchestration changes, security-critical decisions |
| `sonnet` | Standard implementation (**default**) | Known patterns with judgment calls, cross-file changes, standard feature additions. **Use when uncertain.** |
| `haiku` | Mechanical execution | Purely additive changes, copy-paste-adapt patterns, string/config changes, no decision-making required |

### Decision Heuristic

Start at `sonnet`. Justify **upward** to `opus` only when the unit requires genuine architectural judgment between competing approaches. Justify **downward** to `haiku` only when execution is fully mechanical with zero ambiguity.

### Anti-patterns (RFC 2119)

- The agent **MUST NOT** assign `opus` to units with fully-specified mechanical execution paths
- The agent **MUST NOT** leave `model:` unset — every unit spec **MUST** include the field
- The agent **MUST NOT** assign the same model to all units without assessing each individually
- The agent **MUST NOT** let "this is important work" justify `opus` — importance and complexity are different

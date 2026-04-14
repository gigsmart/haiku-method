---
depends_on: []
discipline: documentation
model: haiku
status: completed
bolt: 2
hat: reviewer
started_at: '2026-04-11T01:23:04Z'
hat_started_at: '2026-04-11T01:27:25Z'
completed_at: '2026-04-11T01:28:29Z'
---

# Elaborator Model Guidance — Implementation

## Scope

Update `plugin/studios/software/stages/inception/hats/elaborator.md` to include model assignment guidance. Single-file change.

## Deliverables

1. Add a "Model Assignment" section to the elaborator hat with:
   - Requirement that every unit MUST have a `model:` field
   - Three complexity tiers with concrete signals: opus (architectural decisions, no existing pattern), sonnet (known patterns with judgment, default when uncertain), haiku (mechanical execution, copy-paste-adapt)
   - Decision heuristic: start at sonnet, justify upward or downward
   - Four RFC 2119 anti-patterns: MUST NOT default to opus, MUST NOT skip model, MUST NOT assign same model to all, MUST NOT confuse importance with complexity
2. Update the `Produces:` section to mention `model:` field in unit frontmatter

## Completion Criteria

- [x] `elaborator.md` contains a "Model Assignment" section
- [x] Three tiers defined with concrete distinguishing signals
- [x] `sonnet` named as default with explicit justification
- [x] All four anti-patterns present with MUST NOT language
- [x] `Produces:` section mentions `model:` field

## References

- `plugin/studios/software/stages/inception/hats/elaborator.md` — the one file
- `.haiku/intents/cascading-model-selection/knowledge/elaborator-landscape.md` — research
- `.haiku/intents/cascading-model-selection/knowledge/unit-02-implementation-acceptance.md` — acceptance criteria

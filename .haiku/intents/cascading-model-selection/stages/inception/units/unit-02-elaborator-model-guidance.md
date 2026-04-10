---
type: research
depends_on: []
discipline: documentation
model: sonnet
status: active
bolt: 1
hat: elaborator
started_at: '2026-04-10T22:14:07Z'
hat_started_at: '2026-04-10T22:23:20Z'
---

# Elaborator Complexity Assessment & Model Guidance

## Scope

Update the elaborator hat definition to include complexity assessment guidance so the elaborator assigns `model:` to each unit during inception.

## Deliverables

1. **Elaborator hat update** — Add a "Model Assignment" section to `plugin/studios/software/stages/inception/hats/elaborator.md` with:
   - Complexity assessment heuristics
   - Model selection guidance: `opus` for complex architectural work, `sonnet` for standard implementation, `haiku` for mechanical/straightforward changes
   - Anti-pattern: MUST NOT default everything to opus, MUST assess each unit individually
   - Anti-pattern: MUST NOT skip model assignment — every unit MUST have a `model:` field

2. **Cross-studio elaborator coverage** — Any studio with an elaborator-like hat in its inception stage should get the same model assignment guidance. Check all studios for inception-stage hats that elaborate units.

## Completion Criteria

- [ ] Software studio's `elaborator.md` includes model assignment section with complexity heuristics
- [ ] At least the three complexity tiers are defined (opus/sonnet/haiku) with clear examples of when each applies
- [ ] Anti-patterns enforce that every unit gets a model assignment
- [ ] All studios with elaborator hats in inception stages are updated consistently

## References

- `plugin/studios/software/stages/inception/hats/elaborator.md` — Current elaborator hat
- `plugin/studios/*/stages/inception/hats/` — Other studio elaborators

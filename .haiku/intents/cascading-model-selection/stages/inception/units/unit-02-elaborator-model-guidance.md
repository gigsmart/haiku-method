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

Update `plugin/studios/software/stages/inception/hats/elaborator.md` to include complexity assessment guidance so the elaborator assigns `model:` to each unit during inception.

Research confirmed this is a single-file change. All 21 studios were surveyed — only the software studio has a dedicated `inception` stage with an `elaborator` hat that produces unit spec files. No other studio qualifies for this update.

## Deliverables

1. **Elaborator hat update** — Add a "Model Assignment" section to `plugin/studios/software/stages/inception/hats/elaborator.md` with:
   - Requirement that every unit MUST have a `model:` field set during elaboration (not optional)
   - Complexity assessment heuristics with specific signals for each tier
   - Model selection guidance: `opus` for complex architectural work requiring judgment between competing approaches, `sonnet` for standard implementation with known patterns (use as default when uncertain), `haiku` for mechanical/straightforward changes with no judgment required
   - Decision heuristic: start at `sonnet`, justify upward to `opus` or downward to `haiku` based on signals
   - Anti-pattern (RFC 2119): MUST NOT assign `opus` to units with fully-specified mechanical execution paths
   - Anti-pattern (RFC 2119): MUST NOT leave `model:` unset — every unit spec MUST include the field
   - Anti-pattern (RFC 2119): MUST NOT assign the same model to all units without assessing each individually
   - Anti-pattern (RFC 2119): MUST NOT let "this is important work" justify `opus` — importance and complexity are different

## Completion Criteria

- [ ] `plugin/studios/software/stages/inception/hats/elaborator.md` has a new "Model Assignment" section
- [ ] The section defines all three tiers (`opus`, `sonnet`, `haiku`) with specific, concrete signals (not vague descriptions)
- [ ] `sonnet` is identified as the default when complexity is uncertain
- [ ] The section includes a decision heuristic (start at sonnet, justify up/down)
- [ ] All four anti-patterns above appear as RFC 2119 MUST NOT statements
- [ ] The `model:` field is added to the `Produces` section as a required unit frontmatter field
- [ ] No other studio files are modified (research confirmed single-file scope)

## References

- `plugin/studios/software/stages/inception/hats/elaborator.md` — The one file that needs updating
- `.haiku/intents/cascading-model-selection/knowledge/elaborator-landscape.md` — Research confirming single-file scope and complexity heuristics

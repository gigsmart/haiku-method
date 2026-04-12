---
intent: cascading-model-selection
unit: unit-02-elaborator-model-guidance
created: 2026-04-10
type: implementation-acceptance
---

# Unit 02 — Implementation Acceptance Criteria

Verified by the implementer hat in the development stage.

## Checklist

- [ ] `plugin/studios/software/stages/inception/hats/elaborator.md` has a new "Model Assignment" section
- [ ] The section defines all three tiers (`opus`, `sonnet`, `haiku`) with specific, concrete signals (not vague descriptions)
- [ ] `sonnet` is identified as the default when complexity is uncertain
- [ ] The section includes a decision heuristic (start at sonnet, justify up/down)
- [ ] All four anti-patterns appear as RFC 2119 MUST NOT statements in the updated hat file
- [ ] The `model:` field is added to the `Produces` section as a required unit frontmatter field
- [ ] No other studio files are modified (single-file scope confirmed by research)

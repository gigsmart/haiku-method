---
name: mapping-spec
location: .haiku/intents/{intent-slug}/stages/mapping/artifacts/
scope: intent
format: text
required: true
---

# Mapping Specification

Field-level source-to-target mappings with transformation rules and compatibility review.

## Expected Artifacts

- **Field mappings** -- every source field mapped to target with explicit transformation rule (rename, cast, derive, drop)
- **Type compatibility** -- incompatible types listed with resolution strategy and data loss implications
- **Edge case documentation** -- nulls, encoding differences, precision loss, and constraint violations
- **Semantic gap analysis** -- differences in meaning between source and target schemas

## Quality Signals

- Every source field has an explicit mapping to target with transformation rule
- Incompatible types have resolution strategies with data loss implications documented
- Edge cases are documented for nulls, encoding, precision, and constraints
- All resolution decisions are documented with rationale

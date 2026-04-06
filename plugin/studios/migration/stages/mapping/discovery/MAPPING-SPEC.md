---
name: mapping-spec
location: .haiku/intents/{intent-slug}/knowledge/MAPPING-SPEC.md
scope: intent
format: text
required: true
---

# Mapping Specification

Document field-level source-to-target mappings and transformation rules. This output feeds the migrate stage as the blueprint for implementation.

## Content Guide

Structure the specification by entity:

- **Entity mappings** — source entity to target entity with mapping rationale
- **Field-level mappings** — every source field mapped to a target field with transformation rule
- **Transformation rules** — renames, type casts, derivations, default fills, drops
- **Edge-case handling** — nulls, encoding differences, precision loss, constraint violations
- **Compatibility issues** — type mismatches, semantic gaps, constraint conflicts with resolutions
- **Unmapped fields** — fields intentionally dropped with documented rationale
- **New target fields** — fields in the target with no source equivalent and their default/derivation logic

## Quality Signals

- Every source field has an explicit disposition (map, transform, drop) — no gaps
- Transformation rules are deterministic and testable in isolation
- Lossy transformations are flagged with documented data loss implications
- Compatibility review sign-off is recorded with any conditional approvals noted

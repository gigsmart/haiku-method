---
type: frontend
depends_on:
  - unit-01-model-cascade-engine
discipline: frontend
model: sonnet
status: active
bolt: 2
hat: reviewer
started_at: '2026-04-11T01:36:09Z'
hat_started_at: '2026-04-11T01:47:03Z'
---

# UI Model Display — Implementation

## Scope

Surface model selection in intent review, unit review, dashboard, and unit list tool.

## Deliverables

1. **Intent review table** — Add Model column between Discipline and Status in `packages/haiku/src/templates/intent-review.ts`. Display `u.frontmatter.model` or em-dash when absent. Bump mockup colspan from 5 to 6.
2. **Unit review badge** — Add model badge after discipline badge in `packages/haiku/src/templates/unit-review.ts`. Conditionally rendered like discipline badge.
3. **Status colors** — Add `opus` (purple/indigo), `sonnet` (blue), `haiku` (green) entries to `statusColors` in `packages/haiku/src/templates/styles.ts`. Verify purple Tailwind classes exist in `tailwind-generated.ts`; add manually if missing.
4. **Unit list tool** — Add `model: data.model ?? null` to the returned object in `packages/haiku/src/state-tools.ts` haiku_unit_list handler.
5. **Dashboard** — Add model info per unit in `packages/haiku/src/state-tools.ts` haiku_dashboard handler.

## Completion Criteria

- [x] Intent review units table has 6 columns including Model
- [x] Colspan on mockup row updated to 6
- [x] Unit review shows model badge with color coding
- [x] `statusColors` has entries for opus, sonnet, haiku
- [x] Purple Tailwind classes present in tailwind-generated.ts
- [x] `haiku_unit_list` returns model field per unit
- [x] `haiku_dashboard` shows model when units have assignments
- [x] `npx tsc --noEmit` passes in `packages/haiku/`

## References

- `packages/haiku/src/templates/intent-review.ts:103-118` — unit row rendering
- `packages/haiku/src/templates/unit-review.ts:60-64` — badge area
- `packages/haiku/src/templates/styles.ts:7-12` — statusColors
- `packages/haiku/src/state-tools.ts:529-537` — haiku_unit_list
- `packages/haiku/src/state-tools.ts:838-868` — haiku_dashboard
- `.haiku/intents/cascading-model-selection/knowledge/unit-03-ui-research.md` — detailed research
- `.haiku/intents/cascading-model-selection/knowledge/unit-03-implementation-acceptance.md` — acceptance criteria

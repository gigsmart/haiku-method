---
type: research
depends_on:
  - unit-01-model-cascade-engine
discipline: frontend
model: sonnet
status: active
bolt: 1
hat: elaborator
started_at: '2026-04-10T22:35:11Z'
hat_started_at: '2026-04-10T22:50:24Z'
---

# UI Model Display

## Scope

Surface model selection information in all user-facing views: intent review, unit review, dashboard, and the unit list tool.

## Deliverables

1. **Intent review units table** — In `packages/haiku/src/templates/intent-review.ts`, add a "Model" column to the units table (between Discipline and Status). Display the unit's `model` frontmatter value, or "default" if unset.

2. **Unit review badge** — In `packages/haiku/src/templates/unit-review.ts:63`, add a model badge next to the discipline badge. Use appropriate color coding: opus = purple/indigo, sonnet = blue, haiku = green, default/unset = gray.

3. **Unit list tool** — In `packages/haiku/src/state-tools.ts:533`, include `model` in the returned object alongside name, status, bolt, hat.

4. **Dashboard** — In `packages/haiku/src/state-tools.ts:838` (`haiku_dashboard`), when listing units per stage, include model assignment if present.

## Completion Criteria

- [ ] Intent review units table shows Model column with values for each unit
- [ ] Unit review page shows model badge with color coding per tier
- [ ] `haiku_unit_list` tool output includes `model` field per unit
- [ ] `haiku_dashboard` shows model info when units have model assignments
- [ ] TypeScript compiles without errors (`npx tsc --noEmit`)
- [ ] HTML renders correctly (no broken table structure, badges styled consistently)

## References

- `packages/haiku/src/templates/intent-review.ts:103-118` — Current unit row rendering
- `packages/haiku/src/templates/unit-review.ts:60-64` — Current badge area
- `packages/haiku/src/state-tools.ts:529-537` — haiku_unit_list
- `packages/haiku/src/state-tools.ts:838-868` — haiku_dashboard

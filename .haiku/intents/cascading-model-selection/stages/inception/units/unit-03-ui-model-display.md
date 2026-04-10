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

## Dependency Note

This unit depends on unit-01 having added `model?: string` to `UnitFrontmatter` in `packages/haiku/src/types.ts` (lines 30–53). The builder must verify this field is present before implementing the template references. If unit-01 did not add it as a code change (only as a knowledge artifact), the builder must add `model?: string` to `UnitFrontmatter` as part of this unit's work.

## Deliverables

1. **`statusColors` entries** — In `packages/haiku/src/templates/styles.ts`, add three model-tier color entries to `statusColors`:
   - `opus`: purple (`bg-purple-100 / text-purple-800 / dark:bg-purple-900/40 / dark:text-purple-300`)
   - `sonnet`: blue (`bg-blue-100 / text-blue-800 / dark:bg-blue-900/40 / dark:text-blue-300`) — same as `in_progress`
   - `haiku`: green (`bg-green-100 / text-green-800 / dark:bg-green-900/40 / dark:text-green-300`) — same as `completed`

2. **Tailwind class verification** — Verify that `bg-purple-100`, `text-purple-800`, `dark:bg-purple-900/40`, and `dark:text-purple-300` are present in `packages/haiku/src/templates/tailwind-generated.ts`. If any are missing, add them to the generated file.

3. **Intent review units table** — In `packages/haiku/src/templates/intent-review.ts`:
   - Add `<th>Model</th>` between the Discipline and Status header cells (current line ~136)
   - Add `<td>${escapeHtml(u.frontmatter.model ?? "—")}</td>` between the Discipline and Status data cells (current line ~112), using an em-dash for unset values (matching the deps empty-state pattern)
   - Update the mockup colspan from `colspan="5"` to `colspan="6"` (current line ~116)

4. **Unit review badge** — In `packages/haiku/src/templates/unit-review.ts`, add a model badge after the discipline badge (current line ~63). Only render when `unit.frontmatter.model` is truthy:
   ```ts
   ${unit.frontmatter.model ? renderBadge("Model", unit.frontmatter.model) : ""}
   ```

5. **Unit list tool** — In `packages/haiku/src/state-tools.ts` (`haiku_unit_list`, lines 529–537), add `model: data.model ?? null` to the returned object alongside `name`, `status`, `bolt`, `hat`.

6. **Dashboard** — In `packages/haiku/src/state-tools.ts` (`haiku_dashboard`, lines 838–868), inside the stage iteration loop, read unit frontmatter files from `stages/{stage}/units/` and output model assignments as markdown inline code (e.g., `` - unit-01-model-cascade-engine: `opus` ``) — only for units that have a `model` set.

## Completion Criteria

- [ ] `statusColors` in `packages/haiku/src/templates/styles.ts` contains entries for `opus`, `sonnet`, and `haiku`
- [ ] `bg-purple-100`, `text-purple-800`, `dark:bg-purple-900/40`, `dark:text-purple-300` are present in `packages/haiku/src/templates/tailwind-generated.ts`
- [ ] Intent review units table has a `Model` column header between Discipline and Status
- [ ] Intent review units table data rows show `u.frontmatter.model` or `—` (em-dash) when unset
- [ ] Intent review table mockup colspan is updated from `5` to `6`
- [ ] Unit review badge area renders a model badge (using `renderBadge`) only when `unit.frontmatter.model` is set; no badge renders when unset
- [ ] `haiku_unit_list` tool output includes `model` field (string or null) per unit alongside existing fields
- [ ] `haiku_dashboard` shows per-unit model assignments in markdown inline code format, but only for units with a model set
- [ ] `UnitFrontmatter` in `packages/haiku/src/types.ts` has `model?: string` (verify or add)
- [ ] TypeScript compiles without errors (`npx tsc --noEmit` from the repo root or `packages/haiku/`)

## References

- `packages/haiku/src/templates/intent-review.ts:103-145` — Current unit table (5 cols: #, Name, Discipline, Status, Dependencies)
- `packages/haiku/src/templates/unit-review.ts:60-64` — Current badge area
- `packages/haiku/src/templates/styles.ts:7-12` — Current `statusColors` (completed, in_progress, pending, blocked)
- `packages/haiku/src/templates/components.ts:111-117` — `renderBadge` implementation
- `packages/haiku/src/templates/tailwind-generated.ts` — Pre-generated Tailwind classes; verify purple class coverage
- `packages/haiku/src/state-tools.ts:529-537` — `haiku_unit_list` returned object
- `packages/haiku/src/state-tools.ts:838-868` — `haiku_dashboard` stage loop
- `packages/haiku/src/types.ts:30-53` — `UnitFrontmatter` interface (verify `model?: string` present)

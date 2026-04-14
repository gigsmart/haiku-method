---
intent: cascading-model-selection
unit: unit-03-ui-model-display
created: 2026-04-10
type: implementation-acceptance
---

# Unit 03 — UI Model Display: Implementation Acceptance Criteria

These are verified by the implementer hat in the development stage.

## Pre-flight

- [ ] `UnitFrontmatter` in `packages/haiku/src/types.ts` (lines 30–53) has `model?: string` — verify or add

## styles.ts — statusColors

- [ ] `statusColors` in `packages/haiku/src/templates/styles.ts` contains an `opus` entry with purple Tailwind classes (`bg-purple-100 / text-purple-800 / dark:bg-purple-900/40 / dark:text-purple-300`)
- [ ] `statusColors` contains a `sonnet` entry with blue classes (same as `in_progress`)
- [ ] `statusColors` contains a `haiku` entry with green classes (same as `completed`)

## tailwind-generated.ts — Purge Safety

- [ ] `bg-purple-100`, `text-purple-800`, `dark:bg-purple-900/40`, `dark:text-purple-300` are present in `packages/haiku/src/templates/tailwind-generated.ts`; add any missing ones

## intent-review.ts — Model Column

- [ ] `<th>Model</th>` added between Discipline and Status header cells (~line 136)
- [ ] `<td>${escapeHtml(u.frontmatter.model ?? "—")}</td>` added between Discipline and Status data cells (~line 112); em-dash for unset
- [ ] Mockup colspan updated from `colspan="5"` to `colspan="6"` (~line 116)

## unit-review.ts — Model Badge

- [ ] Model badge added after discipline badge (~line 63): `${unit.frontmatter.model ? renderBadge("Model", unit.frontmatter.model) : ""}`
- [ ] No badge renders when `unit.frontmatter.model` is unset/falsy

## state-tools.ts — haiku_unit_list

- [ ] `haiku_unit_list` returned object includes `model: data.model ?? null` alongside `name`, `status`, `bolt`, `hat`

## state-tools.ts — haiku_dashboard

- [ ] Inside `haiku_dashboard` stage loop, unit frontmatter files are read from `stages/{stage}/units/`
- [ ] Units with a `model` set are listed as `` - {unit-slug}: `{model}` `` in markdown inline code
- [ ] Units without `model` are not listed (conditional output only)

## TypeScript Compilation

- [ ] `npx tsc --noEmit` (from `packages/haiku/` or repo root) passes without errors

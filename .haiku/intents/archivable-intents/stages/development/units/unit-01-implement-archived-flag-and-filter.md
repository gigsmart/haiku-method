---
name: unit-01-implement-archived-flag-and-filter
type: backend
depends_on: []
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - knowledge/ARCHITECTURE.md
  - stages/inception/units/unit-01-archived-flag-and-filter-helper.md
status: active
bolt: 1
hat: reviewer
started_at: '2026-04-14T21:41:10Z'
hat_started_at: '2026-04-14T21:45:10Z'
---

# unit-01-implement-archived-flag-and-filter

## Description
Implement the specification in `stages/inception/units/unit-01-archived-flag-and-filter-helper.md`. That document is the source of truth for scope, line numbers, and success criteria. Read it end-to-end before writing code.

## Scope
- Add `archived?: boolean` to `IntentFrontmatter` in `packages/haiku/src/types.ts`.
- Add `listVisibleIntentSlugs(intentsDir, opts?: { includeArchived?: boolean }): string[]` to `packages/haiku/src/state-tools.ts`, reusing `parseFrontmatter`.
- Route `haiku_intent_list`, `haiku_dashboard`, and `haiku_capacity` enumeration through the helper.
- Extend the `haiku_intent_list` tool schema with optional `include_archived: boolean` (default `false`); when `true`, response objects include an `archived: boolean` field.
- Do NOT touch `haiku_backlog`, `/repair` scan loops, or the hook-side active-intent scanners.

## Success Criteria
- [ ] `IntentFrontmatter` in `packages/haiku/src/types.ts` has `archived?: boolean` and `bun run typecheck` (from `packages/haiku/`) passes with no new errors.
- [ ] `listVisibleIntentSlugs(intentsDir, opts?)` is exported from `packages/haiku/src/state-tools.ts`, uses `parseFrontmatter`, and returns `string[]`. Grep confirms exactly three call-sites inside `state-tools.ts` (one each for `haiku_intent_list`, `haiku_dashboard`, `haiku_capacity`); no duplicated `archived === true` predicate elsewhere.
- [ ] `haiku_intent_list` with no arguments returns only non-archived intents and omits the `archived` field from response objects (or sets it to `false`); with `{ include_archived: true }` it returns the full set and each response object includes an `archived: boolean` field reflecting frontmatter state.
- [ ] Manual verification: temporarily set `archived: true` in a test intent's frontmatter, then confirm all three of `haiku_intent_list` (default call), `haiku_dashboard`, and `haiku_capacity` omit that intent; then confirm `haiku_intent_list { include_archived: true }` returns it with `archived: true`.
- [ ] `bun test` in `packages/haiku/` passes. The three existing `haiku_intent_list` tests in `test/state-tools-handlers.test.mjs:265-291` continue to pass unchanged. The `haiku_intent_list requires no arguments` assertion in `test/server-tools.test.mjs` still holds because `include_archived` is optional.

## Notes
The inception spec is authoritative for line numbers (`types.ts:7-28`, `state-tools.ts:1547` for `parseFrontmatter`, `:2191-2210`, `:2807-2920`, `:2923+`). Read it before touching any file. The helper is named `listVisibleIntentSlugs`, not `listActiveIntentSlugs` — "active" collides with `status === "active"`.

---
name: unit-01-archived-flag-and-filter-helper
type: backend
depends_on: []
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
status: active
bolt: 1
hat: researcher
started_at: '2026-04-14T20:18:31Z'
hat_started_at: '2026-04-14T20:18:31Z'
---

# unit-01-archived-flag-and-filter-helper

## Description
Add an `archived?: boolean` field to `IntentFrontmatter` and introduce a centralized helper that enumerates non-archived intent slugs. Wire the helper into every existing intent-enumeration site so archived intents disappear from default list/dashboard/capacity/backlog output. The flag is orthogonal to `status` — archival preserves the intent's prior status intact, so unarchival is lossless. An optional `include_archived: boolean` parameter on `haiku_intent_list` lets callers opt back into the full set.

## Discipline
backend - TypeScript changes in `packages/haiku/src/`.

## Scope

**In scope:**
- Add `archived?: boolean` to `IntentFrontmatter` in `packages/haiku/src/types.ts`.
- Add a helper (e.g. `listActiveIntentSlugs(intentsDir)`) in `packages/haiku/src/state-tools.ts` that reads each intent's frontmatter and filters out those where `archived === true`.
- Route `haiku_intent_list`, `haiku_dashboard`, `haiku_capacity`, and `haiku_backlog` through the helper by default.
- Extend the `haiku_intent_list` tool schema with an optional `include_archived` boolean parameter; when true, return all intents (both archived and not), and include the `archived` field in the per-intent response object.

**Out of scope:**
- Adding tools to set/unset the flag (unit-02).
- FSM refusal changes (unit-02).
- Skills, docs, prototype sync, tests (units 03–06).

## Success Criteria
- [ ] `IntentFrontmatter` in `packages/haiku/src/types.ts` has `archived?: boolean` and `bun run typecheck` (or equivalent) passes.
- [ ] A new shared helper in `state-tools.ts` enumerates intent slugs and filters archived ones; it is used by `haiku_intent_list`, `haiku_dashboard`, `haiku_capacity`, and `haiku_backlog`.
- [ ] `haiku_intent_list` returns non-archived intents by default; passing `include_archived: true` returns the full set with an `archived` boolean on each record.
- [ ] Manual verification: creating an intent with `archived: true` in its frontmatter and running `haiku_intent_list`, `haiku_dashboard`, `haiku_capacity`, `haiku_backlog` each omits the intent unless `include_archived` is explicitly passed.
- [ ] `bun test` in `packages/haiku/` passes (no regression in existing tests).

## Notes
- Centralize the filter in one helper and call it from all four sites — don't duplicate the predicate. Miss-one-site is the main regression risk per discovery.
- `haiku_backlog` may need a design decision: archived intents that never started are edge cases. Default to filtering them out; revisit if it surfaces a real use case.
- Existing intents without an `archived` field behave as not-archived. No migration required.

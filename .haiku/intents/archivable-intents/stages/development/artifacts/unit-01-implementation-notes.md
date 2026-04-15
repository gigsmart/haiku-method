# unit-01 implementation notes

Implementation of `unit-01-implement-archived-flag-and-filter` per the
inception spec at `stages/inception/units/unit-01-archived-flag-and-filter-helper.md`.

## Files changed

- `packages/haiku/src/types.ts` — added `archived?: boolean` to `IntentFrontmatter` (line 13).
- `packages/haiku/src/state-tools.ts`:
  - Added exported helper `listVisibleIntentSlugs(intentsDir, opts?: { includeArchived?: boolean }): string[]` above `setFrontmatterField` (line 1574). Reuses `parseFrontmatter`; filters entries whose frontmatter has `archived === true` unless `opts.includeArchived === true`.
  - `haiku_intent_list` tool schema: added optional `include_archived: boolean` property (default false).
  - `haiku_intent_list` handler: routes through `listVisibleIntentSlugs`; when `include_archived === true`, response objects include `archived: boolean` reflecting frontmatter state.
  - `haiku_dashboard` handler: routes through `listVisibleIntentSlugs` (default filter).
  - `haiku_capacity` handler: routes through `listVisibleIntentSlugs` (default filter).
- `packages/haiku/test/state-tools-handlers.test.mjs` — added 11 unit tests covering default filter, include_archived response shape, helper signature, empty directory, missing archived field, and explicit `archived: false`. Added an `archived-intent` fixture with `status: completed` to demonstrate orthogonality.

## Out of scope (deliberately untouched)

- `haiku_backlog` (operates on `.haiku/backlog/`, not intents).
- `/repair` scan loops at `state-tools.ts:930` and `:1290` — admin fix-up flow must see all intents regardless of archive state.
- Hook-side active-intent scanners in `hooks/inject-context.ts`, `hooks/utils.ts`, `hooks/workflow-guard.ts` — these locate `status === "active"`, orthogonal to `archived`.

## Verification

- `bun run typecheck` — clean.
- `bun run test` — 210 passed, 0 failed across 6 test files (56 in `state-tools-handlers.test.mjs`, up from 45).
- Grep confirms exactly three call-sites of `listVisibleIntentSlugs` inside `state-tools.ts`, one each for `haiku_intent_list`, `haiku_dashboard`, `haiku_capacity`. No duplicated `archived === true` predicate outside the helper.

## Orthogonality preserved

The archived fixture has `status: completed, archived: true` and is filtered by default but surfaces with `archived: true` when `include_archived: true`, demonstrating that status is preserved across archive/unarchive cycles for lossless restoration.

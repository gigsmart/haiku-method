---
name: unit-01-archived-flag-and-filter-helper
type: backend
depends_on: []
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
status: completed
bolt: 1
hat: elaborator
started_at: '2026-04-14T20:18:31Z'
hat_started_at: '2026-04-14T20:21:17Z'
outputs:
  - stages/inception/artifacts/unit-01-elaboration-notes.md
completed_at: '2026-04-14T20:27:06Z'
---

# unit-01-archived-flag-and-filter-helper

## Description
Add an `archived?: boolean` field to `IntentFrontmatter` and introduce a centralized helper `listVisibleIntentSlugs` that enumerates non-archived intent slugs. Wire the helper into the three user-facing intent-enumeration sites (`haiku_intent_list`, `haiku_dashboard`, `haiku_capacity`) so archived intents disappear from their default output. The flag is orthogonal to `status` — archival preserves the intent's prior status intact, so unarchival is lossless. An optional `include_archived: boolean` parameter on `haiku_intent_list` (and the helper) lets callers opt back into the full set.

## Discipline
backend — TypeScript changes in `packages/haiku/src/`.

## Model Assignment
`sonnet` — Standard additive feature across known patterns. One new type field, one new helper, three routing call-sites that already share a common enumeration idiom (`readdirSync(intentsDir)` + `parseFrontmatter`). No architectural judgment required; no mechanical copy-paste either (each call site has slightly different surrounding code). Default tier per the decision heuristic.

## Scope

**In scope:**
- Add `archived?: boolean` to `IntentFrontmatter` in `packages/haiku/src/types.ts` (type currently lives at `types.ts:7-28`).
- Add a helper `listVisibleIntentSlugs(intentsDir: string, opts?: { includeArchived?: boolean }): string[]` in `packages/haiku/src/state-tools.ts`. It MUST reuse the existing `parseFrontmatter` (`state-tools.ts:1547`) for frontmatter reads so behavior is identical to the current enumeration sites. When `opts.includeArchived === true`, it returns all intent slugs; otherwise it filters out entries whose frontmatter has `archived === true`.
- Route the following three intent-enumeration sites through the helper by default (line numbers per research verification):
  1. `haiku_intent_list` handler at `state-tools.ts:2191-2210` (current `readdirSync(intentsDir)` at `:2195`)
  2. `haiku_dashboard` handler at `state-tools.ts:2807-2920` (enumeration at `:2817`)
  3. `haiku_capacity` handler starting at `state-tools.ts:2923` (enumeration at `:2933`)
- Extend the `haiku_intent_list` tool schema (in `STATE_TOOL_SPECS`) with an optional `include_archived: boolean` parameter (default `false`). When `true`, the handler MUST pass `{ includeArchived: true }` to the helper AND include the `archived` boolean on each per-intent response object.

**Out of scope (explicitly):**
- `haiku_backlog` (`state-tools.ts:3176+`) — this enumerates `.haiku/backlog/`, NOT `.haiku/intents/`. Backlog items are free-standing parking-lot markdown files that were never promoted to intents, so archived intents cannot leak into it. Do NOT route it through the helper.
- The `/repair` scan loops at `state-tools.ts:930` and `state-tools.ts:1290`. Repair is an admin fix-up flow; archived-but-broken intents MUST stay repairable, so repair MUST see all intents regardless of the archived flag.
- Hook-side scanners in `hooks/inject-context.ts:52`, `hooks/utils.ts:66`, `hooks/workflow-guard.ts:9`. These locate the single `status === "active"` intent, not user-facing list views. The `archived` field is orthogonal to `status`, so these are deliberately untouched.
- Adding the tools that set/unset the `archived` flag (unit-02).
- FSM refusal / state-machine guards around archived intents (unit-02).
- Skills (unit-03), prototype runtime-map sync (unit-04), docs sync (unit-05).

## Success Criteria
Inception-scoped elaboration deliverables (checked by elaborator on completion):

- [x] Scope is tightened to exactly three enumeration sites (`haiku_intent_list`, `haiku_dashboard`, `haiku_capacity`) with `haiku_backlog` explicitly excluded and justified.
- [x] Helper name is fixed at `listVisibleIntentSlugs` with full signature `(intentsDir, opts?: { includeArchived?: boolean }): string[]`, and the naming collision with `status === "active"` is called out.
- [x] Out-of-scope call-sites (`/repair` scans, hook-side active-intent scanners) are explicitly listed so reviewers do not flag them as missed sites.
- [x] Model assignment is set (`sonnet`) with justification per the decision heuristic.
- [x] An elaboration-notes artifact captures the scope decisions at `stages/inception/artifacts/unit-01-elaboration-notes.md`.

## Forward-Looking Dev-Stage Acceptance (reference only; checked during the development stage)
- `IntentFrontmatter` in `packages/haiku/src/types.ts` has `archived?: boolean` and `bun run typecheck` (from `packages/haiku/`) passes with no new errors.
- `listVisibleIntentSlugs(intentsDir, opts?)` is exported from `packages/haiku/src/state-tools.ts`, uses `parseFrontmatter`, and returns `string[]`. Grep confirms exactly three call-sites inside `state-tools.ts` (one each for `haiku_intent_list`, `haiku_dashboard`, `haiku_capacity`); no duplicated `archived === true` predicate elsewhere.
- `haiku_intent_list` with no arguments returns only non-archived intents and omits the `archived` field from response objects (or sets it to `false`); with `{ include_archived: true }` it returns the full set and each response object includes an `archived: boolean` field reflecting frontmatter state.
- Manual verification: temporarily set `archived: true` in a test intent's frontmatter, then confirm all three of `haiku_intent_list` (default call), `haiku_dashboard`, and `haiku_capacity` omit that intent; then confirm `haiku_intent_list { include_archived: true }` returns it with `archived: true`.
- `bun test` in `packages/haiku/` passes. The three existing `haiku_intent_list` tests in `test/state-tools-handlers.test.mjs:265-291` continue to pass unchanged. The `haiku_intent_list requires no arguments` assertion in `test/server-tools.test.mjs` still holds because `include_archived` is optional.

## Notes
- **Helper name is `listVisibleIntentSlugs`**, not `listActiveIntentSlugs`. "Active" is overloaded with `status === "active"` used in the hook-side scanners and would cause confusion. "Visible" cleanly describes "what shows up in default list views."
- One helper, two behaviors — use the `{ includeArchived?: boolean }` options object form rather than two separate helpers. Single source of truth for the `readdirSync + intent.md existence check + parseFrontmatter` sequence.
- Centralize the filter in the helper and call it from all three sites — do NOT duplicate the `archived === true` predicate. Miss-one-site is the primary regression risk per discovery, and is the reason this unit exists as a standalone slice.
- Existing intents without an `archived` field behave as not-archived (the check is strict `=== true`, not truthy). No migration required.
- The `archived` flag is orthogonal to `status`. A completed intent that is archived keeps `status: "completed"`; an active intent that is archived keeps `status: "active"`. Unarchival is lossless.
- Adding a fixture intent with `archived: true` to the test suite is recommended in this unit (it's small and belongs with the helper) so that subsequent units don't have to re-discover the filter behavior.

## References
- `stages/inception/units/unit-01-archived-flag-and-filter-helper/research-notes.md` — verified line numbers, the `haiku_backlog` correction, all `readdirSync(intentsDir)` call-sites, and the helper-naming recommendation.
- `stages/inception/artifacts/unit-01-elaboration-notes.md` — elaborator's scope-decision record.
- `knowledge/DISCOVERY.md` — business context and non-goals.

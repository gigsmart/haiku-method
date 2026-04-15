---
name: unit-01-elaboration-notes
unit: unit-01-archived-flag-and-filter-helper
stage: inception
hat: elaborator
created: 2026-04-14
---

# Elaboration notes — unit-01 (archived flag + filter helper)

Elaborator-level record of the scope decisions applied to `unit-01-archived-flag-and-filter-helper.md` after reading the researcher's verified findings. This file exists as the unit's produced artifact; the authoritative spec is the unit md itself.

## Scope tightening

Discovery originally listed **four** intent-enumeration sites to route through the new filter helper:

1. `haiku_intent_list`
2. `haiku_dashboard`
3. `haiku_capacity`
4. `haiku_backlog` ← **removed**

Researcher verified that `haiku_backlog` (handler at `state-tools.ts:3176+`) enumerates `.haiku/backlog/`, not `.haiku/intents/`. Backlog items are free-standing parking-lot markdown files that were never promoted to intents, so archived intents cannot leak into the backlog view regardless of filtering.

**Decision:** drop `haiku_backlog` from the in-scope routing list. The unit reduces to **three** routing sites. Updated the Scope bullets, Success Criteria, and the manual-verification checklist accordingly.

## Helper name decision

Discovery suggested `listActiveIntentSlugs`. Researcher flagged the name collision with `status === "active"` semantics used by the hook-side scanners (`hooks/utils.ts:71`, `hooks/workflow-guard.ts`). Two things carry the word "active" in this codebase today; adding a third would cause confusion.

**Decision:** name the helper `listVisibleIntentSlugs(intentsDir, opts?)`. "Visible" cleanly describes "what shows up in default list views" and does not collide with any existing "active" concept.

**Signature:**

```ts
function listVisibleIntentSlugs(
  intentsDir: string,
  opts?: { includeArchived?: boolean }
): string[]
```

One helper, two behaviors — when `opts.includeArchived === true`, returns all slugs; otherwise filters out entries whose frontmatter has `archived === true`. Single source of truth for the `readdirSync + intent.md existence check + parseFrontmatter` sequence.

## Explicit out-of-scope (so reviewers don't flag as missed sites)

The researcher's exhaustive grep of `readdirSync(intentsDir)` surfaced six call-sites. Three are in scope; the other three are deliberately untouched:

- **`/repair` scan loops** at `state-tools.ts:930` and `state-tools.ts:1290` — admin fix-up flow. Archived-but-broken intents MUST remain repairable, so repair MUST see everything regardless of the archived flag.
- **Hook-side active-intent scanners** in `hooks/inject-context.ts:52`, `hooks/utils.ts:66`, `hooks/workflow-guard.ts:9` — these locate the single `status === "active"` intent, not user-facing list views. The `archived` field is orthogonal to `status`; an archived intent keeps whatever status it had, so hook behavior is unchanged by design.

These are called out explicitly in the unit spec's Out-of-scope section to prevent confusion in review.

## Test-plan addendum

The existing three `haiku_intent_list` tests in `packages/haiku/test/state-tools-handlers.test.mjs:265-291` continue to pass unchanged — none of their fixtures set `archived: true`, so the default-filter behavior is a no-op for them.

Recommended additions (part of this unit's scope since the helper is the unit's whole point):

1. A fixture intent with `archived: true` in its frontmatter.
2. Assertion that default `haiku_intent_list` output omits it.
3. Assertion that `haiku_intent_list { include_archived: true }` returns it with `archived: true` on the record.
4. Verification that the `haiku_intent_list requires no arguments` check in `test/server-tools.test.mjs` still holds (the `include_archived` param is optional).

## Model assignment

`sonnet`. Standard additive feature across known patterns — one new optional field on a TypeScript type, one new helper, three routing call-sites that share a common enumeration idiom. No architectural judgment calls; also not purely mechanical. Default tier per the decision heuristic.

## Downstream handoff

- **Design stage** does not need to intervene on this unit — the data shape and helper contract are both fully specified here. If design adds anything, it's the cross-stage verification that the archived flag remains orthogonal to `status`.
- **Development stage** (builder → reviewer) has unambiguous marching orders: edit `packages/haiku/src/types.ts` and `packages/haiku/src/state-tools.ts`, add tests under `packages/haiku/test/`, run `bun run typecheck` and `bun test`.
- **unit-02** will add the tools that set/unset the flag; it depends on unit-01's field and helper landing first.

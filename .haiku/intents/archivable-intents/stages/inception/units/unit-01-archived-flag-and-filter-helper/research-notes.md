---
name: research-notes
unit: unit-01-archived-flag-and-filter-helper
stage: inception
hat: researcher
created: 2026-04-14
---

# Per-unit research — archived flag & filter helper

Builds on `knowledge/DISCOVERY.md`. Purpose: verify the discovery's file/line claims against the current worktree and flag corrections the elaborator needs before writing unit spec details.

## User/business outcome (reminder)

Users want the active intent list to stop filling up with shipped, stalled, and paused work. This unit is the smallest invisible slice: the **data shape** (`archived?: boolean` on `IntentFrontmatter`) plus a **single enumeration helper** so all four list surfaces route through the same filter. No user-visible control yet — that's unit-02. But once this lands, the moment unit-02 flips the flag on any intent, every list/dashboard/capacity view drops it automatically. Miss-one-site would leak archived intents into one surface and destroy user trust in the feature, so the helper is the whole ballgame.

## Verified facts (discovery claims re-checked against current code)

### Line-range corrections

| Surface | Discovery said | Actual (verified) | Notes |
|---|---|---|---|
| `haiku_intent_list` handler | `state-tools.ts:2191-2210` | **`state-tools.ts:2191-2210`** ✓ | Case starts at 2191; `readdirSync(intentsDir)` at 2195; returns at 2209. |
| `haiku_intent_list` schema decl | `state-tools.ts:1878-1882` | **not re-verified here** | Elaborator should confirm before writing the `include_archived` schema addition; search `STATE_TOOL_SPECS` for `"haiku_intent_list"`. |
| `haiku_dashboard` handler | `state-tools.ts:2807-2920` | **`state-tools.ts:2807-2920`** ✓ | Case at 2807; enumeration at 2817; closes at 2920. |
| `haiku_capacity` handler | `state-tools.ts:2923+` | **`state-tools.ts:2923`** starts; enumeration at **2933**. End of case not re-checked but begins correctly. |
| `haiku_backlog` handler | `state-tools.ts:3176+` | **`state-tools.ts:3176`** starts — **but enumerates `.haiku/backlog/`, NOT `.haiku/intents/`.** See next section. |

### `haiku_backlog` is NOT an intent-enumeration site (discovery error)

The discovery and the unit spec both list `haiku_backlog` as one of four intent-enumeration sites that must be routed through the new helper. **This is wrong.** Read at 3176–3246:

- `haiku_backlog` operates on `.haiku/backlog/` (line 3184: `const backlogDir = join(root, "backlog")`).
- Backlog items are free-standing `.md` files under that dir (lines 3189, 3216, 3262), each with their own `priority` / `created_at` / `status` frontmatter.
- They are **parking-lot ideas that were never promoted to intents** (per `haiku:backlog` skill description and `promote` action at 3232).
- Archived intents cannot leak into the backlog view because the backlog view never looks at `.haiku/intents/` at all.

**Implication for the elaborator:** drop `haiku_backlog` from the list of filter-routing sites in the unit. The unit reduces to **three** enumeration sites: `haiku_intent_list`, `haiku_dashboard`, `haiku_capacity`. The success-criterion bullet that says "manual verification: ... `haiku_backlog` omits the intent" should be removed or rewritten (backlog never showed the intent to begin with; the check is vacuous). The open-question note in the unit spec about "archived intents in backlog" is also moot.

### Helper to reuse: `parseFrontmatter` + `setFrontmatterField`

Both live in `state-tools.ts`:

- **`parseFrontmatter(raw: string)`** at `state-tools.ts:1547-1556` — returns `{ data, body }` using `gray-matter` with date normalization. This is what all three enumeration sites already use (2199, 2825, 2952). The new helper should parse frontmatter exactly this way so behavior is identical.
- **`setFrontmatterField(filePath, field, value)`** at `state-tools.ts:1558-1574` — writes one field back via `matter.stringify`. Not needed for unit-01 (unit-02 writes the flag); but worth naming here so unit-02's elaborator finds it without re-discovering it.

There is no existing `listActiveIntentSlugs` or anything similar in state-tools — confirmed by grep on `readdirSync\(intentsDir\)`. The helper is a genuinely new export.

### All `readdirSync(intentsDir)` call sites in the codebase

Exhaustive grep result (six total):

1. `state-tools.ts:2195` — **`haiku_intent_list`** ← in scope
2. `state-tools.ts:2817` — **`haiku_dashboard`** ← in scope
3. `state-tools.ts:2933` — **`haiku_capacity`** ← in scope
4. `state-tools.ts:930` (`readdirSync(intentsDir, { withFileTypes: true })`) — **`/repair` scan loop**. Out of scope: repair is an admin fix-up flow, not a user list view, and archived-but-broken intents should still be repairable. Flag for the elaborator to explicitly mark out of scope so it's not accidentally filtered.
5. `state-tools.ts:1290` (`readdirSync(intentsDir, { withFileTypes: true })`) — **repair's worktree-mainline variant**, same reasoning.
6. `hooks/inject-context.ts:52`, `hooks/utils.ts:66`, `hooks/workflow-guard.ts:9` — hook-side scanners that find **the one active intent** (`status === "active"`). Not list views; not user-facing enumeration. Archived intents already wouldn't show up because their status isn't "active" (and per the design, `archived` is orthogonal to `status`, so an archived intent keeps whatever status it had — if it was active it'd still be found by these hooks). Out of scope for this unit.

**No missed user-facing list surfaces.** The scope is three sites, not four.

### Test surface — existing tests that call `haiku_intent_list`

- `packages/haiku/test/state-tools-handlers.test.mjs:269-291` — three tests hit `haiku_intent_list`:
  - `lists all intents` — expects `>= 2` intents.
  - `intent list includes slug and status` — expects test intent with `status: "active"`, `studio: "software"`.
  - `intent list includes completed intents` — expects a `second-intent` with `status: "completed"`.
- `packages/haiku/test/server-tools.test.mjs:112, 207-208` — schema/registration tests that verify the tool def exists and takes no required args.

None of these fixtures set `archived: true`, so **they all continue to pass under the new default-filter behavior**. The elaborator should still plan to:

1. Add a fixture intent with `archived: true` and assert it's absent from the default `haiku_intent_list` output.
2. Add a test that passes `include_archived: true` and asserts the archived fixture comes back with `archived: true` on its record.
3. Update the `haiku_intent_list requires no arguments` server-tools test if adding `include_archived` to the schema would change the "required args" set — verify it's still zero required (optional param).

## Non-functional considerations

- **Performance:** trivial. Helper adds one boolean check per intent per call. The enumeration was already O(intents) with one `parseFrontmatter` per entry — the helper preserves that cost. No regression.
- **Backward compatibility:** `archived?: boolean` is optional, existing intents omit the field, `archived === true` is false for all current intents, nothing behaves differently until unit-02 writes the flag somewhere.
- **Type safety:** `packages/haiku/` is TS strict. The field addition to `IntentFrontmatter` (types.ts:7-28) is type-safe. The helper's return type should be `string[]` (slugs) — callers already do their own `parseFrontmatter` for the per-intent data they need, so returning slugs keeps the helper single-purpose.

## Recommended helper shape (non-prescriptive)

Name per unit spec: `listActiveIntentSlugs(intentsDir: string): string[]`. The word "active" is slightly overloaded with `status: "active"` and with the "not currently archived" concept the hooks use. Elaborator may want to rename to `listNonArchivedIntentSlugs` or `listVisibleIntentSlugs` to avoid confusion with `status === "active"` semantics used in `hooks/utils.ts:71` and `workflow-guard.ts`. **Recommendation: `listVisibleIntentSlugs`** — it accurately describes the intent (these are the slugs visible in default list views) and doesn't collide with any existing "active" concept.

For `haiku_intent_list`'s `include_archived: true` path, the elaborator needs a second helper or an option param — either `listAllIntentSlugs()` or `listVisibleIntentSlugs({ includeArchived: true })`. Recommend the option-param form — one helper, two behaviors, single source of truth for `readdirSync + intent.md existence check`.

## Open items for the elaborator

1. **Drop `haiku_backlog` from unit scope.** Update the Scope bullet and Success Criteria bullet accordingly. This is a direct discovery correction, not a judgment call.
2. **Helper naming** — pick `listVisibleIntentSlugs` (or equivalent) over `listActiveIntentSlugs` to avoid collision with `status === "active"`.
3. **Explicit out-of-scope note** for the `/repair` scan sites (`state-tools.ts:930`, `1290`) and the hook-side scanners so reviewers don't flag them as missed sites.
4. **Test plan addendum:** add one fixture with `archived: true` and assert the three-site default-filter behavior + the `include_archived: true` opt-in path. Verify no regression in the three existing `haiku_intent_list` tests.

## Ground truth for the elaborator

- `packages/haiku/src/types.ts:7-28` — `IntentFrontmatter` is the type to extend.
- `packages/haiku/src/state-tools.ts:1547` — `parseFrontmatter` signature to match.
- `packages/haiku/src/state-tools.ts:2191, 2817, 2933` — the three routing sites.
- `packages/haiku/test/state-tools-handlers.test.mjs:265-291` — existing `haiku_intent_list` test fixtures that must not regress.

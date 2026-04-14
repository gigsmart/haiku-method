---
name: discovery
intent: archivable-intents
created: 2026-04-14
status: draft
---

# Discovery: Archivable Intents

## Business Context

H·AI·K·U projects accumulate intents. Some ship and should get out of the way. Some stall for weeks and shouldn't show up in the daily dashboard. Some are intentionally paused — "we'll come back to this after the mobile release" — and need to survive without cluttering every list view. Today there's no user-facing way to say "hide this, but don't throw it away." Every `haiku_intent_list`, `haiku_dashboard`, `haiku_capacity`, and `haiku_backlog` call returns every intent that ever existed in `.haiku/intents/`.

**Feature goal:** give the user a manual, reversible soft-hide. One tool call archives, one unarchives. Files stay put under `.haiku/intents/{slug}/`. Default list/dashboard views filter archived intents out. History is preserved; nothing is destroyed.

**Origin:** Direct user request on 2026-04-14 for "archivable intents." Driver is all three of: decluttering the active list, reducing orchestrator state bloat, preserving paused work for later revisit. Explicit scope decisions from the user:
- Soft-hide via a flag in intent state (no physical move, no git-tag archiving)
- Manual trigger only — NO auto-archive on completion or staleness
- Restorable via a single tool call
- Files stay at `.haiku/intents/{slug}`

**Success criteria:**
- Functional: A user can archive an intent, confirm it disappears from default `haiku_intent_list` and `haiku_dashboard` output, then unarchive it and see it return with its prior status intact.
- Outcome: Active dashboard stops accumulating stale entries. Users can pause work without losing it. Restoring a paused intent is one command, not a file-system rummage.

## Competitive Landscape

Brief — this is a well-worn pattern:
- **Jira / Linear:** Status-based archival (closed/done issues drop from default filters but stay queryable). Re-opening restores to an earlier state.
- **GitHub Projects (v2):** Items can be archived from a project board; archived items stay in the repo but vanish from the board unless a filter includes them.
- **Notion:** Archive sends a page to a trash-like bin; restore is a single click.

The common pattern is a boolean flag orthogonal to status, with filtered default views and an explicit "show archived" toggle. None of these move files or rewrite history — they flag and filter.

## Considerations & Risks

### Existing scaffolding (partial, with a naming conflict)

The codebase already uses the word "archived" in two places, and both have to be understood before this feature picks a name:

1. **`orchestrator.ts:870` blocks `status === "archived"`:**
   ```ts
   if (status === "archived") {
     return { action: "error", message: `Intent '${slug}' is archived` }
   }
   ```
   The orchestrator already refuses to `haiku_run_next` on an archived intent. But nothing in the codebase currently sets that status — no tool, no hook, no skill. It's a partial implementation.

2. **`state-tools.ts:1248–1468` uses "archived" to mean branch-merged:** the `/repair` flow has a completely separate concept of "archived" which means "intent exists on mainline but has no matching `haiku/{slug}/main` branch" — i.e., the work branch was merged and deleted. This is derived from git state (`archivedSlugs = mainlineSlugs.filter((s) => !activeSet.has(s))`), not from a frontmatter flag. It overlaps semantically with the user's ask (merged intents *are* the kind of thing someone would want filtered out of default views) but is a different mechanism.

This collision is the biggest open question. See Open Questions below.

### Technical considerations

- **Frontmatter is the persistence layer.** Intent state is stored in `packages/haiku/src/types.ts` → `IntentFrontmatter` (line 7–28), with fields like `status`, `active_stage`, `studio`, `mode`. The file is `.haiku/intents/{slug}/intent.md`. Adding a flag means adding a field to `IntentFrontmatter` and persisting it on disk via existing `setFrontmatterField` helpers.
- **List-site inventory is small and contained.** Four call sites iterate intents:
  1. `haiku_intent_list` — `state-tools.ts:2191-2210`
  2. `haiku_dashboard` — `state-tools.ts:2807-2920`
  3. `haiku_capacity` — `state-tools.ts:2923+`
  4. `haiku_backlog` — `state-tools.ts:3176+`

  Each reads `readdirSync(intentsDir)` and loops. Filtering is a single predicate applied to each site.
- **FSM interaction is already there.** `orchestrator.ts:haiku_run_next` already blocks archived intents. Whatever flag this feature settles on, `haiku_run_next` must respect it too.
- **Test surface:** `packages/haiku/tests/` has tests for state-tools and orchestrator. New tool + filter logic needs matching coverage.

### Business considerations

- This is additive — no breaking changes for users who don't archive anything.
- No new dependencies, no infra impact, no deployment risk.
- No paper/methodology change required. Intent lifecycle in the paper already contemplates pause/resume; archival is a UX affordance, not a new concept.

### UI impact (non-browser UI — tool output)

Every surface that currently enumerates intents is affected:

| Surface | Current behavior | Required behavior |
|---|---|---|
| `haiku_intent_list` | Returns all intents as JSON | Filter archived by default; optional `include_archived` flag |
| `haiku_dashboard` | Markdown dashboard of every intent | Filter archived by default; optional section for archived |
| `haiku_capacity` | Studio-grouped throughput | Filter archived from default counts |
| `haiku_backlog` | Parking lot of not-yet-started | Uncertain — review whether archived intents should land in backlog view |
| `/haiku:status` skill (if any) | TBD | Filter archived |

### Sync surface (per CLAUDE.md and architecture-prototype-sync.md)

- **Paper:** No change required. The paper doesn't discuss archival mechanics; this is implementation-level UX.
- **Website docs:** `website/content/docs/` — whichever doc lists MCP tools needs the new tool(s) added. Verify and update.
- **Runtime-architecture prototype:** `website/public/prototype-stage-flow.html` — per `architecture-prototype-sync.md`, any new MCP tool must be registered in `TOOL_SPECS` and referenced in the Orchestrator actor modal's tool list. This feature adds at least one new tool, so the prototype is in scope.
- **CHANGELOG.md:** Automatic (don't edit manually — per memory).

### Risks

- **Naming collision with `/repair`'s derived "archived" concept.** If the elaborator settles on `status: "archived"` as the flag, there is an existing code path (`state-tools.ts:1248+`) that uses the same word to mean something derived from git branch state. Readers may confuse the two. Mitigation: either pick a different field name (e.g. `archived: boolean` separate from `status`) or rename the `/repair` internal variable. Recommend the former — cheaper, no churn in repair logic.
- **Lossy status transitions.** If we overload `status` to mean "archived," we destroy the prior status on archive and have nothing to restore to on unarchive. A separate boolean avoids this entirely. See Open Questions.
- **Silent drift risk if filters aren't applied uniformly.** Miss one call site and archived intents leak into that view. Mitigation: centralize the filter in a helper (e.g. `listActiveIntents()`) and have all four call sites route through it.

## Open Questions

1. **Separate flag or status overload?** *Recommendation: add `archived: boolean` to `IntentFrontmatter`, orthogonal to `status`.* This preserves the prior status across archive/unarchive cycles and avoids the collision with `/repair`'s derived "archived" concept. An alternative (reuse `status: "archived"`) is simpler but loses information.
2. **One tool or two?** `haiku_intent_archive` + `haiku_intent_unarchive`, or a single `haiku_intent_set_archived { archived: boolean }`? *Recommendation: two explicit tools.* Matches the existing `haiku_intent_reset` / explicit-verb naming pattern. Clearer intent at the call site.
3. **Confirmation elicitation?** `haiku_intent_reset` uses elicitation to confirm destructive ops. Archive is reversible — does it still need confirmation? *Recommendation: no elicitation for archive (reversible). Unarchive also no elicitation.* Make both cheap.
4. **Default filter in `haiku_intent_list`.** Filter by default and add an opt-in `include_archived` flag? Or always return everything and let the caller filter? *Recommendation: filter by default, add `include_archived: boolean` param.* Matches how users think about intent lists.
5. **Should `haiku_backlog` include or exclude archived?** Backlog is "not started yet" — archival is orthogonal. Unclear whether an archived un-started intent belongs in backlog view. Elaborator should decide after looking at current `haiku_backlog` semantics.
6. **Does a user-facing skill matter?** `/haiku:archive {slug}` as a thin skill wrapper over the tool, or direct tool call only? *Recommendation: add the skill.* All current intent-lifecycle entry points are skills (see memory: "Skills over prompts"); tool-only would break the pattern.
7. **FSM behavior on archived intents.** `orchestrator.ts:870` already errors on `status === "archived"`. If we use a separate `archived` flag, the orchestrator needs a second check. Should archived intents be advanceable at all, or should `haiku_run_next` refuse them with a clear "unarchive first" message? *Recommendation: refuse with a clear message.* Prevents runaway tick loops on dormant work.
8. **Interaction with composite intents.** `intent.composite` intents have sub-studios. Archiving a composite — does it cascade or just flag the top-level? *Recommendation: flag only the top level.* Composite state is a separate concern.

## Technical Landscape

### Entity inventory

**`IntentFrontmatter`** — `packages/haiku/src/types.ts:7-28`
```ts
export interface IntentFrontmatter {
  title?: string
  studio: string
  mode: string
  active_stage: string
  status: string
  started_at?: string
  completed_at?: string | null
  // Legacy fields...
}
```
The type is the contract. Adding a field here is the first change; every read/write path respects the type.

### API surface (MCP tools)

Relevant existing tools, all registered in `state-tools.ts` `STATE_TOOL_SPECS`:
- `haiku_intent_list` — declared line 1878–1882, handled line 2191
- `haiku_intent_get` — declared line 1870, handled earlier in the switch
- `haiku_dashboard` — declared line 2044, handled line 2807
- `haiku_capacity` — declared line 2050, handled line 2923
- `haiku_backlog` — declared line 2088, handled line 3176
- `haiku_intent_reset` — pattern reference for "destructive mutation with frontmatter update," worth reading before writing the new tools

Not yet existing (to add):
- `haiku_intent_archive { intent: string }`
- `haiku_intent_unarchive { intent: string }`
- (alternatively, one unified `haiku_intent_set_archived`)

### File-by-file change map

| File | Lines | Change |
|---|---|---|
| `packages/haiku/src/types.ts` | 7–28 | Add `archived?: boolean` to `IntentFrontmatter` |
| `packages/haiku/src/state-tools.ts` | 2191–2210 | Filter archived from `haiku_intent_list` by default; honor optional `include_archived` param |
| `packages/haiku/src/state-tools.ts` | 1878–1882 | Update `haiku_intent_list` schema to declare new optional `include_archived` param |
| `packages/haiku/src/state-tools.ts` | 2807–2920 | Filter archived from `haiku_dashboard` by default |
| `packages/haiku/src/state-tools.ts` | 2923+ | Filter archived from `haiku_capacity` by default |
| `packages/haiku/src/state-tools.ts` | 3176+ | Decide filter behavior for `haiku_backlog` |
| `packages/haiku/src/state-tools.ts` | (new) | Helper: `listActiveIntentSlugs(root)` used by all filter sites |
| `packages/haiku/src/orchestrator.ts` | ~1984 (tool decl) | Add `haiku_intent_archive` / `haiku_intent_unarchive` tool declarations |
| `packages/haiku/src/orchestrator.ts` | ~2555 (handlers) | Add handlers: read intent.md, set `archived` field, write back |
| `packages/haiku/src/orchestrator.ts` | 870–872 | Additionally check `data.archived === true` → error with "unarchive first" message |
| `plugin/skills/archive/SKILL.md` (new) | — | Thin skill wrapping the archive tool (optional, per Q6) |
| `plugin/skills/unarchive/SKILL.md` (new) | — | Thin skill wrapping unarchive (or combined with archive) |
| `website/public/prototype-stage-flow.html` | `TOOL_SPECS` registry | Register the new tools with input/output/writes spec |
| `website/public/prototype-stage-flow.html` | Orchestrator actor modal | Add new tools to the tool list |
| `website/content/docs/*.md` | (scan required) | Add archive tool/skill to MCP tool docs if docs list tools |
| `packages/haiku/tests/` | (new) | Tests for archive/unarchive tool, filter behavior, FSM refusal |

### Architecture patterns in use

- **Frontmatter writes go through `setFrontmatterField`** (state-tools.ts) — existing helper for safe YAML rewrite. Reuse.
- **Tool declarations live in a spec array, handlers live in a switch.** Follow the existing shape in `state-tools.ts` and `orchestrator.ts`.
- **All intent enumeration is `readdirSync(intentsDir).filter(...)`.** Centralizing a helper is a small refactor but prevents filter drift.

### Non-functional requirements

- No performance concerns — four call sites, each iterating a directory of O(intents) with one frontmatter parse per entry. Archived filter adds one predicate check per entry.
- No security concerns — operates on local files, no auth surface.
- Backward compatibility: `archived?: boolean` is optional. Existing intents without the field behave as "not archived." No migration needed.

### Overlap awareness

Ran the branch overlap check. Only active haiku branch touching the intent slug is `haiku/archivable-intents/main` (this branch). No other branches are modifying `state-tools.ts`, `orchestrator.ts`, `types.ts`, or the prototype. Clean field.

### Constraints

- TypeScript strict mode in `packages/haiku/` — any new field must be typed.
- Bun runtime — test/build commands use `bun test`, not `npm test`.
- Plugin-version auto-bumped by CI — do NOT manually edit `plugin/.claude-plugin/plugin.json`.
- CHANGELOG.md is automatic — do NOT edit.

## What the Elaborator Should Produce

Given this landscape, the elaborator should define a small unit set — roughly:

1. Type + persistence (add `archived` field, write helpers)
2. List-filter helper + apply to all four enumeration tools
3. Archive / unarchive tool(s) + FSM refusal update
4. Skill wrapper(s)
5. Prototype runtime-map update (required by sync rule)
6. Website docs update (if tools are listed)
7. Tests

The elaborator should resolve the open questions above before writing units, especially Q1 (separate flag vs. status overload) — that decision shapes several units.

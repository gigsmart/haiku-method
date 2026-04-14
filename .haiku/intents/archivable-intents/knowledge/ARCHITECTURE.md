# ARCHITECTURE — archivable-intents

Implementation-level map of the archive feature. Inception specs in `stages/inception/units/` carry the pinned line numbers and exact edits. This file is the view-from-above.

## Module map

Five code files and two doc surfaces get touched. Nothing else.

- `packages/haiku/src/types.ts` — `IntentFrontmatter` gains one optional field: `archived?: boolean`.
- `packages/haiku/src/state-tools.ts` — home of the new `listVisibleIntentSlugs(intentsDir, opts?)` helper. Three enumeration call-sites (`haiku_intent_list`, `haiku_dashboard`, `haiku_capacity`) route through it. `haiku_intent_list`'s tool schema gains an optional `include_archived: boolean`.
- `packages/haiku/src/orchestrator.ts` — two new MCP tool specs (`haiku_intent_archive`, `haiku_intent_unarchive`), two new handler branches in `handleOrchestratorTool`, and one new refusal guard inside `runNext` for `intent.archived === true`.
- `packages/haiku/src/server.ts` — routing disjunction extended so both new tools dispatch to `handleOrchestratorTool`.
- `plugin/skills/archive/SKILL.md` and `plugin/skills/unarchive/SKILL.md` — thin redirects cloned from `plugin/skills/reset/SKILL.md`.
- `website/public/prototype-stage-flow.html` — canonical runtime map. `TOOL_SPECS` gains two entries, `haiku_run_next` description picks up the refusal path, tool count bumps 27 → 29, orchestrator actor modal lists both new tools under FSM drivers.
- `website/content/docs/cli-reference.md` — two new skill sections plus a short "Managing Intents" prose block.

## Data flow

User invokes `/haiku:archive <slug>`. The skill is a thin wrapper that calls `haiku_intent_archive { intent: <slug> }`. The orchestrator handler resolves the intent path, reads frontmatter, short-circuits with `action: "noop"` if already archived, otherwise calls `setFrontmatterField(intent.md, "archived", true)` and commits via `gitCommitState`. From that point forward, `haiku_intent_list`, `haiku_dashboard`, and `haiku_capacity` all filter the intent out of their default output by going through `listVisibleIntentSlugs`. Any subsequent `haiku_run_next` call on that slug hits the new refusal guard and returns `action: "error"` with an "unarchive first" hint. `/haiku:unarchive <slug>` reverses the flag and the intent reappears everywhere. FSM-controlled fields (`status`, `bolt`, `hat`, timestamps) are never touched by the archive path.

## Key abstraction

`archived` is orthogonal to `status`. A completed intent that's archived keeps `status: completed`. An active intent that's archived keeps `status: active`. Unarchival is lossless — you get back exactly what you had. The single filter source of truth is `listVisibleIntentSlugs(intentsDir, opts?: { includeArchived?: boolean }): string[]`. No call-site may re-implement the `archived === true` predicate. Miss-one-site is the primary regression risk and this helper exists to eliminate it.

## Architectural decisions

- **Separate `archived: boolean` over status overload.** `status` already carries lifecycle meaning (`active`, `completed`, `archived`-as-terminal-state). Reusing it would force a choice between "archived" and "completed" and break lossless unarchival. A dedicated flag is orthogonal and additive.
- **Two explicit tools, not one toggle.** `haiku_intent_archive` and `haiku_intent_unarchive` beat a single `haiku_intent_set_archived { value }` tool. Explicit verbs are self-documenting in audit logs, match the skill names users type, and mirror the existing pattern set by `haiku_intent_reset`.
- **Hard FSM refusal on archived intents.** `haiku_run_next` returns an error with a literal "unarchive first" hint instead of silently auto-unarchiving or coercing through. The guard sits between the existing `status === "archived"` branch and the composite block — ordering is load-bearing so completed-and-archived intents still resolve as complete. No automagic, no surprise side effects.

---
name: unit-02-archive-tools-and-fsm-refusal
type: backend
depends_on:
  - unit-01-archived-flag-and-filter-helper
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
status: active
bolt: 1
hat: elaborator
started_at: '2026-04-14T20:29:21Z'
hat_started_at: '2026-04-14T20:31:15Z'
---

# unit-02-archive-tools-and-fsm-refusal

## Description
Add two new MCP tools — `haiku_intent_archive` and `haiku_intent_unarchive` — that set and clear the `archived` flag on an intent's frontmatter. Both tools operate on `.haiku/intents/{slug}/intent.md` via the existing frontmatter-write helpers. Neither uses elicitation (archival is reversible, so no confirmation is needed). Update `haiku_run_next` in `orchestrator.ts` to refuse advancement on archived intents with a clear "unarchive first" message, in addition to the existing `status === "archived"` check.

## Discipline
backend - TypeScript changes in `packages/haiku/src/orchestrator.ts` and `packages/haiku/src/state-tools.ts` (wherever the new tools fit best).

## Scope

**In scope:**
- Declare `haiku_intent_archive { intent: string }` in the tool-spec array; handler writes `archived: true` to the intent's frontmatter and returns a confirmation payload including the resolved path.
- Declare `haiku_intent_unarchive { intent: string }` similarly; handler writes `archived: false` (or removes the field) and returns confirmation.
- Both handlers must error cleanly when the intent slug doesn't exist, or when the flag is already in the requested state (return idempotent success message rather than error — caller can ignore).
- In `haiku_run_next` (`orchestrator.ts` ~line 870), after the existing `status === "archived"` check, add a check for `data.archived === true` that returns `{ action: "error", message: "Intent '<slug>' is archived. Call haiku_intent_unarchive to restore it." }`.

**Out of scope:**
- Filter logic (unit-01).
- Skill wrappers (unit-03).
- Prototype / docs / tests (units 04–06).

## Success Criteria
- [ ] `haiku_intent_archive` and `haiku_intent_unarchive` are registered in the MCP tool spec array and appear in `haiku_version_info` / tool listings.
- [ ] Calling `haiku_intent_archive { intent: "some-slug" }` sets `archived: true` in `.haiku/intents/some-slug/intent.md` and leaves every other frontmatter field (including `status`) unchanged — verified by reading the file before and after.
- [ ] Calling `haiku_intent_unarchive { intent: "some-slug" }` clears the flag and restores normal behavior. The intent reappears in default `haiku_intent_list` output.
- [ ] `haiku_run_next` on an archived intent returns an error payload containing the phrase "unarchive" in the message; it does not mutate any state.
- [ ] `bun test` passes; manual end-to-end cycle (archive → list → run_next → unarchive → list → run_next) behaves as described.

## Notes
- Reuse the existing `setFrontmatterField` helper in `state-tools.ts` for persistence.
- Follow the declaration pattern of `haiku_intent_reset` for structure, but skip the elicitation step — this operation is safe to perform without confirmation.
- The existing `status === "archived"` check in `orchestrator.ts:870` stays in place. The new check for `data.archived === true` is additive and catches the field-based flag this unit introduces.

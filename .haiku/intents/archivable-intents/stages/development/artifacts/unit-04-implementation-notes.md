# unit-04 implementation notes

## Scope
Prototype-only edits to `website/public/prototype-stage-flow.html` registering the two new archive tools from unit-02 and documenting the archived-intent refusal path on `haiku_run_next`.

## Edits applied

1. **Tool count bump** — line 4011 — `exposes 27 haiku_* tools` → `exposes 29 haiku_* tools` in `ACTORS.orchestrator.role`.
2. **Orchestrator actor modal notes** — `ACTORS.orchestrator.notes` at line 4025:
   - Header updated `27 tools` → `29 tools`.
   - Added `haiku_intent_archive` and `haiku_intent_unarchive` bullets under the `**FSM drivers** (orchestrator.ts):` group, directly after `haiku_intent_reset`. Each bullet notes the frontmatter flip and cross-links to the refusal behavior on `haiku_run_next`.
3. **`haiku_run_next` entry amendment** — `TOOL_SPECS` starting line 4605:
   - `description` now documents the archived-intent refusal path and the `haiku_intent_unarchive` hint.
   - `output.action` string appends `intent_archived` as a possible refusal action.
   - `writes` array gains an explicit line declaring the refusal path performs no state mutation.
   - No new `payloadFor` map entry — there is no UI chip to attach it to.
4. **`haiku_intent_archive` entry added** — in `TOOL_SPECS` immediately after `haiku_intent_reset`. Shape cloned from `haiku_intent_reset` but with the `confirm` guard dropped; archive is reversible. Input: `{ intent }`. Output: `{ ok, archived }`. Writes a single entry toggling `archived: true` in `intent.md` frontmatter.
5. **`haiku_intent_unarchive` entry added** — immediately after `haiku_intent_archive`. Same shape; writes toggle `archived: false`.

## Line drift
None. Every pinned anchor in the inception spec matched the live file:

- `TOOL_SPECS` const opens at line 4585 (matches spec).
- `haiku_intent_reset` at lines 4631-4646 (matches spec).
- `haiku_run_next` at lines 4605-4614 (matches spec; spec said 4605-4615).
- `ACTORS.orchestrator.notes` around line 4025 (matches spec).
- Tool count at line 4011 (matches spec).

## Out of scope (respected)
- Did NOT run `node website/_build-prototype-content.mjs` — studio content unchanged.
- No `payloadFor` map additions.
- No plugin / paper / docs edits.
- No `packages/haiku/src/` edits — unit-02 territory.

## Verification
- `grep haiku_intent_archive\|haiku_intent_unarchive website/public/prototype-stage-flow.html` → 7 hits (≥4 required).
- `grep "29 \`haiku_\*\` tools"` → 1 hit on the `role` line.
- Orchestrator notes string contains both new tools under `**FSM drivers**`.

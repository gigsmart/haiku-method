---
name: unit-04-implement-prototype-runtime-map-sync
type: website
depends_on:
  - unit-02-implement-archive-tools-and-fsm-refusal
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - knowledge/ARCHITECTURE.md
  - stages/inception/units/unit-04-prototype-runtime-map-sync.md
outputs:
  - stages/development/artifacts/unit-04-implementation-notes.md
---

# unit-04-implement-prototype-runtime-map-sync

## Description
Implement the specification in `stages/inception/units/unit-04-prototype-runtime-map-sync.md`. That document is the source of truth for scope, line numbers, and success criteria. Read it end-to-end before editing the prototype.

## Scope
- Add `haiku_intent_archive` entry to `TOOL_SPECS` in `website/public/prototype-stage-flow.html` immediately after `haiku_intent_reset`. Clone the reset shape but drop the `confirm` guard; `writes` toggles `archived: true` in frontmatter.
- Add `haiku_intent_unarchive` immediately after, same shape, `writes` toggles `archived: false`.
- Amend the existing `haiku_run_next` entry's `description` and `writes` to document the archived-intent refusal path and the `haiku_intent_unarchive` hint. Do NOT add a new `payloadFor` map key.
- Update the Orchestrator actor modal's `ACTORS.orchestrator.notes` to list both new tools under **FSM drivers** alongside `haiku_intent_reset`.
- Bump the tool count line from `exposes 27 haiku_* tools` to `exposes 29 haiku_* tools`.
- Do NOT run `node website/_build-prototype-content.mjs` — studio/stage/hat content is unchanged.
- Do NOT edit docs (unit-05).

## Success Criteria
- [ ] `TOOL_SPECS` in `website/public/prototype-stage-flow.html` contains a `haiku_intent_archive` entry immediately after `haiku_intent_reset`, with `input: { intent }`, output shape, and a single `writes` entry touching `intent.md` frontmatter. No `confirm` guard.
- [ ] `TOOL_SPECS` contains a `haiku_intent_unarchive` entry directly after `haiku_intent_archive`, same shape, `writes` toggles `archived: false`.
- [ ] `haiku_run_next` entry in `TOOL_SPECS` has its `description` and `writes` amended to document the archived-intent refusal path and the `haiku_intent_unarchive` hint. No new `payloadFor` map key was added.
- [ ] `ACTORS.orchestrator.notes` lists both new tools under `**FSM drivers**` alongside `haiku_intent_reset`.
- [ ] Tool-count line reads `exposes 29 haiku_* tools` (was `27`).
- [ ] `grep -c "haiku_intent_archive" website/public/prototype-stage-flow.html` returns at least `2` (TOOL_SPECS entry + modal notes). Same for `haiku_intent_unarchive`.
- [ ] `cd website && npm run dev`, open `http://localhost:3000/prototype-stage-flow.html`: page renders without console errors; Orchestrator actor modal shows both new tools under FSM drivers; existing tool modals (`haiku_intent_create`, `haiku_unit_advance_hat`) still render — no regression.
- [ ] `node website/_build-prototype-content.mjs` was NOT run as part of this unit.

## Notes
The inception spec pins every line: `TOOL_SPECS` at 4585-4709, `haiku_intent_reset` template at 4631-4646, `haiku_run_next` at 4605-4615, `ACTORS.orchestrator.notes` around 4025, tool-count at 4011. If the runtime-map diverges from the orchestrator code, the orchestrator wins — fix the prototype to match.

---
name: unit-04-prototype-runtime-map-sync
type: website
depends_on:
  - unit-02-archive-tools-and-fsm-refusal
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
status: active
bolt: 1
hat: elaborator
started_at: '2026-04-14T20:40:50Z'
hat_started_at: '2026-04-14T20:42:46Z'
---

# unit-04-prototype-runtime-map-sync

## Description
Update the interactive runtime-architecture prototype at `website/public/prototype-stage-flow.html` so it reflects the new archive tools. Per `.claude/rules/architecture-prototype-sync.md`, any new MCP tool must be registered in the `TOOL_SPECS` registry and referenced from the Orchestrator actor modal's tool list. Also update `haiku_run_next` payload documentation in the prototype to note the new archived-intent refusal path.

## Discipline
website - HTML/JS edits in `website/public/prototype-stage-flow.html`.

## Scope

**In scope:**
- Register `haiku_intent_archive` in the prototype's `TOOL_SPECS` registry with its input, output, and state-write spec.
- Register `haiku_intent_unarchive` similarly.
- Add both tools to the Orchestrator actor modal's tool list (grouped under the appropriate category — likely "state tools" alongside `haiku_intent_reset`).
- Update the `haiku_run_next` entry (if relevant) so readers see the archived-intent refusal as one of its possible error paths.

**Out of scope:**
- Changes to studio content (no new stages, hats, or review agents), so `node website/_build-prototype-content.mjs` does not need to run.
- Docs in `website/content/docs/` (unit-05).

## Success Criteria
- [ ] `TOOL_SPECS` in `website/public/prototype-stage-flow.html` contains entries for `haiku_intent_archive` and `haiku_intent_unarchive` with accurate input/output/writes fields.
- [ ] The Orchestrator actor modal lists both new tools in the tool catalog, visible when the modal is opened in the live prototype.
- [ ] Running `cd website && npm run dev` and opening `http://localhost:3000/prototype-stage-flow.html` shows the two new tools without console errors.
- [ ] No regressions in other prototype interactions (tooltips, click modals, hover pairing still work).

## Notes
- The prototype is canonical per the sync rule — if the registry and the actual orchestrator code diverge later, the orchestrator is right and the prototype gets fixed.
- There is no need to regenerate the prototype content sidecar (`_build-prototype-content.mjs`) because this change touches tool registration, not studio/stage/hat content.

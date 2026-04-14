---
name: unit-04-prototype-runtime-map-sync
type: website
depends_on:
  - unit-02-archive-tools-and-fsm-refusal
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
status: completed
bolt: 1
hat: elaborator
started_at: '2026-04-14T20:40:50Z'
hat_started_at: '2026-04-14T20:42:46Z'
outputs:
  - stages/inception/artifacts/unit-04-elaboration-notes.md
completed_at: '2026-04-14T20:49:56Z'
---

# unit-04-prototype-runtime-map-sync

## Description
Update the interactive runtime-architecture prototype at `website/public/prototype-stage-flow.html` so it reflects the new archive tools introduced in unit-02 (`haiku_intent_archive`, `haiku_intent_unarchive`) and the archived-intent refusal path on `haiku_run_next`. Per `.claude/rules/architecture-prototype-sync.md`, any new MCP tool **MUST** be registered in `TOOL_SPECS` and referenced from the Orchestrator actor modal's tool list.

All line numbers below refer to `website/public/prototype-stage-flow.html` at HEAD of the unit branch.

## Discipline
website — HTML/JS edits in `website/public/prototype-stage-flow.html` only. No sidecar rebuild.

## Model
`sonnet` — known pattern (extend `TOOL_SPECS` + modal notes string), multiple coordinated edits, no architectural decisions. Template entry and insertion points are fully pinned below. Not `opus` because no trade-off decisions remain; not `haiku` because grouping and prose-amending are judgment calls.

## Scope

**In scope — exact edits:**

1. **`TOOL_SPECS` registry — lines 4585 – 4709.**
   - Add `haiku_intent_archive` entry immediately after `haiku_intent_reset` (which closes at line **4646**). Keeps all `haiku_intent_*` tools grouped.
   - Add `haiku_intent_unarchive` entry directly after the new `haiku_intent_archive` entry.
   - Clone the **shape** of `haiku_intent_reset` (lines 4631 – 4646) but:
     - Input is only `{ intent: "string · the intent slug" }` — **DROP the `confirm` guard**; archive/unarchive is reversible.
     - Output is `{ ok: "boolean", archived: "boolean · new flag value" }` (unarchive mirrors with the new value).
     - `writes` is a single entry: `{ path: ".haiku/intents/{slug}/intent.md", change: "frontmatter: \`archived: true\`" }` (unarchive: `false`).
   - Source of truth for the actual tool surface: unit-02 builder output in `packages/haiku/src/state-tools.ts`. If it disagrees with the above, the orchestrator code wins (per sync rule ground-truth clause) — match the code.

2. **`haiku_run_next` amendment — lines 4605 – 4615.**
   - Amend the existing `haiku_run_next` entry in `TOOL_SPECS` (do NOT add a new `payloadFor` map key — there is no UI chip to attach it to, so a new key would be unreachable).
   - Update the `description` string (line ~4606) to note: `haiku_run_next` refuses to advance when the intent has `archived: true` in frontmatter, and returns a hint to call `haiku_intent_unarchive` first.
   - Update the `writes` section (lines ~4613 – 4615) with an explicit line noting the archived-refusal path performs no state mutation.
   - No new `payloadFor` map entries in the 3627 – 3900+ range.

3. **Orchestrator actor modal — line 4025.**
   - Edit the `ACTORS.orchestrator.notes` multi-line string (starts line 4008, tool list around **4025**).
   - Add `haiku_intent_archive` and `haiku_intent_unarchive` to the `**FSM drivers** (orchestrator.ts):` bullet group, alongside `haiku_intent_reset`. They are lifecycle mutations and belong with the FSM drivers, NOT state tools.

4. **Tool count bump — line 4011.**
   - Change `exposes 27 haiku_* tools` → `exposes 29 haiku_* tools`. Exact text delta: `27` → `29`.

**Out of scope:**
- `node website/_build-prototype-content.mjs` — **DO NOT run.** Studio/stage/hat/review-agent/discovery/output template content is unchanged. Sidecar rebuild is not triggered by tool-spec additions.
- New `payloadFor` map keys.
- Website docs in `website/content/docs/` — owned by unit-05.
- Plugin/paper edits — owned by unit-02 (done) and unit-05.

## Success Criteria
Inception-scoped elaboration deliverables (checked by elaborator on completion):

- [x] Line ranges pinned for every edit site (TOOL_SPECS 4585 – 4709; `haiku_intent_reset` template 4631 – 4646; `haiku_run_next` 4605 – 4615; `ACTORS.orchestrator.notes` ~4025; tool-count 4011) so the dev-stage agent has zero ambiguity.
- [x] Template entry shape captured, including explicit "drop the `confirm` guard" call-out distinguishing archive from `haiku_intent_reset`.
- [x] `haiku_run_next` amendment scoped to description + writes only, with explicit "no new `payloadFor` map key" rationale.
- [x] Sidecar rebuild (`_build-prototype-content.mjs`) explicitly marked out-of-scope with justification from the sync-rule table.
- [x] Model assignment is set (`sonnet`) with justification per the decision heuristic.
- [x] An elaboration-notes artifact captures the scope decisions at `stages/inception/artifacts/unit-04-elaboration-notes.md`.

## Forward-Looking Dev-Stage Acceptance (reference only; checked during the development stage)
- `TOOL_SPECS` in `website/public/prototype-stage-flow.html` contains a `haiku_intent_archive` entry immediately after `haiku_intent_reset`, with `input: { intent }`, output shape, and a single `writes` entry touching `intent.md` frontmatter. No `confirm` guard.
- `TOOL_SPECS` contains a `haiku_intent_unarchive` entry directly after `haiku_intent_archive`, same shape, `writes` toggles `archived: false`.
- `haiku_run_next` entry in `TOOL_SPECS` (originally lines 4605 – 4615) has its `description` and `writes` amended to document the archived-intent refusal path and the `haiku_intent_unarchive` hint. No new `payloadFor` map key was added.
- `ACTORS.orchestrator.notes` (line ~4025) lists both new tools under `**FSM drivers**` alongside `haiku_intent_reset`.
- Tool-count line 4011 reads `exposes 29 haiku_* tools` (was `27`).
- `grep -c "haiku_intent_archive" website/public/prototype-stage-flow.html` returns at least `2` (TOOL_SPECS entry + modal notes). Same for `haiku_intent_unarchive`.
- `cd website && npm run dev`, open `http://localhost:3000/prototype-stage-flow.html`: page renders without console errors; Orchestrator actor modal opens and shows both new tools under FSM drivers; clicking an existing `haiku_run_next` pill opens a modal with the amended description.
- Spot-check: existing tool modals (`haiku_intent_create`, `haiku_unit_advance_hat`) still render — no regression from the edit.
- `node website/_build-prototype-content.mjs` was NOT run as part of this unit.

## Notes
- Research notes at `.haiku/intents/archivable-intents/stages/inception/units/unit-04-prototype-runtime-map-sync/research-notes.md` contain the full template entry, grouping rationale, and verification steps.
- The prototype is canonical per `.claude/rules/architecture-prototype-sync.md` — if the registry and the orchestrator code diverge, the orchestrator wins and the prototype gets fixed.
- Archive is reversible, so unlike `haiku_intent_reset` neither new tool carries a `confirm: boolean` guard field.
- This is a website-only unit. Zero plugin code changes.

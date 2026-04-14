# Architecture-Prototype Sync Rule

The interactive runtime-architecture map at `website/public/prototype-stage-flow.html` is the canonical visualization of how H·AI·K·U actually works at runtime — actors, hooks, FSM phases per stage, every `haiku_run_next` tick, every state write, knowledge flow, modes, post-intent delivery/ops.

**Whenever the architecture changes, update this prototype.** It is part of the sync surface, not a one-off.

## When to update the prototype

Any change to one of the following requires verifying or updating `prototype-stage-flow.html`:

| Change | What to update in the prototype |
|---|---|
| New / changed orchestrator action (e.g. new `haiku_run_next` return type) | Add or update the entry in `payloadFor(...)` registry; update validations/writes/instructions |
| New MCP tool added/removed in `packages/haiku/src/mcp.ts` | Update `TOOL_SPECS` registry; update Orchestrator actor modal's tool list |
| New / changed hook in `packages/haiku/src/hooks/` | Update `HOOKS` array (name, group, desc, fires, file path) |
| New / removed stage in `plugin/studios/software/stages/` | Update `STAGES` array (name, hats, review-agents, inputs, outputs, gate); rerun `node website/_build-prototype-content.mjs` |
| New / removed hat in any stage | Rerun `node website/_build-prototype-content.mjs`; rebuilds the bundled studio content sidecar |
| New / removed review-agent in any stage | Rerun `node website/_build-prototype-content.mjs` |
| New / removed discovery or output template (`discovery/*.md`, `outputs/*.md`) | Rerun `node website/_build-prototype-content.mjs`; clickable artifact chips will render the new template |
| Phase model change (e.g. new phase, removed phase, new transition) | Update the per-stage template in `renderStudio()` and add new pills/payloads as needed |
| Gate type change (`auto`, `ask`, `external`, `await`, combinations) | Update `effectiveGate(...)` and per-stage `gate` definitions |
| Mode behavior change (discrete/continuous/hybrid/auto) | Update `effectiveMode(...)` + `effectiveGate(...)` + paused-chip insertion logic |
| New runtime actor (e.g. new MCP server, new background process) | Add to `ACTORS` registry and the `.actors-strip` HTML |
| Pre-intent flow change (`haiku_intent_create`, intent-review semantics) | Update the `.pre-intent-card` markup and `payloadFor("preelab-to-stage1", ...)` |
| Post-intent change (delivery/ops steps, final gate semantics) | Update the `.post-intent-card` markup |

## How to update

1. Edit `website/public/prototype-stage-flow.html` (or run `node website/_build-prototype-content.mjs` if the change is in `plugin/studios/`).
2. Visually verify in the dev server: `cd website && npm run dev`, then open `http://localhost:3000/prototype-stage-flow.html`.
3. Optionally run `node website/_screenshot.mjs` for a quick all-modes capture in `/tmp/proto-*.png`.
4. Make sure tooltips, click modals, hover-pairing, and inputs/outputs hover-pair into the knowledge pool sidebar all still match reality.

## Ground truth

The prototype claims to be canonical. If it diverges from the orchestrator code, **the orchestrator is right and the prototype is wrong** — fix the prototype, do not fix the orchestrator to match the prototype.

## Known terminology drift (followup work)

The AI-DLC paper (`website/content/papers/ai-dlc-2026.md`) and several docs (`docs/concepts.md`, `docs/workflows.md`, `docs/example-*.md`) reference an **operating-mode taxonomy: HITL / OHOTL / AHOTL** that the implementation has moved past. Today the only mode field is `intent.mode` (`continuous` / `discrete` / `hybrid`); user involvement is determined by per-stage `gate` type in `STAGE.md` plus which skill the user invoked (`/haiku:start`, `/haiku:pickup`, `/haiku:autopilot`, `/haiku:revisit`).

The prototype reflects the **implementation**, not the legacy paper terminology. When the paper/docs are revised to align with the implementation, this note can be removed and the prototype's User-actor modal "terminology drift" callout can also be removed.

## Recently closed gaps (track for related follow-up)

- **Discovery fan-out via subagents** (closed 2026-04-14) — the orchestrator now injects a `## Discovery Fan-Out (REQUIRED)` section into the elaborate-phase `tool_use_result`, instructing the agent to spawn one `Task` subagent per declared `discovery/*.md` template (research + production). Per-studio hat md files do not carry this instruction; it's FSM-level so it applies uniformly across studios. Affected file: `packages/haiku/src/orchestrator.ts` (elaborate case, after `discoveryFiles` loop). Prototype reflects this in step ② of Elaborate ("FSM fans out one ↗ subagent per artifact") and in the `elab-to-gate` injection list.
- **MCP tool list correction** (closed 2026-04-14) — Orchestrator actor modal now lists the real 27 tools across `orchestrator.ts`, `state-tools.ts`, and `server.ts`, grouped by category (FSM drivers · state tools · review-server). Removed the previously-invented tool names.
- **Hat progression mechanism** (closed 2026-04-14) — `hat-to-hat` payload now correctly reflects that the **subagent** calls `haiku_unit_advance_hat` (success) or `haiku_unit_reject_hat` (failure), and the orchestrator internally progresses the FSM in the same call. Not a `haiku_run_next` tick. The action in the modal is now `haiku_unit_advance_hat`.
- **Missing tools `haiku_select_studio` and `haiku_intent_reset`** (closed 2026-04-14) — added to `TOOL_SPECS` with full input/output/writes. `haiku_select_studio` is now referenced as a clickable pill in the studio-detection step of the intent creation card. `haiku_unit_start`, `haiku_unit_advance_hat`, `haiku_unit_reject_hat` also added.
- **`ask_user_visual_question`** (closed 2026-04-14) — added to `TOOL_SPECS` and referenced as a clickable pill in the elaborate ① conversation step, noting the agent uses it for structured visual decisions instead of inline chat options.
- **Wave-spawn atomicity** (closed 2026-04-14) — each Execute wave now shows a small purple dashed callout above the cylinder row: *"↗ parent spawns N subagents in one response · no menu, no per-unit confirmation"*, citing `orchestrator.ts:2509`.

## Ground truth (reiterated)

The prototype claims to be canonical. When implementation changes, update the prototype using this rule's tables. When the prototype is wrong, fix the prototype, not the orchestrator.

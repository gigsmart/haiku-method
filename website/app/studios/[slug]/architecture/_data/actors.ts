// Actor registry — the runtime players above the lifecycle map.

export interface ActorDef {
	icon: string
	name: string
	role: string
	talks_to: string[]
	owns: string[]
	notes: string
}

export const ACTORS: Record<string, ActorDef> = {
	user: {
		icon: "🧑",
		name: "User",
		role: "Provides the intent prompt, signs reviews/approvals at gates, makes external-review decisions. Drives the system through slash-command skills.",
		talks_to: ["Agent (conversation)", "Review web UI (clicks)"],
		owns: [
			"The original intent (`intent.md` body)",
			"Approve / Request Changes / Open PR / External-Review decisions",
			"Slash commands (clickable in the diagram): `/haiku:start`, `/haiku:pickup`, `/haiku:autopilot`, `/haiku:revisit`, `/haiku:quick`",
		],
		notes:
			"**The slash-command skills are invocation entry points, not modes.** The mode lives on `intent.md` as `intent.mode` and is mode-shaped by the cursor:\n\n• `/haiku:start` — create a new intent and re-tick. The pre-cursor selection chain (`select_studio` → `select_mode` → optionally `select_stage`) blocks until the user picks.\n• `/haiku:pickup` — resume an active intent: just calls `haiku_run_next`. No mode change.\n• `/haiku:autopilot` — sets `intent.mode = autopilot`. The cursor trims the role list for that intent: reviews collapse to `[spec]`, approvals to `[spec, quality_gates]`, and `merge_stage` auto-fires once `quality_gates` is signed. No user gate, no agent reviewers.\n• `/haiku:revisit` — file a stage-revisit feedback that rewinds the cursor to that earlier stage's fix loop on the next tick. There is no separate `revisit` action — Track B's by-file-location routing handles the rewind.\n• `/haiku:quick` — single-stage intent with `intent.mode = quick`; the `select_stage` pre-cursor gate fires when `intent.stages[]` is empty.\n\n**Mode taxonomy (v4):** `continuous` / `discrete` / `discrete-hybrid` / `autopilot` / `quick`. Older HITL/OHOTL/AHOTL terminology from the AI-DLC paper is deprecated — the cursor branches on `intent.mode`, not on a separate involvement axis.",
	},
	agent: {
		icon: "🤖",
		name: "Agent (Claude Code)",
		role: "The body. Runs inside the harness. Calls `haiku_run_next` whenever it doesn't know what to do next, then executes the action returned. Never branches on action type for workflow-routing decisions — just follows the prompt.",
		talks_to: [
			"User (chat / clarification)",
			"Orchestrator (MCP tool calls)",
			"Filesystem (Read / Edit / Write — gated by `guard-workflow-fields`)",
		],
		owns: [
			"Conversation context (transient — `/clear` survivable, the cursor re-derives every tick)",
			"The current hat's behavior (loaded from `hats/{hat}.md` and inlined into the dispatch prompt)",
			"The active worktree (one per unit; engine-managed via `git-worktree`)",
		],
		notes:
			"**Stateless between cursor ticks.** `derivePosition` is a pure function of `(disk, studio config) → CursorAction`. The agent holds no workflow state — wave numbers, hat sequences, slot management, bolt counters are all engine-internal, derived from FM at read time. If the agent loses context mid-run, the next tick brings it right back.\n\n**Two mental states.** Per architecture §5.6 — at any tick the agent has either \"I have N subagents to spawn\" or \"I have a terminal — stop.\" Every CursorAction reduces to one of these.",
	},
	hooks: {
		icon: "🛡",
		name: "Hooks",
		role: "Optional reflexes. Every load-bearing rule has an MCP-tool equivalent, so the system works on harnesses without hooks. On Claude Code, hooks make the rules physical at the tool-call boundary.",
		talks_to: [
			"Agent (intercept tool calls; deny + redirect)",
			"Orchestrator (PostToolUse stamps via `haiku_record_agent_write`)",
		],
		owns: [
			"Workflow-path enforcement (`guard-workflow-fields` denies generic Read/Write/Edit on `units/`, `feedback/`, `intent.md`)",
			"Plan-mode redirect (`redirect-plan-mode` → `/haiku:start`)",
			"Drift attribution (`stamp-agent-write` PostToolUse stamps so agent edits don't surface as `drift_detected`)",
			"Context-budget warnings (`context-monitor` PostToolUse)",
			"Edit-after-read recovery hint (`edit-auto-read-hint`)",
			"Prompt-injection scan on `.haiku/` writes (`prompt-guard`)",
		],
		notes:
			"**The hook surface is small in v4.** Five active hooks per `plugin/hooks/hooks.json`: `redirect-plan-mode`, `inject-state-file`, `guard-workflow-fields`, `prompt-guard`, `workflow-guard` (PreToolUse), plus `context-monitor`, `stamp-agent-write`, `edit-auto-read-hint` (PostToolUse). Removed in v4: `quality-gate`, `track-outputs`, `ensure-deps`, `inject-context`, `subagent-hook`, `subagent-context`, `enforce-iteration`. Cached hook registrations in already-running CC sessions are silently no-op'd in `runHook` so the user doesn't see \"hook X not implemented\" until their next CC restart reloads `hooks.json`.",
	},
	orchestrator: {
		icon: "🧠",
		name: "Orchestrator (MCP server)",
		role: "The brain. The MCP server (`packages/haiku/src/server.ts`) that exposes the `haiku_*` tool surface. On every `haiku_run_next` tick it reads disk, runs the v0→v4 migrator if needed, walks the cursor (Track C drift → Track B feedback → Track A intent), and returns the next action.",
		talks_to: [
			"Agent (responds to tool calls)",
			"Filesystem (reads disk; writes only on explicit MCP tool calls and engine-owned merges)",
			"Review web UI (`haiku_review_open` mints sessions; `haiku_await_gate` blocks on user decisions)",
			"intent-broadcaster (fans out `tick_committed`, `gate_prepared`, `await_state_changed`, `pending_decision_changed` to every WS subscriber on this intent)",
			"VCS provider (branch-merge detection for the `external` gate variant of `user_gate`)",
			"Telemetry / Sentry (emit events)",
		],
		owns: [
			"All workflow engine state mutations — `intent.md`, `unit.md`, `feedback.md` frontmatter, FM-stamped reviews / approvals / discovery records",
			"Studio definitions are read-only — the engine consumes `STUDIO.md`, `STAGE.md`, `hats/`, `review-agents/`, `fix-hats/`, `discovery/`, `clarify/`, `outputs/`",
			"Wave scheduling (the cursor's wave-ready predicate over `started_at` + `depends_on`)",
			"Stage-branch lifecycle (`firstUnmergedStage`, stage→main merges under `withIntentMainLock`)",
			"Drift sweep over signed witnesses (`runDriftSweep` against unit body and declared-output content hashes)",
			"v0→v4 migrator, run once on first tick of any pre-v4 intent",
		],
		notes:
			"**The cursor model — v4's reconciliation point.** `derivePosition(slug)` reads disk and walks three tracks in priority order:\n\n1. **Track C — drift sweep.** Re-hashes each unit's body / declared outputs and compares against the FM witness (`reviews.<role>.body_sha256`, `approvals.<role>.witnesses[]`). Mismatch → `drift_detected { events }`. Dedup'd against open drift FBs by `source_ref` so a fired FB suppresses re-emission until it closes. Pre-v4 baseline artifacts (`baseline.json`, `drift-markers.json`, `baseline-content/`) are deleted by the v0→v4 migrator.\n\n2. **Track B — feedback.** Walks every stage from index 0 through the active stage, then intent-scope. Open FB → `start_feedback_hat` (next fix-hat dispatch) or `close_feedback` (terminal advance landed). Cross-stage routing is purely by file location: an FB in `stages/<earlier>/feedback/` rewinds the cursor to that stage's fix loop on the next tick. There is no `upstream_stage:` field and no pre-tick triage gate — classification is the first hat in the stage's `fix_hats:` chain (calls `haiku_feedback_set_targets`).\n\n3. **Track A — intent.** On the active stage (first stage whose branch is not merged into intent main), walks the per-stage state machine: `design_direction_required` → `clarify_required` → `discovery_required` → `elaborate` → `start_unit_hat` (wave logic) → `dispatch_review` / `user_gate { gate_kind: \"spec\" }` → `dispatch_quality_gates` / `dispatch_approval` / `user_gate { gate_kind: \"approval\" }` → `merge_stage`.\n\nAfter every stage merges, the cursor walks intent-scope approvals (`spec`, `continuity`, `user`) and emits `intent_review` per missing role, then `merge_intent`, then `sealed`.\n\n**Pre-cursor selection gates** — `run-tick.ts` (between migrator and `derivePosition`) emits `select_studio` / `select_mode` / `select_stage` when `intent.studio` / `intent.mode` is unset, or when mode is `quick` and `intent.stages[]` is empty. `haiku_run_next` blocks on the picker UI inline; the agent never sees a \"call haiku_select_*\" instruction.\n\n**No state.json.** v4 derives stage position from FM. The cursor is straight TypeScript, deterministic given the same disk state, with no LLM in the workflow-position decision. The agent does not hold workflow state in their context — anything they think they remember about waves or hats is incidental; the next tick tells them what's actually next.\n\n**Mode shaping (read from `intent.mode`):**\n• `continuous` — full role lists `[spec, <agents>, user]` (reviews) and `[spec, quality_gates, <agents>, user]` (approvals).\n• `discrete` — same role lists; the `user` gate dispatches via PR/MR open and waits for merge into intent main as the approval signal.\n• `discrete-hybrid` — discrete up to a chosen pivot stage, then continuous; per-stage gate type drives the dispatch choice.\n• `autopilot` — trimmed: reviews `[spec]`, approvals `[spec, quality_gates]`, no user gate, `merge_stage` auto-fires once `quality_gates` is signed.\n• `quick` — single-stage intent (`intent.stages[]` length 1 after `select_stage`).\n\n**Stage→main merge serialization.** Every `merge_stage` runs under `withIntentMainLock` so concurrent stages can't race the merge into intent main. Stages are NEVER sealed — only intents are; a previously-merged stage that gains a new unit (via fix-loop corrective work) becomes ahead-of-main and `firstUnmergedStage` rewinds the cursor to it automatically.\n\n**MCP tool surface** lives in `packages/haiku/src/orchestrator.ts`, `state-tools.ts`, and `server.ts` — including `haiku_run_next` (the tick + blocking shell for every interactive UI), the unit/feedback CRUDL family with TypeBox + AJV input gates, `haiku_intent_*`, `haiku_select_*` (resume entry points; canonical path is engine-side blocking via run_next), `haiku_await_gate`, `haiku_record_agent_write`, `haiku_feedback_advance_hat` / `_reject_hat` / `_set_targets` / `_move`, `haiku_unit_advance_hat` / `_reject_hat`, `haiku_settings_get/set`, `haiku_studio_*`, `haiku_dashboard`, `haiku_capacity`, `haiku_reflect`, `haiku_repair`. Numeric `feedback_id` at the wire (display label `FB-001`); the parser accepts both 2-digit and 3-digit filename forms.",
	},
	webui: {
		icon: "🌐",
		name: "Review web UI",
		role: "Separate frontend (`packages/haiku-ui`). Where the user clicks at every `user_gate`, every `select_*` picker, every `ask_user_visual_question`, and every `pick_design_direction`. Engine-side blocking: a single MCP tool call (`haiku_run_next` / `ask_user_visual_question` / `pick_design_direction`) opens the session, the engine waits inline, and processing happens before the call returns.",
		talks_to: [
			"User (clicks)",
			"Orchestrator (POST `/review/:id/decide` or WS `decide` frame queues `pending_decision`; broadcaster pushes live state into the open tab)",
		],
		owns: [
			"Approve / Request Changes / Open PR / External Review buttons",
			"Annotation canvas for design / spec review",
			"Inline comments on diffs",
			"Remote review tunnel (so reviewers don't need a local checkout)",
		],
		notes:
			"**Four UI paths** — all engine-side blocking (the agent calls one tool, the engine handles session creation + browser launch + wait + post-decision processing):\n\n• **User-gate review** — text-mode review at `user_gate { gate_kind: \"spec\" | \"approval\" }`. User sees the unit specs (spec gate, pre-execute) or the executed work + review-agent findings (approval gate, post-execute) and clicks Approve / Request Changes / Open PR / External Review. The engine inlines the await inside `haiku_run_next` (or `haiku_await_gate` as the resume entry point).\n\n• **Picker** — engine-side blocking selection for `select_studio` / `select_mode` / `select_stage`. Studio renders as card grid + stage chain, mode as cards with a mini-timeline showing where pauses happen, stage as a simpler list. The agent never sees the `select_*` action in chat — the tick blocks until the user picks.\n\n• **Visual question** — `ask_user_visual_question` opens a structured pick-an-option page with an annotation canvas instead of dropping options into chat. Common during Design and early Product elaborate phases.\n\n• **Design direction** — `pick_design_direction` (surfaced when `STAGE.md` declares `requires_design_direction: true`) opens an intake-first picker. Designers who already have files upload them directly (→ `design_direction_uploaded`, no archetype generation); designers who need variants get a card grid of generated archetypes with annotation + regenerate affordances (→ `design_direction_complete`).\n\n**Live-session UX:** the SPA tab outlives the blocking tool call. Approve is disabled when no await is currently blocking (`await_active=false`); the composer nudges the user to leave feedback that the engine will pick up on the next tick. Decisions submitted before the engine is asking get queued as `pending_decision` and consumed on the next await. Live state events (`tick_committed`, `gate_prepared`, `await_state_changed`, `pending_decision_changed`) flow over the WS so the dashboard stays current without polling.\n\n**`discrete` mode** — `user_gate` dispatches differently: the engine opens a real PR/MR for the stage branch and the merge into intent main IS the approval signal. The SPA still renders for context, but Approve routes through VCS.\n\n**Reliability:** WebSocket reconnect lets the orchestrator survive UI refreshes. JWT-in-hash-fragment makes the URL safely shareable for `external` review.",
	},
}

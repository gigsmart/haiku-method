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
		role: "Provides the intent prompt, approves at gates, makes external-review decisions. Drives the system primarily through four slash-command skills.",
		talks_to: ["Agent (conversation)", "Review web UI (clicks)"],
		owns: [
			"The original intent (`intent.md` body)",
			"Approve / Request Changes / Open PR / External-Review decisions",
			"Slash commands (clickable in the diagram): `/haiku:start`, `/haiku:pickup`, `/haiku:autopilot`, `/haiku:revisit`",
		],
		notes:
			"**The slash-command skills (not a separate operating-mode axis)** are the user's invocation entry points:\n\n• `/haiku:start` — create a new intent and kick off stage 1.\n• `/haiku:pickup` — resume an active intent: just calls `haiku_run_next` on whichever intent is active. No mode change.\n• `/haiku:autopilot` — wraps `haiku_run_next` in a loop, behaves *as if* ask gates were auto, only pauses for external review or scope-check guardrails (e.g. `>5 units` triggers a pause). It's a workflow wrapper, **not a workflow engine mode** — there's no `autopilot` value the orchestrator branches on.\n• `/haiku:revisit` — bounce back to a prior stage's elaborate.\n\n**Note on terminology drift:** the AI-DLC paper describes three operating modes — HITL / OHOTL / AHOTL — and that taxonomy is still in `paper/` and several `docs/` files. The implementation has moved past it: the only stored mode is `intent.mode` (continuous/discrete/hybrid). The user's level of involvement is now a function of (a) the gate type per stage in `STAGE.md` and (b) which skill they invoked. The prototype reflects the implementation, not the legacy paper.",
	},
	agent: {
		icon: "🤖",
		name: "Agent (Claude Code)",
		role: "The body. Runs inside the Claude Code harness. Calls `haiku_run_next` whenever it doesn't know what to do next, then executes the action returned.",
		talks_to: [
			"User (chat / clarification)",
			"Orchestrator (MCP tool calls)",
			"Filesystem (Read/Edit/Write — gated by hooks)",
		],
		owns: [
			"Conversation context (transient — `/clear` survivable thanks to the workflow engine)",
			"The current hat's behavior (loaded from `hats/{hat}.md`)",
			"The active worktree (one per unit)",
		],
		notes:
			"**Stateless between workflow engine ticks.** Every `haiku_run_next` re-injects what the agent needs to know via the `inject-context` hook. If the agent loses context mid-run, the next tick brings it right back.",
	},
	hooks: {
		icon: "🛡",
		name: "Hooks",
		role: "The spinal reflexes. Run inside Claude Code's hook system — between every agent tool call. Can't decide anything; can only block / inject.",
		talks_to: [
			"Agent (intercept tool calls)",
			"Filesystem (read workflow engine state for injection)",
		],
		owns: [
			"Edit-scope enforcement (`workflow-guard`)",
			"workflow-managed frontmatter protection (`guard-workflow-fields`)",
			"Quality-gate execution (`quality-gate`)",
			"Output tracking (`track-outputs`)",
		],
		notes:
			"If you have to *trust* the agent to follow the rules, you'll find out it didn't the moment something goes wrong. Hooks make the rules **physical**. See the left sidebar for the full hook list.",
	},
	orchestrator: {
		icon: "🧠",
		name: "Orchestrator (MCP server)",
		role: "The brain. An MCP server (`packages/haiku/src/server.ts`) that exposes 45 `haiku_*` tools. On every tick it reads workflow engine state from disk, validates preconditions, and returns the next action.",
		talks_to: [
			"Agent (responds to tool calls)",
			"Filesystem (reads + writes workflow engine state)",
			"Review web UI (`_prepareGateReview()` mints/reuses a session — non-blocking; `haiku_await_gate` blocks separately, drains queued decisions)",
			"intent-broadcaster (fans out tick / gate / await / pending-decision events to every WS subscriber on this intent)",
			"Quality gates (spawns child processes)",
			"Telemetry / Sentry (emit events)",
		],
		owns: [
			"All workflow engine state mutations (only the orchestrator may write `state.json` or workflow-managed frontmatter)",
			"Studio definitions are read-only — orchestrator consumes `STUDIO.md`, `STAGE.md`, `hats/`, `review-agents/`",
			"Wave scheduling (`computeUnitWaves` topological sort)",
			"Gate type resolution (`auto`, `ask`, `external`, `[external, ask]`, `await`)",
		],
		notes:
			"**Core principle — the workflow engine enforces, not the agent.** The agent is the body executing actions; the orchestrator is the brain owning state mutations and validating preconditions. If you have to *trust* the agent to follow the rules, you'll find out it didn't the moment something goes wrong. Hooks make rules physical; the orchestrator makes them stateful. That's why you see `_prepareGateReview()` returning the URL synchronously while `haiku_await_gate` blocks separately (decoupled so the SPA tab outlives the tool call), `guard-workflow-fields` rejecting agent edits to workflow engine frontmatter — every guarantee is enforced, not requested.\n\n**Live-session contract (2026-05-04):** review sessions outlive the await tool call. `_prepareGateReview()` returns `{session_id, review_url, reused, browser_attached}` non-blockingly; the agent posts the URL (or skips if `browser_attached=true` because the user is already watching from a prior gate this session). `haiku_await_gate { intent }` is a separate MCP tool that drains `pending_decision` on entry, otherwise blocks on `waitForSession` for up to 30 min — and forwards the MCP abort signal so cancel unwinds promptly. The await NEVER closes the WS or kills the session in its finally; cleanup is TTL/presence-driven. Decisions submitted via HTTP `/review/:id/decide` or the WS `decide` frame both write to `pending_decision`; the per-intent broadcaster fires `pending_decision_changed` so other tabs see the queued state. The session is reused (same URL, same session_id) on every subsequent prepare for the same intent within a single agent session — one tab per intent, no re-pops.\n\n**Pre-tick contract update (2026-04-27):** when there's open feedback on or before the active stage, the workflow engine routes through one of three fallbacks BEFORE any handler can re-open a review UI: `feedback_triage` (untriaged), `revisited` (earlier-stage FB), or `feedback_dispatch` (human comments left to the agent). The review UI never re-pops while feedback is unaddressed — the agent works each finding to closure or escalation first.\n\n**Pre-tick drift-detection gate (2026-04-30):** after feedback-triage, the drift-detection gate runs before per-state dispatch on every tick. It walks `artifacts/`, `outputs/`, `knowledge/`, `discovery/`, and intent-scope `knowledge/`; computes SHA-256 per file; diffs against `stages/{stage}/baseline.json`. When findings are emitted, `manual_change_assessment` short-circuits the normal handler. The agent classifies all findings atomically via `haiku_classify_drift` (four outcomes: `ignore`, `inline-fix`, `surface-as-feedback`, `trigger-revisit`). Kill-switch: `drift_detection: false` in settings.yml makes the gate a complete no-op. Gate chain: tamper-detection → feedback-triage → **drift-detection** → per-state dispatch.\n\n**The MCP tool surface lives in `packages/haiku/src/orchestrator.ts`, `state-tools.ts`, and `server.ts`** — including `haiku_run_next` (the tick), the unit/feedback CRUDL family, `haiku_intent_*` (now including `haiku_intent_set` for validated FM mutations against `INTENT_FRONTMATTER_SCHEMA`), `haiku_stage_get` / `haiku_stage_set` (engine-internal — `haiku_stage_set` rejects all writes with `stage_field_engine_only` since every state.json field is workflow-managed), `haiku_settings_get` / `haiku_settings_set` (validated against `plugin/schemas/settings.schema.json` with provider sub-schemas pre-loaded), `haiku_studio_*`, `haiku_dashboard`, `haiku_capacity`, `haiku_reflect`, `haiku_repair`, the review-server's `haiku_feedback`, `haiku_coverage_acknowledge` (record explicit out-of-scope or covered-by-unit decision for the cumulative-input-coverage gate), and `haiku_classify_drift` (classify out-of-band human file modifications — four outcomes: ignore, inline-fix, surface-as-feedback, trigger-revisit). Revisit is not a separate verb — it's a property of the next `haiku_run_next` tick when the pre-tick gate sees an open `stage_revisit` FB. Auto-commits via `gitCommitState()` happen on every workflow engine mutation, so a H·AI·K·U intent's full history is reconstructable from git alone.",
	},
	webui: {
		icon: "🌐",
		name: "Review web UI",
		role: "Separate frontend (`packages/haiku/review-app/`). Where the user actually clicks at every `ask` and `[external, ask]` gate. Lives for the duration of the agent session: opened via `_prepareGateReview()` (non-blocking), reused across gate cycles, gated Approve button only active while a `haiku_await_gate` call is awaiting a decision.",
		talks_to: [
			"User (clicks)",
			"Orchestrator (POST `/review/:id/decide` or WS `decide` frame queues `pending_decision`; broadcaster pushes live state into the open tab)",
		],
		owns: [
			"Approve / Request Changes / Open PR / External Review buttons",
			"Annotation canvas for design / spec review",
			"Inline comments on diffs",
			"Remote review tunnel (so reviewers don't need local checkout)",
		],
		notes:
			"**Two distinct UI paths:**\n\n• **Standard gate review** — text-mode review at every `ask` / `[external, ask]` gate. User sees the elaborated specs (or the executed work + review-agent findings) and clicks Approve / Request Changes / Open PR / External Review. Triggered by `_prepareGateReview()` from the orchestrator (non-blocking — the agent posts the URL then calls `haiku_await_gate` to wait).\n\n• **Visual review** — used during elaboration when the agent has wireframes, mockups, design comparisons, or architecture diagrams to put in front of the user. Triggered by `ask_user_visual_question` MCP tool — renders a structured pick-an-option experience with annotation canvas instead of dropping options into chat. Common during Design and early Product elaborate phases.\n\n**Live-session UX (2026-05-04):** the SPA tab outlives the await tool call. Approve is disabled when no `haiku_await_gate` is currently blocking (`await_active=false`); the composer nudges the user to leave feedback that the engine will pick up on the next tick. Decisions submitted before the engine is asking get queued as `pending_decision` and consumed on the next await. Live state events (`tick_committed`, `gate_prepared`, `await_state_changed`, `pending_decision_changed`) flow over the WS so the dashboard stays current without polling.\n\n**When the UI does NOT re-pop:** while open feedback is on the stage. The agent triages and resolves each item (or escalates) before any review screen re-opens — see the orchestrator's pre-tick triage gate.\n\n**Reliability:** a WebSocket reconnect lets the orchestrator survive UI refreshes. JWT-in-hash-fragment makes the URL safely shareable for `external` review.",
	},
}

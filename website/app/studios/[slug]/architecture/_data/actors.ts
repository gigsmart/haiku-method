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
			"Review web UI (engine-side blocking: `haiku_run_next` calls `_prepareGateReview()` + inlines `haiku_await_gate` in one tick; the agent NEVER sees a URL+await two-step. `haiku_await_gate` stays as a resume entry point for timeouts)",
			"SPA picker (engine-side blocking: tick gates emit `select_studio` / `select_mode` / `select_stage` which `haiku_run_next` intercepts, runs `runPicker()` inline, and re-ticks — agent never sees the select_* action)",
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
			"**Core principle — the workflow engine enforces, not the agent.** The agent is the body executing actions; the orchestrator is the brain owning state mutations and validating preconditions. If you have to *trust* the agent to follow the rules, you'll find out it didn't the moment something goes wrong. Hooks make rules physical; the orchestrator makes them stateful. That's why selection pickers, gate reviews, visual questions, and design-direction sessions ALL block engine-side now — there is no URL+await two-step the agent can drop, because the agent never sees one.\n\n**Engine-side blocking (v4):** `haiku_run_next` is now the single blocking surface for every interactive UI. When the cursor emits `select_studio` / `select_mode` / `select_stage`, the engine runs `runPicker()` inline, writes the chosen value, and re-ticks. When the cursor emits `gate_review`, the engine prepares the session, calls `haiku_await_gate.handle()` inline, processes the post-decision side effects (stampGateApproval / workflowAdvance{Phase,Stage} / writeReviewFeedbackFiles / sealIntentState), and either re-ticks for advance cases or returns the await response directly for terminal cases. The same shape applies to `ask_user_visual_question` (inlines `awaitVisualAnswerSession`) and `pick_design_direction` (inlines `awaitDesignDirectionSession`). The corresponding `haiku_await_*` tools stay as resume entry points only — used when the original blocking tool call timed out, the MCP host disconnected, or an agent restart lost the in-memory wait.\n\n**Live-session contract:** review sessions outlive the await tool call. The session is reused (same URL, same session_id) on every subsequent prepare for the same intent within a single agent session — one tab per intent, no re-pops. Decisions submitted via HTTP `/review/:id/decide` or the WS `decide` frame both write to `pending_decision`; the per-intent broadcaster fires `pending_decision_changed` so other tabs see the queued state. Approve is disabled in the SPA when no await is active.\n\n**Pre-tick contract (2026-04-27):** when there's open feedback on or before the active stage, the workflow engine routes through one of three fallbacks BEFORE any handler can re-open a review UI: `feedback_triage` (untriaged), `revisited` (earlier-stage FB), or `feedback_dispatch` (human comments left to the agent). The review UI never re-pops while feedback is unaddressed — the agent works each finding to closure or escalation first.\n\n**Pre-tick drift-detection gate (v4 body-sha256 model):** after feedback-triage, the drift-detection gate runs before per-state dispatch on every tick. v4 dropped the `baseline.json` manifest + `baseline-content/` snapshot dir + `drift-markers.json` sidecar; the witness now lives directly on each unit's frontmatter as `reviews.<role>.body_sha256` and `approvals.<role>.witnesses[]`. `runDriftSweep` re-hashes the unit body / declared outputs and compares against the witness. Pre-v4 baseline artifacts are deleted by the v0→v4 migrator. Kill-switch: `drift_detection: false` in settings.yml.\n\n**The MCP tool surface lives in `packages/haiku/src/orchestrator.ts`, `state-tools.ts`, and `server.ts`** — including `haiku_run_next` (the tick + blocking shell for every interactive UI), the unit/feedback CRUDL family, `haiku_intent_*`, `haiku_select_*` (resume entry points; canonical path is engine-side blocking via run_next), `haiku_await_*` (resume entry points only), `haiku_stage_get` / `haiku_stage_set` (engine-internal), `haiku_settings_get` / `haiku_settings_set`, `haiku_studio_*`, `haiku_dashboard`, `haiku_capacity`, `haiku_reflect`, `haiku_repair`, the review-server's `haiku_feedback`, and `haiku_coverage_acknowledge`. Auto-commits via `gitCommitState()` happen on every workflow engine mutation.",
	},
	webui: {
		icon: "🌐",
		name: "Review web UI",
		role: "Separate frontend (`packages/haiku-ui`). Where the user actually clicks at every `ask` / `[external, ask]` gate, every studio/mode/stage picker, every visual question, and every design-direction selection. Lives for the duration of the agent session: opened by the engine inside `haiku_run_next` / `ask_user_visual_question` / `pick_design_direction` (single blocking call — no URL+await two-step), reused across gate cycles. Approve is disabled when no await is currently blocking.",
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
			"**Four UI paths** — all engine-side blocking (the agent calls one tool, the engine handles session creation + browser launch + wait + post-decision processing):\n\n• **Gate review** — text-mode review at every `ask` / `[external, ask]` gate. User sees the elaborated specs (or executed work + review-agent findings) and clicks Approve / Request Changes / Open PR / External Review. The engine inlines the await inside `haiku_run_next`.\n\n• **Picker** — engine-side blocking selection for studio / mode / stage / destructive-confirm. Studio renders as card grid + stage chain, mode as cards with mini-timeline showing where pauses happen, stage + confirm as simpler lists. The agent never sees `select_*` actions; the tick blocks until the user picks.\n\n• **Visual question** — `ask_user_visual_question` opens a structured pick-an-option page with an annotation canvas instead of dropping options into chat. Common during Design and early Product elaborate phases.\n\n• **Design direction** — `pick_design_direction` opens an intake-first picker. Designers who already have files upload them directly (no archetype generation); designers who need variants get a card grid of generated archetypes with annotation + regenerate affordances.\n\n**Live-session UX:** the SPA tab outlives the blocking tool call. Approve is disabled when no await is currently blocking (`await_active=false`); the composer nudges the user to leave feedback that the engine will pick up on the next tick. Decisions submitted before the engine is asking get queued as `pending_decision` and consumed on the next await. Live state events (`tick_committed`, `gate_prepared`, `await_state_changed`, `pending_decision_changed`) flow over the WS so the dashboard stays current without polling.\n\n**When the UI does NOT re-pop:** while open feedback is on the stage. The agent triages and resolves each item (or escalates) before any review screen re-opens — see the orchestrator's pre-tick triage gate.\n\n**Reliability:** a WebSocket reconnect lets the orchestrator survive UI refreshes. JWT-in-hash-fragment makes the URL safely shareable for `external` review.",
	},
}

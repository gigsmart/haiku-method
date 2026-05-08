// haiku_run_next payload registry — what the cursor returns at each
// visual transition point in a stage's lifecycle. Distilled from
// `packages/haiku/src/orchestrator/workflow/cursor.ts` and
// `run-tick.ts`.
//
// v4 model: the cursor (`derivePosition`) walks Track C (drift) → Track B
// (feedback) → Track A (intent) on every `haiku_run_next` tick. Each
// entry below describes a visual position in the map and what the
// cursor would emit at that point — one of the v4 CursorAction kinds:
// `select_studio` / `select_mode` / `select_stage` / `drift_detected` /
// `clarify_required` / `discovery_required` /
// `design_direction_required` / `design_direction_complete` /
// `design_direction_uploaded` / `elaborate` / `start_unit_hat` /
// `start_feedback_hat` / `close_feedback` / `dispatch_review` /
// `dispatch_quality_gates` / `dispatch_approval` / `user_gate` /
// `merge_stage` / `intent_review` / `merge_intent` / `sealed`.
//
// The TransitionKey enum is the map's visual vocabulary; it does NOT
// match cursor `kind` values 1:1. Each visual position chooses the
// most-likely cursor action it represents. See architecture §5.5 for
// the full action surface and §5.4 for the per-stage walk order.

import type { DerivedStage, ExecutionMode, PayloadModalData } from "./types.js"

export type TransitionKey =
	| "preelab-to-stage1"
	| "elab-to-prereview"
	| "prereview-to-gate"
	| "elab-to-gate"
	| "hat-to-hat"
	| "wave-to-wave"
	| "execute-to-review"
	| "review-spec-to-agents"
	| "gate-spec-reset-to-review"
	| "review-quality-to-agents"
	| "review-to-gate"
	| "gate-to-next-stage"
	| "feedback-dispatch"
	| "drift-detected"

export interface TransitionOpts {
	from?: string
	to?: string
	unit?: string
	units?: string[]
	isLast?: boolean
	nextStageName?: string | null
}

export type PayloadResult = Omit<PayloadModalData, "stage" | "key">

export function payloadFor(
	stage: DerivedStage,
	idx: number,
	mStage: ExecutionMode,
	key: TransitionKey,
	opts: TransitionOpts = {},
): PayloadResult | null {
	const stageLower = stage.name.toLowerCase()
	const isFirst = idx === 0
	const isAutopilot = mStage === "auto"

	const map: Partial<Record<TransitionKey, PayloadResult>> = {
		"preelab-to-stage1": {
			injection: [
				{
					hook: "MCP tool result",
					target: "agent's `tool_use_result` content",
					what: "the pre-cursor selection chain emits one action at a time — `select_studio` → `select_mode` → (mode='quick' ? `select_stage`) — until every orientation field is set on `intent.md`. `haiku_run_next` blocks on the SPA picker inline; the agent never sees `select_*` in chat unless a non-haiku_run_next caller bypassed the gate.",
				},
				{
					hook: "inject-state-file",
					target: "MCP `_session_context` arg",
					what: "PreToolUse hook injects `state_file` (session metadata persistence path) and `_session_context` (CLAUDE_SESSION_ID, harness, model, etc.) so the orchestrator sees env it can't read directly.",
				},
				{
					hook: "v0→v4 migrator",
					target: "intent.md, every unit.md, every feedback.md (one-time)",
					what: "`run-tick.ts` runs the migrator on first read of any pre-v4 intent: strips deprecated fields (`active_stage`, `phase`, `status`, `triaged_at`, `upstream_stage`, etc.), deletes `state.json`, deletes pre-v4 drift sidecars, stamps `plugin_version: \"4.0.0\"`, synthesizes `approvals.user` for previously-completed units. Idempotent.",
				},
				{
					hook: "readStudio() / readStageDef()",
					target: "`start_stage` prompt body",
					what: "once orientation is complete and the cursor walks Track A on the first stage, `start_stage` inlines the studio body + STAGE.md body so the agent has the full mandate up front.",
				},
			],
			action: "select_studio → select_mode → (quick? select_stage) → elaborate",
			summary: `pre-cursor selection chain → first stage (${stage.name}) elaborate`,
			payload: {
				action: "select_studio",
				intent: "{slug}",
				message: "Intent has no studio. Engine pops the SPA picker.",
				next_actions_after_orientation: [
					"select_mode (continuous | discrete | discrete-hybrid | autopilot | quick)",
					"select_stage (only when mode='quick' and intent.stages[] is empty)",
					"elaborate { stage: '" + stageLower + "' }",
				],
			},
			validations: [
				"`intent.md` exists with valid frontmatter (created by `haiku_intent_create`)",
				"`intent.studio` is the trigger for `select_studio` (unset → emit)",
				"`intent.mode` is the trigger for `select_mode` (unset → emit; engine-only field, agents cannot write directly)",
				"For `mode: quick` only: `intent.stages[]` empty → `select_stage`",
				"`plugin_version` major < 4 → migrator runs once before the cursor walks",
			],
			writes: [
				{
					path: ".haiku/intents/{slug}/intent.md",
					change:
						"frontmatter: `studio`, `mode`, optionally `stages[]` written by engine after each picker resolves; `plugin_version: \"4.0.0\"` stamped by the migrator on first v4 read.",
				},
			],
			instructions: `The pre-cursor gates in \`run-tick.ts\` emit one \`select_*\` action at a time when the corresponding \`intent.md\` field is missing. \`haiku_run_next\` intercepts each, blocks on the SPA picker, writes the chosen value, and re-ticks. Once orientation is complete, the cursor walks Track A on the first stage (\`${stage.name}\`) — initially the stage has no units, so the cursor returns \`elaborate { stage: "${stageLower}" }\` and the agent begins collaborative drafting.`,
		},
		"elab-to-prereview": {
			injection: [
				{
					hook: "MCP tool result",
					target: "agent's `tool_use_result`",
					what: "`action: dispatch_review` — once the stage has units and every hat sequence has terminal-advanced, the cursor walks the spec-review track. One action per missing role per tick — engine-built `spec` first, then each studio-declared review-agent in sequence.",
				},
				{
					hook: "readReviewAgentPaths()",
					target: "subagent prompt",
					what: "the dispatched review agent's mandate (`plugin/studios/<studio>/stages/<stage>/review-agents/<role>.md`) is inlined into the dispatch block.",
				},
			],
			action: "dispatch_review",
			summary:
				"unit hats done — cursor walks the spec-review track per role (one tick = one role)",
			payload: {
				action: "dispatch_review",
				intent: "{slug}",
				stage: stageLower,
				role: "<next-missing-review-role>",
				units: ["<units-where-reviews.<role>-is-missing>"],
			},
			validations: [
				"Every unit's hat sequence has terminal-advanced (last `iterations[].result === 'advance'` on the last configured hat)",
				"Some unit has `reviews.<role>` missing for the next role in the cursor's reviewRoles list",
				"reviewRoles order: `spec` (engine-built) → studio review-agents → `user`",
				`Mode shaping: ${isAutopilot ? "autopilot trims to `[spec]` only — no studio agents, no user role" : "full role list applies"}`,
			],
			writes: [
				{
					path: ".haiku/intents/{slug}/stages/{stage}/units/<unit>.md",
					change:
						"after the review-agent subagent terminates clean, the engine signs `reviews.<role>: { at, body_sha256, ... }` on each reviewed unit (the witness for Track C drift). Findings flow through `haiku_feedback` (origin: `adversarial-review`).",
				},
			],
			instructions:
				"Cursor's spec-review track. Each tick returns `dispatch_review { role, units }` for the next missing role. Agent dispatches the review-agent subagent with a tool whitelist of `haiku_unit_read` + `haiku_feedback`. The subagent files findings (which Track B picks up on the next tick via `start_feedback_hat`); when the subagent terminates clean, the engine stamps `reviews.<role>` on each listed unit. Once every non-user role is signed, the cursor advances to `user_gate { gate_kind: \"spec\" }` (skipped under autopilot).",
		},
		"prereview-to-gate": {
			injection: [
				{
					hook: "MCP tool result",
					target: "agent's `tool_use_result`",
					what: isAutopilot
						? "autopilot mode: spec gate is auto. Reviews collapse to `[spec]`; once `spec` is signed the cursor advances directly to `start_unit_hat` for the first wave."
						: "non-autopilot: `dispatch_review` for the next missing role until every studio agent signs, then the cursor emits `user_gate { gate_kind: \"spec\" }` and the engine opens the SPA review session inline.",
				},
			],
			action: isAutopilot ? "start_unit_hat" : "user_gate",
			summary: isAutopilot
				? "spec reviews collapsed to `[spec]` — auto-advance to first wave"
				: `spec reviews complete — open user_gate { gate_kind: "spec" }`,
			payload: isAutopilot
				? {
						action: "start_unit_hat",
						intent: "{slug}",
						stage: stageLower,
						hat: "<first-hat>",
						units: ["<wave-1-units>"],
						terminal: false,
					}
				: {
						action: "user_gate",
						intent: "{slug}",
						stage: stageLower,
						gate_kind: "spec",
						units: ["<units-where-reviews.user-is-missing>"],
					},
			validations: [
				"Every unit's hat sequence has terminal-advanced",
				isAutopilot
					? "autopilot trimmed reviewRoles to `[spec]`; once `spec` is signed, no further review track work"
					: "Every studio-declared review agent has signed `reviews.<role>` on every listed unit",
			],
			writes: [
				{
					path: ".haiku/intents/{slug}/stages/{stage}/units/<unit>.md",
					change: isAutopilot
						? "no write at this transition — the wave dispatch is the next mainline action"
						: "after the user approves via the SPA, the engine signs `reviews.user` on every listed unit and the cursor advances to the approval track. On request_changes, the engine writes the user's annotations as feedback files; the cursor walks Track B on the next tick.",
				},
			],
			instructions: isAutopilot
				? "Autopilot mode: the cursor's reviewRoles list is `[spec]`, so once the spec subagent signs there's no more spec-review work. The next tick returns `start_unit_hat` for the first wave-ready batch."
				: "The cursor returns `user_gate { gate_kind: \"spec\" }` and `haiku_run_next` opens the review SPA session inline (via `haiku_review_open`), then blocks on `haiku_await_gate`. On approve, the engine stamps `reviews.user` on every unit; on request_changes, the engine writes the annotations as feedback files and Track B walks them on the next tick.",
		},
		"elab-to-gate": {
			injection: [
				{
					hook: "MCP tool result",
					target: "agent's `tool_use_result`",
					what: "`user_gate { gate_kind: \"spec\" }` — the cursor's reviewRoles loop reached the `user` role. `haiku_run_next` calls `haiku_review_open` inline (creates or reuses a session) and blocks on `haiku_await_gate`.",
				},
				{
					hook: "haiku_review_open / _prepareGateReview",
					target: "Review web UI session record",
					what: "creates (or REUSES, when a live SPA tab exists for this intent) the review session; refreshes the unit set + gate metadata on every prepare; returns `{session_id, review_url, reused, browser_attached}`.",
				},
				{
					hook: "intent-broadcaster",
					target: "every WS subscriber on this intent",
					what: "fires a `gate_prepared` event so the SPA tab refreshes into the gate view without polling.",
				},
				{
					hook: "haiku_await_gate (engine-internal in v4)",
					target: "agent's `tool_use_result` (post-decision)",
					what: "drains `pending_decision` on entry; otherwise blocks on `waitForSession` (up to 30 min). Forwards the MCP abort signal so cancel unwinds promptly. Session lives across awaits — WS, tunnel, and pointers persist.",
				},
			],
			action: "user_gate",
			summary: "spec reviews signed by every agent → user_gate { gate_kind: \"spec\" } (engine-side blocking)",
			payload: {
				action: "user_gate",
				intent: "{slug}",
				stage: stageLower,
				gate_kind: "spec",
				units: ["<units-where-reviews.user-is-missing>"],
				review_url: "https://...",
				session_id: "<session-id>",
				reused: false,
				browser_attached: false,
			},
			validations: [
				"DAG is acyclic and every unit's `depends_on` references existing units (validated at `haiku_unit_write` time)",
				"Unit naming follows `unit-NN-slug.md`",
				"Every unit's hat sequence has terminal-advanced",
				"Every non-user review role has signed `reviews.<role>` on every unit",
			],
			writes: [
				{
					path: ".haiku/intents/{slug}/stages/{stage}/units/<unit>.md",
					change:
						"on approve: `reviews.user: { at, body_sha256, ... }` stamped on every listed unit (the witness Track C will sweep against). On request_changes: engine writes user's annotations as `feedback/<NN>-*.md` files; cursor walks Track B on the next tick.",
				},
			],
			instructions: `The cursor reached the user's spec review. \`haiku_run_next\` opens the review session inline and blocks on \`haiku_await_gate\` — single tool call, no URL+await two-step. On approve → engine stamps \`reviews.user\` on every listed unit; the next tick returns \`start_unit_hat\` for the first wave. On request_changes → engine writes feedback files and Track B walks them on the next tick. **The review UI does NOT re-open while open feedback is pending** — Track B walks before Track A on every tick, so the cursor dispatches fix-hats against the FB until it closes.`,
		},
		"hat-to-hat": {
			injection: [
				{
					hook: "MCP tool result",
					target: "subagent's `tool_use_result`",
					what: `next hat name (\`${opts.to ?? "?"}\`), \`hats/${opts.to ?? "?"}.md\` content. The cursor groups units by hat-index; the parent dispatches one subagent per unit per hat in parallel batches.`,
				},
				{
					hook: "stamp-agent-write (PostToolUse)",
					target: "intent action log",
					what: "agent edits inside tracked drift surfaces stamp `entry_type: \"agent_write\"` so the next drift sweep attributes the change to the agent rather than firing `drift_detected` against the agent's own work.",
				},
			],
			action: "haiku_unit_advance_hat",
			summary: `subagent calls advance_hat → ${opts.from ?? "?"} done, next: ${opts.to ?? "?"}`,
			payload: {
				tool_called_by_subagent: "haiku_unit_advance_hat",
				input: {
					intent: "{slug}",
					stage: stageLower,
					unit: opts.unit ?? "?",
					hat: opts.from ?? "?",
				},
				output_for_next_tick: "the cursor walks `nextHatForUnit` on the next `haiku_run_next` tick and either returns `start_unit_hat` for the next hat or moves on to the spec-review track when every hat sequence has terminal-advanced.",
			},
			validations: [
				`Current hat (\`${opts.from ?? "?"}\`) iterations[-1].result === null at advance time (in-flight, can advance)`,
				"The advancing subagent owns the unit's worktree (the agent's tool whitelist enforces scope)",
			],
			writes: [
				{
					path: `.haiku/intents/{slug}/stages/${stageLower}/units/${opts.unit ?? "?"}.md`,
					change: `frontmatter: append \`{ hat: "${opts.from ?? "?"}", started_at, completed_at, result: "advance" }\` to \`iterations[]\`. The cursor's \`nextHatForUnit\` reads this on the next tick to derive the next hat.`,
				},
			],
			instructions: `**Not a \`haiku_run_next\` tick.** The subagent calls \`haiku_unit_advance_hat\` when it finishes the current hat. The orchestrator records the iteration; the cursor on the next \`haiku_run_next\` tick reads \`iterations[]\` and either returns \`start_unit_hat\` for hat \`${opts.to ?? "?"}\` (if any hats remain) or moves on. On failure the subagent calls \`haiku_unit_reject_hat\` instead — the next \`nextHatForUnit\` walk rewinds one hat (or re-dispatches the first hat if reject was on hat[0]).`,
		},
		"wave-to-wave": {
			injection: [
				{
					hook: "MCP tool result",
					target: "agent's `tool_use_result`",
					what: `\`start_unit_hat { stage, hat, units: [...], terminal }\` — newly-eligible unit batch (${(opts.units ?? []).join(", ")}). The parent dispatches ONE subagent per unit, in parallel.`,
				},
				{
					hook: "start_unit_hat prompt builder",
					target: "next agent prompt",
					what: "each unit gets a self-contained `<subagent>` block with the hat instructions, unit spec, model tier (resolved via per-unit > hat > stage > studio cascade), and tool whitelist embedded inside the block.",
				},
			],
			action: "start_unit_hat",
			summary: `wave ${opts.from ?? "?"} complete → start wave ${opts.to ?? "?"} (${(opts.units ?? []).join(", ")})`,
			payload: {
				action: "start_unit_hat",
				intent: "{slug}",
				stage: stageLower,
				hat: "<first-hat-of-wave>",
				units: opts.units,
				terminal: false,
			},
			validations: [
				"Cursor's wave-ready predicate: `started_at == null` AND every entry in `depends_on` has terminal-advanced (`iterations[-1].result === 'advance'` on the last configured hat)",
				"No in-flight units in the previous wave (cursor returns null = mid-wave noop while any unit's iterations[-1].result is null)",
			],
			writes: [
				{
					path: `.haiku/intents/{slug}/stages/${stageLower}/units/<unit>.md`,
					change: 'frontmatter: `started_at` stamped on each newly-dispatched unit by `haiku_unit_start` (called by the subagent on entry).',
				},
				{
					path: `.haiku/worktrees/<unit>/`,
					change: "git worktree created for each newly-eligible unit by the engine.",
				},
			],
			instructions:
				"There is no 'wave' tool — `haiku_run_next` returns `start_unit_hat` for whichever units satisfy the wave-ready predicate at this tick. The cursor groups by hat-index; the parent dispatches the whole batch in one response. Wave numbers, hat sequences, and slot management are all engine-internal — derived from FM, not tracked by the agent.",
		},
		"execute-to-review": {
			injection: [
				{
					hook: "MCP tool result",
					target: "agent's `tool_use_result`",
					what: "`dispatch_quality_gates { stage, units }` — every unit's hat sequence has terminal-advanced AND `reviews.<role>` is signed for every spec-review role. The cursor advances to the approval track; the engine-built `quality_gates` role is first.",
				},
				{
					hook: "dispatch_quality_gates prompt builder",
					target: "agent prompt",
					what: "instructs the agent to run `runQualityGates()` (configured tests / lint / typecheck per studio settings); on success the engine signs `approvals.quality_gates` on every listed unit, on failure the agent fixes in place and re-runs.",
				},
			],
			action: "dispatch_quality_gates",
			summary:
				"all unit hat sequences done + every spec review signed → dispatch_quality_gates",
			payload: {
				action: "dispatch_quality_gates",
				intent: "{slug}",
				stage: stageLower,
				units: ["<units-where-approvals.quality_gates-is-missing>"],
			},
			validations: [
				"Every unit's hat sequence terminal-advanced",
				"Every reviewRole has signed `reviews.<role>` on every unit",
				"`approvals.quality_gates` is missing on at least one unit",
				"approvalRoles order: `spec` → `quality_gates` (engine-built) → studio agents → `user`",
			],
			writes: [
				{
					path: ".haiku/intents/{slug}/stages/{stage}/units/<unit>.md",
					change:
						"on `runQualityGates()` success the engine signs `approvals.quality_gates: { at, body_sha256, witnesses: [...output paths...] }` on each unit. The witnesses become the drift surface Track C will sweep on every subsequent tick.",
				},
			],
			instructions:
				"The cursor walks the approval track per role. `spec` (engine-built) and `quality_gates` (engine-run) come before any studio agent. On quality-gate failure the agent fixes the code in place and re-runs — failures don't roll the workflow back, they stay on the approval track until the gates pass. After `quality_gates` is signed, the cursor returns `dispatch_approval { role: <next> }` for each studio approval agent in turn, then `user_gate { gate_kind: \"approval\" }` (skipped under autopilot).",
		},
		"review-spec-to-agents": {
			injection: [
				{
					hook: "MCP tool result",
					target: "agent's `tool_use_result`",
					what: "`dispatch_review { role: \"spec\" }` — every stage's spec-review track always starts with the engine-built `spec` role (cross-unit acceptance criteria coverage, scope creep, cross-unit drift). One subagent, runs first.",
				},
			],
			action: "dispatch_review",
			summary:
				"spec-conformance is the first role in every stage's review track (engine-built, no per-studio mandate)",
			payload: {
				action: "dispatch_review",
				intent: "{slug}",
				stage: stageLower,
				role: "spec",
				units: ["<units-where-reviews.spec-is-missing>"],
			},
			validations: [
				"`reviews.spec` is missing on at least one unit",
				"reviewRoles list (from cursor) puts `spec` first; even autopilot mode keeps `spec` (autopilot trims OUT the studio agents and user, not spec)",
			],
			writes: [
				{
					path: ".haiku/intents/{slug}/stages/{stage}/units/<unit>.md",
					change:
						"after the spec-conformance subagent terminates clean, the engine signs `reviews.spec: { at, body_sha256, ... }` on each listed unit. Findings flow through `haiku_feedback` (origin: `adversarial-review`).",
				},
			],
			instructions:
				"A perfect implementation of the wrong thing is still wrong — the engine's spec-conformance subagent runs first on every stage. There's no per-studio mandate file, no opt-out. Findings flow through Track B (next tick → `start_feedback_hat`); a clean run signs `reviews.spec` on every listed unit and the cursor advances to the next review role.",
		},
		"gate-spec-reset-to-review": {
			injection: [
				{
					hook: "MCP tool result",
					target: "agent's `tool_use_result`",
					what: "v4 has no spec-vs-quality phase split — the cursor walks reviewRoles serially. After `reviews.spec` is signed the next tick returns `dispatch_review` for the next missing studio review-agent role.",
				},
			],
			action: "dispatch_review",
			summary:
				"v4: no separate spec→quality reset. The cursor advances to the next reviewRole (`spec` → studio agents → `user`).",
			payload: {
				action: "dispatch_review",
				intent: "{slug}",
				stage: stageLower,
				role: "<next-studio-review-agent>",
				units: ["<units-where-reviews.<role>-is-missing>"],
			},
			validations: [
				"`reviews.spec === { at, ... }` on every unit",
				"At least one unit is missing `reviews.<next-role>`",
				"reviewRoles list is the cursor's source of role order",
			],
			writes: [
				{
					path: ".haiku/intents/{slug}/stages/{stage}/units/<unit>.md",
					change:
						"after each review-agent terminates clean, `reviews.<role>` is signed by the engine. Findings file via `haiku_feedback` and route through Track B on the next tick.",
				},
			],
			instructions:
				"v3's spec-vs-quality two-phase model is gone. v4's cursor walks one reviewRole per tick — `spec` (engine-built) first, then each studio review-agent in declared order, then `user`. Mode-shaped: autopilot trims to `[spec]` only. After every non-user role signs, the cursor returns `user_gate { gate_kind: \"spec\" }` (skipped under autopilot).",
		},
		"review-quality-to-agents": {
			injection: [
				{
					hook: "MCP tool result",
					target: "agent's `tool_use_result`",
					what: "`dispatch_approval { role }` — quality_gates is signed; the cursor walks approvalRoles for each remaining studio approval agent. One role per tick.",
				},
				{
					hook: "readReviewAgentPaths()",
					target: "subagent prompt",
					what: "each studio approval agent's mandate (from `plugin/studios/<studio>/stages/<stage>/review-agents/<role>.md`) is inlined into the dispatch block.",
				},
			],
			action: "dispatch_approval",
			summary:
				"quality_gates signed → cursor walks the approval track per studio role (one tick per role)",
			payload: {
				action: "dispatch_approval",
				intent: "{slug}",
				stage: stageLower,
				role: "<next-studio-approval-agent>",
				units: ["<units-where-approvals.<role>-is-missing>"],
			},
			validations: [
				"`approvals.spec` and `approvals.quality_gates` are signed on every unit",
				"Some unit has `approvals.<role>` missing for the next role in approvalRoles",
				`Mode shaping: ${isAutopilot ? "autopilot trims approvalRoles to `[spec, quality_gates]` — no studio agents, no user role" : "full role list applies"}`,
			],
			writes: [
				{
					path: ".haiku/intents/{slug}/stages/{stage}/units/<unit>.md",
					change:
						"after the approval agent terminates clean, the engine signs `approvals.<role>: { at, body_sha256, witnesses: [<output paths>] }`. Witnesses are the drift surface Track C sweeps every subsequent tick.",
				},
			],
			instructions:
				"Approval agents focus on built artifacts (architecture, performance, security, test coverage). Each role gets its own tick. After every studio approval signs, the cursor returns `user_gate { gate_kind: \"approval\" }` (skipped under autopilot, where `merge_stage` auto-fires once `quality_gates` is signed).",
		},
		"review-to-gate": {
			injection: [
				{
					hook: "MCP tool result",
					target: "agent's `tool_use_result`",
					what: isAutopilot
						? "autopilot: approvalRoles trimmed to `[spec, quality_gates]`. Once both are signed the cursor returns `merge_stage` directly — no user gate, no studio agents."
						: "every studio approval agent has signed → `user_gate { gate_kind: \"approval\" }`. `haiku_run_next` opens the review SPA inline and blocks on `haiku_await_gate`.",
				},
			],
			action: isAutopilot ? "merge_stage" : "user_gate",
			summary: isAutopilot
				? "autopilot: every required approval signed → merge_stage"
				: "every studio approval signed → user_gate { gate_kind: \"approval\" }",
			payload: isAutopilot
				? {
						action: "merge_stage",
						intent: "{slug}",
						stage: stageLower,
					}
				: {
						action: "user_gate",
						intent: "{slug}",
						stage: stageLower,
						gate_kind: "approval",
						units: ["<units-where-approvals.user-is-missing>"],
					},
			validations: [
				"`approvals.<role>` signed on every unit for every approvalRole except the next one",
				isAutopilot
					? "autopilot: `quality_gates` signed → no further approval work; cursor returns `merge_stage`"
					: "non-autopilot: every studio approval agent has signed; cursor returns `user_gate { gate_kind: \"approval\" }`",
			],
			writes: [
				{
					path: ".haiku/intents/{slug}/stages/{stage}/units/<unit>.md",
					change: isAutopilot
						? "no write at this transition — `merge_stage` is the next mainline action"
						: "on approve: engine signs `approvals.user` on every listed unit; on request_changes: engine writes annotations as feedback files and Track B walks them on the next tick.",
				},
			],
			instructions: isAutopilot
				? "Autopilot: cursor returns `merge_stage` directly. The engine merges the stage branch into intent main under `withIntentMainLock`."
				: "Cursor returns `user_gate { gate_kind: \"approval\" }`. `haiku_run_next` opens the SPA review session inline and blocks on `haiku_await_gate`. On approve, the cursor advances to `merge_stage`. On request_changes, engine writes feedback and Track B walks the fix loop. **In `discrete` mode, the user gate dispatches differently — the engine opens a real PR/MR for the stage branch and the merge into intent main IS the approval signal.**",
		},
		"gate-to-next-stage": {
			injection: [
				{
					hook: "MCP tool result",
					target: "agent's `tool_use_result`",
					what: opts.isLast
						? "every stage merged → cursor walks intent-scope approvals (`spec`, `continuity`, `user`) and emits `intent_review { role }` per missing role, then `merge_intent`, then `sealed`."
						: "stage merged into intent main; cursor's next tick walks the next stage (the new `firstUnmergedStage`).",
				},
				{
					hook: "withIntentMainLock",
					target: "merge serialization",
					what: "every stage→main merge runs under the lock so concurrent stages can't race the merge into intent main.",
				},
			],
			action: opts.isLast ? "merge_intent" : "merge_stage",
			summary: opts.isLast
				? "final stage merged → walk intent-scope approvals → merge_intent → sealed"
				: `merge stage \`${stageLower}\` into intent main → next stage (${opts.nextStageName ?? "?"})`,
			payload: opts.isLast
				? {
						action: "merge_intent",
						intent: "{slug}",
					}
				: {
						action: "merge_stage",
						intent: "{slug}",
						stage: stageLower,
					},
			validations: [
				"Every approval signed for every unit on the stage (mode-shaped)",
				opts.isLast
					? "every stage's branch is merged into intent main (`firstUnmergedStage` returns null)"
					: "stage's branch is ahead of intent main and ready to merge",
			],
			writes: opts.isLast
				? [
						{
							path: ".haiku/intents/{slug}/intent.md",
							change:
								"after intent-scope approvals all sign and `merge_intent` runs, the engine stamps `sealed_at`. The next tick returns `sealed` (terminal).",
						},
					]
				: [
						{
							path: "git refs",
							change:
								"`haiku/{slug}/{stage}` merged into `haiku/{slug}/main` under `withIntentMainLock`. Stages are NEVER sealed — only intents are; corrective work on a previously-merged stage rewinds the cursor automatically (`firstUnmergedStage` returns it on the next tick).",
						},
					],
			instructions: opts.isLast
				? "Final stage's branch is merged. The cursor now walks intent-scope approvals from `intent.md.approvals`: `spec` and `continuity` (engine-built) and `user` (gated through SPA). Mode-shaped: autopilot trims to `[spec, continuity]` only. Each missing role → `intent_review { role }` (one tick per role). Once every intent-scope approval signs → `merge_intent` (engine performs final rebase + stamps `sealed_at`) → `sealed`."
				: `Cursor returns \`merge_stage { stage: "${stageLower}" }\`. The next \`haiku_run_next\` tick performs the merge under \`withIntentMainLock\` and returns the next instruction — most commonly the next stage's first action (e.g. \`elaborate\` or \`design_direction_required\`).`,
		},
		"feedback-dispatch": {
			injection: [
				{
					hook: "MCP tool result",
					target: "agent's `tool_use_result`",
					what: "`start_feedback_hat { stage, hat, feedback_ids, terminal }` — Track B walks open FBs in stage order (0..active) plus intent-scope, returns the next fix-hat dispatch. `close_feedback` lands when the terminal hat advances.",
				},
				{
					hook: "start_feedback_hat prompt builder",
					target: "subagent prompt",
					what: "the fix-hat's mandate (`hats/<hat>.md`), the FB body, and a tool whitelist (`haiku_feedback_read`, `haiku_feedback_write`, `haiku_unit_read` for context, `haiku_feedback_advance_hat` / `_reject_hat`, optionally `haiku_feedback_set_targets` for the classifier hat).",
				},
			],
			action: "start_feedback_hat",
			summary:
				"Track B: open FB → cursor returns `start_feedback_hat` for the next fix-hat in the stage's `fix_hats:` chain (or `close_feedback` on terminal advance)",
			payload: {
				action: "start_feedback_hat",
				intent: "{slug}",
				stage: stageLower,
				hat: "<next-fix-hat>",
				feedback_ids: ["FB-001"],
				terminal: false,
			},
			validations: [
				"Stage declares `fix_hats:` (typically `[<implementer>, feedback-assessor]` minimum)",
				"FB has `closed_at == null` (open)",
				"Cursor walks Track B BEFORE Track A on every tick — open FB blocks forward motion",
				"Cross-stage routing: FBs in `stages/<earlier>/feedback/` rewind the cursor to that stage's fix loop on the next tick (purely by file location, no `upstream_stage:` field in v4)",
			],
			writes: [
				{
					path: ".haiku/intents/{slug}/stages/{stage}/feedback/<NN>-*.md",
					change:
						"fixer hats edit the FB BODY via `haiku_feedback_write`; the flagged unit is read-only context (`haiku_unit_read`). Hat progression via `haiku_feedback_advance_hat` / `_reject_hat`. The terminal hat's advance triggers `close_feedback` on the next tick — engine stamps `closed_at` and applies `targets.invalidates` (clearing approvals on the targeted unit, which routes the cursor back through those approval roles).",
				},
			],
			instructions:
				"FB-as-unit fix loop. The first hat in `fix_hats:` is conventionally a classifier — it reads the FB body, decides which unit (if any) the finding targets and which approval roles to invalidate on closure, and calls `haiku_feedback_set_targets`. Subsequent hats execute the fix; the terminal hat (typically `feedback-assessor`) validates and calls `haiku_feedback_advance_hat`. Engine auto-stamps `closed_at` and applies invalidations on the next tick. Closed FBs become input to the next iteration of the upstream stage's elaborate phase — completed units are never modified (forward-only).",
		},
		"drift-detected": {
			injection: [
				{
					hook: "MCP tool result",
					target: "agent's `tool_use_result`",
					what: "`drift_detected { events }` — Track C ran a content-hash sweep over every signed witness on the active stage and at least one mismatched. Dedup'd against open drift FBs by `source_ref` so a fired FB suppresses re-emission until it closes.",
				},
				{
					hook: "runDriftSweep()",
					target: "Track C of the cursor",
					what: "for each signed `reviews.<role>` / `approvals.<role>` on every unit on the active stage, re-hashes the unit body / declared outputs and compares against `body_sha256` + `witnesses[]`. v4 dropped `baseline.json` / `baseline-content/` / `drift-markers.json`; the witness lives directly on FM. Pre-v4 sidecars are deleted by the v0→v4 migrator.",
				},
				{
					hook: "stamp-agent-write (PostToolUse)",
					target: "intent action log",
					what: "agent edits get an `entry_type: \"agent_write\"` stamp so the next sweep attributes the change to the agent and does NOT emit drift. The `drift_detected` action only fires for genuinely out-of-band edits.",
				},
			],
			action: "drift_detected",
			summary:
				"Track C content-hash sweep found out-of-band edits to a witnessed artifact",
			payload: {
				action: "drift_detected",
				intent: "{slug}",
				events: [
					{
						unit: "<unit>",
						role: "<reviews|approvals.<role>>",
						kind: "body | output",
						file: "<path>",
						since: "<witness ISO timestamp>",
						commits: ["<sha1>", "<sha2>"],
					},
				],
			},
			validations: [
				"Drift sweep kill-switch (`drift_detection: false`) is OFF",
				"Active stage exists (sweep is gated on `firstUnmergedStage`)",
				"At least one signed witness's content hash no longer matches",
				"No open drift FB with the same `source_ref` (dedup)",
			],
			writes: [
				{
					path: ".haiku/intents/{slug}/stages/{stage}/feedback/<NN>-drift-*.md",
					change:
						"the agent files one FB per drift event via `haiku_feedback` with `origin: \"drift\"`, `source_ref: \"drift:<kind>:<file>\"`, `target_unit: <named unit>`, `target_invalidates: []`. The classifier hat decides whether the drift is material; closure with empty invalidates means \"cosmetic, no action,\" a non-empty list re-routes the cursor through the named approval roles.",
				},
			],
			instructions:
				"Track C is the engine's reconciliation against forward-only. Completed work is not edited in place — out-of-band edits surface as drift FBs, the fix loop assesses materiality, and corrective work (when needed) becomes new pending units in a future iteration of the upstream stage's elaborate phase. The drift FB itself follows the FB-as-unit pattern: fixers edit the FB body to record diagnosis and root cause; the terminal hat decides invalidations.",
		},
	}
	return map[key] ?? null
}

// haiku_run_next payload registry — what the orchestrator returns at each
// transition point in a stage's lifecycle. Distilled from
// packages/haiku/src/orchestrator/workflow/.

import type { DerivedStage, ExecutionMode, PayloadModalData } from "./types.js"

export type TransitionKey =
	| "preelab-to-stage1"
	| "elab-to-prereview"
	| "prereview-to-gate"
	| "elab-to-gate"
	| "hat-to-hat"
	| "wave-to-wave"
	| "execute-to-review"
	| "review-quality-to-agents"
	| "review-to-gate"
	| "gate-to-next-stage"
	| "feedback-dispatch"

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
	const baseGate =
		mStage === "auto"
			? "auto"
			: mStage === "discrete"
				? "external"
				: stage.gate.type

	const map: Partial<Record<TransitionKey, PayloadResult>> = {
		"preelab-to-stage1": {
			injection: [
				{
					hook: "MCP tool result",
					target: "agent's `tool_use_result` content",
					what: "the payload below — agent now knows which stage to start and which phase",
				},
				{
					hook: "inject-context",
					target: "next agent prompt prepend",
					what: "intent.md frontmatter (slug, title, studio, mode), `active_stage`, `phase=elaborate`",
				},
				{
					hook: "inject-state-file",
					target: "`.haiku/_inject.md` (transient)",
					what: "structured snapshot of state.json the agent can read with the Read tool",
				},
				{
					hook: "readStudio()",
					target: "agent prompt prepend",
					what: "**Studio context injection** — `readStudio(studio).body` is injected as studio-level context when a new stage starts, providing the studio's high-level goals, principles, and behavioral framing from `STUDIO.md`.",
				},
				{
					hook: "readStageDef()",
					target: "agent prompt",
					what: "**Stage definition** — STAGE.md body is injected as the stage's behavioral definition and criteria guidance.",
				},
			],
			action: "start_stage",
			summary: `kick off the first stage (${stage.name}) — sets phase=elaborate`,
			payload: {
				action: "start_stage",
				intent: "{slug}",
				stage: stageLower,
				next_phase: "elaborate",
			},
			validations: [
				"`intent.md` exists with valid frontmatter",
				"`intent_reviewed=true` (user approved the `intent_review` gate)",
				"studio resolved",
			],
			writes: [
				{
					path: ".haiku/intents/{slug}/intent.md",
					change:
						'frontmatter: `active_stage: "inception"`, `status: "in_progress"`',
				},
				{
					path: `.haiku/intents/{slug}/stages/${stageLower}/state.json`,
					change:
						'`{ phase: "elaborate", elaboration_turns: 0 }` (creates the file)',
				},
			],
			instructions: `Orchestrator advances the workflow engine into \`${stage.name}.elaborate\`. The agent should now don the first hat and begin elaboration with the user.`,
		},
		"elab-to-prereview": {
			injection: [
				{
					hook: "MCP tool result",
					target: "agent's `tool_use_result`",
					what: "`action: pre_review` — workflow engine dispatches conditional review agents against unit SPECS (not artifacts — they don't exist yet)",
				},
				{
					hook: "filterReviewAgentsByScope()",
					target: "agent dispatch list",
					what: "**Conditional review agents** — agents whose `applies_to:` globs don't match any stage artifact are skipped.",
				},
				{
					hook: "readReviewAgentPaths()",
					target: "subagent prompt",
					what: "each review agent's mandate is inlined into a self-contained `<subagent>` block targeting the unit .md files",
				},
			],
			action: "pre_review",
			summary: "dispatch pre-execute adversarial review of unit specs",
			payload: {
				action: "pre_review",
				intent: "{slug}",
				stage: stageLower,
				units_dir: `.haiku/intents/{slug}/stages/${stageLower}/units/`,
			},
			validations: [
				"Every unit declared in `elaborate` has a valid `.md` file",
				"`stageState.pre_review_dispatched` is `false` (first-pass only)",
				"At least one review agent applies to this stage's output kinds (otherwise skip pre-review entirely)",
			],
			writes: [
				{
					path: `.haiku/intents/{slug}/stages/${stageLower}/state.json`,
					change:
						"`pre_review_dispatched: true`, `pre_review_dispatched_at: <timestamp>`",
				},
			],
			instructions:
				"Agent spawns conditional review agents in parallel against every unit .md file. Reviewers audit the PLAN — not artifacts. Findings are logged via `haiku_feedback`. After all subagents complete, agent calls `haiku_run_next`. Zero findings → advance to specs gate. Pending findings → workflow engine emits `pre_review_revisit` with spec-edit instructions (modify existing units, don't draft new ones).",
		},
		"prereview-to-gate": {
			injection: [
				{
					hook: "readFeedbackFiles()",
					target: "orchestrator decision",
					what: "if any pending feedback exists, workflow engine returns `pre_review_revisit` with a spec-edit mandate; otherwise falls through to the specs gate",
				},
			],
			action: "advance_phase",
			summary: `pre-review clear — open ${isFirst ? "intent_review" : "elaborate_to_execute"} specs gate`,
			payload: {
				action: "advance_phase",
				gate_context: isFirst ? "intent_review" : "elaborate_to_execute",
				next_phase: "execute",
				pending_pre_review_feedback: 0,
			},
			validations: [
				"`stageState.pre_review_dispatched` is `true` (review already ran)",
				"Zero pending feedback on the stage (all spec findings resolved — closed or rejected)",
			],
			writes: [
				{
					path: `.haiku/intents/{slug}/stages/${stageLower}/state.json`,
					change: "no write — falls through to auto/ask gate decision",
				},
			],
			instructions:
				"Pre-review audit has completed and all spec-level findings are resolved. The workflow engine advances to the normal specs gate (auto-advance or opens the review UI, depending on the stage's `review:` type).",
		},
		"elab-to-gate": {
			injection: [
				{
					hook: "MCP tool result",
					target: "agent's `tool_use_result`",
					what: "**blocking** until user clicks; on resolve the click outcome (`approved`/`changes_requested`)",
				},
				{
					hook: "_openReviewAndWait",
					target: "Review web UI",
					what: "the elaborated unit specs + DAG + `inputs:` declarations are rendered for human inspection",
				},
				{
					hook: "inject-context",
					target: "next agent prompt prepend (after click)",
					what: "if approved: `phase=execute`, first wave's units. if rejected: revision instructions + previous attempt's content",
				},
			],
			action: "gate_review",
			summary: `elaboration complete — open ${isFirst ? "intent_review" : "elaborate_to_execute"} gate`,
			payload: {
				action: "gate_review",
				gate_context: isFirst ? "intent_review" : "elaborate_to_execute",
				next_phase: "execute",
				units_count: stage.units.length,
				wave_count: stage.waves.length,
			},
			validations: [
				"DAG is acyclic (`computeUnitWaves` topological sort succeeds)",
				"Every unit's `depends_on` references existing units",
				"Unit naming follows convention (`unit-NN-slug.md`)",
				"All declared `inputs:` from prior stages exist on disk",
				mStage === "auto" ? null : "`elaboration_turns >= 3` (collaborative)",
			].filter((v): v is string => Boolean(v)),
			writes: [
				{
					path: `.haiku/intents/{slug}/stages/${stageLower}/state.json`,
					change: `\`gate_context: "${isFirst ? "intent_review" : "elaborate_to_execute"}"\`, \`gate_outcome: "pending"\``,
				},
				{
					path: `.haiku/intents/{slug}/stages/${stageLower}/units/unit-NN-*.md`,
					change:
						"frontmatter validated; nothing mutated unless validation auto-fixes naming",
				},
			],
			instructions: `Calls \`_openReviewAndWait()\`, which **blocks** the MCP tool call until the user clicks \`Approve\` or \`Request Changes\` in the web UI. On approve → \`phase\` advances to \`execute\`. On reject → ${isFirst ? "`phase` resets to `pending`" : "`phase` stays at `elaborate`"} and any user comments left in the UI become \`feedback/FB-NN.md\` files on the stage. **The review UI does NOT re-open while those FBs are pending** — the workflow engine routes through \`feedback_dispatch\` (for human comments) or \`review_fix\` (for inline-fix items) until each finding is closed or escalated.`,
		},
		"hat-to-hat": {
			injection: [
				{
					hook: "MCP tool result",
					target: "subagent's `tool_use_result`",
					what: `next hat name (\`${opts.to ?? "?"}\`), \`hats/${opts.to ?? "?"}.md\` content, bolt counter`,
				},
				{
					hook: "subagent-context",
					target: "the subagent itself",
					what: "stays scoped to the parent unit's worktree throughout the hat rotation — same subagent transitions between hats, doesn't respawn.",
				},
				{
					hook: "track-outputs",
					target: "unit frontmatter",
					what: `records files \`${opts.from ?? "?"}\` wrote into the unit's \`outputs:\` so the next hat sees them`,
				},
			],
			action: "haiku_unit_advance_hat",
			summary: `subagent calls advance_hat → ${opts.from ?? "?"} done, next: ${opts.to ?? "?"}`,
			payload: {
				tool_called_by_subagent: "haiku_unit_advance_hat",
				input: { intent: "{slug}", unit: opts.unit ?? "?" },
				output: {
					action: "next_hat",
					next_hat: opts.to,
					hat_definition: `hats/${opts.to ?? "?"}.md content`,
				},
			},
			validations: [
				`Current hat (\`${opts.from ?? "?"}\`) declared its outputs (recorded by \`track-outputs\` hook)`,
				"No `Edit`/`Write` outside the active unit's worktree (enforced by `workflow-guard`)",
				"Bolt counter incremented by `enforce-iteration` hook",
			],
			writes: [
				{
					path: `.haiku/intents/{slug}/stages/${stageLower}/units/${opts.unit ?? "?"}.md`,
					change: `frontmatter: \`hat: "${opts.to ?? "?"}"\`, \`bolt: bolt+1\` (status stays \`in_progress\`)`,
				},
			],
			instructions: `**Not a \`haiku_run_next\` tick.** The subagent calls \`haiku_unit_advance_hat\` when it finishes the current hat. The orchestrator internally progresses the workflow engine and returns the next hat — the subagent doffs \`${opts.from ?? "?"}\` and dons \`${opts.to ?? "?"}\` without involving the parent agent. On failure the subagent calls \`haiku_unit_reject_hat\` instead — that's the red back-arc.`,
		},
		"wave-to-wave": {
			injection: [
				{
					hook: "MCP tool result",
					target: "agent's `tool_use_result`",
					what: `newly-eligible unit list (${(opts.units ?? []).join(", ")}), each with worktree path + first hat`,
				},
				{
					hook: "inject-context",
					target: "next agent prompt prepend (per spawned unit context)",
					what: 'each unit gets a self-contained `<subagent tool="Agent">` block with frontmatter, depends_on outputs, first hat\'s instructions — all embedded inside the block',
				},
			],
			action:
				opts.units && opts.units.length > 1 ? "start_units" : "start_unit",
			summary: `wave ${opts.from ?? "?"} complete → start wave ${opts.to ?? "?"} (${(opts.units ?? []).join(", ")})`,
			payload: {
				action:
					opts.units && opts.units.length > 1 ? "start_units" : "start_unit",
				units: opts.units,
				completed_wave: opts.from,
				next_wave: opts.to,
			},
			validations: [
				`All units in wave ${opts.from ?? "?"} have \`status=complete\``,
				"Outputs declared by completed units exist on disk",
				"Each unit's `depends_on` are all complete (DAG eligibility check)",
			],
			writes: [
				{
					path: `.haiku/intents/{slug}/stages/${stageLower}/units/{prev-wave-unit}.md`,
					change:
						'frontmatter: `status: "complete"`, final `outputs:` recorded',
				},
				{
					path: `.haiku/worktrees/{new-wave-unit}/`,
					change: "git worktree created for each newly-eligible unit",
				},
			],
			instructions:
				"There's no 'wave' tool — `haiku_run_next` simply returns `start_unit(s)` for whichever units have just become eligible. `computeUnitWaves` is a pure scheduling function; the workflow engine has no explicit wave concept beyond which units are currently eligible.",
		},
		"execute-to-review": {
			injection: [
				{
					hook: "MCP tool result",
					target: "agent's `tool_use_result`",
					what: "phase=review confirmation, then quality-gate process is spawned in this same call",
				},
				{
					hook: "quality-gate",
					target: "child process exit codes captured",
					what: "stdout/stderr from tests/lint/typecheck — parsed into structured findings if they fail",
				},
			],
			action: "advance_phase + run_quality_gates",
			summary:
				"all units complete — enter review and run quality gates atomically",
			payload: {
				action: "advance_phase",
				from: "execute",
				to: "review",
				units_complete: stage.units.length,
				followed_by:
					"this same call runs `runQualityGates()` immediately after the phase flip",
			},
			validations: [
				"All units have `status=complete` across every wave",
				"Every declared `output` artifact exists on disk",
				"`track-outputs` hook recorded all writes",
			],
			writes: [
				{
					path: `.haiku/intents/{slug}/stages/${stageLower}/state.json`,
					change:
						'`phase: "review"`, then `quality_gates_run_at: <ts>` after gates run',
				},
			],
			instructions:
				'`haiku_run_next` flips `phase` to `review` and **runs the quality gates as part of the same call** — tests, lint, typecheck. On failure, the next call returns `fix_quality_gates` with the failure list and stays in `review`. On success, the next call returns `action: "review"` to dispatch the parallel review agents.',
		},
		"review-to-gate": {
			injection: [
				{
					hook: "MCP tool result",
					target: "agent's `tool_use_result`",
					what: "phase=gate confirmation; gate type from STAGE.md frontmatter",
				},
			],
			action: "advance_phase",
			summary: "soft review complete — enter gate phase",
			payload: {
				action: "advance_phase",
				from: "review",
				to: "gate",
				review_outcome: "all_clear",
			},
			validations: [
				"Every review-agent returned approval (no findings)",
				"If any agent returned findings → `fix_quality_gates` loops back",
			],
			writes: [
				{
					path: `.haiku/intents/{slug}/stages/${stageLower}/state.json`,
					change: '`phase: "gate"`, `review_findings: []`',
				},
			],
			instructions: `Open the \`${baseGate}\` gate. ${
				baseGate === "auto"
					? "Auto-advance with no human interaction."
					: baseGate === "external"
						? "Submit PR on per-stage branch and wait for merge."
						: "Open review UI via `_openReviewAndWait()` and wait for human decision."
			}`,
		},
		"gate-to-next-stage": {
			injection: [
				{
					hook: "MCP tool result",
					target: "agent's `tool_use_result`",
					what: opts.isLast
						? "`intent_complete` — terminal"
						: mStage === "discrete"
							? "`stage_complete_discrete` — agent stops; user must run /haiku:pickup"
							: "next stage name and `phase: pending`",
				},
			],
			action: opts.isLast
				? "intent_complete"
				: mStage === "discrete"
					? "stage_complete_discrete"
					: "advance_stage",
			summary: opts.isLast
				? "final stage approved — intent_complete"
				: mStage === "discrete"
					? "stage complete — intent paused, awaiting /haiku:pickup"
					: `advance to next stage (${opts.nextStageName ?? "?"})`,
			payload: {
				action: opts.isLast
					? "intent_complete"
					: mStage === "discrete"
						? "stage_complete_discrete"
						: "advance_stage",
				from_stage: stageLower,
				to_stage: opts.isLast
					? null
					: (opts.nextStageName ?? "").toLowerCase() || null,
				mode: mStage,
			},
			validations: [
				"`gate_outcome === 'approved'` (or `auto`)",
				opts.isLast
					? "`isLastStage=true`"
					: "Next stage's `inputs:` satisfied by accumulated pool",
			],
			writes: opts.isLast
				? [
						{
							path: `.haiku/intents/{slug}/stages/${stageLower}/state.json`,
							change: '`status: "complete"`, `gate_outcome: "approved"`',
						},
						{
							path: ".haiku/intents/{slug}/intent.md",
							change:
								'frontmatter: `status: "completed"`, `active_stage: null`',
						},
					]
				: [
						{
							path: `.haiku/intents/{slug}/stages/${stageLower}/state.json`,
							change: '`status: "complete"`, `gate_outcome: "approved"`',
						},
					],
			instructions: opts.isLast
				? "`workflowIntentComplete()` fires; `intent.md` `status` flips to `completed`."
				: mStage === "discrete"
					? "Stage complete; intent paused. The user must run `/haiku:pickup` to resume."
					: "`workflowAdvanceStage()` moves the workflow engine into the next stage's `pending` phase.",
		},
		"feedback-dispatch": {
			injection: [
				{
					hook: "MCP tool result",
					target: "agent's `tool_use_result`",
					what: "`action: feedback_dispatch` — per-FB instructions to triage (set resolution) and reply to questions inline. The review UI is NOT re-opened while these FBs are pending.",
				},
				{
					hook: "buildFeedbackDispatchAction()",
					target: "agent prompt",
					what: "Each open human-authored FB with `resolution: null` is listed under `### Triage` (set resolution via `haiku_feedback_update`); items with `resolution: question` get reply instructions (POST `/api/feedback/.../<id>/replies` with `close_as_answered: true`).",
				},
			],
			action: "feedback_dispatch",
			summary:
				"open human feedback — agent triages, replies, and resolves before any review UI re-opens",
			payload: {
				action: "feedback_dispatch",
				stage: stageLower,
				counts: { needs_triage: 0, questions: 0, inline_fixes: 0 },
				message:
					"Resolve pending feedback on this stage WITHOUT rolling the stage back. After dispatching all items, call `haiku_run_next` — the router re-classifies and dispatches.",
			},
			validations: [
				"Pre-tick triage gate already stamped `triaged_at:` on every open FB",
				"At least one FB has `author_type === 'human'` AND (`resolution: null` OR `resolution: question`)",
			],
			writes: [
				{
					path: `.haiku/intents/{slug}/stages/${stageLower}/feedback/FB-NN.md`,
					change:
						'agent calls `haiku_feedback_update { resolution: "<choice>" }` (set route) or POSTs reply (`close_as_answered: true` flips status to `addressed`)',
				},
			],
			instructions:
				'**New (2026-04-27) — replaces the buggy gate_review re-pop.** When the user left feedback at the gate with `resolution: null` ("Let agent decide") or filed a question, the workflow engine hands the items back to the agent for inline handling instead of re-popping the review UI. The agent walks each item: needs_triage → set resolution; question → reply + close_as_answered; once cleared the gate re-evaluates per the (now-set) resolutions and dispatches inline_fixes through the worktree-based fix-chain. The screen never re-opens until every open FB is closed/addressed/rejected.',
		},
	}
	return map[key] ?? null
}

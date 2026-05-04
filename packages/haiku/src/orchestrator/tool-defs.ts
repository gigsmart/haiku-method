// orchestrator/tool-defs.ts — MCP tool surface for orchestration tools.
//
// Pure declaration of name + description + inputSchema for every haiku_*
// tool advertised to the MCP client. The handler implementations live in
// `tools/orchestrator/` and are dispatched via `orchestratorToolHandlers`.
//
// IMPORTANT: every entry in `orchestratorToolHandlers` MUST have a
// matching entry here (and vice versa) — `orchestrator-tool-defs-sync`
// test asserts this contract. Adding a new tool requires both:
//   1. defining + registering it in `tools/orchestrator/{name}.ts`
//      and `tools/orchestrator/index.ts`
//   2. adding its name + description + inputSchema entry below
//
// We intentionally do NOT derive this surface from the registry at
// module-load time: the registry imports each handler, several handlers
// import `orchestrator.ts`, and `orchestrator.ts` imports this file.
// Deriving here would close the import cycle and TDZ-trip the registry's
// const exports. The contract test is the safe alternative.

export const orchestratorToolDefs = [
	{
		name: "haiku_run_next",
		description:
			"Advance an intent through its lifecycle. The workflow engine reads state, determines the next action, " +
			"performs the state mutation (start stage, advance phase, complete stage, etc.), and returns " +
			"the action to the agent. The agent follows the returned action — it never mutates stage or " +
			"intent state directly. " +
			"When `intent` is omitted, the workflow engine auto-resolves it from the current git branch " +
			"(`haiku/<slug>/main` or `haiku/<slug>/<stage>`) — lets pickup/revisit skills be thin " +
			"one-line redirects without asking the user to pick an intent the checkout already names. " +
			"If omitted and no branch match exists, falls back to the single active intent; errors " +
			"when zero or multiple active intents are present.",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent: {
					type: "string",
					description:
						"Intent slug. Omit to auto-resolve from the current git branch or the sole active intent.",
				},
				external_review_url: {
					type: "string",
					description: "URL where stage was submitted for external review",
				},
			},
		},
	},
	// haiku_gate_approve removed — gates are handled by the workflow engine (review UI + elicitation fallback)
	{
		name: "haiku_intent_create",
		description:
			'Create a new H·AI·K·U intent. Studio selection happens separately via haiku_select_studio. You must provide BOTH a crisp `title` (3–8 words, ≤80 chars, single line, no trailing punctuation — e.g. "Add archivable intents") AND a richer `description` (2–5 sentences covering scope, motivation, and constraints). The title is NOT derived from the description — write it deliberately as a human-readable summary.',
		inputSchema: {
			type: "object" as const,
			properties: {
				title: {
					type: "string",
					description:
						'Short human-readable title (3–8 words, max 80 chars, single line, no trailing period). Must be a deliberate summary — NOT the first 80 chars of the description. Good: "Add archivable intents". Bad: "Add archivable intents to H·AI·K·U. Users need a way to soft-hide…".',
				},
				description: {
					type: "string",
					description:
						"Full description of what the intent is about (2–5 sentences covering scope, motivation, and constraints). Stored verbatim in the intent body.",
				},
				slug: {
					type: "string",
					description:
						"URL-friendly slug for the intent (auto-generated from title if not provided)",
				},
				context: {
					type: "string",
					description:
						"Conversation context summary — highlights from the conversation that led to this intent",
				},
				mode: {
					type: "string",
					description:
						"Execution mode: continuous (stages auto-advance, follow STAGE.md gates), discrete (every stage gate becomes external PR/MR), or autopilot (every per-stage gate auto-advances; only the final intent-completion gate opens a delivery PR). Defaults to continuous.",
					enum: ["continuous", "discrete", "autopilot"],
				},
				stages: {
					type: "array",
					items: { type: "string" },
					description:
						"Explicit stage list — overrides the studio's default stages. Use to run a subset of stages (e.g. just ['development'] for quick tasks).",
				},
			},
			required: ["title", "description"],
		},
	},
	{
		name: "haiku_select_studio",
		description:
			"Select or change the studio for an intent. Uses elicitation to present studio options. Cannot be used after the intent has entered any stage.",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent: { type: "string", description: "Intent slug" },
				options: {
					type: "array",
					items: { type: "string" },
					description:
						"Studio names to present. Empty or omitted = all studios. Single item = auto-select.",
				},
			},
			required: ["intent"],
		},
	},
	{
		name: "haiku_intent_reset",
		description:
			"Reset an intent — preserves the description, deletes all state, and recreates the intent from scratch. Asks for confirmation via elicitation before proceeding.",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent: { type: "string", description: "Intent slug to reset" },
			},
			required: ["intent"],
		},
	},
	{
		name: "haiku_intent_archive",
		description:
			"Archive an intent — sets the `archived: true` frontmatter flag so the intent is hidden from default list views. Reversible via haiku_intent_unarchive. Does not prompt for confirmation.",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent: { type: "string", description: "Intent slug to archive" },
			},
			required: ["intent"],
		},
	},
	{
		name: "haiku_intent_unarchive",
		description:
			"Unarchive an intent — clears the `archived` frontmatter flag so the intent reappears in default list views. Reversible via haiku_intent_archive. Does not prompt for confirmation.",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent: { type: "string", description: "Intent slug to unarchive" },
			},
			required: ["intent"],
		},
	},
	{
		name: "haiku_baseline_init",
		description:
			"Establish drift-detection baselines for an intent. Used by haiku_repair, the kill-switch re-arm flow, and the manual rollout path. 'establish-all' mode baselines every tracked file across all stages; 'establish-paths' mode baselines only the listed paths. Idempotent — files whose SHA already matches the stored baseline are skipped.",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent_slug: {
					type: "string",
					description: "Slug of the intent to baseline.",
				},
				mode: {
					type: "string",
					enum: ["establish-all", "establish-paths"],
					description:
						"'establish-all': scan all tracked files for every stage. 'establish-paths': baseline only the listed paths.",
				},
				paths: {
					type: "array",
					items: { type: "string" },
					description:
						"Required when mode === 'establish-paths'. Paths relative to the intent directory to baseline.",
				},
			},
			required: ["intent_slug", "mode"],
		},
	},
	{
		name: "haiku_coverage_acknowledge",
		description:
			"Record a per-file decision for an upstream output that the current stage's units do not reference. Used to resolve a `coverage_review_required` action emitted by the pre-tick cumulative-input-coverage validator. Decisions persist to `stages/<stage>/coverage-decisions.json`. The decision MUST be either `out-of-scope` (with rationale explaining why this file is not relevant to the current stage's deliverables) or `covered-by-unit` (with the `unit` slug whose `inputs:` field already includes — or will include — the path; redundant for paths added via `haiku_unit_set` but useful when the agent wants to record reasoning). This tool does NOT advance the workflow; call `haiku_run_next` after acknowledging to re-run the validator.",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent_slug: { type: "string" },
				stage: { type: "string" },
				path: { type: "string" },
				decision: {
					type: "string",
					enum: ["out-of-scope", "covered-by-unit"],
				},
				rationale: { type: "string" },
				unit: { type: "string" },
			},
			required: ["intent_slug", "stage", "path", "decision", "rationale"],
		},
	},
	{
		name: "haiku_classify_drift",
		description:
			"Record classification outcomes for a `manual_change_assessment` action. The agent submits one Classification per dispatched finding; the tool atomically writes the Assessment record, creates any inline feedback items, updates baselines for terminal outcomes (ignore, inline-fix), writes pending-assessment markers for non-terminal outcomes (surface-as-feedback, trigger-revisit), and dispatches haiku_revisit for trigger-revisit. Rejects stale tick_ids, illegal outcomes (per change_kind matrix), missing rationales on non-ignore outcomes, and revisit targets at or downstream of the active stage.",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent_slug: {
					type: "string",
					description: "Slug of the active intent.",
				},
				tick_id: {
					type: "string",
					description:
						"The tick_id from the dispatched manual_change_assessment action. Must match the active drift dispatch; stale ids are rejected with `tick_id_stale`.",
				},
				classifications: {
					type: "array",
					description:
						"One Classification per dispatched finding. Length must match the dispatch's findings array. Each entry has: path, outcome, rationale_excerpt, optionally linked_feedback_id (required for surface-as-feedback) and linked_revisit_target_stage (required for trigger-revisit).",
					items: {
						type: "object",
						properties: {
							path: { type: "string" },
							outcome: {
								type: "string",
								enum: [
									"ignore",
									"inline-fix",
									"surface-as-feedback",
									"trigger-revisit",
								],
							},
							rationale_excerpt: { type: "string" },
							linked_feedback_id: { type: ["string", "null"] },
							linked_revisit_target_stage: { type: ["string", "null"] },
						},
						required: ["path", "outcome", "rationale_excerpt"],
					},
				},
				agent_rationale: {
					type: "string",
					description:
						"Free-form prose explaining the classifications. Must contain at least one non-whitespace character.",
				},
				feedback_creates: {
					type: "array",
					description:
						"Inline feedback creates — one per surface-as-feedback classification that omits linked_feedback_id. Each entry has for_classification_path, title, body, origin (must be 'agent'), and optional resolution.",
					items: {
						type: "object",
						properties: {
							for_classification_path: { type: "string" },
							title: { type: "string" },
							body: { type: "string" },
							origin: { type: "string" },
							resolution: { type: ["string", "null"] },
						},
						required: ["for_classification_path", "title", "body", "origin"],
					},
				},
			},
			required: [
				"intent_slug",
				"tick_id",
				"classifications",
				"agent_rationale",
			],
		},
	},
	{
		name: "haiku_human_write",
		description:
			"Write a file to the intent's tracked surface as a human-attributed write. Use when a user explicitly instructs the agent to write a file on their behalf (e.g. 'save this config to knowledge/'). The file is written atomically, attributed to the human via an action-log entry, and appended to the write-audit log. The baseline is NOT updated — the next drift-gate tick detects the change and dispatches manual_change_assessment. Allowed destinations: knowledge/, stages/{stage}/knowledge/, stages/{stage}/discovery/, stages/{stage}/artifacts/ (or outputs/ alias). Workflow-managed files (units, feedback, intent.md, state.json) are refused.",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent_slug: {
					type: "string",
					description: "The slug of the active intent.",
				},
				path: {
					type: "string",
					description:
						"Destination file path — intent-relative (e.g. knowledge/brand-guide.md) or absolute within the intent directory. Path is canonicalised (outputs/ → artifacts/) before validation.",
				},
				content: {
					type: "string",
					description:
						"File content. UTF-8 string by default. Pass base64-encoded bytes and set content_encoding: 'base64' for binary files.",
				},
				content_encoding: {
					type: "string",
					enum: ["utf-8", "base64"],
					description: "Encoding of the content field. Default: 'utf-8'.",
				},
				claimed_author_id: {
					type: "string",
					description:
						"Self-reported identifier (username, email, UUID) of who the agent BELIEVES gave the instruction. Captured in the audit log as a CLAIM, not an authoritative identity — the server does not cross-check against any session or OS identity. Reviewers reading audit logs MUST treat this as 'what the agent said' rather than 'who did it'.",
				},
				human_author_id: {
					type: "string",
					description:
						"DEPRECATED legacy alias for `claimed_author_id`. Accepted for backwards compatibility; mirrored to `claimed_author_id` on persistence. New callers MUST use `claimed_author_id`.",
				},
				rationale: {
					type: "string",
					description:
						"Short free-text explanation of why the human requested this write. Strongly recommended. Required when the plugin setting human_write_require_rationale is true.",
				},
				user_instruction_excerpt: {
					type: "string",
					description:
						"The user's instruction as it appeared in chat (first 200 chars). Captured in the audit log for security review. Self-reported by the agent.",
				},
				overwrite: {
					type: "boolean",
					description:
						"Whether to overwrite the file if it already exists. Default: true. When false, returns path_already_exists if the destination exists.",
				},
				create_dirs: {
					type: "boolean",
					description:
						"Whether to create intermediate directories if they do not exist. Default: true. When false, returns parent_dir_missing if the parent directory is absent.",
				},
			},
			required: ["intent_slug", "path", "content"],
		},
	},
	{
		name: "haiku_record_agent_write",
		description:
			"Record an agent_write entry in the intent's action log for a tracked-surface file the agent just wrote via the harness's Write/Edit tool. Use only on harnesses that don't fire PostToolUse hooks (i.e., NOT Claude Code — on CC, the `stamp-agent-write` hook does this automatically). The next drift-gate tick will silently absorb the change into the baseline so the agent isn't asked to classify its own deliberate writes. Tracked-surface paths: stages/<X>/{artifacts,outputs,knowledge,discovery}/... and intent-root knowledge/.... Workflow-managed paths (units/, feedback/, state.json, intent.md) and paths outside the intent dir don't need (and won't get) a stamp.",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent_slug: {
					type: "string",
					description: "Slug of the intent that owns the file you just wrote.",
				},
				path: {
					type: "string",
					description:
						"Path of the file you just wrote. Either intent-relative (e.g. stages/design/artifacts/spec.md) or absolute. The tool resolves it against the intent dir and verifies it falls inside the drift-tracked surface before stamping.",
				},
			},
			required: ["intent_slug", "path"],
		},
	},
]

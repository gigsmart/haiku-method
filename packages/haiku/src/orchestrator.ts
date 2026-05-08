// orchestrator.ts — H·AI·K·U workflow-engine entry point + back-compat
// re-export surface.
//
// The orchestrator's logic lives in focused modules under
// `orchestrator/`:
//
//   - workflow/run-tick.ts  → tick loop + dispatcher
//   - workflow/handlers/    → per-state handlers
//   - workflow/side-effects → state mutators (workflowStartStage etc.)
//   - actions.ts            → OrchestratorAction helpers (summarize,
//                             escalate, elaborator instruction, etc.)
//   - studio.ts             → studio / stage / hat resolution
//   - units.ts              → unit listing + DAG wave computation
//   - validators.ts         → output / discovery / naming / inputs /
//                             quality-gate validators
//   - external-review.ts    → gh/glab CLI probing + changes_requested
//   - revisit.ts            → stage / phase regression
//   - preview.ts            → tell_user / next_step enrichment
//
// This file just re-exports the public surface for back-compat with
// callers (and tests) that still import from "./orchestrator.js",
// plus the MCP tool handler dispatch.

import { actionPromptBuilders } from "./orchestrator/prompts/index.js"
import { orchestratorToolDefs } from "./orchestrator/tool-defs.js"
import { dispatchOrchestratorAction } from "./orchestrator/workflow/run-tick.js"
import type { ReviewAnnotations } from "./sessions.js"
import { validateSlugArgs } from "./state-tools.js"
import { writeActionPromptFile } from "./subagent-prompt-file.js"
import { orchestratorToolHandlers } from "./tools/orchestrator/index.js"

export { orchestratorToolDefs }

/** Back-compat re-export of the workflow dispatcher. Older callers
 *  (and tests) imported this as `runNext` from orchestrator.ts; new
 *  code should prefer `dispatchOrchestratorAction` directly from
 *  `orchestrator/workflow/run-tick.js`. */
export const runNext = dispatchOrchestratorAction

export {
	buildElaboratorInstruction,
	buildGuardResponse,
	maybeEscalate,
	summarizeFeedback,
} from "./orchestrator/actions.js"
// Re-exports from extracted submodules. Callers of the old monolith
// continue to import from "./orchestrator.js"; new code can import
// directly from the per-concern modules.
//
// v4: external-review.ts and revisit.ts deleted. External review =
// merge into intent main; revisit = feedback closure with
// targets.invalidates rerouting the cursor naturally.
export { enrichActionWithPreview } from "./orchestrator/preview.js"
export {
	buildFeedbackAssessorPrompt,
	resolveIntentStages,
	resolveStageHats,
	resolveStageMetadata,
	resolveStageReview,
	resolveStudioFilePath,
	resolveStudioStages,
	resolveUnitHatsInStudio,
} from "./orchestrator/studio.js"
export {
	cleanupPreExecuteFeedback,
	computeUnitWaves,
	currentWaveNumber,
	isStagePreExecute,
	listUnits,
	type UnitInfo,
} from "./orchestrator/units.js"
export {
	buildOutputRequirements,
	runQualityGates,
	validateCumulativeInputCoverage,
	validateDiscoveryArtifacts,
	validateOutputLiveness,
	validateStageOutputs,
	validateUnitInputs,
	validateUnitNaming,
	writeReviewFeedbackFiles,
} from "./orchestrator/validators.js"
export {
	completeOrReviewIntent,
	findIncompleteStages,
	workflowAdvancePhase,
	workflowAdvanceStage,
	workflowCompleteStage,
	workflowGateAsk,
	workflowIntentComplete,
	workflowStartStage,
} from "./orchestrator/workflow/side-effects.js"

// ── Action types ───────────────────────────────────────────────────────────

export interface OrchestratorAction {
	action: string
	[key: string]: unknown
}

// ── Main orchestration function ────────────────────────────────────────────

// ── Run instruction builder ───────────────────────────────────────────────

/**
 * Action emitters whose multi-line instructional bodies are routed to a
 * tmpfile via `writeActionPromptFile` instead of inlined in the response.
 *
 * The flow:
 *   1. The per-action prompt builder renders the full body as today.
 *   2. `buildRunInstructions` writes the body to a file, stamps
 *      `prompt_file` on the action, and replaces the prompt-builder
 *      output with a one-line "Read the file" pointer.
 *   3. The action JSON returned to the agent then carries `prompt_file`
 *      alongside the structured fields (intent, stage, items, …).
 *
 * `elaborate` is NOT in this set because its handler already performs
 * the file-write itself and the prompt builder short-circuits when
 * `action.prompt_file` is present (see PR #281). All other multi-line
 * emitters route through here.
 */
/**
 * Actions that DO NOT route through prompt-file dispatch. P1 (2026-05-06):
 * file-backed dispatch is now the default for every action with a
 * non-trivial prompt body. The skip-set carries only:
 *
 *   - `noop` / `sealed` / `error` — no instructional body to file-back.
 *   - Anything else where the body is trivially short (a "you done"
 *     terminus message that the agent doesn't need to re-read).
 *
 * Adding an action here must be deliberate. The default — every tick
 * gets a prompt file — is the cleaner I/O contract for the agent.
 */
const FILE_BACKED_SKIP_ACTIONS: ReadonlySet<string> = new Set<string>([
	"noop",
	"sealed",
	"error",
])

/**
 * Slug fragment for the action prompt-file name. Keeps the filename
 * deterministic enough to locate, but unique enough that two ticks of
 * the same action don't collide.
 */
function buildActionTickHint(action: OrchestratorAction): string {
	const stage = (action.stage as string) || ""
	const items = Array.isArray(action.items)
		? `n${(action.items as unknown[]).length}`
		: ""
	const iteration =
		(action.iteration as number | undefined) ??
		(action.bolt as number | undefined)
	return `${stage}-${items}-${iteration ?? ""}-${Date.now()}`
}

export function buildRunInstructions(
	slug: string,
	studio: string,
	action: OrchestratorAction,
	dir: string,
): string {
	// All per-action prompts live in orchestrator/prompts/* per-file
	// modules registered in actionPromptBuilders. The legacy switch is
	// gone — unknown actions fall through to the default JSON dump
	// below for forward-compat with new action types.
	const perActionBuilder = actionPromptBuilders.get(action.action)
	let perActionBody: string | null = null
	if (perActionBuilder) {
		perActionBody = perActionBuilder({ slug, studio, action, dir })
	}

	// File-backed dispatch (P1, 2026-05-06): the default for every
	// action with a non-trivial prompt body is to write the body to a
	// tmpfile, stamp `prompt_file` on the action, and replace the
	// per-action body with a short "read the file" pointer. The action
	// JSON below the announcement section then carries `prompt_file`,
	// so the agent's tool response surfaces the path in both places.
	// Skip-set covers actions whose body is trivially short (noop,
	// sealed, error).
	if (
		perActionBody &&
		!FILE_BACKED_SKIP_ACTIONS.has(action.action) &&
		!action.prompt_file
	) {
		try {
			const { path } = writeActionPromptFile({
				action: action.action,
				intent: slug,
				stage: (action.stage as string) || undefined,
				content: perActionBody,
				tickHint: buildActionTickHint(action),
			})
			action.prompt_file = path
			// Keep the structured `message:` short — the inline body in
			// the response also points to the file.
			action.message = `Read \`${path}\` and execute its instructions exactly. The file is the canonical, authoritative ${action.action} prompt for this tick.`
			perActionBody = [
				`## ${action.action} Prompt (file-based)`,
				"",
				`The full prompt for this tick is at:`,
				"",
				`    ${path}`,
				"",
				`Read that file with the Read tool and execute its instructions exactly. The file is the canonical, authoritative ${action.action} prompt — do not paraphrase, summarize, or skip any of it.`,
			].join("\n")
		} catch (err) {
			// Best-effort: leave perActionBody as the inline body. This
			// mirrors elaborate's fallback (handlers/elaborate.ts).
			console.error(
				`[haiku] action prompt-file write failed for ${action.action}/${slug}: ${err instanceof Error ? err.message : String(err)}. Falling back to inline rendering.`,
			)
		}
	}

	// Strip tell_user/next_step from the JSON output — they appear in the
	// announcement section already, no need to duplicate in the raw action.
	// Note: action mutation above (prompt_file/message) is reflected in the
	// JSON because we destructure AFTER the mutation.
	const { tell_user, next_step, ...actionForJson } =
		action as OrchestratorAction & { tell_user?: string; next_step?: string }
	const actionJson = JSON.stringify(actionForJson, null, 2)
	const sections: string[] = []

	// Agent announcement directive — tell the user what's happening
	if (tell_user || next_step) {
		const parts: string[] = [
			"## Announce to User (MANDATORY)\n",
			`**Before doing ANY work**, tell the user what you're about to do:`,
		]
		if (tell_user) parts.push(`> ${tell_user}`)
		if (next_step) parts.push(`\n_${next_step}_`)
		parts.push(
			"\nKeep the announcement concise — one or two sentences. Do NOT skip this step.",
		)
		sections.push(parts.join("\n"))
	}

	sections.push(`## Orchestrator Action\n\n\`\`\`json\n${actionJson}\n\`\`\``)

	if (perActionBody !== null) {
		sections.push(perActionBody)
		return sections.join("\n\n")
	}

	sections.push(
		`## Unknown Action: ${action.action}\n\n${JSON.stringify(action, null, 2)}`,
	)
	return sections.join("\n\n")
}

// ── Tool definitions ───────────────────────────────────────────────────────

// ── Tool handlers ──────────────────────────────────────────────────────────

export type GateMetaForCallback = {
	gateContext?: string
	stage?: string
	nextStage?: string | null
	nextPhase?: string | null
}

/**
 * Two-step gate-review callbacks. Set by server.ts at startup to avoid
 * circular imports.
 *
 * - `_prepareGateReview` is called by `haiku_run_next` when the workflow
 *   engine reports `gate_review`. It creates the session + URL but does
 *   NOT block, so haiku_run_next can return the URL to the agent (so
 *   the agent can post it to the user) before the user decides.
 *
 * - `_awaitGateReviewSession` is called by `haiku_await_gate`. It opens
 *   the browser best-effort (when `autoOpen`) and blocks on the session
 *   until the user decides or the wait times out.
 */
let _prepareGateReview:
	| ((
			intentDir: string,
			gateType: string | undefined,
			gateMeta: GateMetaForCallback | undefined,
	  ) => Promise<{
			session_id: string
			review_url: string
			use_remote: boolean
			reused: boolean
			browser_attached: boolean
	  }>)
	| null = null

let _awaitGateReviewSession:
	| ((
			sessionId: string,
			opts: {
				autoOpen?: boolean
				signal?: AbortSignal
				reviewUrl?: string
				timeoutMs?: number
			},
	  ) => Promise<{
			decision: string
			feedback: string
			annotations?: ReviewAnnotations
	  }>)
	| null = null

// 2026-05-07: MCP elicitation has been removed. Studio / mode /
// stage selection and intent reset confirmation now go through the
// SPA picker (`runPicker` in src/server/picker.ts). The elicit
// handler getter/setter are gone; nothing in the engine should
// import them.

export function setGateReviewHandlers(handlers: {
	prepare: typeof _prepareGateReview
	await: typeof _awaitGateReviewSession
}): void {
	_prepareGateReview = handlers.prepare
	_awaitGateReviewSession = handlers.await
}

/** Per-tool orchestrator handlers reach the gate-review prepare/await
 *  callbacks through these getters. Keeps the variables module-private
 *  while still allowing extracted per-tool files to call them. */
export function getPrepareGateReview(): typeof _prepareGateReview {
	return _prepareGateReview
}

export function getAwaitGateReviewSession(): typeof _awaitGateReviewSession {
	return _awaitGateReviewSession
}

export async function handleOrchestratorTool(
	name: string,
	args: Record<string, unknown>,
	signal?: AbortSignal,
): Promise<{
	content: Array<{ type: "text"; text: string }>
	isError?: boolean
}> {
	const text = (s: string) => ({
		content: [{ type: "text" as const, text: s }],
	})

	const validationError = validateSlugArgs(args)
	if (validationError) return validationError

	// Per-tool handlers in tools/orchestrator/* take priority over the
	// legacy if-chain. Migrated tools live in their own file with
	// defineTool(); the chain below handles the rest until they all
	// migrate. The MCP abort signal is forwarded so long-running tools
	// (haiku_await_gate, future blocking tools) can unwind on client
	// cancel — without it, a Ctrl-C on the agent leaves the await
	// running for the full 30-minute timeout.
	const perToolHandler = orchestratorToolHandlers.get(name)
	if (perToolHandler) {
		const result = perToolHandler.handle(args, signal)
		return result instanceof Promise ? await result : result
	}

	return text(`Unknown orchestrator tool: ${name}`)
}

// v4: per-unit dispatch hook removed.
//   Rationale: subagents are single-hat in v4. When a hat advances
//   mid-wave, the subagent terminates with a clean message; the parent
//   reads it and calls haiku_run_next on the next tick. The cursor
//   returns the next start_unit_hat instruction; the parent spawns a
//   fresh subagent for that hat. No in-context hat iteration, no
//   Workflow Result file relay, no rogue cursor driving from inside
//   subagent contexts.

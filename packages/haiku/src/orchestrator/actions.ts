// orchestrator/actions.ts — Pure helpers that build OrchestratorAction
// payloads + summary shapes. No workflow engine-state mutation; everything here
// returns a value, doesn't write disk.
//
// Contents:
//   - summarizeFeedback        — compact feedback summary for action payloads
//   - buildGuardResponse       — MCP error envelope for stage-branch guard
//                                failures (commit_wip etc.)
//   - maybeEscalate            — stage-iteration / loop guards → escalate action
//   - buildElaboratorInstruction — instruction text for the elaborate action
//   - manual_change_assessment shape, builder, and guard (re-exported
//     from `workflow/handlers/manual-change-assessment.ts` so the
//     discriminated-union surface lives in one place for callers)

import type { OrchestratorAction } from "../orchestrator.js"
import { MAX_STAGE_ITERATIONS } from "../state-tools.js"
import { emitTelemetry } from "../telemetry.js"

// v4: manual_change_assessment removed. Drift detection runs in
// the cursor's Track C and surfaces as drift_detected → FB; the
// feedback track handles assessment. No separate handler needed.

/** Compact feedback summary for orchestrator action responses.
 *  Returns id/title/origin/author/status + file path — NO body.
 *  Callers MUST read the file to understand the finding; a preview
 *  here invites shortcut-thinking and missing critical detail. */
export function summarizeFeedback(f: {
	id: string
	title: string
	origin: string
	author: string
	status: string
	file: string
}) {
	return {
		feedback_id: f.id,
		title: f.title,
		status: f.status,
		origin: f.origin,
		author: f.author,
		file: f.file,
	}
}

/** Build an MCP response for a failed stage-branch enforcement.
 *
 *  When the guard failed because uncommitted changes block a checkout,
 *  return a structured `commit_wip` action. That action tells the
 *  agent exactly what to commit (the files git refused to overwrite,
 *  which belong on the branch they currently sit on) and to retry —
 *  no human needs to step in to resolve the dirty tree.
 *
 *  Other block types (merge_conflict, merge_in_progress) still ask
 *  the agent to resolve, but expose the structured block code so the
 *  agent handles the right case. Hard errors remain only for truly
 *  unresolvable states. */
export function buildGuardResponse(
	slug: string,
	stage: string | undefined,
	guard: {
		ok: boolean
		branch: string
		message: string
		block?:
			| "dirty_tree"
			| "merge_conflict"
			| "merge_in_progress"
			| "worktree_locked"
		dirty_files?: string[]
		target_branch?: string
	},
	contextLabel: string,
): {
	content: { type: "text"; text: string }[]
	isError: true
} {
	const stageLabel = stage || "(none)"
	const target = guard.target_branch || "the target branch"
	const files = guard.dirty_files || []
	if (guard.block === "dirty_tree") {
		const filesBlock =
			files.length > 0
				? `\n\nFiles to commit:\n${files.map((f) => `  - ${f}`).join("\n")}`
				: ""
		const action = {
			action: "commit_wip",
			intent: slug,
			stage: stage || null,
			context: contextLabel,
			current_branch: guard.branch,
			target_branch: target,
			dirty_files: files,
			message: `Uncommitted changes on branch '${guard.branch}' block the switch to '${target}'. These changes belong on '${guard.branch}' — commit them there, then call \`haiku_run_next\` again. The workflow engine will retry the branch switch automatically.${filesBlock}\n\nNo human intervention needed — just:\n  1. \`git add ${files.length > 0 ? files.join(" ") : "<files listed above>"}\`\n  2. \`git commit -m "haiku: wip on ${guard.branch}"\`\n  3. Call \`haiku_run_next\` to retry.`,
		}
		return {
			content: [
				{ type: "text" as const, text: JSON.stringify(action, null, 2) },
			],
			isError: true,
		}
	}
	return {
		content: [
			{
				type: "text" as const,
				text: `Error: stage-branch enforcement failed for intent '${slug}', stage '${stageLabel}' (${contextLabel}) — ${guard.message}`,
			},
		],
		isError: true,
	}
}

/** Guardrails for agent-invoked stage iterations. When
 *  `appendStageIteration` flags `exceeded` (> MAX_STAGE_ITERATIONS) or
 *  `loopDetected` (same feedback signature as the previous iteration),
 *  return an `escalate` action so the parent agent stops the
 *  autonomous loop and surfaces to the human. User-invoked revisits
 *  (`trigger: "user-revisit"`) never hit these guards — explicit
 *  human intent always wins. */
export function maybeEscalate(
	slug: string,
	stage: string,
	iter: {
		count: number
		exceeded: boolean
		loopDetected: boolean
		signature: string
	},
	trigger: "feedback" | "external-changes",
	pendingItems: Array<{ feedback_id: string; title: string }> = [],
): OrchestratorAction | null {
	if (!(iter.exceeded || iter.loopDetected)) return null

	const reason = iter.exceeded ? "iteration_limit" : "loop_detected"
	const message = iter.exceeded
		? `Stage '${stage}' has exceeded ${MAX_STAGE_ITERATIONS} agent-invoked iterations (now at ${iter.count}). The autonomous loop has stopped — a human must decide whether to keep pushing, reject feedback items, split the work, or terminate the intent. To force another cycle (user-invoked, uncapped), invoke the /haiku:revisit slash command — it logs stage_revisit feedback items so the next \`haiku_run_next\` reroutes via the pre-tick gate. Or use \`haiku_feedback_reject\` to dismiss specific items, or mark the stage complete manually.`
		: `Stage '${stage}' is in a loop: iteration ${iter.count}'s feedback set is the same as the previous iteration's. The agent keeps regenerating identical findings, which usually means the spec is wrong or the criteria are unreachable. A human must intervene — adjust the feedback items, relax the criteria, or terminate the intent.`

	emitTelemetry("haiku.stage.escalate", {
		intent: slug,
		stage,
		reason,
		iteration: String(iter.count),
		trigger,
		signature: iter.signature,
	})

	return {
		action: "escalate",
		intent: slug,
		stage,
		reason,
		trigger,
		iteration: iter.count,
		max_iterations: MAX_STAGE_ITERATIONS,
		signature: iter.signature,
		pending_items: pendingItems,
		message,
	}
}

/** Instruction text for the elaborate action's message field. Tells
 *  the caller WHAT to do — read every feedback file, draft units
 *  with `closes:`, ask the user when trade-offs are unclear.
 *  Deliberately does NOT prescribe HOW (no subagent-delegation
 *  guidance) — the parent decides how to structure the work within
 *  its own context. */
export function buildElaboratorInstruction(opts: {
	visits: number
	pendingFeedbackCount: number
	stage: string
	situation?: string
}) {
	const { visits, pendingFeedbackCount, stage, situation } = opts
	const lead =
		visits > 0
			? `Revisit elaborate (visit ${visits}) for stage '${stage}'. ${pendingFeedbackCount} pending feedback item(s) must be addressed with new units.`
			: `Elaborate stage '${stage}' into units with completion criteria.`

	const body = [
		"",
		"Inputs (read each file directly — do not trust titles alone):",
		"- every `pending_feedback[].file` in this action's payload",
		"- `stage_metadata` (STAGE.md body + review agents)",
		"- `completed_units` (the stage's prior units, read-only reference)",
		"- the intent's `intent.md` for overall goals",
		"",
		"Responsibilities:",
		"- Read every `pending_feedback[].file` COMPLETELY. The title is only a handle; the body carries requirements, tests, and acceptance criteria.",
		"- Draft one or more new units whose `closes:` frontmatter references the feedback items they resolve.",
		"- Every pending feedback item MUST be referenced by at least one new unit's `closes:` (orphans block advancement).",
		"- When drafting is complete, call `haiku_run_next` to advance. The workflow engine opens a review gate where the user inspects and approves the drafted units via the review UI — that is the ONLY approval path.",
		"",
		"## Turn discipline",
		"",
		"Elaboration is COLLABORATIVE and DETAILED. Take as many turns as you need to draft a thorough, well-scoped unit set — but every turn must earn its place.",
		"",
		"- **Each turn MUST ask a meaningful question.** A meaningful question is one whose answer changes what you draft — trade-offs, scope boundaries, acceptance criteria, architectural choices with two-plus viable options, priorities between conflicting requirements, or requirement ambiguities that can't be resolved from the intent body alone. Use `AskUserQuestion` with a pre-populated `options[]` array.",
		"- **NEVER ask about things covered elsewhere in the flow.** The following are handled by other parts of the system — asking about them here duplicates work:",
		'  - Unit-set approval ("how do these units look", "does this scope work", "are these acceptable", "should I proceed", "do you approve") — handled by the review gate UI after drafting completes',
		"  - Per-unit feedback (reject / request-changes on specific units) — handled by the review gate's annotation + changes-requested path",
		'  - Feedback closure verification ("did my unit address FB-N") — handled by the feedback-assessor hat during execution',
		'  - Gate decisions ("should we advance the stage") — handled by the gate itself',
		'  - Quality-gate results ("did tests pass") — handled by advance_hat',
		"- **Use `AskUserQuestion` with `questions[]` when several decisions are related** so the user answers them in one UI exchange. Independent questions can still be separate turns — collaboration is the point.",
		"- **When information is genuinely absent from the intent and there are no viable defaults, ask.** When you have reasonable inference based on intent goals + stage scope + prior units, draft it and let the review gate surface disagreements.",
	].join("\n")

	return situation ? `${lead}\n\n${situation}${body}` : `${lead}${body}`
}

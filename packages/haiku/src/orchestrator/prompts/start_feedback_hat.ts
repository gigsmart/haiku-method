// orchestrator/prompts/start_feedback_hat.ts — v4 fix-hat dispatch
// for an open feedback file.
//
// Cursor returns `start_feedback_hat { stage, hat, feedback_ids,
// terminal }` when an open FB needs its next fix-hat dispatched. The
// agent spawns a subagent that loads the FB, executes the fix-hat's
// mandate against the FB body, and calls
// `haiku_feedback_advance_hat` or `haiku_feedback_reject_hat` when
// done.
//
// Terminal hat (`feedback-assessor`): on advance, the FB closes
// (`closed_at` stamped) and `targets.invalidates` is applied to the
// targeted unit's approvals — the cursor on the next tick reroutes
// through those approval roles.

import { definePromptBuilder } from "./define.js"

export default definePromptBuilder(({ slug, action }) => {
	const stage = (action.stage as string) || ""
	const hat = (action.hat as string) || ""
	const feedbackIds = (action.feedback_ids as string[]) || []
	const terminal = (action.terminal as boolean) || false

	if (feedbackIds.length === 0) {
		return `## start_feedback_hat: no FBs\n\nThe cursor returned start_feedback_hat with no feedback_ids. Call \`haiku_run_next { intent: "${slug}" }\` to retick.`
	}

	const lines: string[] = []
	lines.push(`# Dispatch fix-hat \`${hat}\` for feedback on \`${stage}\``)
	lines.push("")
	lines.push(`Open feedback needing the \`${hat}\` hat:`)
	lines.push("")
	for (const id of feedbackIds) lines.push(`  - \`${id}\``)
	lines.push("")
	lines.push("## What to do")
	lines.push("")
	lines.push(
		`Spawn ${feedbackIds.length} subagent${feedbackIds.length === 1 ? "" : "s"} (parallel, single message, ${feedbackIds.length} \`Task\` call${feedbackIds.length === 1 ? "" : "s"}). Each subagent block below carries the **canonical FB ID** — pass each \`feedback_id\` verbatim, no substitution required. The IDs are not placeholders; the agent should NEVER guess, normalize, or rewrite them.`,
	)
	lines.push("")
	// P2 (2026-05-06): emit one per-FB subagent block with the
	// canonical feedback_id inlined into every tool call. The previous
	// version emitted a single template with `<FB-NN>` placeholders, which
	// led to the agent guessing IDs and hitting `feedback_not_found`
	// errors in retry loops.
	const replyClauseTerminal = terminal
		? `, reply: "<short plain-language explanation of what was done — surfaces in the SPA so the requester sees the resolution>"`
		: ""
	for (const fbId of feedbackIds) {
		lines.push(`### Subagent for \`${fbId}\``)
		lines.push("")
		lines.push("```")
		lines.push(
			`Read plugin/studios/<studio>/stages/${stage}/hats/${hat}.md.`,
		)
		lines.push(
			`Then call haiku_feedback_read { intent: "${slug}", stage: "${stage}", feedback_id: "${fbId}" } to load the FB body.`,
		)
		lines.push(`Execute the ${hat} mandate against the FB.`)
		lines.push("When done, call ONE of:")
		lines.push("  Success path:")
		lines.push(
			`    haiku_feedback_advance_hat { intent: "${slug}", stage: "${stage}", feedback_id: "${fbId}"${replyClauseTerminal} }`,
		)
		lines.push("  Block / reject path:")
		lines.push(
			`    haiku_feedback_reject_hat { intent: "${slug}", stage: "${stage}", feedback_id: "${fbId}", reason: "<why>" }`,
		)
		lines.push("Terminate with the tool's plain-text return.")
		lines.push("```")
		lines.push("")
	}
	if (terminal) {
		lines.push("")
		lines.push(
			`**Terminal hat note**: \`${hat}\` is the LAST hat in this stage's \`fix_hats:\` sequence. The subagent's \`feedback_advance_hat\` call closes the FB (stamps \`closed_at\`) and applies \`targets.invalidates\` to the targeted unit's approvals — the cursor on the next tick will route through the invalidated roles to re-run them.`,
			"",
			`**Reply required**: pass a \`reply\` string with a short plain-language explanation of what was done. Without it, \`haiku_feedback_advance_hat\` returns \`reply_required\` and refuses to close. The reply surfaces in the SPA so the requester sees the resolution, not just that closure happened.`,
		)
	}
	lines.push("")
	lines.push(
		`After all subagent(s) return, call \`haiku_run_next { intent: "${slug}" }\`.`,
	)

	return lines.join("\n")
})

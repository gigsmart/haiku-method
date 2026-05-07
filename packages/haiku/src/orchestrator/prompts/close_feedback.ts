// orchestrator/prompts/close_feedback.ts — Auto-close prompt for
// feedback that has cleared its fix-hat sequence.
//
// Cursor returns `close_feedback { stage, feedback_id }` when every
// hat in the stage's `fix_hats:` rotation has signed advance on the
// FB. The engine flips the FB's lifecycle to `closed` on the next
// tick; this prompt tells the agent to drive that tick and surface
// the closure to the user.

import { definePromptBuilder } from "./define.js"

export default definePromptBuilder(({ slug, action }) => {
	const stage = (action.stage as string) || ""
	const fbId = (action.feedback_id as string) || ""

	const lines: string[] = []
	lines.push(`# Close feedback \`${fbId}\` on stage \`${stage}\``)
	lines.push("")
	lines.push(
		`Every fix-hat for feedback \`${fbId}\` has signed advance. The engine is ready to flip the FB to \`closed\` and continue the cursor walk.`,
	)
	lines.push("")
	lines.push("## What to do")
	lines.push("")
	lines.push(
		`Call \`haiku_run_next { intent: "${slug}" }\` — the engine writes the closure (lifecycle: closed, closed_at: now) and the next tick walks the cursor forward (next FB on Track B, or back to Track A).`,
	)
	lines.push("")
	lines.push(
		`Do NOT call \`haiku_feedback_update\` manually — the engine owns the closure timestamp and the lifecycle transition. Manual writes here will trip the workflow-managed-file guard.`,
	)
	return lines.join("\n")
})

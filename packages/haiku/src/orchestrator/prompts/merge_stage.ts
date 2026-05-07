// orchestrator/prompts/merge_stage.ts — v4 stage→main merge prompt.
//
// Cursor returns `merge_stage { stage }` when every unit in the stage
// has its branch merged into the stage branch AND every required
// review/approval role has signed (mode-shaped). The engine merges
// the stage branch into intent main under `withIntentMainLock`.
//
// On success, the cursor's next tick advances to the next unmerged
// stage (or the intent-level approval track if this was the last
// stage). On conflict, returns `merge_conflict` with file paths for
// the agent to resolve.

import { definePromptBuilder } from "./define.js"

export default definePromptBuilder(({ slug, action }) => {
	const stage = (action.stage as string) || ""

	const lines: string[] = []
	lines.push(`# Merge stage \`${stage}\` into intent main`)
	lines.push("")
	lines.push(
		`Every unit on stage \`${stage}\` is merged into the stage branch and every required reviewer + the user (if mode requires it) has signed. The cursor is ready to merge \`haiku/${slug}/${stage}\` → \`haiku/${slug}/main\`.`,
	)
	lines.push("")
	lines.push("## What to do")
	lines.push("")
	lines.push(
		`Call \`haiku_run_next { intent: "${slug}" }\` again — the engine will perform the stage→main merge under \`withIntentMainLock\` and return the next instruction. Most commonly: another \`merge_stage\` for the next unmerged stage, or \`intent_review\` once every stage is on main.`,
	)
	lines.push("")
	lines.push(
		`On a successful merge, no further action from you. On \`merge_conflict\`, the response will include the conflicting files and instructions for resolution.`,
	)

	return lines.join("\n")
})

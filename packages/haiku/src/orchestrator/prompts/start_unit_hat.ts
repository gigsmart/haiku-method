// orchestrator/prompts/start_unit_hat.ts — v4 batch-aware hat dispatch
// prompt builder.
//
// The cursor returns `start_unit_hat { stage, hat, units: [...], terminal }`
// when one or more wave-ready units need their next hat. The prompt
// instructs the parent agent to spawn ONE subagent per listed unit,
// in parallel. Each subagent runs that unit's hat, calls
// haiku_unit_advance_hat (or _reject_hat) when done, and terminates
// with a clean signal — no Workflow Result file relay, no in-context
// hat iteration. The parent reaps all returns, calls haiku_run_next
// once, and the cursor returns the next instruction.
//
// Why batch (not one-per-tick): cursor walks the wave-ready set once,
// emits all of them; parent dispatches N in parallel. Single tick =
// whole wave. Mid-wave ticks return null (noop) until all in-flight
// units terminate.

import { definePromptBuilder } from "./define.js"
import { WORKFLOW_CONTRACTS_ANNOUNCEMENT_BLOCK } from "./WORKFLOW_CONTRACTS_ANNOUNCEMENT_BLOCK.js"

export default definePromptBuilder(({ slug, action }) => {
	const stage = (action.stage as string) || ""
	const hat = (action.hat as string) || ""
	const units = (action.units as string[]) || []
	const terminal = (action.terminal as boolean) || false

	if (units.length === 0) {
		return `## start_unit_hat: no units\n\nThe cursor returned start_unit_hat with an empty units list. Call \`haiku_run_next { intent: "${slug}" }\` to retick — likely a transient mid-wave noop misclassified.`
	}

	const lines: string[] = []
	lines.push(`# Dispatch hat \`${hat}\` for stage \`${stage}\``)
	lines.push("")
	lines.push(
		`The cursor identified ${units.length} unit(s) ready for the \`${hat}\` hat:`,
	)
	lines.push("")
	for (const u of units) lines.push(`  - \`${u}\``)
	lines.push("")
	// Announcement contract — silent fan-outs panic the user. The block
	// is verbatim (no per-dispatch customization) so the rule reads the
	// same regardless of what's being dispatched.
	if (units.length > 1) {
		lines.push(WORKFLOW_CONTRACTS_ANNOUNCEMENT_BLOCK)
		lines.push("")
	}
	lines.push("## What to do")
	lines.push("")
	lines.push(
		`Spawn ONE subagent per unit, **in parallel** (single message, ${units.length} \`Task\` tool calls). Each subagent's prompt: "Read .haiku/intents/${slug}/stages/${stage}/units/<unit>.md and execute the \`${hat}\` hat's mandate. Call \`haiku_unit_start\` if iterations[] is empty; otherwise the unit is already started. When finished, call \`haiku_unit_advance_hat { intent: \\"${slug}\\", unit: \\"<unit>\\" }\` (on success) or \`haiku_unit_reject_hat { intent: \\"${slug}\\", unit: \\"<unit>\\", reason: \\"<why>\\" }\` (on block). Terminate with the tool's plain-text return — no summary, no narration."`,
	)
	lines.push("")
	lines.push(
		"Each subagent runs **one hat only**. After it terminates, this dispatch is complete for that unit; the cursor on the next tick will return either the next hat for that unit or a noop while siblings are still in flight.",
	)
	if (terminal) {
		lines.push("")
		lines.push(
			`**Terminal hat note**: \`${hat}\` is the LAST hat in the stage's sequence. The subagent's \`advance_hat\` call will trigger the unit-branch → stage-branch merge under \`withStageLock\`. On merge success, the unit is complete; on conflict, the response carries \`merge_conflict\` with the conflicting paths for resolution.`,
		)
	}
	lines.push("")
	lines.push(
		`After ALL ${units.length} subagent(s) return, call \`haiku_run_next { intent: "${slug}" }\` exactly once. The cursor will tell you what's next (more wave-ready units, the next wave, or the spec/output review track).`,
	)

	return lines.join("\n")
})

// orchestrator/prompts/dispatch_quality_gates.ts — v4 quality_gates
// runner prompt.
//
// Cursor returns `dispatch_quality_gates { stage, units }` when the
// post-execute approval track reaches the engine-built `quality_gates`
// role and `approvals.quality_gates` is unsigned on one or more units.
// The agent calls `haiku_dispatch_quality_gates` (a synchronous engine
// tool) which runs each unit's declared `quality_gates: [{name,
// command, dir?}]` commands. On all-pass for a unit, the tool stamps
// `approvals.quality_gates`; on failure, it files an FB targeting the
// unit (targets.invalidates: ["quality_gates"]).
//
// The agent doesn't spawn a subagent for this — quality_gates is
// engine-callable, no LLM involvement.

import { definePromptBuilder } from "./define.js"

export default definePromptBuilder(({ slug, action }) => {
	const stage = (action.stage as string) || ""
	const units = (action.units as string[]) || []

	const lines: string[] = []
	lines.push(`# Run quality gates on stage \`${stage}\``)
	lines.push("")
	lines.push(
		`The cursor's post-execute approval track reached the \`quality_gates\` role. ${units.length} unit(s) need their declared gates run:`,
	)
	lines.push("")
	for (const u of units) lines.push(`  - \`${u}\``)
	lines.push("")
	lines.push("## What to do")
	lines.push("")
	lines.push(
		`Call \`haiku_dispatch_quality_gates { intent: "${slug}", stage: "${stage}", units: ${JSON.stringify(units)} }\`. The tool runs each unit's \`quality_gates\` commands synchronously, stamps \`approvals.quality_gates\` on units that pass, and files an FB on each unit that fails.`,
	)
	lines.push("")
	lines.push(
		`After it returns, call \`haiku_run_next { intent: "${slug}" }\`. If all gates passed, the cursor routes to the next role; if any FBs were filed, the cursor routes to Track B (fix loop) to address them.`,
	)

	return lines.join("\n")
})

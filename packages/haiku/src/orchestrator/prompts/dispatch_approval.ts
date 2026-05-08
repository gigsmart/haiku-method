// orchestrator/prompts/dispatch_approval.ts — v4 review-agent dispatch
// for the post-execute output approval track.
//
// Mirror of dispatch_review.ts but the review-agent reads the unit's
// PRODUCED OUTPUTS (not the spec) and confirms they align with the
// spec it already approved. On any disagreement, files an FB
// (origin: `adversarial-review`, targets.invalidates: [<role>]) which
// rewinds the cursor through the fix loop on this role. On clean
// approval, stamps `approvals.<role>`.
//
// Model routing follows the same `resolveStudioMandateModel` cascade
// as dispatch_review.ts. See its header for rationale.

import { join } from "node:path"
import { resolvePluginRoot } from "../../config.js"
import { resolveStudioMandateModel } from "./_helpers.js"
import { definePromptBuilder } from "./define.js"

export default definePromptBuilder(({ slug, studio, action }) => {
	const stage = (action.stage as string) || ""
	const role = (action.role as string) || ""
	const units = (action.units as string[]) || []

	const mandatePath = join(
		resolvePluginRoot(),
		"studios",
		studio,
		"stages",
		stage,
		"review-agents",
		`${role}.md`,
	)
	const modelTier = resolveStudioMandateModel({ mandatePath, studio, stage })

	const lines: string[] = []
	lines.push(`# Dispatch approval-agent \`${role}\` on stage \`${stage}\``)
	lines.push("")
	lines.push(
		`The cursor's output-approval track requires \`approvals.${role}\` on ${units.length} unit(s):`,
	)
	lines.push("")
	for (const u of units) lines.push(`  - \`${u}\``)
	lines.push("")
	if (modelTier) {
		lines.push(
			`**Model:** spawn the Task with \`model: "${modelTier}"\` (resolved via the review-agent mandate cascade).`,
		)
		lines.push("")
	}
	lines.push("## What to do")
	lines.push("")
	lines.push(
		`Spawn ONE \`${role}\` review-agent subagent (single Task call). The subagent's prompt:`,
	)
	lines.push("")
	lines.push("```")
	lines.push(
		`Read your mandate at plugin/studios/<studio>/stages/${stage}/review-agents/${role}.md. For each listed unit (${units.join(", ")}): read the spec via haiku_unit_read, then read each declared output path on disk, and evaluate whether the outputs deliver what the spec promised. If any output diverges from the spec, file feedback (origin: "adversarial-review", source_ref: "${role}", target_unit: "<unit>", target_invalidates: ["${role}"]). After reviewing all listed units, stamp approvals.${role} on each — the engine handles this on the next haiku_run_next tick when it sees no unsigned approvals on this role. Terminate with a one-line summary.`,
	)
	lines.push("```")
	lines.push("")
	lines.push(
		`When the review-agent terminates, call \`haiku_run_next { intent: "${slug}" }\`. If FBs were filed, the cursor routes to Track B (fix loop). If clean, it routes to the next missing approval role or to the user gate.`,
	)

	return lines.join("\n")
})

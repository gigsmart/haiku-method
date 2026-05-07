// orchestrator/prompts/dispatch_review.ts — v4 review-agent dispatch
// for the pre-execute spec review track.
//
// Cursor returns `dispatch_review { stage, role, units }` when one
// configured review agent (e.g. `adversarial-architect`,
// `code-reviewer`) hasn't signed `reviews.<role>` yet on one or more
// units. The agent dispatches that review-agent subagent against the
// listed unit specs. The subagent reads each spec, files an FB if it
// finds an issue (origin: `adversarial-review`, targets.invalidates:
// [<this-role>]), and stamps `reviews.<role>` when its review
// completes — clean or with FBs filed.
//
// The review-agent's tool whitelist (enforced by the parent's Task
// dispatch): `haiku_unit_read`, `haiku_feedback` (create), nothing
// else. No advance_hat, no run_next, no triage tools — review-agents
// are pure finders, not workflow drivers.

import { definePromptBuilder } from "./define.js"

export default definePromptBuilder(({ slug, action }) => {
	const stage = (action.stage as string) || ""
	const role = (action.role as string) || ""
	const units = (action.units as string[]) || []

	const lines: string[] = []
	lines.push(`# Dispatch review-agent \`${role}\` on stage \`${stage}\``)
	lines.push("")
	lines.push(
		`The cursor's spec-review track requires \`reviews.${role}\` on ${units.length} unit(s):`,
	)
	lines.push("")
	for (const u of units) lines.push(`  - \`${u}\``)
	lines.push("")
	lines.push("## What to do")
	lines.push("")
	lines.push(
		`Spawn ONE \`${role}\` review-agent subagent (single Task call). The subagent's prompt:`,
	)
	lines.push("")
	lines.push("```")
	lines.push(
		`Read your mandate at plugin/studios/<studio>/stages/${stage}/review-agents/${role}.md. Then read each unit spec via haiku_unit_read for the listed units: ${units.join(", ")}. For each unit, evaluate whether the spec aligns with the intent and the upstream stage outputs. If you find a substantive issue, file feedback via haiku_feedback (origin: "adversarial-review", source_ref: "${role}", target_unit: "<unit>", target_invalidates: ["${role}"]). After reviewing all listed units, stamp reviews.${role} on each by calling haiku_run_next — the engine sees you've finished and stamps the sigs. Terminate with a one-line summary of findings.`,
	)
	lines.push("```")
	lines.push("")
	lines.push(
		`When the review-agent terminates, call \`haiku_run_next { intent: "${slug}" }\`. The cursor will route to the next missing review role, or to the user gate if all configured agents have signed.`,
	)

	return lines.join("\n")
})

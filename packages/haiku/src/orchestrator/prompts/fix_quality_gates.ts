// orchestrator/prompts/fix_quality_gates.ts — Quality-gate failure
// fixup loop. Lists the failures and instructs the agent to fix +
// retry. Adversarial review re-runs after gates pass.
//
// Two failure shapes the agent encounters here:
//
//   1. The gate's COMMAND is right but the production code is wrong.
//      Fix the code (Edit on the unit's outputs), commit, retry.
//
//   2. The gate DEFINITION is wrong — typo in the command, library
//      API drifted, YAML serialization mangled the inline syntax. In
//      this case the gate itself needs editing. Pre-2026-05-07 the
//      forward-only lifecycle blocked `haiku_unit_set` on completed
//      units, so the agent had no engine-side path and had to fall
//      back to "edit the file outside Claude Code." That trap is
//      gone: `quality_gates` is now lifecycle-mutable on completed
//      units (see haiku_unit_set handler), so the fix below is
//      always available.

import { definePromptBuilder } from "./define.js"

export default definePromptBuilder(({ slug, action }) => {
	const stage = (action.stage as string) || ""
	const stageHint = stage ? `, stage: "${stage}"` : ""
	return [
		`## Quality Gates Failed`,
		``,
		action.message || "No details provided.",
		``,
		`### Instructions`,
		``,
		`Decide which failure shape this is, then act:`,
		``,
		`**Shape 1 — code issue:** the gate command is correct, the production code under \`outputs:\` is wrong. Edit the source files, commit, then call \`haiku_run_next { intent: "${slug}" }\`. The engine re-runs the gates.`,
		``,
		`**Shape 2 — gate definition issue:** the gate's \`command\` is broken (typo, library API change, YAML serialization mangling, command targets a path that no longer exists, etc.). Fix the gate definition itself with \`haiku_unit_set { intent: "${slug}"${stageHint}, unit: "<unit>", field: "quality_gates", value: [{name: "...", command: "...", dir?: "..."}, ...] }\`. \`quality_gates\` is lifecycle-mutable on completed units precisely so this path stays open. Then call \`haiku_run_next\`.`,
		``,
		`Do NOT edit the unit's .md file directly — the workflow-fields hook blocks generic Read/Write/Edit on units, and the engine wouldn't recognize the change anyway. Use \`haiku_unit_set\`.`,
	].join("\n")
})

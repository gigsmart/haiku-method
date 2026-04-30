// orchestrator/prompts/intent_completion_review.ts — Studio-level
// review pass that fires once after the final stage gate passes.
// Spawns one subagent per studio review-agent in parallel; findings
// are logged at intent scope (no stage). The pre-tick triage gate
// relocates any misplaced findings via `haiku_feedback_move`.

import { getCapabilities } from "../../harness.js"
import { readStudioReviewAgentPaths } from "../../studio-reader.js"
import {
	batchDispatchDirective,
	buildInterpretationBlock,
	emitSubagentDispatchBlock,
	inlineFile,
	readInterpretation,
	resolveReviewAgentModel,
} from "./_helpers.js"
import { definePromptBuilder } from "./define.js"

export default definePromptBuilder(({ slug, studio, action }) => {
	const agents = (action.agents as string[]) || []
	const agentPaths = readStudioReviewAgentPaths(studio)
	const sections: string[] = []

	sections.push(
		[
			`## Intent-Completion Review: ${slug}`,
			"",
			`All stages for intent **${slug}** have passed their gates. Before opening the final human approval gate, the studio-level review agents audit the whole-intent artifacts against studio-wide standards (cross-stage consistency, brand, tokens, architecture patterns, etc.).`,
			"",
			"### Review Agent Fan-Out (REQUIRED)",
			"",
			`**Spawn exactly one subagent per review agent in parallel — no duplicates.** Findings are logged at **intent scope** (stage omitted) via \`haiku_feedback\`. After every agent completes, call \`haiku_run_next { intent: "${slug}" }\` — the workflow will dispatch the studio fix-hat loop against any findings, or open the final gate if the review is clean.`,
		].join("\n"),
	)

	for (const name of agents) {
		const mandatePath = agentPaths[name]
		if (!mandatePath) continue
		const interpretation = readInterpretation(mandatePath)
		const interpretiveBlock = buildInterpretationBlock(interpretation)
		const reviewLines: string[] = [
			`You are the **${name}** studio-level review agent for intent "${slug}".`,
			"",
			"## Required context (inlined below)",
			"Your review mandate is embedded in this prompt. You audit the WHOLE intent — every stage's artifacts — against the studio's standards.",
			"",
			inlineFile(mandatePath, `Mandate: ${name}`),
		]
		if (interpretiveBlock) {
			reviewLines.push("", interpretiveBlock)
		}
		reviewLines.push(
			"",
			"## Write scope (STRICT)",
			"**You MUST NOT write, edit, or create any file.** Your ONLY output channel is the `haiku_feedback` MCP tool. If you're tempted to fix an issue yourself, log it as feedback instead. Any file write is a scope violation.",
			"",
			"## Scope routing",
			"Log every finding at intent scope — omit `stage` when calling `haiku_feedback`. The pre-tick triage gate is the single point where cross-stage findings get relocated to the right stage via `haiku_feedback_move`. Do NOT pre-classify with a stage hint.",
			"",
			"## Instructions",
			"",
			`1. Read the intent artifacts across every stage: \`.haiku/intents/${slug}/stages/*/\` and \`.haiku/intents/${slug}/knowledge/\`.`,
			"2. Review through your mandate's lens.",
			`3. For each issue you find, call \`haiku_feedback({ intent: "${slug}", title: "<short>", body: "<full with file:line refs>", origin: "studio-review", author: "${name}" })\`. Omit \`stage\` to log at intent scope.`,
			"4. Return only a summary count of how many findings you logged.",
		)
		const prompt = reviewLines.join("\n")
		const studioReviewModel = resolveReviewAgentModel({
			mandatePath,
			studio,
		})
		sections.push(
			`${emitSubagentDispatchBlock({
				unit: `studio-review-${slug}`,
				hat: name,
				bolt: 1,
				agentType: "general-purpose",
				model: studioReviewModel,
				promptBody: prompt,
				heading: `#### Subagent: \`${name}\``,
			})}\n`,
		)
	}

	const icrBgLine = getCapabilities().subagents.backgroundSpawn
		? ' Each `<subagent>` carries `background="true"` — pass `run_in_background: true` to the Task tool so the parent thread stays responsive while review agents run.'
		: ""
	sections.push(
		[
			"### Parent Instructions (do NOT include in subagent prompts)",
			"",
			`Spawn review subagents using the \`prompt_file\` attribute. They persist findings directly via \`haiku_feedback\` at intent scope.${icrBgLine}`,
			"",
			batchDispatchDirective(agents.length, "studio-level review agents"),
			"",
			`After every agent returns, call \`haiku_run_next { intent: "${slug}" }\`.`,
		].join("\n"),
	)

	return sections.join("\n\n")
})

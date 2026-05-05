// orchestrator/prompts/review.ts — Adversarial review for a stage.
// Spawns one subagent per review-agent in parallel, with cross-stage
// includes (review-agents-include on STAGE.md) merged in. Conditional
// review filters by `applies_to:` against the stage's artifacts.

import { join } from "node:path"
import { getMainlineBranch } from "../../git-worktree.js"
import { getCapabilities } from "../../harness.js"
import { findHaikuRoot, isGitRepo } from "../../state-tools.js"
import {
	filterReviewAgentsByScope,
	readReviewAgentPaths,
	readStageDef,
} from "../../studio-reader.js"
import {
	batchDispatchDirective,
	buildInterpretationBlock,
	emitSubagentDispatchBlock,
	inlineFile,
	readInterpretation,
	resolveStudioMandateModel,
} from "./_helpers.js"
import { definePromptBuilder } from "./define.js"
import { WORKFLOW_CONTRACTS_REVIEW_BLOCK } from "./WORKFLOW_CONTRACTS_REVIEW_BLOCK.js"

export default definePromptBuilder(({ slug, studio, action }) => {
	const stage = action.stage as string
	const sections: string[] = []

	sections.push(WORKFLOW_CONTRACTS_REVIEW_BLOCK)

	// Collect agent name → mandate FILE PATH.
	let agentPaths: Record<string, string> = readReviewAgentPaths(studio, stage)

	// Cross-stage includes (review-agents-include on STAGE.md).
	{
		const stageDef = readStageDef(studio, stage)
		if (
			stageDef?.data?.["review-agents-include"] &&
			Array.isArray(stageDef.data["review-agents-include"])
		) {
			const includes = stageDef.data["review-agents-include"] as Array<{
				stage: string
				agents: string[]
			}>
			for (const inc of includes) {
				if (!(inc.stage && Array.isArray(inc.agents))) continue
				const crossPaths = readReviewAgentPaths(studio, inc.stage)
				for (const agentName of inc.agents) {
					if (crossPaths[agentName] && !agentPaths[agentName]) {
						agentPaths[`${agentName} (from ${inc.stage})`] =
							crossPaths[agentName]
					}
				}
			}
		}
	}

	// Conditional review: skip agents whose `applies_to:` doesn't match
	// any artifact this stage produces.
	agentPaths = filterReviewAgentsByScope(
		agentPaths,
		join(findHaikuRoot(), "intents", slug, "stages", stage, "artifacts"),
		{ studio, stage },
	)

	sections.push(`## Adversarial Review: ${stage}`)

	if (Object.keys(agentPaths).length > 0) {
		sections.push(
			"### Review Agent Fan-Out (REQUIRED)\n\n**Spawn exactly one subagent per review agent in parallel — no duplicates.** Each `<subagent>` block below is a complete prompt — relay verbatim. Prompts are path-based so the parent context stays small.\n",
		)
		for (const [name, mandatePath] of Object.entries(agentPaths)) {
			const interpretation = readInterpretation(mandatePath)
			const interpretiveBlock = buildInterpretationBlock(interpretation)
			const reviewLines: string[] = [
				`You are the **${name}** review agent for stage "${stage}" of intent "${slug}".`,
				"",
				"## Required context (inlined below)",
				"Your review mandate is embedded in this prompt.",
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
				"## Instructions",
				"",
				"1. Use your mandate (above) as the lens for this review.",
			)
			let reviewStep = 2
			if (isGitRepo()) {
				reviewLines.push(
					`${reviewStep++}. Run \`git diff ${getMainlineBranch()}...HEAD\` to get the current diff for this stage.`,
				)
			}
			reviewLines.push(
				`${reviewStep++}. Read the stage's output artifacts in \`.haiku/intents/${slug}/stages/${stage}/\` (types vary — use the appropriate tool for each file).`,
				`${reviewStep++}. Review through your mandate's lens.`,
				`${reviewStep++}. For each issue you find, call \`haiku_feedback({ intent: "${slug}", stage: "${stage}", title: "<short title>", body: "<full description with file:line refs>", origin: "adversarial-review", author: "${name}" })\`.`,
				`${reviewStep++}. Return only a summary count of how many findings you logged.`,
			)
			const prompt = reviewLines.join("\n")
			const reviewAgentModel = resolveStudioMandateModel({
				mandatePath,
				studio,
				stage,
			})
			sections.push(
				`${emitSubagentDispatchBlock({
					unit: `review-${stage}`,
					hat: name,
					bolt: 1,
					agentType: "general-purpose",
					model: reviewAgentModel,
					promptBody: prompt,
					heading: `#### Subagent: \`${name}\``,
				})}\n`,
			)
		}
	}

	const reviewBgLine = getCapabilities().subagents.backgroundSpawn
		? ' Each `<subagent>` carries `background="true"` — pass `run_in_background: true` to the Task tool so the parent thread stays responsive while review agents run.'
		: ""
	sections.push(
		[
			"### Parent Instructions (do NOT include in subagent prompts)",
			"",
			`Spawn review subagents using the \`prompt_file\` attribute — pass \`"Read <prompt_file> and execute its instructions exactly."\` as the spawn prompt. They persist findings directly via haiku_feedback.${reviewBgLine}`,
			"",
			batchDispatchDirective(Object.keys(agentPaths).length, "review agents"),
			"",
			`After all review agents complete, call \`haiku_run_next { intent: "${slug}" }\`.`,
		].join("\n"),
	)

	return sections.join("\n\n")
})

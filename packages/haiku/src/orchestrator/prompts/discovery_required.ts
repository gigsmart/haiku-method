// orchestrator/prompts/discovery_required.ts — Per-unit, per-agent
// discovery dispatch.
//
// Cursor returns `discovery_required { stage, agent, units: [name] }`
// when the next unit on the active stage is missing a discovery
// record (`fm.discovery[<agent>].at`) for a required discovery agent.
// The agent dispatches a single subagent against the named template;
// the subagent writes its artifact, calls
// `haiku_record_agent_write`, and the next tick re-walks. The
// cursor will keep emitting `discovery_required` for each missing
// (unit, agent) pair until every required record exists.
//
// This is distinct from `discovery_missing`, which is a validator
// surface (location-on-disk check) raised by the elaborate handler.

import { join } from "node:path"
import { resolvePluginRoot } from "../../config.js"
import { readStageArtifactDefs } from "../../studio-reader.js"
import {
	emitSubagentDispatchBlock,
	inlineFile,
	resolveStudioMandateModel,
} from "./_helpers.js"
import { definePromptBuilder } from "./define.js"

export default definePromptBuilder(({ slug, studio, action }) => {
	const stage = (action.stage as string) || ""
	const agent = (action.agent as string) || ""
	const units = (action.units as string[]) || []
	const unit = units[0] || ""

	const defs = readStageArtifactDefs(studio, stage).filter(
		(d) => d.kind === "discovery",
	)
	const def = defs.find((d) => d.name === agent)

	const lines: string[] = []
	lines.push(`# Discovery required: \`${agent}\` on \`${unit}\``)
	lines.push("")
	lines.push(
		`Stage \`${stage}\` declares discovery agent \`${agent}\`. Unit \`${unit}\` has no \`fm.discovery.${agent}.at\` record yet. Run the agent before any execute hat dispatches.`,
	)
	lines.push("")

	if (!def) {
		lines.push(
			`The studio configuration is missing the template file for discovery agent \`${agent}\`. Fix the studio configuration; this should never reach the agent in a healthy intent.`,
		)
		return lines.join("\n")
	}

	const templatePath = `plugin/studios/${studio}/stages/${stage}/discovery/${agent}.md`
	const promptBody = [
		`You are the **${agent}** discovery agent for unit \`${unit}\` in stage \`${stage}\` of intent "${slug}".`,
		"",
		"## Required context (inlined below)",
		`Your discovery template is embedded in this prompt. The artifact you produce becomes a knowledge input for every execute hat that runs against this unit.`,
		"",
		inlineFile(templatePath, `Template: ${agent}`),
		"",
		"## Output target",
		`Write your artifact to \`${def.location}\`. The path is relative to the intent root (\`.haiku/intents/${slug}/\`).`,
		"",
		"## Recording the write",
		`After the file lands, call \`haiku_record_agent_write { intent: "${slug}", stage: "${stage}", unit: "${unit}", agent: "${agent}" }\`. The engine stamps \`fm.discovery.${agent}.at\` on the unit and the next cursor tick will either dispatch the next missing discovery agent or move on to the execute wave.`,
		"",
		"## Write scope",
		`The discovery artifact at \`${def.location}\` is your only file write. Do NOT touch unit specs, feedback, or stage state.`,
	].join("\n")

	lines.push("## What to do")
	lines.push("")
	lines.push(
		`Spawn one subagent for the \`${agent}\` discovery template against unit \`${unit}\`.`,
	)
	lines.push("")
	const discoveryMandatePath = join(
		resolvePluginRoot(),
		"studios",
		studio,
		"stages",
		stage,
		"discovery",
		`${agent}.md`,
	)
	const discoveryModel = resolveStudioMandateModel({
		mandatePath: discoveryMandatePath,
		studio,
		stage,
	})
	lines.push(
		emitSubagentDispatchBlock({
			unit,
			hat: agent,
			bolt: 1,
			agentType: "general-purpose",
			model: discoveryModel,
			promptBody,
			heading: `### Subagent: \`${agent}\``,
		}),
	)
	lines.push("")
	lines.push(
		`When the subagent returns, call \`haiku_run_next { intent: "${slug}" }\`. The cursor will dispatch the next missing (unit, agent) pair, or — once every required record is on disk — move on to the execute wave.`,
	)
	return lines.join("\n")
})

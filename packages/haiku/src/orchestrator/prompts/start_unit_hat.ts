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
//
// Model routing — mirrors start_unit.ts and start_feedback_hat.ts.
// Cascade: unit > hat > stage > studio. When a unit was rejected and
// the model_original/model fields got bumped (haiku→sonnet→opus), the
// per-unit value is at the top of the cascade so the escalated tier
// gets picked up on the next bolt automatically. Pre-fix this batch
// dispatch emitted no `model` annotation, so the parent fell back to
// inheriting the parent model — typically Opus, which made the unit
// cascade cosmetic only.

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import matter from "gray-matter"
import { features } from "../../config.js"
import { type ModelTier, resolveModel } from "../../model-selection.js"
import { stageDir } from "../../state-tools.js"
import { readHatDefs, readStageDef, readStudio } from "../../studio-reader.js"
import { definePromptBuilder } from "./define.js"
import { WORKFLOW_CONTRACTS_ANNOUNCEMENT_BLOCK } from "./WORKFLOW_CONTRACTS_ANNOUNCEMENT_BLOCK.js"

/** Resolve the model for the wave's hat dispatch. Multi-unit waves
 *  may carry different per-unit `model:` overrides — most commonly,
 *  one unit was rejected and escalated to opus while siblings stayed
 *  at sonnet. We resolve per-unit so the parent can pass the right
 *  tier per Task call; the wire format below emits a `Model:` row per
 *  unit in the dispatch instruction. */
function resolveUnitModel(opts: {
	slug: string
	stage: string
	studio: string
	hat: string
	unit: string
	hatModel?: string
	stageDefault?: string
	studioDefault?: string
}): ModelTier | undefined {
	if (!features.modelSelection) return undefined
	const { slug, stage, unit, hatModel, stageDefault, studioDefault } = opts
	let unitModel: string | undefined
	const unitPath = join(stageDir(slug, stage), "units", `${unit}.md`)
	if (existsSync(unitPath)) {
		try {
			const raw = readFileSync(unitPath, "utf8")
			unitModel = (matter(raw).data as { model?: string }).model
		} catch {
			/* swallow */
		}
	}
	return resolveModel({
		unit: unitModel,
		hat: hatModel,
		stage: stageDefault,
		studio: studioDefault,
	}).model
}

export default definePromptBuilder(({ slug, studio, action }) => {
	const stage = (action.stage as string) || ""
	const hat = (action.hat as string) || ""
	const units = (action.units as string[]) || []
	const terminal = (action.terminal as boolean) || false

	if (units.length === 0) {
		return `## start_unit_hat: no units\n\nThe cursor returned start_unit_hat with an empty units list. Call \`haiku_run_next { intent: "${slug}" }\` to retick — likely a transient mid-wave noop misclassified.`
	}

	// Resolve the model per-unit so escalated units in the wave get
	// the bumped tier while siblings keep the studio default.
	const hatDef = stage ? readHatDefs(studio, stage)?.[hat] : undefined
	const stageDef = stage ? readStageDef(studio, stage) : undefined
	const studioData = readStudio(studio)
	const perUnitModel = new Map<string, ModelTier | undefined>()
	for (const u of units) {
		perUnitModel.set(
			u,
			resolveUnitModel({
				slug,
				stage,
				studio,
				hat,
				unit: u,
				hatModel: hatDef?.model,
				stageDefault: stageDef?.data?.default_model as string | undefined,
				studioDefault: studioData?.data?.default_model as string | undefined,
			}),
		)
	}
	const someResolved = Array.from(perUnitModel.values()).some(Boolean)

	const lines: string[] = []
	lines.push(`# Dispatch hat \`${hat}\` for stage \`${stage}\``)
	lines.push("")
	lines.push(
		`The cursor identified ${units.length} unit(s) ready for the \`${hat}\` hat:`,
	)
	lines.push("")
	for (const u of units) {
		const m = perUnitModel.get(u)
		lines.push(`  - \`${u}\`${m ? ` _(model: ${m})_` : ""}`)
	}
	lines.push("")
	if (someResolved) {
		lines.push(
			"**Per-unit model:** spawn each Task with `model: \"<tier>\"` matching the parenthetical above. Units that escalated after a prior reject (haiku→sonnet→opus) carry their bumped tier in the unit FM, so the wave's slowest member doesn't drag everyone up. Omit the `model` arg only when no tier is shown above.",
		)
		lines.push("")
	}
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

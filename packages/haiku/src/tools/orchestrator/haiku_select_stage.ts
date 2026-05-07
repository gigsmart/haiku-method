// tools/orchestrator/haiku_select_stage.ts — Pick the single stage
// for a quick-mode intent. Mirrors haiku_select_studio /
// haiku_select_mode's three-resolution-path shape.
//
// FIRES WHEN: mode is `quick` and `stages` is empty. derive-state
// routes to the `select_stage` workflow state, the agent calls this
// tool. Quick mode is single-stage by definition — exactly one stage
// is chosen from the studio's stage list and written as
// `stages: [<stage>]`. Refuses the call if mode != quick (to avoid
// an agent setting stages on a non-quick intent and amputating the
// workflow accidentally).

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { ensureOnStageBranch } from "../../git-worktree.js"
import { resolveStudioStages } from "../../orchestrator.js"
import { runPicker } from "../../server/picker.js"
import {
	HAIKU_SELECT_STAGE_INPUT_SCHEMA,
	type HaikuSelectStageInput,
	validateHaikuSelectStageInputSchema,
} from "../../state/schemas/index.js"
import {
	jsonSchemaOf,
	validateToolInput,
} from "../../state/schemas/inputs/_validate.js"
import {
	findHaikuRoot,
	gitCommitState,
	parseFrontmatter,
	setFrontmatterField,
} from "../../state-tools.js"
import { emitTelemetry } from "../../telemetry.js"
import { defineTool } from "../define.js"
import { withAnnouncement } from "./_announce.js"
import { text } from "./_text.js"

function readFrontmatter(filePath: string): Record<string, unknown> {
	if (!existsSync(filePath)) return {}
	const raw = readFileSync(filePath, "utf8")
	const { data } = parseFrontmatter(raw)
	return data
}

export default defineTool({
	name: "haiku_select_stage",
	description:
		"Select the single stage for a quick-mode intent. Pass the intent slug and optionally a list with one stage name to auto-select. Otherwise opens a SPA picker and blocks on the user's choice. Refuses if the intent's mode is not 'quick' or if a stage is already set.",
	inputSchema: jsonSchemaOf(HAIKU_SELECT_STAGE_INPUT_SCHEMA),
	async handle(args, signal) {
		const inputErr = validateToolInput(
			args,
			validateHaikuSelectStageInputSchema,
			"haiku_select_stage",
		)
		if (inputErr) return inputErr
		const validated = args as HaikuSelectStageInput
		const slug = validated.intent
		const root = findHaikuRoot()
		const iDir = join(root, "intents", slug)
		const intentFile = join(iDir, "intent.md")

		if (!existsSync(intentFile)) {
			return text(
				JSON.stringify({
					error: "not_found",
					message: `Intent '${slug}' not found`,
				}),
			)
		}

		const intentFm = readFrontmatter(intentFile)
		const studio = (intentFm.studio as string) || ""
		if (!studio) {
			return text(
				JSON.stringify({
					error: "studio_not_selected",
					message: `Intent '${slug}' has no studio selected. Call haiku_select_studio first.`,
				}),
			)
		}
		const mode = ((intentFm.mode as string) || "").toLowerCase()
		if (mode !== "quick") {
			return text(
				JSON.stringify({
					error: "mode_not_quick",
					message: `haiku_select_stage only applies to quick-mode intents (intent '${slug}' is in '${mode || "(none)"}' mode). Non-quick modes get the studio's full stage list set automatically by haiku_select_mode.`,
				}),
			)
		}
		const existingStages = (intentFm.stages as unknown[]) || []
		if (Array.isArray(existingStages) && existingStages.length > 0) {
			return text(
				JSON.stringify({
					error: "stage_already_set",
					message: `Intent '${slug}' already has stages set (${JSON.stringify(existingStages)}). Reset the intent if you need to pick a different stage.`,
				}),
			)
		}

		const studioStages = resolveStudioStages(studio)
		if (studioStages.length === 0) {
			return {
				content: [
					{
						type: "text" as const,
						text: `Studio '${studio}' has no stages.`,
					},
				],
				isError: true,
			}
		}

		const optionsRaw = validated.options ?? []
		// Map any case variants to the canonical stage names.
		const options = optionsRaw
			.map((o) => studioStages.find((s) => s.toLowerCase() === o.toLowerCase()))
			.filter((s): s is string => !!s)

		if (options.length > 1) {
			return text(
				JSON.stringify({
					error: "single_stage_required",
					message: `haiku_select_stage requires zero or one option (quick mode is single-stage). Got ${options.length}: [${options.join(", ")}].`,
				}),
			)
		}

		let chosenStage = ""
		if (options.length === 1) {
			chosenStage = options[0]
		} else {
			const result = await runPicker({
				intentSlug: slug,
				kind: "stage",
				title: `Pick the single stage for "${slug}"`,
				prompt: `Quick mode runs exactly one stage from the ${studio} studio.`,
				options: studioStages.map((s) => ({ id: s, label: s })),
				signal,
			})
			if (result.timedOut || !result.selection) {
				return text(
					JSON.stringify({
						action: "cancelled",
						message: withAnnouncement(
							"Stage picker timed out without a selection.",
							"Ask the user how they'd like to proceed — retry the picker or abandon this intent.",
						),
					}),
				)
			}
			chosenStage = result.selection.id
		}

		if (!studioStages.includes(chosenStage)) {
			return {
				content: [
					{
						type: "text" as const,
						text: `Stage '${chosenStage}' is not in studio '${studio}'. Available: ${studioStages.join(", ")}.`,
					},
				],
				isError: true,
			}
		}

		const guard = ensureOnStageBranch(slug, undefined)
		if (!guard.ok) {
			return {
				content: [
					{
						type: "text" as const,
						text: `Error: branch enforcement failed after stage selection for intent '${slug}' — ${guard.message}. Resolve manually and retry.`,
					},
				],
				isError: true,
			}
		}

		setFrontmatterField(intentFile, "stages", [chosenStage])
		gitCommitState(
			`haiku: select stage ${chosenStage} for quick intent ${slug}`,
		)
		emitTelemetry("haiku.stage.selected", {
			intent: slug,
			stage: chosenStage,
			studio,
		})

		return text(
			JSON.stringify(
				{
					action: "stage_selected",
					intent: slug,
					stage: chosenStage,
					stages: [chosenStage],
					message: withAnnouncement(
						`The user picked the **${chosenStage}** stage for quick intent "${slug}".`,
						`Call haiku_run_next { intent: "${slug}" } to continue.`,
					),
				},
				null,
				2,
			),
		)
	},
})

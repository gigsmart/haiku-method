// tools/orchestrator/haiku_select_studio.ts — Pick a studio for an
// intent.
//
// Refuses if the intent has already entered any stage. Two
// resolution paths:
//   1. Single explicit option → auto-select.
//   2. Otherwise → open the SPA picker and block on the user's
//      choice. Picker is the ONLY interactive path (2026-05-07);
//      MCP elicitation has been removed entirely.
//
// On selection, writes studio to intent.md and re-enforces the
// branch guard. Studio is locked once written — every other tool
// that mutates intent state refuses to change it.

import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { ensureOnStageBranch } from "../../git-worktree.js"
import { resolveStudioStages } from "../../orchestrator.js"
import { runPicker } from "../../server/picker.js"
import {
	HAIKU_SELECT_STUDIO_INPUT_SCHEMA,
	type HaikuSelectStudioInput,
	validateHaikuSelectStudioInputSchema,
} from "../../state/schemas/index.js"
import {
	jsonSchemaOf,
	validateToolInput,
} from "../../state/schemas/inputs/_validate.js"
import {
	findHaikuRoot,
	gitCommitState,
	readJson,
	setFrontmatterField,
} from "../../state-tools.js"
import { listStudios, resolveStudio } from "../../studio-reader.js"
import { emitTelemetry } from "../../telemetry.js"
import { defineTool } from "../define.js"
import { withAnnouncement } from "./_announce.js"
import { text } from "./_text.js"

export default defineTool({
	name: "haiku_select_studio",
	description:
		"Select a studio for an intent. Pass the intent slug and optionally a list of studio names to limit the selection. If only one option is provided, auto-selects it. Otherwise opens a SPA picker and blocks on the user's selection. Refuses if the intent has already entered a stage. The studio is locked once written — it cannot be changed later.",
	inputSchema: jsonSchemaOf(HAIKU_SELECT_STUDIO_INPUT_SCHEMA),
	async handle(args, signal) {
		const inputErr = validateToolInput(
			args,
			validateHaikuSelectStudioInputSchema,
			"haiku_select_studio",
		)
		if (inputErr) return inputErr
		const validated = args as HaikuSelectStudioInput
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

		// Refuse if intent has entered any stage.
		const stagesDir = join(iDir, "stages")
		if (existsSync(stagesDir)) {
			for (const entry of readdirSync(stagesDir, { withFileTypes: true })) {
				if (!entry.isDirectory()) continue
				const statePath = join(stagesDir, entry.name, "state.json")
				if (existsSync(statePath)) {
					const state = readJson(statePath)
					if (state.status && state.status !== "pending") {
						return {
							content: [
								{
									type: "text" as const,
									text: "Cannot change studio after intent has entered a stage. Studio is locked at start.",
								},
							],
							isError: true,
						}
					}
				}
			}
		}

		const allStudios = listStudios()
		if (allStudios.length === 0) {
			return {
				content: [{ type: "text" as const, text: "No studios available." }],
				isError: true,
			}
		}

		const options = validated.options ?? []
		let selectedStudio = ""

		// Path 1: single option → auto-select.
		if (options.length === 1) {
			const resolved = resolveStudio(options[0])
			if (!resolved) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Studio '${options[0]}' not found. Available: ${allStudios.map((s) => s.name).join(", ")}`,
						},
					],
					isError: true,
				}
			}
			selectedStudio = resolved.dir
		} else {
			// Path 2: open SPA picker. Map any pre-filtered options to
			// canonical names; if none provided (or the filter narrows
			// to zero valid studios), present every studio.
			const mappedOptions = options
				.map((o) => resolveStudio(o))
				.filter((s): s is NonNullable<typeof s> => s !== null)
				.map((s) => s.name)
			const presentNames =
				mappedOptions.length === 0
					? allStudios.map((s) => s.name)
					: mappedOptions
			const pickerOptions = allStudios
				.filter((s) => presentNames.includes(s.name))
				.map((s) => ({
					id: s.dir,
					label: s.name,
					description: s.description ?? "",
				}))

			const result = await runPicker({
				intentSlug: slug,
				kind: "studio",
				title: `Pick a studio for "${slug}"`,
				prompt:
					"Studios are locked once chosen — pick the lifecycle that matches the work. You can adjust the mode mid-flight, but not the studio.",
				options: pickerOptions,
				signal,
			})

			if (result.timedOut || !result.selection) {
				return text(
					JSON.stringify({
						action: "cancelled",
						message: withAnnouncement(
							"Studio picker timed out without a selection.",
							"Ask the user how they'd like to proceed — retry the picker or abandon the intent.",
						),
					}),
				)
			}
			selectedStudio = result.selection.id
		}

		if (!selectedStudio) {
			return {
				content: [{ type: "text" as const, text: "No studio selected." }],
				isError: true,
			}
		}

		// Re-enforce branch after the picker session — user may have
		// flipped checkouts while the picker was open.
		const postStudioGuard = ensureOnStageBranch(slug, undefined)
		if (!postStudioGuard.ok) {
			return {
				content: [
					{
						type: "text" as const,
						text: `Error: branch enforcement failed after studio selection for intent '${slug}' — ${postStudioGuard.message}. Resolve manually and retry.`,
					},
				],
				isError: true,
			}
		}

		const allStudioStages = resolveStudioStages(selectedStudio)
		setFrontmatterField(intentFile, "studio", selectedStudio)
		gitCommitState(`haiku: select studio ${selectedStudio} for intent ${slug}`)
		emitTelemetry("haiku.studio.selected", {
			intent: slug,
			studio: selectedStudio,
		})

		return text(
			JSON.stringify(
				{
					action: "studio_selected",
					intent: slug,
					studio: selectedStudio,
					all_studio_stages: allStudioStages,
					message: withAnnouncement(
						`The user selected the **${selectedStudio}** studio for "${slug}". Studio is now locked.`,
						`Continue the tick — the engine will drive the next selection (mode, then stage if quick) automatically.`,
					),
				},
				null,
				2,
			),
		)
	},
})

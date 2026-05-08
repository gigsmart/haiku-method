// tools/orchestrator/haiku_select_mode.ts — Pick a mode for an
// intent. Two paths:
//   1. Single explicit option → auto-select.
//   2. Otherwise → open the SPA picker and block on the user's
//      choice. MCP elicitation has been removed (2026-05-07).
//
// Mode is engine-managed. The agent never types `mode: <value>` into
// any frontmatter writer — the value flows through this picker tool
// only. /haiku:start drives a fresh selection; /haiku:change-mode
// drives a mid-flight change against an already-started intent.
//
// Side effects:
//   - Writes `mode` to intent.md.
//   - For non-quick modes, ALSO writes `stages` to the studio's full
//     stage list (engine-derived, never agent-set). This is what
//     makes the next derive-state tick fall through to
//     `intent_review` instead of dead-ending on `select_stage`.
//   - For quick mode, leaves `stages` empty so the workflow routes
//     to `select_stage` next.
//
// Constraints when called against an already-started intent
// (active_stage set):
//   - Cannot transition INTO quick (would amputate later stages).
//   - Cannot transition OUT OF quick (would suddenly add stages
//     mid-flight, the inverse problem).
// The picker hides `quick` from the option list under those
// constraints.

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { ensureOnStageBranch } from "../../git-worktree.js"
import { resolveStudioStages } from "../../orchestrator.js"
import { runPicker } from "../../server/picker.js"
import {
	HAIKU_SELECT_MODE_INPUT_SCHEMA,
	type HaikuSelectModeInput,
	validateHaikuSelectModeInputSchema,
} from "../../state/schemas/index.js"
import {
	jsonSchemaOf,
	validateToolInput,
} from "../../state/schemas/inputs/_validate.js"
import { INTENT_MODES } from "../../state/schemas/intent.js"
import {
	deleteFrontmatterFields,
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

const MODE_DESCRIPTIONS: Record<string, string> = {
	continuous:
		"You're in chat for every stage gate. Best for first-time use or work you want to steer.",
	discrete:
		"Each stage opens a real GitHub PR / GitLab MR. Merging the PR is your approval signal.",
	autopilot:
		"Agent runs the whole pipeline. Only the pre-intent review and the final delivery PR require human attention.",
	"discrete-hybrid":
		"Continuous within most stages, but specific stages declared with external review still pop a per-stage PR.",
	quick:
		"Single stage only. Operates like continuous but the workflow runs exactly one studio stage and stops. Not changeable mid-flight.",
}

export default defineTool({
	name: "haiku_select_mode",
	description:
		"Select an execution mode for an intent. Pass the intent slug and optionally a list of mode names to limit the selection. If only one option is provided, auto-selects it. Otherwise opens a SPA picker and blocks on the user's selection. Side effects: writes `mode` to intent.md; for non-quick modes also writes `stages` (the studio's full stage list). For quick mode, leaves `stages` empty so the workflow routes to select_stage next. Refuses transitions into or out of `quick` once the intent has started a stage.",
	inputSchema: jsonSchemaOf(HAIKU_SELECT_MODE_INPUT_SCHEMA),
	async handle(args, signal) {
		const inputErr = validateToolInput(
			args,
			validateHaikuSelectModeInputSchema,
			"haiku_select_mode",
		)
		if (inputErr) return inputErr
		const validated = args as HaikuSelectModeInput
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
		const currentMode = ((intentFm.mode as string) || "").toLowerCase()
		const activeStage = (intentFm.active_stage as string) || ""
		const intentStarted = !!activeStage

		// Filter the mode option list:
		//   - Drop `quick` once the intent has started a stage (can't
		//     amputate or grow mid-flight).
		//   - Drop `discrete-hybrid` from the user-facing picker since
		//     it's a derived/virtual mode — the engine computes hybrid
		//     behavior from `continuous` + per-stage external gates.
		const allModes = INTENT_MODES.filter((m) => m !== "discrete-hybrid")
		const modesAvailable = allModes.filter((m) => {
			if (m === "quick") return !intentStarted
			if (currentMode === "quick" && intentStarted) return false
			return true
		})

		if (modesAvailable.length === 0) {
			return text(
				JSON.stringify({
					error: "no_modes_available",
					message: `Intent '${slug}' is in mode '${currentMode}' and has started — no other mode is reachable from here without resetting.`,
				}),
			)
		}

		const optionsRaw = validated.options ?? []
		const options = optionsRaw.map((o) => o.toLowerCase())

		if (options.length > 0) {
			const invalid = options.filter(
				(o) => !modesAvailable.includes(o as (typeof modesAvailable)[number]),
			)
			if (invalid.length > 0) {
				return text(
					JSON.stringify({
						error: "invalid_mode_options",
						message: `Mode option(s) [${invalid.join(", ")}] are not available for intent '${slug}'. Available: ${modesAvailable.join(", ")}.`,
					}),
				)
			}
		}

		let chosenMode = ""
		if (options.length === 1) {
			chosenMode = options[0]
		} else {
			const presentModes =
				options.length === 0
					? [...modesAvailable]
					: (options as typeof modesAvailable)
			const pickerOptions = presentModes.map((m) => ({
				id: m,
				label: m,
				description: MODE_DESCRIPTIONS[m] ?? m,
			}))
			const result = await runPicker({
				intentSlug: slug,
				kind: "mode",
				title: intentStarted
					? `Change mode for "${slug}"`
					: `Pick a mode for "${slug}"`,
				prompt: intentStarted
					? "You can adjust the mode mid-flight; in-flight stages keep their current shape until the next gate."
					: "Modes change how often the engine pauses for you. You can adjust this later, but the studio stays locked.",
				options: pickerOptions,
				signal,
			})
			if (result.timedOut || !result.selection) {
				return text(
					JSON.stringify({
						action: "cancelled",
						message: withAnnouncement(
							"Mode picker timed out without a selection.",
							"Ask the user how they'd like to proceed — retry the picker or abandon this intent.",
						),
					}),
				)
			}
			chosenMode = result.selection.id
		}

		chosenMode = chosenMode.toLowerCase()
		if (
			!modesAvailable.includes(chosenMode as (typeof modesAvailable)[number])
		) {
			return {
				content: [
					{
						type: "text" as const,
						text: `Selected mode '${chosenMode}' is not available for intent '${slug}'. Available: ${modesAvailable.join(", ")}.`,
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
						text: `Error: branch enforcement failed after mode selection for intent '${slug}' — ${guard.message}. Resolve manually and retry.`,
					},
				],
				isError: true,
			}
		}

		setFrontmatterField(intentFile, "mode", chosenMode)
		if (chosenMode === "quick") {
			deleteFrontmatterFields(intentFile, ["stages"])
		} else {
			const studioStages = resolveStudioStages(studio)
			setFrontmatterField(intentFile, "stages", studioStages)
		}

		gitCommitState(`haiku: select mode ${chosenMode} for intent ${slug}`)
		emitTelemetry("haiku.mode.selected", {
			intent: slug,
			mode: chosenMode,
			previous_mode: currentMode || "(none)",
			intent_started: String(intentStarted),
		})

		return text(
			JSON.stringify(
				{
					action: "mode_selected",
					intent: slug,
					mode: chosenMode,
					previous_mode: currentMode || null,
					message:
						chosenMode === "quick"
							? withAnnouncement(
									`The user picked **quick** mode for "${slug}".`,
									`Call haiku_run_next { intent: "${slug}" } — the engine will open the stage picker next.`,
								)
							: withAnnouncement(
									`The user picked **${chosenMode}** mode for "${slug}"${currentMode && currentMode !== chosenMode ? ` (was ${currentMode})` : ""}.`,
									`Call haiku_run_next { intent: "${slug}" } to continue.`,
								),
				},
				null,
				2,
			),
		)
	},
})

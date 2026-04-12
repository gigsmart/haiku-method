// enforce-iteration — Stop hook for H·AI·K·U
//
// Rescue mechanism when the execution loop exits unexpectedly.
// Determines the appropriate action:
// 1. Work remains (units ready or in progress): instruct agent to call /haiku:execute
// 2. All complete: intent is done
// 3. Truly blocked: alert the user

import { basename, join } from "node:path"
import {
	checkIntentCriteria,
	findActiveIntent,
	findUnitFiles,
	getCurrentBranch,
	isUnitBranch,
	readFrontmatterField,
	readJson,
	setFrontmatterField,
} from "./utils.js"

function out(s: string): void {
	process.stdout.write(`${s}\n`)
}

export async function enforceIteration(
	_input: Record<string, unknown>,
	_pluginRoot: string,
): Promise<void> {
	const currentBranch = getCurrentBranch()
	const onUnitBranch = isUnitBranch(currentBranch)

	// Find active intent
	const intentDir = findActiveIntent()

	// Unit-branch sessions should NOT be told to /haiku:execute
	if (onUnitBranch) {
		out("## H\u00b7AI\u00b7K\u00b7U: Unit Session Ending")
		out("")
		out("Ensure you committed changes and saved progress.")
		return
	}

	if (!intentDir) {
		// No H·AI·K·U state - not using the methodology, skip
		return
	}

	// Read state from the new model: intent frontmatter + stage state.json + unit frontmatter
	const intentFile = `${intentDir}/intent.md`
	const intentStatus = readFrontmatterField(intentFile, "status")
	const activeStage = readFrontmatterField(intentFile, "active_stage")

	// If no active stage, no state to enforce
	if (!activeStage) return

	// Read stage state for phase info
	const stageState = readJson(
		join(intentDir, "stages", activeStage, "state.json"),
	)
	const stageStatus = (stageState.status as string) ?? ""

	// Find the active unit to get hat and bolt
	const unitFiles = findUnitFiles(intentDir)
	let hat = ""
	let bolt = 1
	let activeUnitName = ""
	for (const uf of unitFiles) {
		const uStatus = readFrontmatterField(uf, "status")
		if (uStatus === "active") {
			hat = readFrontmatterField(uf, "hat") || "builder"
			bolt = Number(readFrontmatterField(uf, "bolt") || "1")
			activeUnitName = basename(uf, ".md")
			break
		}
	}
	if (!hat) hat = "builder"

	// If task is already complete, don't enforce iteration
	if (intentStatus === "completed" || stageStatus === "completed") {
		return
	}

	// Get intent slug and check DAG status
	const intentSlug = basename(intentDir)
	let readyCount = 0
	let inProgressCount = 0
	let allComplete = false

	{
		let pending = 0
		let completed = 0
		let blocked = 0

		for (const uf of unitFiles) {
			const unitStatus = readFrontmatterField(uf, "status") || "pending"
			switch (unitStatus) {
				case "completed":
					completed++
					break
				case "active":
				case "in_progress":
					inProgressCount++
					break
				case "blocked":
					blocked++
					break
				case "pending": {
					// Check if dependencies are satisfied to determine if "ready"
					pending++
					readyCount++ // simplified: count pending as ready for now
					break
				}
				default:
					pending++
					break
			}
		}

		if (
			readyCount === 0 &&
			inProgressCount === 0 &&
			pending === 0 &&
			blocked === 0 &&
			unitFiles.length > 0
		) {
			allComplete = true
		}
		// Also mark complete if all are completed
		if (completed > 0 && completed === unitFiles.length) {
			allComplete = true
		}
	}

	out("")
	out("---")
	out("")

	if (allComplete) {
		// Auto-reconcile: if all units complete but intent not marked completed
		if (intentStatus === "active") {
			setFrontmatterField(intentFile, "status", "completed")
			checkIntentCriteria(intentDir)
		}
		out("## H\u00b7AI\u00b7K\u00b7U: All Units Complete")
		out("")
		out("All units have been completed. Intent has been marked as completed.")
		out("")
	} else if (readyCount > 0 || inProgressCount > 0) {
		// Work remains - instruct agent to continue
		out("## H\u00b7AI\u00b7K\u00b7U: Session Exhausted - Continue Execution")
		out("")
		out(`**Bolt:** ${bolt} | **Hat:** ${hat} | **Stage:** ${activeStage}`)
		out(`**Ready units:** ${readyCount} | **In progress:** ${inProgressCount}`)
		out("")
		out("### ACTION REQUIRED")
		out("")
		if (activeUnitName) {
			out(
				`Call \`/haiku:execute ${intentSlug} ${activeUnitName}\` to continue targeted execution.`,
			)
		} else {
			out("Call `/haiku:execute` to continue the autonomous loop.")
		}
		out("")
		out("**Note:** Subagents have clean context. No `/clear` needed.")
		out("")
	} else {
		// Truly blocked - human must intervene
		out("## H\u00b7AI\u00b7K\u00b7U: BLOCKED - Human Intervention Required")
		out("")
		out(`**Bolt:** ${bolt} | **Hat:** ${hat} | **Stage:** ${activeStage}`)
		out("")
		out("No units are ready to work on. All remaining units are blocked.")
		out("")
		out("**User action required:**")
		out(
			`1. Review blockers: read \`.haiku/intents/${intentSlug}/state/blockers.md\``,
		)
		out("2. Unblock units or resolve dependencies")
		out("3. Run `/haiku:execute` to resume")
		out("")
	}

	out(`Progress preserved in \`.haiku/intents/${intentSlug}/\`.`)
}

// enforce-iteration — Stop hook for H·AI·K·U
//
// Rescue mechanism when the execution loop exits unexpectedly.
// Determines the appropriate action:
// 1. Work remains (units ready or in progress): instruct agent to call /haiku:execute
// 2. All complete: intent is done
// 3. Truly blocked: alert the user

import {
	findActiveIntent,
	stateLoad,
	stateSave,
	isUnitBranch,
	getCurrentBranch,
	isValidJson,
	readFrontmatterField,
	setFrontmatterField,
	findUnitFiles,
	checkIntentCriteria,
} from "./utils.js"
import { basename } from "node:path"

function out(s: string): void {
	process.stdout.write(s + "\n")
}

export async function enforceIteration(_input: Record<string, unknown>, _pluginRoot: string): Promise<void> {
	const currentBranch = getCurrentBranch()
	const onUnitBranch = isUnitBranch(currentBranch)

	// Load iteration state from filesystem
	const intentDir = findActiveIntent()
	let iterationJson = ""
	if (intentDir) {
		iterationJson = stateLoad(intentDir, "iteration.json")
	}

	// Unit-branch sessions should NOT be told to /haiku:execute
	if (onUnitBranch) {
		out("## H\u00b7AI\u00b7K\u00b7U: Unit Session Ending")
		out("")
		out("Ensure you committed changes and saved progress.")
		return
	}

	if (!iterationJson) {
		// No H·AI·K·U state - not using the methodology, skip
		return
	}

	if (!isValidJson(iterationJson)) {
		return
	}

	const state = JSON.parse(iterationJson) as Record<string, unknown>
	const status = (state.status as string) ?? "active"
	const currentIteration = Number(state.iteration ?? 1)
	const hat = (state.hat as string) ?? "builder"
	const maxIterations = Number(state.maxIterations ?? 0)
	const targetUnit = (state.targetUnit as string) ?? ""

	// If task is already complete, don't enforce iteration
	if (status === "complete" || status === "completed") {
		return
	}

	// Check if iteration limit exceeded
	if (maxIterations > 0 && currentIteration >= maxIterations) {
		out("")
		out("---")
		out("")
		out("## H\u00b7AI\u00b7K\u00b7U: ITERATION LIMIT REACHED")
		out("")
		out(`**Iteration:** ${currentIteration} / ${maxIterations} (max)`)
		out(`**Hat:** ${hat}`)
		out("")
		out("The maximum iteration limit has been reached. This is a safety mechanism")
		out("to prevent infinite loops.")
		out("")
		out("**Options:**")
		out("1. Review progress and decide if work is complete")
		out("2. Increase limit: edit `.haiku/intents/{intent-slug}/state/iteration.json` and set maxIterations")
		out("3. Reset iteration count: `/haiku:reset` and start fresh")
		out("")
		out("Progress preserved in `.haiku/intents/{intent-slug}/state/`.")
		return
	}

	// Get intent slug and check DAG status
	const intentSlug = intentDir ? basename(intentDir) : ""
	let readyCount = 0
	let inProgressCount = 0
	let allComplete = false

	if (intentSlug && intentDir) {
		const unitFiles = findUnitFiles(intentDir)
		let pending = 0
		let completed = 0
		let blocked = 0

		for (const uf of unitFiles) {
			const unitStatus = readFrontmatterField(uf, "status") || "pending"
			switch (unitStatus) {
				case "completed":
					completed++
					break
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

		if (readyCount === 0 && inProgressCount === 0 && pending === 0 && blocked === 0 && unitFiles.length > 0) {
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
		if (intentDir) {
			const intentFile = `${intentDir}/intent.md`
			const intentStatus = readFrontmatterField(intentFile, "status")
			if (intentStatus === "active") {
				setFrontmatterField(intentFile, "status", "completed")
				checkIntentCriteria(intentDir)
				// Update iteration.json status
				if (iterationJson) {
					const updatedState = { ...state, status: "completed" }
					stateSave(intentDir, "iteration.json", JSON.stringify(updatedState))
				}
			}
		}
		out("## H\u00b7AI\u00b7K\u00b7U: All Units Complete")
		out("")
		out("All units have been completed. Intent has been marked as completed.")
		out("")
	} else if (readyCount > 0 || inProgressCount > 0) {
		// Work remains - instruct agent to continue
		out("## H\u00b7AI\u00b7K\u00b7U: Session Exhausted - Continue Execution")
		out("")
		out(`**Iteration:** ${currentIteration} | **Hat:** ${hat}`)
		out(`**Ready units:** ${readyCount} | **In progress:** ${inProgressCount}`)
		out("")
		out("### ACTION REQUIRED")
		out("")
		if (targetUnit) {
			out(`Call \`/haiku:execute ${intentSlug} ${targetUnit}\` to continue targeted execution.`)
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
		out(`**Iteration:** ${currentIteration} | **Hat:** ${hat}`)
		out("")
		out("No units are ready to work on. All remaining units are blocked.")
		out("")
		out("**User action required:**")
		out(`1. Review blockers: read \`.haiku/intents/${intentSlug}/state/blockers.md\``)
		out("2. Unblock units or resolve dependencies")
		out("3. Run `/haiku:execute` to resume")
		out("")
	}

	out(`Progress preserved in \`.haiku/intents/${intentSlug}/state/\`.`)
}

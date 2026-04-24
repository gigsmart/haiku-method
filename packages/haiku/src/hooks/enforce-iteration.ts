// enforce-iteration — Stop hook for H·AI·K·U
//
// Secondary guard for the "parent stops after subagent returns" bug.
// When the parent agent tries to end but the active stage still has work,
// emit a blocking JSON decision and push the agent back into the FSM.
//
// Behavior:
//   - stop_hook_active retry -> no-op (prevents infinite loops)
//   - SubagentStop event     -> no-op (subagents must return so parent can drive)
//   - Unit-branch session    -> no-op (also a subagent signal, belt-and-suspenders)
//   - No active intent       -> no-op (user isn't in a managed flow)
//   - Intent paused          -> no-op (explicit user pause)
//   - Stage/intent completed -> no-op
//   - Stage blocked          -> no-op
//   - Awaiting external      -> no-op (PR/MR merge, external gate, await event)
//   - In gate/gate_review    -> no-op (human approval wait)
//   - No ready+in-progress   -> no-op (truly stuck; human must intervene)
//   - Work remains           -> BLOCK and inject `haiku_run_next` instruction
//
// The injected reason tells the parent to call `haiku_run_next` and follow
// the returned action — NOT to stop until the FSM advances past the stage.
//
// Legitimate wait states MUST be detected first — otherwise a stage sitting
// in `external_review` or `ask` gate would loop forever with the hook trying
// to force a run_next call while the FSM correctly refuses to advance.

import { existsSync, readdirSync } from "node:fs"
import { basename, join } from "node:path"
import {
	checkIntentCriteria,
	findActiveIntent,
	getCurrentBranch,
	isUnitBranch,
	readFrontmatterField,
	readJson,
	setFrontmatterField,
} from "./utils.js"

function emitBlock(reason: string): void {
	process.stdout.write(JSON.stringify({ decision: "block", reason }))
}

function findUnitFilesInStage(intentDir: string, stage: string): string[] {
	const unitsDir = join(intentDir, "stages", stage, "units")
	if (!existsSync(unitsDir)) return []
	return readdirSync(unitsDir)
		.filter((f) => f.startsWith("unit-") && f.endsWith(".md"))
		.map((f) => join(unitsDir, f))
}

export async function enforceIteration(
	input: Record<string, unknown>,
	_pluginRoot: string,
): Promise<void> {
	// Retry guard: if we already blocked once this turn, let the agent stop.
	if (input.stop_hook_active === true || input.stop_hook_active === "true") {
		return
	}

	// SubagentStop fires the same hook — subagents MUST be allowed to return so
	// the parent can call haiku_run_next. Only block on parent Stop.
	if (input.hook_event_name === "SubagentStop") return

	// Belt-and-suspenders: unit-branch sessions are subagent sessions.
	if (isUnitBranch(getCurrentBranch())) return

	const intentDir = findActiveIntent()
	if (!intentDir) return

	const intentFile = `${intentDir}/intent.md`
	const intentStatus = readFrontmatterField(intentFile, "status")
	const activeStage = readFrontmatterField(intentFile, "active_stage")

	if (intentStatus === "completed" || intentStatus === "paused") return
	if (!activeStage) return

	const stageState = readJson(
		join(intentDir, "stages", activeStage, "state.json"),
	)
	const stageStatus = (stageState.status as string) ?? ""
	if (stageStatus === "completed" || stageStatus === "blocked") return

	// Legitimate wait states — FSM correctly refuses to advance and a blocking
	// loop here would spin forever against the user. Detect and allow stop.
	const phase = (stageState.phase as string) ?? ""
	if (phase === "gate" || phase === "gate_review") return

	// Awaiting external review (PR/MR merge, external gate system).
	if (stageState.external_review_url) return

	// Await gate — external event signal (customer response, pipeline, etc.).
	if (stageStatus === "awaiting_external" || stageStatus === "awaiting") return

	// Count unit states in the ACTIVE stage only. Prior stages' completed units
	// and future stages' pending units must not influence this decision.
	const unitFiles = findUnitFilesInStage(intentDir, activeStage)

	let readyCount = 0
	let inProgressCount = 0
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
			default:
				readyCount++
				break
		}
	}

	const intentSlug = basename(intentDir)
	const allUnitsDone =
		unitFiles.length > 0 &&
		completed === unitFiles.length &&
		readyCount === 0 &&
		inProgressCount === 0 &&
		blocked === 0

	// All stage units done — reconcile intent state if needed and allow stop.
	// The agent is expected to have called haiku_run_next already; if not, the
	// NEXT prompt will surface the pending phase/stage transition.
	if (allUnitsDone) {
		if (intentStatus === "active") {
			checkIntentCriteria(intentDir)
		}
		return
	}

	// Nothing to drive forward (no ready, no in-progress) — human must unblock.
	// Don't force a loop; let the agent stop so the user sees the blockers.
	if (readyCount === 0 && inProgressCount === 0) return

	// Work remains in the active stage. Block the stop and push back into FSM.
	const reason = [
		`H·AI·K·U: stage '${activeStage}' is not complete.`,
		`Intent '${intentSlug}' has ${inProgressCount} unit(s) in progress and ${readyCount} ready.`,
		`Call \`haiku_run_next { intent: "${intentSlug}" }\` now and follow the returned action.`,
		"Drive forward on every subagent return — do NOT stop until the FSM advances past this stage.",
	].join(" ")

	emitBlock(reason)

	// Mark intent as still active if it drifted.
	if (intentStatus !== "active") {
		setFrontmatterField(intentFile, "status", "active")
	}

	// Report the iteration miss to Sentry so we can track how often the
	// primary drive-forward mechanism (FSM Result relay → run_next) fails
	// and the Stop hook has to rescue the loop. High miss counts signal
	// the MCP-level pattern needs tightening. Best-effort; never blocks.
	try {
		const { reportError } = await import("../sentry.js")
		reportError(
			new Error(
				`enforce-iteration rescue: stop intercepted with work remaining in stage '${activeStage}'`,
			),
			{
				intent: intentSlug,
				stage: activeStage,
				in_progress: String(inProgressCount),
				ready: String(readyCount),
				blocked: String(blocked),
				completed: String(completed),
			},
		)
	} catch {
		/* best-effort telemetry */
	}
}

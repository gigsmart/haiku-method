// quality-gate — Stop/SubagentStop hook for H·AI·K·U quality gates
//
// Reads quality_gates from intent.md and current unit frontmatter,
// runs each gate command, and blocks the agent from stopping if any fail.
// Gates are only enforced for building hats (builder, implementer, refactorer).

import { execSync } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"
import {
	findActiveIntent,
	readFrontmatterField,
	readFrontmatterArray,
	readJson,
	getRepoRoot,
} from "./utils.js"

interface GateResult {
	name: string
	command: string
	exit_code: number
	output: string
}

/**
 * Find the first active unit file in a stage's units/ directory.
 * Returns the full path to the unit file, or null if none found.
 */
function findActiveUnitInStage(intentDir: string, stage: string): string | null {
	const unitsDir = join(intentDir, "stages", stage, "units")
	if (!existsSync(unitsDir)) return null
	for (const file of readdirSync(unitsDir)) {
		if (file.startsWith("unit-") && file.endsWith(".md")) {
			const filePath = join(unitsDir, file)
			const status = readFrontmatterField(filePath, "status")
			if (status === "active") return filePath
		}
	}
	return null
}

export async function qualityGate(input: Record<string, unknown>, _pluginRoot: string): Promise<void> {
	// Early exit: stop_hook_active guard
	// When a Stop hook blocks the agent, the harness retries with stop_hook_active=true.
	// Exit 0 on retry to avoid infinite loops.
	if (input.stop_hook_active === true || input.stop_hook_active === "true") {
		return
	}

	// Early exit: no active intent
	const intentDir = findActiveIntent()
	if (!intentDir) return

	// Read state from the new model: intent frontmatter + stage state.json + unit frontmatter
	const intentFile = `${intentDir}/intent.md`
	const intentStatus = readFrontmatterField(intentFile, "status")
	const activeStage = readFrontmatterField(intentFile, "active_stage")

	// Early exit: no active stage means no active work
	if (!activeStage) return

	// Read stage state
	const stageState = readJson(join(intentDir, "stages", activeStage, "state.json"))
	const stageStatus = (stageState.status as string) ?? ""

	// Early exit: completed or blocked intent/stage
	if (intentStatus === "completed" || stageStatus === "completed" || stageStatus === "blocked") return

	// Find the active unit and read its hat
	const activeUnitFile = findActiveUnitInStage(intentDir, activeStage)
	const hat = activeUnitFile ? readFrontmatterField(activeUnitFile, "hat") : ""

	// Early exit: non-building hat
	if (!["builder", "implementer", "refactorer"].includes(hat)) return

	// Load quality gates from intent and active unit
	const intentGates = readFrontmatterArray(intentFile, "quality_gates")

	let unitGates: Array<Record<string, string>> = []
	if (activeUnitFile) {
		unitGates = readFrontmatterArray(activeUnitFile, "quality_gates")
	}

	// Merge gates additively
	const allGates = [...intentGates, ...unitGates]
	if (allGates.length === 0) return

	const repoRoot = getRepoRoot()
	const failures: GateResult[] = []
	let allPassed = true

	for (let i = 0; i < allGates.length; i++) {
		const gate = allGates[i]
		const gateName = gate.name ?? `gate-${i}`
		const gateCmd = gate.command ?? ""

		if (!gateCmd) continue

		// Resolve cwd: use gate.dir (relative to repo root) if specified, else repo root
		const cwd = gate.dir ? resolve(repoRoot, gate.dir) : repoRoot

		let gateOutput = ""
		let gateExit = 0

		try {
			gateOutput = execSync(gateCmd, {
				cwd,
				encoding: "utf8",
				timeout: 30000,
				stdio: ["pipe", "pipe", "pipe"],
			})
		} catch (err: unknown) {
			const execErr = err as { status?: number; stdout?: string; stderr?: string }
			gateExit = execErr.status ?? 1
			gateOutput = (execErr.stdout ?? "") + (execErr.stderr ?? "")
		}

		if (gateExit !== 0) {
			allPassed = false
			// Truncate output to 500 characters
			const truncatedOutput = gateOutput.slice(0, 500)
			failures.push({
				name: gateName,
				command: gateCmd,
				exit_code: gateExit,
				output: truncatedOutput,
			})
		}
	}

	// All passed - allow stop
	if (allPassed) return

	// Build failure reason string
	let reason = "Quality gate(s) failed:"
	for (const f of failures) {
		reason += `\n- ${f.name}: command '${f.command}' exited ${f.exit_code}`
		if (f.output) {
			reason += `, output: ${f.output}`
		}
	}

	// Output blocking JSON
	const response = { decision: "block", reason }
	process.stdout.write(JSON.stringify(response))
}

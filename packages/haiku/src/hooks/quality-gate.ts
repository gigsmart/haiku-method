// quality-gate — Stop/SubagentStop hook for H·AI·K·U quality gates
//
// Reads quality_gates from intent.md and current unit frontmatter,
// runs each gate command, and blocks the agent from stopping if any fail.
// Gates are only enforced for building hats (builder, implementer, refactorer).

import { execSync } from "node:child_process"
import { existsSync } from "node:fs"
import {
	findActiveIntent,
	stateLoad,
	isValidJson,
	readFrontmatterArray,
	getRepoRoot,
} from "./utils.js"

interface GateResult {
	name: string
	command: string
	exit_code: number
	output: string
}

function getJsonField(json: string, field: string): string {
	try {
		const obj = JSON.parse(json)
		return String(obj[field] ?? "")
	} catch {
		return ""
	}
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

	// Early exit: no iteration state
	const iterationJson = stateLoad(intentDir, "iteration.json")
	if (!iterationJson) return

	// Validate JSON
	if (!isValidJson(iterationJson)) return

	// Extract iteration fields
	const hat = getJsonField(iterationJson, "hat")
	const status = getJsonField(iterationJson, "status")
	const currentUnit = getJsonField(iterationJson, "currentUnit")

	// Early exit: non-building hat
	if (!["builder", "implementer", "refactorer"].includes(hat)) return

	// Early exit: completed or blocked status
	if (status === "completed" || status === "blocked") return

	// Load quality gates from intent and unit
	const intentGates = readFrontmatterArray(`${intentDir}/intent.md`, "quality_gates")

	let unitGates: Array<Record<string, string>> = []
	if (currentUnit) {
		const unitFile = `${intentDir}/${currentUnit}.md`
		unitGates = readFrontmatterArray(unitFile, "quality_gates")
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

		let gateOutput = ""
		let gateExit = 0

		try {
			gateOutput = execSync(gateCmd, {
				cwd: repoRoot,
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

// guard-fsm-fields — PreToolUse hook for Write/Edit
//
// Blocks direct file edits that modify FSM-controlled fields in haiku state files.
// The agent must use MCP tools (haiku_run_next, haiku_unit_start, etc.) to mutate
// lifecycle state. Direct file writes bypass the FSM and break the state machine.

import { resolve } from "node:path"

// FSM-controlled fields by file type
const INTENT_PROTECTED = ["status", "active_stage", "completed_at", "started_at"]
const STAGE_PROTECTED = ["status", "phase", "started_at", "completed_at", "gate_entered_at", "gate_outcome"]
const UNIT_PROTECTED = ["status", "started_at", "completed_at", "bolt", "hat"]

function out(s: string): void {
	process.stdout.write(s)
}

export async function guardFsmFields(input: Record<string, unknown>): Promise<void> {
	const toolName = (input.tool_name as string) || ""
	if (toolName !== "Write" && toolName !== "Edit") return

	const filePath = (input.file_path as string) || ""
	if (!filePath) return

	const absPath = resolve(process.cwd(), filePath)

	// Check if this is a haiku state file
	const isIntentFile = absPath.match(/\.haiku\/intents\/[^/]+\/intent\.md$/)
	const isStageState = absPath.match(/\.haiku\/intents\/[^/]+\/stages\/[^/]+\/state\.json$/)
	const isUnitFile = absPath.match(/\.haiku\/intents\/[^/]+\/stages\/[^/]+\/units\/[^/]+\.md$/)

	if (!isIntentFile && !isStageState && !isUnitFile) return

	// Determine what's being written
	const content = (input.content as string) || (input.new_string as string) || ""
	if (!content) return

	let protectedFields: string[]
	let fileType: string

	if (isIntentFile) {
		protectedFields = INTENT_PROTECTED
		fileType = "intent"
	} else if (isStageState) {
		protectedFields = STAGE_PROTECTED
		fileType = "stage state"
	} else {
		protectedFields = UNIT_PROTECTED
		fileType = "unit"
	}

	// Check if the content modifies protected fields
	const violations: string[] = []
	for (const field of protectedFields) {
		// Check YAML frontmatter pattern: "field: value" or JSON: "field":
		const yamlPattern = new RegExp(`^${field}:`, "m")
		const jsonPattern = new RegExp(`"${field}"\\s*:`)
		if (yamlPattern.test(content) || jsonPattern.test(content)) {
			violations.push(field)
		}
	}

	if (violations.length > 0) {
		// Block the edit
		out(`BLOCKED: Cannot directly modify FSM-controlled fields in ${fileType} files: ${violations.join(", ")}. ` +
			`Use the haiku MCP tools instead (haiku_run_next, haiku_unit_start, haiku_unit_complete, etc.). ` +
			`Direct file edits bypass the state machine and corrupt lifecycle state.`)
		process.exit(2) // Exit code 2 signals "blocked" to Claude Code
	}
}

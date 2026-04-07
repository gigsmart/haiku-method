// inject-state-file — PreToolUse hook for H·AI·K·U
//
// Injects a `state_file` argument into haiku MCP tool calls so the
// server can write session metadata without knowing about session IDs.
// The state file path is: ${CLAUDE_CONFIG_DIR}/projects/{slug}/{sessionId}/haiku.json
//
// If no session ID is available, no state_file is injected and the
// MCP server skips metadata persistence.

import { join } from "node:path"

function pathToSlug(fsPath: string): string {
	return fsPath.replace(/^\//, "-").replace(/[/.]/g, "-")
}

export async function injectStateFile(input: Record<string, unknown>): Promise<void> {
	// Only inject for haiku_ tool calls
	const toolName = (input.tool_name as string) || ""
	if (!toolName.startsWith("haiku_")) return

	// Resolve session ID
	const sessionId = (input.session_id as string) || process.env.CLAUDE_SESSION_ID
	if (!sessionId) return

	// Build the state file path
	const configDir = process.env.CLAUDE_CONFIG_DIR || join(process.env.HOME || "", ".claude")
	const projectSlug = pathToSlug(process.cwd())
	const stateFile = join(configDir, "projects", projectSlug, sessionId, "haiku.json")

	// Output the modified input with state_file injected
	// The hook system merges this into the tool call arguments
	process.stdout.write(JSON.stringify({ state_file: stateFile }))
}

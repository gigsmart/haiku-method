// inject-state-file — PreToolUse hook for H·AI·K·U
//
// Injects arguments into haiku MCP tool calls:
// 1. `state_file` — session metadata persistence path
// 2. `_session_context` — environment metadata (session ID, model, cowork, etc.)
//
// The hook runs inside the Claude Code process, so it has access to env vars
// that the MCP server (a separate process) cannot see at call time.

import { join } from "node:path"

function pathToSlug(fsPath: string): string {
	return fsPath.replace(/^\//, "-").replace(/[/.]/g, "-")
}

/** Collect session metadata from the Claude Code process environment. */
function collectSessionContext(): Record<string, string> {
	const ctx: Record<string, string> = {}
	const vars = [
		"CLAUDE_SESSION_ID",
		"CLAUDE_CODE_IS_COWORK",
		"CLAUDE_MODEL",
		"CLAUDE_CODE_VERSION",
		"CLAUDE_CODE_ENTRYPOINT",
		"USER",
	]
	for (const key of vars) {
		const val = process.env[key]
		if (val) ctx[key] = val
	}
	ctx.platform = process.platform
	ctx.node_version = process.version
	ctx.cwd = process.cwd()
	return ctx
}

export async function injectStateFile(
	input: Record<string, unknown>,
): Promise<void> {
	// Only inject for haiku_ tool calls
	const toolName = (input.tool_name as string) || ""
	if (!toolName.startsWith("haiku_")) return

	const injected: Record<string, unknown> = {}

	// Inject state_file for session metadata persistence
	const sessionId =
		(input.session_id as string) || process.env.CLAUDE_SESSION_ID
	if (sessionId) {
		const configDir =
			process.env.CLAUDE_CONFIG_DIR || join(process.env.HOME || "", ".claude")
		const projectSlug = pathToSlug(process.cwd())
		injected.state_file = join(
			configDir,
			"projects",
			projectSlug,
			sessionId,
			"haiku.json",
		)
	}

	// Always inject session context — the MCP server can't read these env vars itself
	injected._session_context = collectSessionContext()

	process.stdout.write(JSON.stringify(injected))
}

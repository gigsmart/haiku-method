// hooks/index.ts — Hook dispatch for the H·AI·K·U binary
//
// Called via: haiku hook <name>
// Hooks receive input on stdin (JSON from Claude Code hook system) and
// output to stdout (text injected into the conversation).
//
// Hooks are OPTIONAL additional safety layers for harnesses that support
// them (Claude Code). Every load-bearing enforcement has an MCP-tool
// equivalent so the system works identically on harnesses with no hooks.
//
// Each hook lives in its own file and exports a `HookDef` as default.
// This dispatcher just collects the registry and routes by name — adding
// a new hook is one new file + one entry in `HOOKS` below.

import { readFileSync } from "node:fs"
import contextMonitor from "./context-monitor.js"
import guardWorkflowFields from "./guard-workflow-fields.js"
import injectStateFile from "./inject-state-file.js"
import promptGuard from "./prompt-guard.js"
import redirectPlanMode from "./redirect-plan-mode.js"
import stampAgentWrite from "./stamp-agent-write.js"
import type { HookDef } from "./types.js"
import workflowGuard from "./workflow-guard.js"

const HOOKS: readonly HookDef[] = [
	contextMonitor,
	guardWorkflowFields,
	injectStateFile,
	promptGuard,
	redirectPlanMode,
	stampAgentWrite,
	workflowGuard,
] as const

const hookByName = new Map<string, HookDef>(HOOKS.map((h) => [h.name, h]))

// Removed hooks: hook registrations are cached in Claude Code's session
// state, so a user who updated hooks.json mid-session may still have CC
// firing these. The binary accepts them as silent no-ops so the user
// doesn't get "hook 'X' not implemented" stop-feedback errors until
// their next full CC restart reloads hooks.json.
const REMOVED_HOOKS = new Set([
	"quality-gate",
	"track-outputs",
	"ensure-deps",
	"inject-context",
	"subagent-hook",
	"subagent-context",
	"enforce-iteration",
])

// Read stdin synchronously (hooks are synchronous)
function readStdin(): string {
	try {
		return readFileSync(0, "utf8")
	} catch {
		return ""
	}
}

export async function runHook(name: string, _args: string[]): Promise<void> {
	if (REMOVED_HOOKS.has(name)) return

	const hook = hookByName.get(name)
	if (!hook) {
		console.error(`haiku: hook '${name}' not implemented`)
		process.exit(2)
	}

	const input = readStdin()
	let parsed: Record<string, unknown> = {}
	try {
		if (input.trim()) parsed = JSON.parse(input)
	} catch {
		/* stdin may not be JSON for all hooks */
	}

	// Import inline to avoid circular deps — hooks are a separate entry point.
	const { resolvePluginRoot } = await import("../config.js")
	const pluginRoot = resolvePluginRoot()

	await hook.handle(parsed, { pluginRoot })
}

/** Exported for tests — lets a unit test assert the registry is wired
 *  the same way the binary dispatcher sees it. */
export const __HOOK_REGISTRY = HOOKS

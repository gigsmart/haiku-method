// hooks/index.ts — Hook dispatch for the H·AI·K·U binary
//
// Called via: haiku hook <name>
// Hooks receive input on stdin (JSON from Claude Code hook system) and
// output to stdout (text injected into the conversation).
//
// Hooks are OPTIONAL additional safety layers for harnesses that support
// them (Claude Code). Every load-bearing enforcement has an MCP-tool
// equivalent so the system works identically on harnesses with no hooks.

import { readFileSync } from "node:fs"
import { contextMonitor } from "./context-monitor.js"
import { enforceIteration } from "./enforce-iteration.js"
import { guardFsmFields } from "./guard-fsm-fields.js"
import { injectStateFile } from "./inject-state-file.js"
import { promptGuard } from "./prompt-guard.js"
import { redirectPlanMode } from "./redirect-plan-mode.js"
import { workflowGuard } from "./workflow-guard.js"

// Read stdin synchronously (hooks are synchronous)
function readStdin(): string {
	try {
		return readFileSync(0, "utf8")
	} catch {
		return ""
	}
}

export async function runHook(name: string, _args: string[]): Promise<void> {
	const input = readStdin()
	let parsed: Record<string, unknown> = {}
	try {
		if (input.trim()) parsed = JSON.parse(input)
	} catch {
		/* stdin may not be JSON for all hooks */
	}

	// Import inline to avoid circular deps — hooks are a separate entry point
	const { resolvePluginRoot } = await import("../config.js")
	const pluginRoot = resolvePluginRoot()

	switch (name) {
		case "prompt-guard":
			await promptGuard(parsed, pluginRoot)
			break
		case "workflow-guard":
			await workflowGuard(parsed, pluginRoot)
			break
		case "redirect-plan-mode":
			await redirectPlanMode(parsed, pluginRoot)
			break
		case "context-monitor":
			await contextMonitor(parsed, pluginRoot)
			break
		case "enforce-iteration":
			await enforceIteration(parsed, pluginRoot)
			break
		case "inject-state-file":
			await injectStateFile(parsed)
			break
		case "guard-fsm-fields":
			await guardFsmFields(parsed)
			break
		default:
			console.error(`haiku: hook '${name}' not implemented`)
			process.exit(2)
	}
}

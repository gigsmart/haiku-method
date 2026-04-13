// hooks/index.ts — Hook dispatch for the H·AI·K·U binary
//
// Called via: haiku hook <name>
// Hooks receive input on stdin (JSON from Claude Code hook system)
// and output to stdout (text injected into the conversation).

import { readFileSync } from "node:fs"
import { contextMonitor } from "./context-monitor.js"
import { enforceIteration } from "./enforce-iteration.js"
import { ensureDeps } from "./ensure-deps.js"
import { guardFsmFields } from "./guard-fsm-fields.js"
import { injectContext } from "./inject-context.js"
import { injectStateFile } from "./inject-state-file.js"
import { promptGuard } from "./prompt-guard.js"
import { qualityGate } from "./quality-gate.js"
import { redirectPlanMode } from "./redirect-plan-mode.js"
import { generateSubagentContext } from "./subagent-context.js"
import { subagentHook } from "./subagent-hook.js"
import { trackOutputs } from "./track-outputs.js"
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

	const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || ""

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
		case "ensure-deps":
			await ensureDeps(parsed, pluginRoot)
			break
		case "quality-gate":
			await qualityGate(parsed, pluginRoot)
			break
		case "subagent-hook":
			await subagentHook(parsed, pluginRoot)
			break
		case "subagent-context":
			await generateSubagentContext(parsed, pluginRoot)
			break
		case "inject-context":
			await injectContext(parsed, pluginRoot)
			break
		case "inject-state-file":
			await injectStateFile(parsed)
			break
		case "guard-fsm-fields":
			await guardFsmFields(parsed)
			break
		case "track-outputs":
			await trackOutputs(parsed, pluginRoot)
			break
		default:
			// For hooks not yet ported to TypeScript, fall through
			// The shell wrapper will handle them
			console.error(
				`haiku: hook '${name}' not implemented in binary — use shell fallback`,
			)
			process.exit(2) // Exit code 2 = not handled, shell wrapper should try .sh
	}
}

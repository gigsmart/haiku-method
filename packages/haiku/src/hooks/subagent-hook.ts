// subagent-hook — PreToolUse hook for Agent|Task|Skill
//
// Injects H·AI·K·U context into subagent prompts by:
// 1. Reading the PreToolUse payload
// 2. Calling subagentContext() to generate markdown context
// 3. Wrapping context in <subagent-context> tags
// 4. Prepending to the original prompt (Agent/Task) or args (Skill)
// 5. Outputting JSON with updatedInput (no permissionDecision)
//
// Also injects permission_mode into Agent/Task tool_input when present.
// Overrides Plan subagent type to general-purpose.

import { generateSubagentContext } from "./subagent-context.js"

export async function subagentHook(input: Record<string, unknown>, pluginRoot: string): Promise<void> {
	const toolName = input.tool_name as string

	// Determine target field: prompt for Agent/Task, args for Skill
	const isAgentTool = toolName === "Agent" || toolName === "Task"
	const targetField = isAgentTool ? "prompt" : "args"

	// Extract the original tool_input and the target field value
	let toolInput = (input.tool_input ?? {}) as Record<string, unknown>
	if (!toolInput || typeof toolInput !== "object") toolInput = {}

	const originalValue = String(toolInput[targetField] ?? "")

	// For Agent/Task, skip if no prompt to inject into
	if (isAgentTool && !originalValue) return

	// Skip if context already injected
	if (originalValue.includes("<subagent-context>")) return

	// Generate context
	const contextOutput = await generateSubagentContextString(pluginRoot)

	// Extract permission_mode from hook payload (for Agent/Task only)
	const permissionMode = isAgentTool ? (input.permission_mode as string) ?? "" : ""

	// If no context and no permission_mode to inject, exit silently
	if (!contextOutput && !permissionMode) return

	// Start with the original tool_input
	let updatedInput = { ...toolInput }

	// Inject context if present
	if (contextOutput) {
		const wrappedContext = `<subagent-context>\n${contextOutput}\n</subagent-context>\n\n`
		const modifiedValue = wrappedContext + originalValue
		updatedInput[targetField] = modifiedValue
	}

	// Inject permission_mode if present (Agent/Task only)
	if (permissionMode) {
		updatedInput.mode = permissionMode
	}

	// Override Plan agent type to general-purpose
	if (isAgentTool) {
		const subagentType = (updatedInput.subagent_type as string) ?? ""
		if (subagentType === "Plan") {
			updatedInput.subagent_type = "general-purpose"
		}
	}

	// Output JSON with updatedInput - do NOT set permissionDecision
	const response = {
		hookSpecificOutput: {
			hookEventName: "PreToolUse",
			updatedInput,
		},
	}

	process.stdout.write(JSON.stringify(response))
}

/**
 * Internal wrapper that captures subagent-context output as a string.
 * The subagentContext function writes to stdout, so we capture it.
 */
async function generateSubagentContextString(pluginRoot: string): Promise<string> {
	// Capture stdout by temporarily replacing process.stdout.write
	let captured = ""
	const origWrite = process.stdout.write.bind(process.stdout)
	process.stdout.write = ((chunk: string | Buffer) => {
		captured += typeof chunk === "string" ? chunk : chunk.toString()
		return true
	}) as typeof process.stdout.write

	try {
		await generateSubagentContext({}, pluginRoot)
	} catch {
		// Ignore errors - subagent context is optional
	} finally {
		process.stdout.write = origWrite
	}

	return captured
}

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

import { getCapabilities } from "../harness.js"
import { generateSubagentContext } from "./subagent-context.js"

export async function subagentHook(
	input: Record<string, unknown>,
	pluginRoot: string,
): Promise<void> {
	const toolName = input.tool_name as string
	const caps = getCapabilities()

	// Determine if this is a subagent tool based on the active harness's tool names.
	// Claude Code: Agent, Task, Skill. Kiro: /spawn. Others may vary.
	const agentToolNames = new Set(caps.subagents.toolNames)
	const isAgentTool =
		toolName === "Agent" ||
		toolName === "Task" ||
		agentToolNames.has(toolName)
	const isSkillTool = toolName === "Skill"
	const targetField = isAgentTool ? "prompt" : isSkillTool ? "args" : "prompt"

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
	const permissionMode = isAgentTool
		? ((input.permission_mode as string) ?? "")
		: ""

	// If no context and no permission_mode to inject, exit silently
	if (!contextOutput && !permissionMode) return

	// Start with the original tool_input
	const updatedInput = { ...toolInput }

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

	// Agent selection: match the best available agent to the work domain
	// Hats define behavior (builder, reviewer); agents bring domain expertise (react-eng, go-eng)
	// A specialized agent can wear any hat — it brings expertise to the role
	if (isAgentTool) {
		const currentType = (updatedInput.subagent_type as string) ?? ""

		// Override Plan to general-purpose
		if (currentType === "Plan") {
			updatedInput.subagent_type = "general-purpose"
		}

		// If no specific agent type set, add a generic H·AI·K·U hint
		if (!currentType || currentType === "general-purpose") {
			if (!updatedInput.description) {
				updatedInput.description = "H·AI·K·U work"
			}
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
async function generateSubagentContextString(
	pluginRoot: string,
): Promise<string> {
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

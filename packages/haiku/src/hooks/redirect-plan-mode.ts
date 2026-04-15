// redirect-plan-mode — Intercept EnterPlanMode and redirect to /haiku:start
//
// Only relevant for harnesses that have an EnterPlanMode tool (Claude Code).

import { isClaudeCode } from "../harness.js"
import { skillReference } from "../harness.js"

export async function redirectPlanMode(
	input: Record<string, unknown>,
	_pluginRoot: string,
): Promise<void> {
	if (input.tool_name !== "EnterPlanMode") return

	// Only Claude Code has EnterPlanMode — other harnesses won't trigger this
	if (!isClaudeCode()) return

	const startRef = skillReference("start")
	const response = {
		hookSpecificOutput: {
			hookEventName: "PreToolUse",
			permissionDecision: "deny",
			permissionDecisionReason:
				`H·AI·K·U: Use ${startRef} instead of plan mode.\n\n` +
				"The H·AI·K·U plugin replaces Claude Code's built-in plan mode with a more comprehensive workflow:\n\n" +
				`**\`${startRef}\`** - Start a new intent that:\n` +
				"- Defines intent and success criteria collaboratively\n" +
				"- Decomposes work into independent units\n" +
				"- Creates isolated worktrees for safe iteration\n" +
				"- Sets up the execution loop with quality gates\n\n" +
				`**To start:** Run \`${startRef}\` with a description of what you want to build.`,
		},
	}

	process.stdout.write(JSON.stringify(response))
}

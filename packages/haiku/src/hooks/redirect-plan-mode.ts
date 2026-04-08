// redirect-plan-mode — Intercept EnterPlanMode and redirect to /haiku:elaborate

export async function redirectPlanMode(input: Record<string, unknown>, _pluginRoot: string): Promise<void> {
	if (input.tool_name !== "EnterPlanMode") return

	const response = {
		hookSpecificOutput: {
			hookEventName: "PreToolUse",
			permissionDecision: "deny",
			permissionDecisionReason:
				"H·AI·K·U: Use /haiku:start instead of plan mode.\n\n" +
				"The H·AI·K·U plugin replaces Claude Code's built-in plan mode with a more comprehensive workflow:\n\n" +
				"**`/haiku:start`** - Start a new intent that:\n" +
				"- Defines intent and success criteria collaboratively\n" +
				"- Decomposes work into independent units\n" +
				"- Creates isolated worktrees for safe iteration\n" +
				"- Sets up the execution loop with quality gates\n\n" +
				"**To start:** Run `/haiku:start` with a description of what you want to build.",
		},
	}

	process.stdout.write(JSON.stringify(response))
}

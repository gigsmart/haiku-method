// prompt-guard — Advisory scan for prompt injection in spec file writes

const INJECTION_PATTERNS =
	/ignore previous|disregard|override instructions|you are now|system prompt|<system>|<\/system>/i

export async function promptGuard(
	input: Record<string, unknown>,
	_pluginRoot: string,
): Promise<void> {
	const toolName = input.tool_name as string
	if (toolName !== "Write" && toolName !== "Edit") return

	const toolInput = (input.tool_input || {}) as Record<string, unknown>
	const filePath = (toolInput.file_path || "") as string
	if (!filePath.includes("/.haiku/")) return

	const content = (toolInput.content || toolInput.new_string || "") as string
	if (INJECTION_PATTERNS.test(content)) {
		process.stdout.write(
			`⚠️ PROMPT GUARD: Potential injection pattern detected in spec file write to ${filePath}\nReview the content before proceeding.\n`,
		)
	}
}

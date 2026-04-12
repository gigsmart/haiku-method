// workflow-guard — Warn when editing files outside active H·AI·K·U hat context

import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"

function findActiveIntent(): string | null {
	const intentsDir = join(process.cwd(), ".haiku", "intents")
	if (!existsSync(intentsDir)) return null
	const dirs = readdirSync(intentsDir).filter((d) =>
		existsSync(join(intentsDir, d, "intent.md")),
	)
	return dirs.length === 1 ? join(intentsDir, dirs[0]) : null
}

export async function workflowGuard(
	input: Record<string, unknown>,
	_pluginRoot: string,
): Promise<void> {
	const toolName = input.tool_name as string
	if (toolName !== "Write" && toolName !== "Edit") return

	const intentDir = findActiveIntent()
	if (!intentDir) return // No active intent, no guard

	const toolInput = (input.tool_input || {}) as Record<string, unknown>
	const filePath = (toolInput.file_path || "") as string
	if (filePath.includes("/.haiku/")) return // .haiku files are expected

	// Check if there's an active unit with a hat — if not, warn
	// With the new state model, hat is in unit frontmatter
	// For now, just warn if editing outside .haiku without an active intent stage
	process.stdout.write(
		`⚠️ WORKFLOW GUARD: Editing ${filePath} — ensure this is within an active hat's scope.\n`,
	)
}

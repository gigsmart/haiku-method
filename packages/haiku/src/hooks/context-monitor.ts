// context-monitor — Warn at context budget thresholds
//
// Fires on PostToolUse. Checks remaining context capacity and
// injects warnings at 35% and 25% remaining.
// Uses debouncing to avoid spamming: only warns once per threshold per session.

import { existsSync, readFileSync, appendFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export async function contextMonitor(input: Record<string, unknown>, _pluginRoot: string): Promise<void> {
	const totalTokens = Number(input.total_tokens ?? 0)
	const maxTokens = Number(input.max_tokens ?? 0)

	// Skip if we can't determine usage
	if (totalTokens === 0 || maxTokens === 0) return

	// Calculate remaining percentage
	const remaining = Math.floor(((maxTokens - totalTokens) * 100) / maxTokens)

	// Debounce file
	const sessionId = process.env.CLAUDE_SESSION_ID ?? "unknown"
	const debounceFile = join("/tmp", `context-monitor-${sessionId}`)

	let debounceContent = ""
	if (existsSync(debounceFile)) {
		debounceContent = readFileSync(debounceFile, "utf8")
	}

	if (remaining <= 25) {
		if (!debounceContent.includes("25")) {
			appendFileSync(debounceFile, "25\n")
			process.stderr.write(
				`\u26a0\ufe0f CONTEXT CRITICAL (\u226425% remaining)\n\n` +
				`**You MUST:**\n` +
				`1. Commit all working changes NOW\n` +
				`2. Save state to \`.haiku/intents/{intent-slug}/state/\`\n` +
				`3. Complete current task or signal handoff\n` +
				`4. Do NOT start new tasks\n\n` +
				`Quality degrades severely at low context. Wrap up.\n`
			)
			process.exit(2)
		}
	} else if (remaining <= 35) {
		if (!debounceContent.includes("35")) {
			appendFileSync(debounceFile, "35\n")
			process.stderr.write(
				`\u26a0\ufe0f CONTEXT WARNING (\u226435% remaining)\n\n` +
				`**Recommended:**\n` +
				`- Finish current task, avoid starting new ones\n` +
				`- Commit working changes frequently\n` +
				`- Consider saving state for session handoff\n` +
				`- Keep responses concise\n`
			)
			process.exit(2)
		}
	}
}

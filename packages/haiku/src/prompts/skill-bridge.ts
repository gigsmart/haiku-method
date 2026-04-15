// prompts/skill-bridge.ts — Bridge skills to MCP prompts for non-Claude harnesses
//
// Claude Code has native skill support (plugin/skills/*/SKILL.md). For other
// harnesses that support MCP prompts but not skills, this module reads all
// SKILL.md files and registers them as MCP prompts so they surface as
// invocable actions (slash commands in Gemini CLI, prompt UI in Cursor, etc.).
//
// This module is loaded conditionally — only when the active harness lacks
// native skill support.

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import type { GetPromptResult } from "@modelcontextprotocol/sdk/types.js"
import { registerPrompt } from "./index.js"

interface SkillFrontmatter {
	name: string
	description: string
}

function parseFrontmatter(content: string): {
	data: SkillFrontmatter
	body: string
} {
	const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
	if (!match) return { data: { name: "", description: "" }, body: content }

	const fmBlock = match[1]
	const body = match[2]

	const data: Record<string, string> = {}
	for (const line of fmBlock.split("\n")) {
		const kv = line.match(/^(\w+):\s*(.+)$/)
		if (kv) data[kv[1]] = kv[2].trim()
	}

	return {
		data: {
			name: data.name || "",
			description: data.description || "",
		},
		body: body.trim(),
	}
}

/**
 * Read all SKILL.md files from plugin/skills/ and register them as MCP prompts.
 *
 * Each skill becomes a prompt named `haiku:{skillname}` with:
 * - The skill description as the prompt description
 * - An optional `args` argument for passing parameters
 * - A handler that returns the SKILL.md body as the prompt content
 */
export function registerSkillPrompts(): number {
	const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || ""
	if (!pluginRoot) {
		console.error("[haiku] CLAUDE_PLUGIN_ROOT not set — cannot bridge skills")
		return 0
	}

	const skillsDir = join(pluginRoot, "skills")
	if (!existsSync(skillsDir)) {
		console.error(`[haiku] Skills directory not found: ${skillsDir}`)
		return 0
	}

	let count = 0
	const entries = readdirSync(skillsDir, { withFileTypes: true })

	for (const entry of entries) {
		if (!entry.isDirectory()) continue

		const skillFile = join(skillsDir, entry.name, "SKILL.md")
		if (!existsSync(skillFile)) continue

		const raw = readFileSync(skillFile, "utf8")
		const { data, body } = parseFrontmatter(raw)

		const skillName = data.name || entry.name
		const promptName = `haiku:${skillName}`

		registerPrompt({
			name: promptName,
			title: `H·AI·K·U: ${skillName}`,
			description:
				data.description ||
				`Run the H·AI·K·U ${skillName} workflow`,
			arguments: [
				{
					name: "args",
					description:
						"Optional arguments to pass to the skill (e.g., intent slug, unit name)",
					required: false,
				},
			],
			handler: async (
				args: Record<string, string>,
			): Promise<GetPromptResult> => {
				const userArgs = args.args || ""
				const content = userArgs
					? `${body}\n\n---\n\n**User arguments:** ${userArgs}`
					: body

				return {
					description: `H·AI·K·U ${skillName} workflow`,
					messages: [
						{
							role: "user",
							content: {
								type: "text",
								text: content,
							},
						},
					],
				}
			},
		})

		count++
	}

	// Register a startup/status prompt that replaces the inject-context SessionStart hook.
	// For hookless harnesses, the agent has no automatic context injection on session start.
	// This prompt gives the agent a way to discover active H·AI·K·U work.
	registerPrompt({
		name: "haiku:status",
		title: "H·AI·K·U: Check active work",
		description:
			"Check for active H·AI·K·U intents and get your current action. " +
			"Call this at the start of every session to resume in-progress work.",
		arguments: [],
		handler: async (): Promise<GetPromptResult> => {
			return {
				description: "Check for active H·AI·K·U work",
				messages: [
					{
						role: "user",
						content: {
							type: "text",
							text:
								"Check if there is active H·AI·K·U work in this project.\n\n" +
								"1. Call `haiku_dashboard` to see all intents and their status\n" +
								"2. If there is an active intent, call `haiku_run_next { intent: \"<slug>\" }` to get your current action\n" +
								"3. If no active intents exist, let me know — I can start one with `haiku:start`\n\n" +
								"Do this silently — just check and report what you find.",
						},
					},
				],
			}
		},
	})
	count++

	if (count > 0) {
		console.error(
			`[haiku] Registered ${count} skill(s) as MCP prompts (harness lacks native skill support)`,
		)
	}

	return count
}

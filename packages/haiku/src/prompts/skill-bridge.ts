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
import { resolvePluginRoot } from "../config.js"
import { parseFrontmatter } from "../state-tools.js"
import { registerPrompt } from "./index.js"

/**
 * Read all SKILL.md files from plugin/skills/ and register them as MCP prompts.
 * Also registers `haiku:status` unconditionally for session resumption.
 */
export function registerSkillPrompts(): number {
	let count = 0

	// Always register the status prompt — valuable for session resumption
	// regardless of whether skill files are present.
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
								'2. If there is an active intent, call `haiku_run_next { intent: "<slug>" }` to get your current action\n' +
								"3. If no active intents exist, let me know — I can start one with `haiku:start`\n\n" +
								"Do this silently — just check and report what you find.",
						},
					},
				],
			}
		},
	})
	count++

	// Bridge skills from plugin/skills/ to MCP prompts
	const pluginRoot = resolvePluginRoot()
	if (!pluginRoot) {
		console.error(
			`[haiku] Registered ${count} prompt(s) (plugin root not found — skills not bridged)`,
		)
		return count
	}

	const skillsDir = join(pluginRoot, "skills")
	if (!existsSync(skillsDir)) {
		console.error(
			`[haiku] Registered ${count} prompt(s) (skills dir not found — skills not bridged)`,
		)
		return count
	}

	const entries = readdirSync(skillsDir, { withFileTypes: true })

	for (const entry of entries) {
		if (!entry.isDirectory()) continue

		const skillFile = join(skillsDir, entry.name, "SKILL.md")
		if (!existsSync(skillFile)) continue

		const raw = readFileSync(skillFile, "utf8")
		const { data, body } = parseFrontmatter(raw)

		const skillName = (data.name as string) || entry.name
		const skillDesc = (data.description as string) || ""
		const promptName = `haiku:${skillName}`

		registerPrompt({
			name: promptName,
			title: `H·AI·K·U: ${skillName}`,
			description: skillDesc || `Run the H·AI·K·U ${skillName} workflow`,
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

	if (count > 0) {
		console.error(
			`[haiku] Registered ${count} prompt(s) as MCP prompts (harness lacks native skill support)`,
		)
	}

	return count
}

// inject-context — SessionStart hook for H·AI·K·U
//
// Reads haiku.json from the Claude session directory for instant context.
// Falls back to .haiku/ filesystem scan when no cache exists.
// The pre_tool_use hook injects state_file into MCP tool calls so the
// server writes metadata there without knowing about sessions.

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import matter from "gray-matter"
import { readHaikuMetadata } from "../session-metadata.js"

function out(s: string): void {
	process.stdout.write(s + "\n")
}

function pathToSlug(fsPath: string): string {
	return fsPath.replace(/^\//, "-").replace(/[/.]/g, "-")
}

/** Resolve the haiku.json path for the current session */
function resolveStateFile(sessionId: string | undefined): string | null {
	if (!sessionId) return null
	const configDir = process.env.CLAUDE_CONFIG_DIR || join(process.env.HOME || "", ".claude")
	const projectSlug = pathToSlug(process.cwd())
	const stateFile = join(configDir, "projects", projectSlug, sessionId, "haiku.json")
	if (existsSync(stateFile)) return stateFile
	return null
}

function getRepoRoot(): string {
	let dir = process.cwd()
	for (let i = 0; i < 20; i++) {
		if (existsSync(join(dir, ".haiku"))) return dir
		const parent = join(dir, "..")
		if (parent === dir) break
		dir = parent
	}
	return process.cwd()
}

function findActiveSlug(root: string): { slug: string; stage: string } | null {
	const intentsDir = join(root, ".haiku", "intents")
	if (!existsSync(intentsDir)) return null
	for (const slug of readdirSync(intentsDir)) {
		const file = join(intentsDir, slug, "intent.md")
		if (!existsSync(file)) continue
		const { data } = matter(readFileSync(file, "utf8"))
		if (data.status === "active") {
			return { slug, stage: (data.active_stage as string) || "" }
		}
	}
	return null
}

export async function injectContext(input: Record<string, unknown>, _pluginRoot: string): Promise<void> {
	// Extract session ID from hook payload or env
	const sessionId = (input.session_id as string) || process.env.CLAUDE_SESSION_ID || undefined

	// Try session metadata cache (fast path)
	const stateFile = resolveStateFile(sessionId)
	if (stateFile) {
		const metadata = readHaikuMetadata(stateFile)
		if (metadata) {
			out(`## H·AI·K·U: ${metadata.intent}`)
			out("")
			out(`**Stage:** ${metadata.active_stage} | **Phase:** ${metadata.phase} | **Studio:** ${metadata.studio}`)
			if (metadata.active_unit) {
				out(`**Unit:** ${metadata.active_unit} | **Hat:** ${metadata.hat} | **Bolt:** ${metadata.bolt}`)
			}
			out("")
			if (metadata.stage_description) {
				out(`### Stage: ${metadata.active_stage}`)
				out(`**${metadata.stage_description}**`)
				if (metadata.stage_unit_types.length > 0) {
					out(`**Unit types:** ${metadata.stage_unit_types.join(", ")}`)
				}
				out("")
				out(`> All work MUST stay within this stage's scope.`)
				out("")
			}
			out(`Call \`haiku_run_next { intent: "${metadata.intent}" }\` to get your current action.`)
			return
		}
	}

	// Fall back to filesystem scan
	const root = getRepoRoot()
	const active = findActiveSlug(root)

	if (!active) {
		out("## H·AI·K·U")
		out("")
		out("No active intent. Use `/haiku:new` to create one.")
		return
	}

	out(`## H·AI·K·U: ${active.slug}`)
	out("")
	out(`Active intent: **${active.slug}** | Stage: **${active.stage || "not set"}**`)
	out("")
	out(`Call \`haiku_run_next { intent: "${active.slug}" }\` to get your current action and stage context.`)
}

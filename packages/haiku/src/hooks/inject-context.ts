// inject-context — SessionStart hook for H·AI·K·U
//
// Minimal hook: tells the agent to fetch its context from the MCP server.
// The MCP server (haiku_run_next) returns full stage metadata including
// scope constraints. This avoids duplicating intent/stage resolution
// in the hook and ensures context is always fresh.

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import matter from "gray-matter"

function out(s: string): void {
	process.stdout.write(s + "\n")
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

/** Quick check: is there an active intent? Just slug + stage, no heavy parsing. */
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

export async function injectContext(_input: Record<string, unknown>, _pluginRoot: string): Promise<void> {
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

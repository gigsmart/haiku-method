// studio-reader.ts — Shared readers for studio, stage, hat, and review-agent definitions

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { studioSearchPaths as _studioSearchPaths, validateIdentifier } from "./prompts/helpers.js"

// Re-export so consumers don't need to reach into prompts/helpers
export const studioSearchPaths = _studioSearchPaths
import { parseFrontmatter } from "./state-tools.js"

/** Read a studio stage definition file */
export function readStageDef(studio: string, stage: string): { data: Record<string, unknown>; body: string } | null {
	validateIdentifier(studio, "studio")
	validateIdentifier(stage, "stage")
	for (const base of studioSearchPaths()) {
		const file = join(base, studio, "stages", stage, "STAGE.md")
		if (existsSync(file)) {
			return parseFrontmatter(readFileSync(file, "utf8"))
		}
	}
	return null
}

/** Read a studio definition file */
export function readStudio(studio: string): { data: Record<string, unknown>; body: string } | null {
	validateIdentifier(studio, "studio")
	for (const base of studioSearchPaths()) {
		const file = join(base, studio, "STUDIO.md")
		if (existsSync(file)) {
			return parseFrontmatter(readFileSync(file, "utf8"))
		}
	}
	return null
}

/** Read all hat definitions for a stage (project overrides plugin for same-named hats) */
export interface HatDef {
	content: string          // full markdown body (without frontmatter)
	agent_type?: string      // e.g., "general-purpose", "plan", custom
	model?: string           // e.g., "opus", "sonnet", "haiku"
	raw: string              // full file content
}

export function readHatDefs(studio: string, stage: string): Record<string, HatDef> {
	validateIdentifier(studio, "studio")
	validateIdentifier(stage, "stage")
	const hats: Record<string, HatDef> = {}
	const paths = studioSearchPaths()
	// Reverse so plugin loads first, then project overwrites
	for (const base of [...paths].reverse()) {
		const hatsDir = join(base, studio, "stages", stage, "hats")
		if (!existsSync(hatsDir)) continue
		for (const f of readdirSync(hatsDir).filter(f => f.endsWith(".md"))) {
			const raw = readFileSync(join(hatsDir, f), "utf8")
			const { data, body } = parseFrontmatter(raw)
			hats[f.replace(/\.md$/, "")] = {
				content: body,
				agent_type: (data.agent_type as string) || undefined,
				model: (data.model as string) || undefined,
				raw,
			}
		}
	}
	return hats
}

/** Read review agent definitions for a stage (project overrides plugin for same-named agents) */
export function readReviewAgentDefs(studio: string, stage: string): Record<string, string> {
	validateIdentifier(studio, "studio")
	validateIdentifier(stage, "stage")
	const agents: Record<string, string> = {}
	const paths = studioSearchPaths()
	// Reverse so plugin loads first, then project overwrites
	for (const base of [...paths].reverse()) {
		const agentsDir = join(base, studio, "stages", stage, "review-agents")
		if (!existsSync(agentsDir)) continue
		for (const f of readdirSync(agentsDir).filter(f => f.endsWith(".md"))) {
			agents[f.replace(/\.md$/, "")] = readFileSync(join(agentsDir, f), "utf8")
		}
	}
	return agents
}

/** List studios with their metadata (project overrides plugin for same-named studios) */
export function listStudios(): Array<{ name: string; data: Record<string, unknown>; body: string }> {
	const seen = new Map<string, { name: string; data: Record<string, unknown>; body: string }>()
	const paths = studioSearchPaths()
	// Reverse so plugin loads first, then project overwrites
	for (const base of [...paths].reverse()) {
		if (!existsSync(base)) continue
		for (const d of readdirSync(base, { withFileTypes: true })) {
			if (!d.isDirectory()) continue
			const file = join(base, d.name, "STUDIO.md")
			if (!existsSync(file)) continue
			const { data, body } = parseFrontmatter(readFileSync(file, "utf8"))
			seen.set(d.name, { name: d.name, data, body })
		}
	}
	return Array.from(seen.values())
}

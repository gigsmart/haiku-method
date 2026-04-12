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

/** Read discovery and output artifact definitions for a stage */
export interface ArtifactDef {
	name: string
	location: string   // template path, e.g. ".haiku/intents/{intent-slug}/stages/design/DESIGN-BRIEF.md"
	scope: string
	format: string
	required: boolean
	body: string       // markdown body describing the artifact
	kind: "discovery" | "output"  // which subdirectory it came from
}

export function readStageArtifactDefs(studio: string, stage: string): ArtifactDef[] {
	validateIdentifier(studio, "studio")
	validateIdentifier(stage, "stage")
	const defs: ArtifactDef[] = []
	const seen = new Set<string>()
	for (const base of [...studioSearchPaths()].reverse()) {
		for (const kind of ["discovery", "outputs"] as const) {
			const artifactDir = join(base, studio, "stages", stage, kind)
			if (!existsSync(artifactDir)) continue
			for (const f of readdirSync(artifactDir).filter(f => f.endsWith(".md"))) {
				const key = `${kind}:${f}`
				if (seen.has(key)) continue
				seen.add(key)
				const raw = readFileSync(join(artifactDir, f), "utf8")
				const { data, body } = parseFrontmatter(raw)
				defs.push({
					name: (data.name as string) || f.replace(/\.md$/, ""),
					location: (data.location as string) || "",
					scope: (data.scope as string) || "intent",
					format: (data.format as string) || "text",
					required: data.required !== false,
					body,
					kind: kind === "outputs" ? "output" : "discovery",
				})
			}
		}
	}
	return defs
}

/** Resolve stage inputs to actual file paths in an intent directory.
 *  Returns entries with resolved paths and (if the file exists) content. */
export interface ResolvedInput {
	stage: string
	artifactName: string
	kind: "discovery" | "output"
	resolvedPath: string     // absolute path on disk
	exists: boolean
	content: string | null   // file content if exists, null otherwise
	description: string      // from the artifact definition body
}

export function resolveStageInputs(
	studio: string,
	inputs: Array<{ stage: string; discovery?: string; output?: string }>,
	intentDir: string,
	intentSlug: string,
): ResolvedInput[] {
	const resolved: ResolvedInput[] = []
	for (const input of inputs) {
		const stageName = input.stage
		const artifactDefs = readStageArtifactDefs(studio, stageName)

		if (input.discovery) {
			const def = artifactDefs.find(d => d.name === input.discovery && d.kind === "discovery")
			if (def && def.location) {
				const absPath = resolveArtifactPath(def.location, intentDir, intentSlug)
				const exists = existsSync(absPath)
				resolved.push({
					stage: stageName,
					artifactName: input.discovery,
					kind: "discovery",
					resolvedPath: absPath,
					exists,
					content: exists ? readFileSync(absPath, "utf8") : null,
					description: def.body,
				})
			}
		}
		if (input.output) {
			const def = artifactDefs.find(d => d.name === input.output && d.kind === "output")
			if (def && def.location) {
				const absPath = resolveArtifactPath(def.location, intentDir, intentSlug)
				const isDir = def.location.endsWith("/")
				const exists = existsSync(absPath)
				if (isDir && exists) {
					// Directory artifact — list files inside
					const files = readdirSync(absPath).filter(f => !f.startsWith("."))
					const contents = files.map(f => {
						const content = readFileSync(join(absPath, f), "utf8")
						return `### ${f}\n\n${content.slice(0, 1500)}${content.length > 1500 ? "\n...(truncated)" : ""}`
					}).join("\n\n")
					resolved.push({
						stage: stageName,
						artifactName: input.output,
						kind: "output",
						resolvedPath: absPath,
						exists: true,
						content: contents || "(empty directory)",
						description: def.body,
					})
				} else {
					resolved.push({
						stage: stageName,
						artifactName: input.output,
						kind: "output",
						resolvedPath: absPath,
						exists,
						content: exists ? readFileSync(absPath, "utf8") : null,
						description: def.body,
					})
				}
			}
		}
	}
	return resolved
}

function resolveArtifactPath(locationTemplate: string, intentDir: string, intentSlug: string): string {
	// Location templates look like: .haiku/intents/{intent-slug}/stages/design/DESIGN-BRIEF.md
	// or: .haiku/intents/{intent-slug}/knowledge/DESIGN-TOKENS.md
	// We need to resolve relative to the intent dir
	const relativePath = locationTemplate
		.replace(/^\.haiku\/intents\/\{intent-slug\}\//, "")
		.replace(/\{intent-slug\}/g, intentSlug)
	return join(intentDir, relativePath)
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

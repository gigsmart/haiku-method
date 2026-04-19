// studio-reader.ts — Shared readers for studio, stage, hat, and review-agent definitions

import {
	existsSync,
	lstatSync,
	readFileSync,
	readdirSync,
	statSync,
} from "node:fs"
import { join } from "node:path"
import {
	studioSearchPaths as _studioSearchPaths,
	validateIdentifier,
} from "./prompts/helpers.js"

// Re-export so consumers don't need to reach into prompts/helpers
export const studioSearchPaths = _studioSearchPaths
import { parseFrontmatter } from "./state-tools.js"

/** Read a studio stage definition file */
export function readStageDef(
	studio: string,
	stage: string,
): { data: Record<string, unknown>; body: string } | null {
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
export function readStudio(
	studio: string,
): { data: Record<string, unknown>; body: string } | null {
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
	content: string // full markdown body (without frontmatter)
	agent_type?: string // e.g., "general-purpose", "plan", custom
	model?: string // e.g., "opus", "sonnet", "haiku"
	raw: string // full file content
}

export function readHatDefs(
	studio: string,
	stage: string,
): Record<string, HatDef> {
	validateIdentifier(studio, "studio")
	validateIdentifier(stage, "stage")
	const hats: Record<string, HatDef> = {}
	const paths = studioSearchPaths()
	// Reverse so plugin loads first, then project overwrites
	for (const base of [...paths].reverse()) {
		const hatsDir = join(base, studio, "stages", stage, "hats")
		if (!existsSync(hatsDir)) continue
		for (const f of readdirSync(hatsDir).filter((f) => f.endsWith(".md"))) {
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
export function readReviewAgentDefs(
	studio: string,
	stage: string,
): Record<string, string> {
	validateIdentifier(studio, "studio")
	validateIdentifier(stage, "stage")
	const agents: Record<string, string> = {}
	const paths = studioSearchPaths()
	// Reverse so plugin loads first, then project overwrites
	for (const base of [...paths].reverse()) {
		const agentsDir = join(base, studio, "stages", stage, "review-agents")
		if (!existsSync(agentsDir)) continue
		for (const f of readdirSync(agentsDir).filter((f) => f.endsWith(".md"))) {
			agents[f.replace(/\.md$/, "")] = readFileSync(join(agentsDir, f), "utf8")
		}
	}
	return agents
}

/** Return review agent NAME → FILE PATH mapping (project overrides plugin). Subagent reads the file itself. */
export function readReviewAgentPaths(
	studio: string,
	stage: string,
): Record<string, string> {
	validateIdentifier(studio, "studio")
	validateIdentifier(stage, "stage")
	const agents: Record<string, string> = {}
	for (const base of [...studioSearchPaths()].reverse()) {
		const agentsDir = join(base, studio, "stages", stage, "review-agents")
		if (!existsSync(agentsDir)) continue
		for (const f of readdirSync(agentsDir).filter((f) => f.endsWith(".md"))) {
			agents[f.replace(/\.md$/, "")] = join(agentsDir, f)
		}
	}
	return agents
}

/** Read discovery and output artifact definitions for a stage */
export interface ArtifactDef {
	name: string
	location: string // template path, e.g. ".haiku/intents/{intent-slug}/stages/design/DESIGN-BRIEF.md"
	scope: string
	format: string
	required: boolean
	body: string // markdown body describing the artifact
	kind: "discovery" | "output" // which subdirectory it came from
}

export function readStageArtifactDefs(
	studio: string,
	stage: string,
): ArtifactDef[] {
	validateIdentifier(studio, "studio")
	validateIdentifier(stage, "stage")
	const defs: ArtifactDef[] = []
	const seen = new Set<string>()
	for (const base of [...studioSearchPaths()].reverse()) {
		for (const kind of ["discovery", "outputs"] as const) {
			const artifactDir = join(base, studio, "stages", stage, kind)
			if (!existsSync(artifactDir)) continue
			for (const f of readdirSync(artifactDir).filter((f) =>
				f.endsWith(".md"),
			)) {
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
	resolvedPath: string // absolute path on disk
	exists: boolean
	content: string | null // file content if exists, null otherwise
	description: string // from the artifact definition body
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
			const def = artifactDefs.find(
				(d) => d.name === input.discovery && d.kind === "discovery",
			)
			if (def?.location) {
				const absPath = resolveArtifactPath(def.location, intentDir, intentSlug)
				const exists = existsSync(absPath)
				const isDir =
					def.location.endsWith("/") ||
					(exists && statSync(absPath).isDirectory())
				if (isDir && exists) {
					// Directory artifact — recursively read all files inside
					const contents = readDirFilesRecursive(absPath)
					resolved.push({
						stage: stageName,
						artifactName: input.discovery,
						kind: "discovery",
						resolvedPath: absPath,
						exists,
						content: contents || "(empty directory)",
						description: def.body,
					})
				} else {
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
		}
		if (input.output) {
			const def = artifactDefs.find(
				(d) => d.name === input.output && d.kind === "output",
			)
			if (def?.location) {
				const absPath = resolveArtifactPath(def.location, intentDir, intentSlug)
				const exists = existsSync(absPath)
				const isDir =
					def.location.endsWith("/") ||
					(exists && statSync(absPath).isDirectory())
				if (isDir && exists) {
					// Directory artifact — recursively read all files inside
					const contents = readDirFilesRecursive(absPath)
					resolved.push({
						stage: stageName,
						artifactName: input.output,
						kind: "output",
						resolvedPath: absPath,
						exists,
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

/** Recursively read all files in a directory, returning formatted content sections. */
function readDirFilesRecursive(dir: string, prefix = ""): string {
	const entries = readdirSync(dir).filter((f) => !f.startsWith("."))
	const sections: string[] = []
	for (const entry of entries) {
		const fullPath = join(dir, entry)
		const relPath = prefix ? `${prefix}/${entry}` : entry
		let stat: ReturnType<typeof lstatSync>
		try {
			stat = lstatSync(fullPath)
		} catch {
			continue // file disappeared between readdirSync and lstatSync — skip it
		}
		if (stat.isSymbolicLink()) {
			continue // skip symlinks to avoid infinite recursion from cycles
		}
		if (stat.isDirectory()) {
			sections.push(readDirFilesRecursive(fullPath, relPath))
		} else {
			let content: string
			try {
				content = readFileSync(fullPath, "utf8")
			} catch {
				continue // file disappeared between lstatSync and readFileSync — skip it
			}
			sections.push(
				`### ${relPath}\n\n${content.slice(0, 1500)}${content.length > 1500 ? "\n...(truncated)" : ""}`,
			)
		}
	}
	return sections.filter(Boolean).join("\n\n")
}

function resolveArtifactPath(
	locationTemplate: string,
	intentDir: string,
	intentSlug: string,
): string {
	// Location templates look like: .haiku/intents/{intent-slug}/stages/design/DESIGN-BRIEF.md
	// or: .haiku/intents/{intent-slug}/knowledge/DESIGN-TOKENS.md
	// We need to resolve relative to the intent dir
	const relativePath = locationTemplate
		.replace(/^\.haiku\/intents\/\{intent-slug\}\//, "")
		.replace(/\{intent-slug\}/g, intentSlug)
	return join(intentDir, relativePath)
}

/** Studio metadata. `dir` is the stable on-disk identifier; `name` is the canonical
 *  display name from frontmatter. Resolve user-supplied identifiers via `resolveStudio`. */
export interface StudioInfo {
	dir: string // directory name on disk — stable identifier for file ops
	name: string // canonical display name (frontmatter.name, defaults to dir)
	slug: string // short alias (frontmatter.slug, defaults to name)
	aliases: string[] // additional aliases from frontmatter
	description: string
	category: string
	stages: string[]
	data: Record<string, unknown> // full frontmatter
	body: string
	source: "plugin" | "project"
	path: string // absolute path to the studio directory
	studioFile: string // absolute path to STUDIO.md (for help links)
}

// ── Studio metadata cache ─────────────────────────────────────────────────
//
// `listStudios` walks the studio search paths and reads every STUDIO.md.
// Several hot paths call `resolveStudio` (and therefore `listStudios`) many
// times per request — hat resolution, stage reviews, branch-mode checks.
// Without memoization these became an N·studios I/O multiplier on every FSM
// step. We cache the scan for a short TTL so a single request sees a
// consistent snapshot without re-walking disk, and we key the cache on the
// search-path list so changes to cwd or plugin root invalidate it implicitly.
const LIST_STUDIOS_TTL_MS = 2000
interface ListStudiosCacheEntry {
	key: string
	expiresAt: number
	value: StudioInfo[]
}
let listStudiosCache: ListStudiosCacheEntry | null = null

/** Clear the listStudios cache. Exported for tests and explicit invalidation. */
export function clearStudioCache(): void {
	listStudiosCache = null
}

function scanStudiosFromDisk(): StudioInfo[] {
	const seen = new Map<string, StudioInfo>()
	const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || ""
	const paths = studioSearchPaths()
	// paths is [project, plugin]; reverse so plugin loads first, then project overwrites
	for (const base of [...paths].reverse()) {
		if (!existsSync(base)) continue
		const source: "plugin" | "project" =
			pluginRoot && base.startsWith(pluginRoot) ? "plugin" : "project"
		for (const d of readdirSync(base, { withFileTypes: true })) {
			if (!d.isDirectory()) continue
			const studioPath = join(base, d.name)
			const file = join(studioPath, "STUDIO.md")
			if (!existsSync(file)) continue
			const { data, body } = parseFrontmatter(readFileSync(file, "utf8"))
			const name = (data.name as string) || d.name
			const slug = (data.slug as string) || name
			const aliases = Array.isArray(data.aliases)
				? (data.aliases as string[])
				: []
			seen.set(d.name, {
				dir: d.name,
				name,
				slug,
				aliases,
				description: (data.description as string) || "",
				category: (data.category as string) || "general",
				stages: Array.isArray(data.stages) ? (data.stages as string[]) : [],
				data,
				body,
				source,
				path: studioPath,
				studioFile: file,
			})
		}
	}
	return Array.from(seen.values())
}

/** List studios with their metadata (project overrides plugin for same-named directories).
 *  Returns `StudioInfo` with canonical name/slug/aliases from frontmatter.
 *  Memoized for `LIST_STUDIOS_TTL_MS` — call `clearStudioCache()` to force refresh. */
export function listStudios(): StudioInfo[] {
	const key = studioSearchPaths().join("|")
	const now = Date.now()
	if (
		listStudiosCache &&
		listStudiosCache.key === key &&
		listStudiosCache.expiresAt > now
	) {
		return listStudiosCache.value
	}
	const value = scanStudiosFromDisk()
	listStudiosCache = { key, expiresAt: now + LIST_STUDIOS_TTL_MS, value }
	return value
}

/** Resolve any studio identifier (directory name, canonical name, slug, or alias) to a StudioInfo.
 *  Case-insensitive. Returns null if no match. Uses the memoized `listStudios` cache. */
export function resolveStudio(identifier: string): StudioInfo | null {
	if (!identifier) return null
	const needle = identifier.toLowerCase()
	const all = listStudios()
	for (const s of all) {
		if (s.dir.toLowerCase() === needle) return s
		if (s.name.toLowerCase() === needle) return s
		if (s.slug.toLowerCase() === needle) return s
		if (s.aliases.some((a) => a.toLowerCase() === needle)) return s
	}
	return null
}

/** Read a phase override file for a stage (e.g. ELABORATION.md, EXECUTION.md).
 *  Returns frontmatter + body, or null if no override exists. */
export function readPhaseOverride(
	studio: string,
	stage: string,
	phase: string,
): { data: Record<string, unknown>; body: string } | null {
	validateIdentifier(studio, "studio")
	validateIdentifier(stage, "stage")
	for (const base of studioSearchPaths()) {
		const file = join(
			base,
			studio,
			"stages",
			stage,
			"phases",
			`${phase.toUpperCase()}.md`,
		)
		if (existsSync(file)) {
			return parseFrontmatter(readFileSync(file, "utf8"))
		}
	}
	return null
}

/** Read operation definitions for a studio (project overrides plugin for same-named ops) */
export function readOperationDefs(studio: string): Record<string, string> {
	validateIdentifier(studio, "studio")
	const ops: Record<string, string> = {}
	const paths = studioSearchPaths()
	// Reverse so plugin loads first, then project overwrites
	for (const base of [...paths].reverse()) {
		const opsDir = join(base, studio, "operations")
		if (!existsSync(opsDir)) continue
		for (const f of readdirSync(opsDir).filter((f) => f.endsWith(".md"))) {
			ops[f.replace(/\.md$/, "")] = readFileSync(join(opsDir, f), "utf8")
		}
	}
	return ops
}

/** Read reflection dimension definitions for a studio (project overrides plugin for same-named dims) */
export function readReflectionDefs(studio: string): Record<string, string> {
	validateIdentifier(studio, "studio")
	const dims: Record<string, string> = {}
	const paths = studioSearchPaths()
	// Reverse so plugin loads first, then project overwrites
	for (const base of [...paths].reverse()) {
		const reflDir = join(base, studio, "reflections")
		if (!existsSync(reflDir)) continue
		for (const f of readdirSync(reflDir).filter((f) => f.endsWith(".md"))) {
			dims[f.replace(/\.md$/, "")] = readFileSync(join(reflDir, f), "utf8")
		}
	}
	return dims
}

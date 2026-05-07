// studio-reader.ts — Shared readers for studio, stage, hat, and review-agent definitions

import {
	existsSync,
	lstatSync,
	readdirSync,
	readFileSync,
	statSync,
} from "node:fs"
import { join } from "node:path"
import {
	studioSearchPaths as _studioSearchPaths,
	validateIdentifier,
} from "./prompts/helpers.js"

// Re-export so consumers don't need to reach into prompts/helpers
export const studioSearchPaths = _studioSearchPaths

import { resolvePluginRoot } from "./config.js"
import { type ModelTier, sanitizeModel } from "./model-selection.js"
import { parseFrontmatter } from "./state-tools.js"

/**
 * Read the `model:` field from a mandate file's frontmatter and sanitize it
 * to a known ModelTier. Returns undefined if the file doesn't exist, has no
 * model field, or has an invalid value. Used at review-agent and fix-hat
 * dispatch sites to pull the declared tier without re-reading the whole file.
 */
export function readModelFromPath(path: string): ModelTier | undefined {
	try {
		if (!existsSync(path)) return undefined
		const { data } = parseFrontmatter(readFileSync(path, "utf8"))
		return sanitizeModel(data.model as string | undefined)
	} catch {
		return undefined
	}
}

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
	run_quality_gates?: boolean // when true, advance_hat from this hat runs the unit's quality_gates and auto-rejects (bolt+1) on failure
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
				run_quality_gates: data.run_quality_gates === true ? true : undefined,
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

/**
 * Studio-level review agents live at `plugin/studios/{studio}/review-agents/*.md`
 * (NOT per-stage). They run once at intent completion, after the final
 * stage gate passes but before `intent_complete`. Their scope is the whole
 * intent, not a single stage. Project overrides plugin. Subagent reads
 * each file. Returns name → absolute path.
 */
export function readStudioReviewAgentPaths(
	studio: string,
): Record<string, string> {
	validateIdentifier(studio, "studio")
	const agents: Record<string, string> = {}
	for (const base of [...studioSearchPaths()].reverse()) {
		const agentsDir = join(base, studio, "review-agents")
		if (!existsSync(agentsDir)) continue
		for (const f of readdirSync(agentsDir).filter((f) => f.endsWith(".md"))) {
			agents[f.replace(/\.md$/, "")] = join(agentsDir, f)
		}
	}
	return agents
}

/**
 * Studio-level fix hats live at `plugin/studios/{studio}/fix-hats/*.md`
 * (NOT per-stage). They are dispatched against intent-scope feedback
 * produced by the studio-level review agents. They run at intent
 * completion time to reconcile cross-stage artifacts against studio-wide
 * standards — different mandate than stage-owned hats. Project overrides
 * plugin. Returns name → HatDef (content + agent_type + model).
 */
export function readStudioFixHatDefs(studio: string): Record<string, HatDef> {
	validateIdentifier(studio, "studio")
	const hats: Record<string, HatDef> = {}
	for (const base of [...studioSearchPaths()].reverse()) {
		const hatsDir = join(base, studio, "fix-hats")
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

/** Return studio-level fix hat NAME → FILE PATH mapping. Parent spawns a
 *  subagent with the mandate file; we pass the path, not the body, to keep
 *  the parent's context small. */
export function readStudioFixHatPaths(studio: string): Record<string, string> {
	validateIdentifier(studio, "studio")
	const hats: Record<string, string> = {}
	for (const base of [...studioSearchPaths()].reverse()) {
		const hatsDir = join(base, studio, "fix-hats")
		if (!existsSync(hatsDir)) continue
		for (const f of readdirSync(hatsDir).filter((f) => f.endsWith(".md"))) {
			hats[f.replace(/\.md$/, "")] = join(hatsDir, f)
		}
	}
	return hats
}

/**
 * Filter review agents by their `applies_to:` frontmatter against the
 * artifacts the stage actually produces. Agents with no `applies_to:`
 * declaration always run (backward compat). Agents with a list of globs
 * run only when at least one artifact in the stage directory matches at
 * least one glob — e.g. `applies_to: ['*.html', '*.tsx']` skips the web
 * a11y agent on a backend-only stage.
 *
 * Globs support simple `*.ext` patterns; full glob semantics are not
 * required because this is a coarse "does this stage have any HTML?" check.
 */
export function filterReviewAgentsByScope(
	agentPaths: Record<string, string>,
	stageArtifactsDir: string,
	/** Optional: studio + stage, used when artifacts don't exist yet (pre-execute
	 *  review). Lets the filter consult declared output templates instead of
	 *  falling back to "include everything." */
	studioStage?: { studio: string; stage: string },
): Record<string, string> {
	const filtered: Record<string, string> = {}
	let stageFiles: string[] | null = null // lazily loaded
	let outputExts: string[] | null = null // lazily loaded
	for (const [name, mandatePath] of Object.entries(agentPaths)) {
		if (!applies(mandatePath)) continue
		filtered[name] = mandatePath
	}
	return filtered

	function readAppliesTo(mandatePath: string): string[] | undefined {
		try {
			const raw = readFileSync(mandatePath, "utf8")
			const { data } = parseFrontmatter(raw)
			const v = data.applies_to
			if (v !== undefined && v !== null) {
				if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
					return v as string[]
				}
				// Malformed — warn so typos like `applyes_to:` surface rather
				// than silently producing a fall-through "always include."
				console.warn(
					`[haiku] review-agent ${mandatePath}: \`applies_to:\` is present but not a string[]; treating as unscoped (always runs). Fix the frontmatter to scope the agent.`,
				)
			}
		} catch {
			/* defensive: can't parse → treat as unscoped */
		}
		return undefined
	}

	function getStageFiles(): string[] {
		if (stageFiles === null) {
			stageFiles = walkDirExtensions(stageArtifactsDir)
		}
		return stageFiles
	}

	function getOutputExts(): string[] {
		if (outputExts === null) {
			outputExts = []
			if (studioStage) {
				for (const def of readStageArtifactDefs(
					studioStage.studio,
					studioStage.stage,
				)) {
					if (def.kind !== "output") continue
					const loc = def.location || ""
					// Extract extension from location template (e.g.
					// ".../stages/design/artifacts/DESIGN-BRIEF.md" → ".md";
					// ".../stages/design/artifacts/{foo}.html" → ".html"). Strip
					// placeholder segments so templates with `{}` markers still
					// resolve an extension.
					const cleaned = loc.replace(/\{[^}]+\}/g, "").toLowerCase()
					const m = cleaned.match(/\.[a-z0-9]+$/)
					if (m) outputExts.push(m[0])
				}
			}
		}
		return outputExts
	}

	function applies(mandatePath: string): boolean {
		const appliesTo = readAppliesTo(mandatePath)
		if (!appliesTo || appliesTo.length === 0) return true
		const files = getStageFiles()
		// Prefer filesystem evidence when the stage has actually produced
		// artifacts (post-execute review path).
		if (files.length > 0) {
			for (const pattern of appliesTo) {
				const ext = pattern.replace(/^\*/, "").toLowerCase()
				if (files.some((f) => f.toLowerCase().endsWith(ext))) return true
			}
			return false
		}
		// Pre-execute review: artifacts don't exist yet. Consult the stage's
		// DECLARED output templates so the applies_to: filter isn't silently
		// defeated (e.g. a web a11y agent must not run on a stage whose
		// outputs are all .md specs).
		const declaredExts = getOutputExts()
		if (declaredExts.length > 0) {
			for (const pattern of appliesTo) {
				const ext = pattern.replace(/^\*/, "").toLowerCase()
				if (declaredExts.some((e) => e === ext)) return true
			}
			return false
		}
		// No artifacts AND no declared outputs — can't decide; include by
		// default. This path fires only for misconfigured stages without
		// any `outputs/*.md` definitions.
		return true
	}
}

/** Recursively collect every file path under `dir`, returning the filenames
 *  (not full paths). Used by the review-agent scope filter so artifacts in
 *  subdirectories (`artifacts/wireframes/home.html`) still match extension
 *  globs. Non-fatal on missing dir. */
function walkDirExtensions(dir: string): string[] {
	if (!existsSync(dir)) return []
	const out: string[] = []
	const stack: string[] = [dir]
	while (stack.length > 0) {
		const current = stack.pop() as string
		try {
			const entries = readdirSync(current, { withFileTypes: true })
			for (const e of entries) {
				const name = String(e.name)
				const p = join(current, name)
				if (e.isDirectory()) stack.push(p)
				else out.push(name)
			}
		} catch {}
	}
	return out
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
	// P8 (2026-05-06): discovery template uniqueness guard. Two
	// discovery templates within the same stage must NOT share a
	// `location:` field — discovery agents fan out in parallel; if
	// two write to the same path the merge back to the stage branch
	// is a guaranteed conflict (and downstream the cursor's
	// `existsSync` check can't distinguish whose output it sees).
	// Surface the collision at studio-load time so the studio author
	// fixes the template, not so the operator hits it at runtime.
	const discoveryByLocation = new Map<string, string[]>()
	for (const d of defs) {
		if (d.kind !== "discovery" || !d.location) continue
		const arr = discoveryByLocation.get(d.location) ?? []
		arr.push(d.name)
		discoveryByLocation.set(d.location, arr)
	}
	for (const [location, names] of discoveryByLocation) {
		if (names.length > 1) {
			throw new Error(
				`Studio configuration error: discovery templates [${names.join(", ")}] in stage '${stage}' of studio '${studio}' share the same location '${location}'. Each discovery template must declare a unique 'location:' frontmatter field — parallel agents writing to the same path produce merge conflicts and ambiguous existence checks.`,
			)
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
// Without memoization these became an N·studios I/O multiplier on every workflow
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
	const pluginRoot = resolvePluginRoot()
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

import type { Dirent } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { basename, join, relative, resolve } from "node:path"
import {
	dedupeFrontmatterKeys,
	isDuplicateKeyError,
} from "@haiku/shared/frontmatter"
import matter from "gray-matter"
import { extractSections } from "./markdown.js"
import type {
	DiscoveryFrontmatter,
	IntentFrontmatter,
	ParsedDiscovery,
	ParsedIntent,
	ParsedUnit,
	StageState,
	UnitFrontmatter,
} from "./types.js"

const EXCLUDED_ENTRIES = new Set(["worktrees", "settings.yml"])

/**
 * Run gray-matter, auto-recovering from duplicate-key YAML errors by keeping
 * the last occurrence of each top-level key and re-parsing. Logs a warning
 * when recovery happens so the broken file still gets noticed.
 */
function matterWithDedupe(
	raw: string,
	filePath: string,
): ReturnType<typeof matter> {
	try {
		return matter(raw)
	} catch (err) {
		if (!isDuplicateKeyError(err)) throw err
		const { text, removed } = dedupeFrontmatterKeys(raw)
		if (removed.length === 0) throw err
		const parsed = matter(text)
		console.warn(
			`[haiku] Recovered duplicate YAML keys in ${filePath}: kept last occurrence of ${removed.join(", ")}`,
		)
		return parsed
	}
}

/**
 * Normalize frontmatter values: coerce Date objects to ISO date strings.
 * gray-matter auto-parses YAML dates (e.g. 2026-03-27) into Date objects.
 */
function normalizeFrontmatter<T extends Record<string, unknown>>(data: T): T {
	const result = { ...data }
	for (const key in result) {
		const val = result[key]
		if (val instanceof Date) {
			;(result as Record<string, unknown>)[key] = val
				.toISOString()
				.split("T")[0]
		}
	}
	return result
}

/**
 * Extract the title (first # heading) from markdown body.
 */
function extractTitle(body: string): string {
	const match = body.match(/^# (.+)$/m)
	return match ? match[1].trim() : ""
}

/**
 * Strip the title line (first # heading) from the body for section parsing.
 * Uses the `m` flag so `^` matches at the start of any line, not just string start.
 */
function stripTitle(body: string): string {
	return body.replace(/^# .+$/m, "").trim()
}

/**
 * Parse an intent.md file from an intent directory.
 */
export async function parseIntent(
	intentDir: string,
): Promise<ParsedIntent | null> {
	try {
		const filePath = join(intentDir, "intent.md")
		const raw = await readFile(filePath, "utf-8")
		const { data, content } = matterWithDedupe(raw, filePath)
		const frontmatter = normalizeFrontmatter(data) as IntentFrontmatter
		const title = extractTitle(content)
		const bodyWithoutTitle = stripTitle(content)
		const sections = extractSections(bodyWithoutTitle)
		const slug = basename(intentDir)

		return {
			slug,
			frontmatter,
			title,
			sections,
			rawContent: raw,
		}
	} catch (err) {
		const filePath = join(intentDir, "intent.md")
		// Only warn for parse errors, not missing files (ENOENT is expected)
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
			console.warn(`[haiku/shared] Failed to parse ${filePath}:`, err)
		}
		return null
	}
}

/**
 * Parse a single unit-*.md file.
 * Extracts unit number from filename pattern: unit-NN-slug.md
 */
export async function parseUnit(filePath: string): Promise<ParsedUnit | null> {
	try {
		const raw = await readFile(filePath, "utf-8")
		const { data, content } = matterWithDedupe(raw, filePath)
		const frontmatter = normalizeFrontmatter(data) as UnitFrontmatter
		const title = extractTitle(content)
		const bodyWithoutTitle = stripTitle(content)
		const sections = extractSections(bodyWithoutTitle)

		const filename = basename(filePath, ".md")
		const numberMatch = filename.match(/^unit-(\d+)/)
		const number = numberMatch ? Number.parseInt(numberMatch[1], 10) : 0

		return {
			slug: filename,
			number,
			frontmatter,
			title,
			sections,
			rawContent: raw,
		}
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
			console.warn(`[haiku/shared] Failed to parse ${filePath}:`, err)
		}
		return null
	}
}

/**
 * Parse all unit-*.md files from an intent directory, sorted by number.
 * Looks in both the intent root and stages/{stage}/units/ subdirectories.
 */
export async function parseAllUnits(intentDir: string): Promise<ParsedUnit[]> {
	const units: ParsedUnit[] = []

	// Look for unit files in stages/{stage}/units/ subdirectories
	try {
		const stagesDir = join(intentDir, "stages")
		const stageEntries = await readdir(stagesDir, { withFileTypes: true })
		for (const stageEntry of stageEntries) {
			if (!stageEntry.isDirectory()) continue
			try {
				const unitsDir = join(stagesDir, stageEntry.name, "units")
				const unitEntries = await readdir(unitsDir)
				const unitFiles = unitEntries
					.filter((f) => /^unit-\d{2,}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(f))
					.sort()

				for (const file of unitFiles) {
					const parsed = await parseUnit(join(unitsDir, file))
					if (parsed) {
						// Tag the unit with its stage for context
						if (!parsed.frontmatter.stage) {
							parsed.frontmatter.stage = stageEntry.name
						}
						units.push(parsed)
					}
				}
			} catch {
				// No units/ subdirectory in this stage — skip
			}
		}
	} catch {
		// No stages/ directory — skip
	}

	return units.sort((a, b) => a.number - b.number)
}

/**
 * Parse discovery.md from an intent directory. Returns null if missing.
 */
export async function parseDiscovery(
	intentDir: string,
): Promise<ParsedDiscovery | null> {
	try {
		const filePath = join(intentDir, "discovery.md")
		const raw = await readFile(filePath, "utf-8")
		const { data, content } = matterWithDedupe(raw, filePath)
		const frontmatter = normalizeFrontmatter(data) as DiscoveryFrontmatter
		const title = extractTitle(content)
		const body = stripTitle(content)

		return { frontmatter, title, body }
	} catch {
		return null
	}
}

/**
 * List all intent directories in the .haiku root.
 * Excludes worktrees/ and settings.yml.
 */
export async function listIntents(haikuDir: string): Promise<string[]> {
	try {
		const entries = await readdir(haikuDir, { withFileTypes: true })
		return entries
			.filter((e) => e.isDirectory() && !EXCLUDED_ENTRIES.has(e.name))
			.map((e) => e.name)
			.sort()
	} catch {
		return []
	}
}

/**
 * Parse all stage state.json files from an intent's stages/ directory.
 * Returns a map of stage name to parsed StageState.
 */
export async function parseStageStates(
	intentDir: string,
): Promise<Record<string, StageState>> {
	const states: Record<string, StageState> = {}
	try {
		const stagesDir = join(intentDir, "stages")
		const entries = await readdir(stagesDir, { withFileTypes: true })
		for (const entry of entries) {
			if (!entry.isDirectory()) continue
			try {
				const stateFile = join(stagesDir, entry.name, "state.json")
				const raw = await readFile(stateFile, "utf-8")
				const parsed = JSON.parse(raw)
				states[entry.name] = {
					stage: parsed.stage ?? entry.name,
					status: parsed.status ?? "pending",
					phase: parsed.phase ?? "",
					started_at: parsed.started_at,
					completed_at: parsed.completed_at,
					gate_entered_at: parsed.gate_entered_at,
					gate_outcome: parsed.gate_outcome,
				}
			} catch {
				// No state.json or parse error — skip
			}
		}
	} catch {
		// No stages/ directory
	}
	return states
}

/**
 * Read all knowledge files from an intent's knowledge/ directory.
 * Returns an array of { name, content } objects.
 */
export async function parseKnowledgeFiles(
	intentDir: string,
): Promise<Array<{ name: string; content: string }>> {
	const files: Array<{ name: string; content: string }> = []
	try {
		const knowledgeDir = join(intentDir, "knowledge")
		const entries = await readdir(knowledgeDir)
		for (const entry of entries.sort()) {
			if (!entry.endsWith(".md")) continue
			try {
				const raw = await readFile(join(knowledgeDir, entry), "utf-8")
				const { content } = matter(raw)
				files.push({
					name: entry.replace(/\.md$/, ""),
					content,
				})
			} catch {
				// Skip unreadable files
			}
		}
	} catch {
		// No knowledge/ directory
	}
	return files
}

/**
 * Read stage-specific artifact files (like DESIGN-BRIEF.md).
 * Returns an array of { stage, name, content } objects.
 */
export async function parseStageArtifacts(
	intentDir: string,
): Promise<Array<{ stage: string; name: string; content: string }>> {
	const artifacts: Array<{ stage: string; name: string; content: string }> = []
	try {
		const stagesDir = join(intentDir, "stages")
		const stageEntries = await readdir(stagesDir, { withFileTypes: true })
		for (const stageEntry of stageEntries) {
			if (!stageEntry.isDirectory()) continue
			try {
				const stageDir = join(stagesDir, stageEntry.name)
				const files = await readdir(stageDir)
				for (const file of files.sort()) {
					// Capture markdown files that aren't state.json
					if (file.endsWith(".md")) {
						try {
							const raw = await readFile(join(stageDir, file), "utf-8")
							const { content } = matter(raw)
							artifacts.push({
								stage: stageEntry.name,
								name: file.replace(/\.md$/, ""),
								content,
							})
						} catch {
							// Skip unreadable files
						}
					}
				}
			} catch {
				// Skip
			}
		}
	} catch {
		// No stages/ directory
	}
	return artifacts
}

const OUTPUT_IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif"]
const OUTPUT_HTML_EXTS = [".html", ".htm"]

export interface OutputArtifact {
	stage: string
	name: string
	type: "markdown" | "html" | "image" | "file"
	/** Markdown and HTML content is inlined; images and unknown files use relativePath */
	content?: string
	/** Relative path within the stage artifacts dir (for serving via HTTP) */
	relativePath?: string
}

/** Recursively collect every file path under `dir`. Returns full absolute
 *  paths so callers can read them and compute relative paths against
 *  whatever root they care about. Non-fatal on missing dir. */
async function walkArtifactsDir(dir: string): Promise<string[]> {
	const out: string[] = []
	let entries: Dirent<string>[]
	try {
		entries = await readdir(dir, { withFileTypes: true })
	} catch {
		return out
	}
	for (const e of entries) {
		const p = join(dir, e.name)
		if (e.isDirectory()) {
			out.push(...(await walkArtifactsDir(p)))
		} else {
			out.push(p)
		}
	}
	return out
}

/**
 * Build an OutputArtifact entry from a file by classifying its extension.
 * `name` is the display name (typically the path-from-some-root with the
 * extension stripped). `relativePath` is intent-dir-relative for HTTP
 * serving by `/stage-artifacts/:sessionId/*`. Returns null when the file
 * can't be read.
 */
async function buildArtifactEntry(
	fullPath: string,
	stage: string,
	name: string,
	relativePath: string,
): Promise<OutputArtifact | null> {
	const file = basename(fullPath)
	const ext = file.substring(file.lastIndexOf(".")).toLowerCase()
	if (ext === ".md") {
		try {
			const raw = await readFile(fullPath, "utf-8")
			const { content } = matter(raw)
			return { stage, name, type: "markdown", content }
		} catch {
			return null
		}
	}
	if (OUTPUT_HTML_EXTS.includes(ext)) {
		try {
			const content = await readFile(fullPath, "utf-8")
			return { stage, name, type: "html", content, relativePath }
		} catch {
			return null
		}
	}
	if (OUTPUT_IMAGE_EXTS.includes(ext)) {
		return { stage, name, type: "image", relativePath }
	}
	// Unknown extension — surface as a download link rather than silently
	// dropping the file. A stage's artifact set should be visible in the
	// review screen regardless of whether the renderer has a specialized
	// view for the format.
	return { stage, name, type: "file", relativePath }
}

/**
 * Resolve a unit's `outputs:` declaration to an intent-dir-relative path.
 * Units may declare outputs as either intent-relative (`product/foo.md`)
 * or workspace-relative (`.haiku/intents/<slug>/product/foo.md`). We
 * strip the workspace-relative prefix when present so both forms collapse
 * to the same intent-dir-relative form before resolution.
 */
function intentRelativeOutputPath(declared: string, intentDir: string): string {
	const intentDirName = basename(intentDir)
	const workspacePrefix = `.haiku/intents/${intentDirName}/`
	if (declared.startsWith(workspacePrefix)) {
		return declared.slice(workspacePrefix.length)
	}
	return declared
}

/** Match the unit-file naming convention used by `parseAllUnits` so we
 *  don't process scratch files (READMEs, drafts) that happen to live
 *  inside `units/`. Tightening the filter also reduces the attack
 *  surface for the path-containment check below — fewer files
 *  contributing user-controlled `outputs:` strings. */
const UNIT_FILENAME_RE = /^unit-\d{2,}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/

/**
 * Read every unit's `outputs:` frontmatter under `stages/<stage>/units/`,
 * resolving each declared path against `intentDir` and classifying it by
 * extension. Returns the [absolutePath, OutputArtifact] tuples so the caller
 * can dedupe against the `artifacts/` walk.
 *
 * The "stage's outputs" surface is broader than `stages/<stage>/artifacts/`:
 * units can declare outputs anywhere within the intent dir (e.g.
 * `<intent>/product/ACCEPTANCE-CRITERIA.md`, `<intent>/features/*.feature`).
 * The review screen needs to surface the full output set or downstream
 * stages have nothing to inspect.
 *
 * Security: `outputs:` strings come from disk frontmatter that an
 * adversarial agent could craft (`../../.env`, `/etc/passwd`, etc.). After
 * resolving each declared path, we verify the absolute path is contained
 * within `intentDir` and silently drop any that escape. The catch-all walk
 * (source 3) doesn't need this guard because its paths come from `readdir`
 * `Dirent` entries, not user-controlled strings.
 */
async function parseUnitOutputs(
	intentDir: string,
): Promise<Array<{ absPath: string; artifact: OutputArtifact }>> {
	const out: Array<{ absPath: string; artifact: OutputArtifact }> = []
	const intentDirAbs = resolve(intentDir)
	const intentDirAbsSlash = `${intentDirAbs}/`
	let stageEntries: Dirent<string>[]
	try {
		stageEntries = await readdir(join(intentDir, "stages"), {
			withFileTypes: true,
		})
	} catch {
		return out
	}
	for (const stageEntry of stageEntries) {
		if (!stageEntry.isDirectory()) continue
		const stageName = stageEntry.name
		const unitsDir = join(intentDir, "stages", stageName, "units")
		let unitFiles: string[]
		try {
			unitFiles = (await readdir(unitsDir, { withFileTypes: true }))
				.filter((e) => e.isFile() && UNIT_FILENAME_RE.test(e.name))
				.map((e) => e.name)
				.sort()
		} catch {
			continue
		}
		for (const unitFile of unitFiles) {
			const unitPath = join(unitsDir, unitFile)
			let outputs: string[]
			try {
				const raw = await readFile(unitPath, "utf-8")
				const parsed = matterWithDedupe(raw, unitPath)
				const fmOutputs = (parsed.data as { outputs?: unknown }).outputs
				outputs = Array.isArray(fmOutputs)
					? fmOutputs.filter((p): p is string => typeof p === "string")
					: []
			} catch {
				continue
			}
			for (const declared of outputs) {
				const intentRel = intentRelativeOutputPath(declared, intentDir)
				const absPath = resolve(intentDirAbs, intentRel)
				// Path-containment check: silently skip anything that
				// resolves outside the intent dir (`../../.env`,
				// `/etc/passwd`, symlink-targeted paths, etc.). Equality
				// check rejects `absPath === intentDirAbs` (declaring the
				// intent dir itself as an output is meaningless).
				if (
					absPath !== intentDirAbs &&
					!absPath.startsWith(intentDirAbsSlash)
				) {
					continue
				}
				const safeRel = relative(intentDirAbs, absPath)
				const nameWithDir = safeRel.replace(/\.[^.]+$/, "")
				const entry = await buildArtifactEntry(
					absPath,
					stageName,
					nameWithDir,
					safeRel,
				)
				if (entry) out.push({ absPath, artifact: entry })
			}
		}
	}
	return out
}

/**
 * Workflow-internal entries inside `stages/<stage>/`. These are not user
 * artifacts and must NOT surface in the review screen's Outputs tab:
 *
 *   - `STAGE.md` — workflow-engine stage definition (lives in the plugin
 *     copy; sometimes mirrored into the intent dir for traceability).
 *   - `state.json` — workflow-engine state record.
 *   - `units/` — unit specs (rendered by the Units tab).
 *   - `feedback/` — feedback items (rendered by the Feedback tab).
 *
 * `artifacts/` is the existing canonical outputs dir and is walked
 * separately above this exclusion list, so it doesn't appear here.
 */
const WORKFLOW_INTERNAL_STAGE_ENTRIES = new Set([
	"STAGE.md",
	"state.json",
	"units",
	"feedback",
])

/**
 * Walk the full `stages/<stage>/` directory tree, returning absolute paths
 * for files that are NOT in the workflow-internal exclusion set. The
 * `artifacts/` directory is also skipped here since the artifacts walk
 * above handles it (and uses a different `name`/`relativePath` convention).
 *
 * The fallback rule: anything else under the stage directory — at any
 * depth, with any extension — is a stage output. Reviewers can inspect
 * everything the stage produced, even files no other view knows about.
 */
async function walkStageDirRecursive(
	stageDir: string,
	currentRel: string = "",
): Promise<Array<{ absPath: string; relFromStage: string }>> {
	const out: Array<{ absPath: string; relFromStage: string }> = []
	let entries: Dirent<string>[]
	try {
		entries = await readdir(stageDir, { withFileTypes: true })
	} catch {
		return out
	}
	for (const e of entries) {
		// Skip workflow-internal entries at the stage root only. Once we've
		// descended into a non-internal subdir, every file under it is fair
		// game.
		if (currentRel === "" && WORKFLOW_INTERNAL_STAGE_ENTRIES.has(e.name)) {
			continue
		}
		// `artifacts/` is the canonical outputs dir, walked separately by
		// the artifacts/ scan above. Skip it here to avoid double-emitting.
		if (currentRel === "" && e.name === "artifacts") continue
		const rel = currentRel ? `${currentRel}/${e.name}` : e.name
		const abs = join(stageDir, e.name)
		if (e.isDirectory()) {
			out.push(...(await walkStageDirRecursive(abs, rel)))
		} else if (e.isFile()) {
			out.push({ absPath: abs, relFromStage: rel })
		}
	}
	return out
}

/**
 * Scan a stage's full output surface for review.
 *
 * The review screen surfaces every artifact a stage produced — not just
 * files happening to live under `stages/<stage>/artifacts/`. Three sources
 * are merged in order, with the first one to claim a given absolute path
 * winning:
 *
 *   1. `stages/<stage>/artifacts/**` — recursive walk. Existing convention.
 *      Display name is artifacts-dir-relative (e.g. `wireframes/foo`).
 *
 *   2. Each unit's `outputs:` frontmatter under `stages/<stage>/units/*.md`.
 *      Units are the canonical declaration of what a stage produces, and
 *      they routinely write to paths OUTSIDE the stage dir entirely (e.g.
 *      `<intent>/product/ACCEPTANCE-CRITERIA.md`, `<intent>/features/*.feature`).
 *      Display name is intent-dir-relative.
 *
 *   3. The full `stages/<stage>/**` walk, minus workflow-internal entries
 *      (`STAGE.md`, `state.json`, `units/`, `feedback/`) and the `artifacts/`
 *      dir already covered by source 1. Catches anything a stage produced
 *      inside its own dir that no unit declared explicitly — e.g. a
 *      `stages/<stage>/outputs/foo.md` directory, ad-hoc supplementary
 *      files, or stage-level READMEs. Display name is stage-dir-relative.
 *
 * The user-facing rule is "if a file isn't handled by another review
 * view, show it under Outputs." That makes Outputs the catch-all so
 * reviewers can never lose visibility on a file the stage put on disk.
 *
 * Dedup is by absolute path: source 1 wins over 2 wins over 3. This
 * preserves existing relativePath conventions for the
 * `/stage-artifacts/:sessionId/*` HTTP route on the artifacts/ entries
 * and on unit-declared paths.
 *
 * Markdown and HTML bodies are inlined; images and unknown extensions are
 * exposed via `relativePath` so the HTTP route can serve them.
 */
export async function parseOutputArtifacts(
	intentDir: string,
): Promise<OutputArtifact[]> {
	const artifacts: OutputArtifact[] = []
	const seen = new Set<string>()
	let stageNames: string[] = []
	try {
		const stagesDir = join(intentDir, "stages")
		const stageEntries = await readdir(stagesDir, { withFileTypes: true })
		stageNames = stageEntries.filter((e) => e.isDirectory()).map((e) => e.name)
		// Source 1: stages/<stage>/artifacts/** walk
		for (const stageName of stageNames) {
			const artifactsDir = join(stagesDir, stageName, "artifacts")
			const files = (await walkArtifactsDir(artifactsDir)).sort()
			for (const fullPath of files) {
				// Path-from-artifacts-root preserves directory hierarchy in the
				// artifact name, so `wireframes/knowledge-upload.html` reads as
				// "wireframes/knowledge-upload" in the review screen instead of
				// colliding with another `knowledge-upload` at a different depth.
				const relFromArtifacts = relative(artifactsDir, fullPath)
				const nameWithDir = relFromArtifacts.replace(/\.[^.]+$/, "")
				const httpPath = `${stageName}/artifacts/${relFromArtifacts}`
				const entry = await buildArtifactEntry(
					fullPath,
					stageName,
					nameWithDir,
					httpPath,
				)
				if (entry) {
					artifacts.push(entry)
					seen.add(fullPath)
				}
			}
		}
	} catch {
		// No stages/ directory
	}
	// Source 2: unit `outputs:` frontmatter (paths often outside stage dir)
	for (const { absPath, artifact } of await parseUnitOutputs(intentDir)) {
		if (seen.has(absPath)) continue
		artifacts.push(artifact)
		seen.add(absPath)
	}
	// Source 3: catch-all walk of every stage dir minus workflow-internal entries
	for (const stageName of stageNames) {
		const stageDir = join(intentDir, "stages", stageName)
		const files = await walkStageDirRecursive(stageDir)
		files.sort((a, b) => a.relFromStage.localeCompare(b.relFromStage))
		for (const { absPath, relFromStage } of files) {
			if (seen.has(absPath)) continue
			const nameWithDir = relFromStage.replace(/\.[^.]+$/, "")
			// HTTP path is intent-dir-relative so the existing
			// `/stage-artifacts/:sessionId/*` route resolves correctly.
			const httpPath = `stages/${stageName}/${relFromStage}`
			const entry = await buildArtifactEntry(
				absPath,
				stageName,
				nameWithDir,
				httpPath,
			)
			if (entry) {
				artifacts.push(entry)
				seen.add(absPath)
			}
		}
	}
	return artifacts
}

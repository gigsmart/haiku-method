import * as Sentry from "@sentry/nextjs"
import matter from "gray-matter"

// Re-export shared types from @haiku/shared
export type {
	HaikuIntent,
	HaikuUnit,
	HaikuStageState,
	HaikuAsset,
	HaikuArtifact,
	HaikuKnowledgeFile,
	HaikuIntentDetail,
	CriterionItem,
} from "@haiku/shared"

// Re-export shared utilities from @haiku/shared
export { formatDuration, formatDate, titleCase } from "@haiku/shared"

// Website-specific types and utilities remain here

export interface BrowseProvider {
	/** List all intents in the workspace. If onProgress is provided, call it as each intent loads. */
	listIntents(onProgress?: (intent: import("@haiku/shared").HaikuIntent) => void): Promise<import("@haiku/shared").HaikuIntent[]>
	/** Get full intent detail including stages, units, knowledge */
	getIntent(slug: string): Promise<import("@haiku/shared").HaikuIntentDetail | null>
	/** Read a raw file from the workspace */
	readFile(path: string): Promise<string | null>
	/** List files matching a pattern in a directory */
	listFiles(dir: string): Promise<string[]>
	/** Write a file to the workspace via commit (optional — not all providers support writes) */
	writeFile?(path: string, content: string, message: string): Promise<boolean>
	/** Read .haiku/settings.yml and return parsed settings, or null if not found */
	getSettings(): Promise<Record<string, unknown> | null>
	/** Provider display name */
	readonly name: string
	/** Check if branches have changed since last poll (ETag-based). Returns true if re-fetch needed. */
	checkForBranchChanges?(): Promise<boolean>
	/** Clear cached branch/intent data so the next fetch gets fresh results. */
	clearBranchCache?(): void
}

export function parseFrontmatter(raw: string): { data: Record<string, unknown>; content: string } {
	const parsed = matter(raw)
	return { data: parsed.data as Record<string, unknown>, content: parsed.content.trim() }
}

/**
 * Dedupe top-level keys in a YAML frontmatter block, keeping the last occurrence.
 * Operates on the whole file: finds the `---` fenced frontmatter, dedupes inside,
 * returns the reassembled document. If there's no frontmatter, returns the input unchanged.
 */
function dedupeFrontmatterKeys(raw: string): { text: string; removed: string[] } {
	const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n[\s\S]*)?$/)
	if (!m) return { text: raw, removed: [] }
	const { cleaned, removed } = dedupeTopLevelYamlKeys(m[1])
	if (removed.length === 0) return { text: raw, removed: [] }
	return { text: `---\n${cleaned}\n---${m[2] ?? ""}`, removed }
}

/**
 * Given a YAML block (no fences), return a version where duplicate top-level keys
 * are reduced to their last occurrence. A "section" is a top-level key line plus
 * any following indented/blank lines until the next top-level key.
 */
function dedupeTopLevelYamlKeys(yaml: string): { cleaned: string; removed: string[] } {
	const lines = yaml.split(/\r?\n/)
	type Section = { key: string | null; text: string[] }
	const sections: Section[] = []
	let current: Section | null = null
	for (const line of lines) {
		const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:/)
		const isTopLevelKey = m != null && !line.startsWith(" ") && !line.startsWith("\t")
		if (isTopLevelKey && m) {
			if (current) sections.push(current)
			current = { key: m[1], text: [line] }
		} else if (current) {
			current.text.push(line)
		} else {
			sections.push({ key: null, text: [line] })
		}
	}
	if (current) sections.push(current)

	const lastIdx = new Map<string, number>()
	for (let i = 0; i < sections.length; i++) {
		const k = sections[i].key
		if (k) lastIdx.set(k, i)
	}
	const seen = new Set<string>()
	const removed: string[] = []
	for (const s of sections) {
		if (!s.key) continue
		if (seen.has(s.key)) continue
		seen.add(s.key)
	}
	// Track which keys had duplicates so callers can log them
	const counts = new Map<string, number>()
	for (const s of sections) {
		if (!s.key) continue
		counts.set(s.key, (counts.get(s.key) ?? 0) + 1)
	}
	for (const [k, n] of counts) if (n > 1) removed.push(k)

	const out: string[] = []
	for (let i = 0; i < sections.length; i++) {
		const s = sections[i]
		if (s.key == null) out.push(...s.text)
		else if (lastIdx.get(s.key) === i) out.push(...s.text)
	}
	return { cleaned: out.join("\n"), removed }
}

function isDuplicateKeyError(err: unknown): boolean {
	const msg = err instanceof Error ? err.message : String(err)
	return /duplicated mapping key/i.test(msg)
}

/**
 * Parse frontmatter, returning null on malformed YAML instead of throwing.
 * On duplicate-key errors, auto-recovers by keeping the last occurrence of each
 * top-level key and reparsing. Reports both recovered and unrecovered parse
 * failures to Sentry so broken files surface in monitoring.
 */
export function safeParseFrontmatter(
	raw: string,
	context: { provider: string; path: string; slug?: string; branch?: string },
): { data: Record<string, unknown>; content: string } | null {
	try {
		return parseFrontmatter(raw)
	} catch (e) {
		if (isDuplicateKeyError(e)) {
			const { text, removed } = dedupeFrontmatterKeys(raw)
			if (removed.length > 0) {
				try {
					const parsed = parseFrontmatter(text)
					console.warn(
						`[haiku-browse] Recovered from duplicate keys at ${context.path}: kept last occurrence of ${removed.join(", ")}`,
					)
					Sentry.captureMessage(`Duplicate YAML keys auto-recovered: ${removed.join(", ")}`, {
						level: "warning",
						tags: { component: "haiku-browse", provider: context.provider, kind: "frontmatter-dedupe" },
						extra: { slug: context.slug, branch: context.branch, path: context.path, removed },
					})
					return parsed
				} catch {
					// Dedupe didn't help — fall through to unrecoverable error
				}
			}
		}
		const err = e instanceof Error ? e : new Error(String(e))
		console.error(`[haiku-browse] Failed to parse frontmatter at ${context.path}:`, err.message)
		Sentry.captureException(err, {
			tags: { component: "haiku-browse", provider: context.provider, kind: "frontmatter-parse" },
			extra: {
				slug: context.slug,
				branch: context.branch,
				path: context.path,
				rawSnippet: raw.slice(0, 500),
			},
		})
		return null
	}
}

/** Parse a unit's frontmatter + content into a HaikuUnit */
export function parseUnit(unitFile: string, stageName: string, raw: string): import("@haiku/shared").HaikuUnit {
	const { data, content } = parseFrontmatter(raw)
	return {
		name: unitFile.replace(".md", ""),
		stage: stageName,
		status: (data.status as string) || "pending",
		dependsOn: (data.depends_on as string[]) || [],
		refs: (data.refs as string[]) || [],
		outputs: (data.outputs as string[]) || [],
		bolt: (data.bolt as number) || 0,
		hat: (data.hat as string) || "",
		startedAt: (data.started_at as string) || null,
		completedAt: (data.completed_at as string) || null,
		criteria: parseCriteria(content),
		content,
		raw: data,
	}
}

export function parseCriteria(content: string): Array<{ text: string; checked: boolean }> {
	const criteria: Array<{ text: string; checked: boolean }> = []
	for (const line of content.split("\n")) {
		const match = line.match(/^-\s*\[([ xX])\]\s*(.+)$/)
		if (match) {
			criteria.push({
				checked: match[1] !== " ",
				text: match[2].trim(),
			})
		}
	}
	return criteria
}

/** Normalize status and compute stagesComplete. Handles "complete" vs "completed".
 *  The status field is the source of truth — completed_at is just a timestamp and
 *  does not override an explicit non-complete status (e.g., a reopened intent). */
export function normalizeIntentStatus(status: string, _completedAt: string | null, stagesComplete: number, stagesTotal: number): { status: string; stagesComplete: number } {
	const isComplete = status === "completed" || status === "complete"
	return {
		status: isComplete ? "completed" : status,
		stagesComplete: isComplete ? stagesTotal : Math.max(0, stagesComplete),
	}
}

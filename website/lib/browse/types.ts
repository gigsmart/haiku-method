import matter from "gray-matter"
import yaml from "js-yaml"

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

// Permissive YAML engine: accepts duplicate mapping keys (last value wins, matching
// JSON.parse semantics) so malformed frontmatter from upstream writers doesn't crash
// the browse UI. If parsing still fails, fall back to empty frontmatter so the body
// is still readable.
const permissiveYaml = {
	parse: (input: string) => yaml.load(input, { json: true }) as object,
	stringify: (obj: object) => yaml.dump(obj),
}

export function parseFrontmatter(raw: string): { data: Record<string, unknown>; content: string } {
	try {
		const parsed = matter(raw, { engines: { yaml: permissiveYaml } })
		return { data: parsed.data as Record<string, unknown>, content: parsed.content.trim() }
	} catch (err) {
		if (typeof window !== "undefined") {
			import("@sentry/nextjs")
				.then((Sentry) => {
					Sentry.captureException(err, { tags: { area: "browse.parseFrontmatter" } })
				})
				.catch(() => {})
		}
		// Strip the frontmatter block (best-effort) so the body is still useful.
		const stripped = raw.replace(/^---\n[\s\S]*?\n---\n?/, "")
		return { data: {}, content: stripped.trim() }
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

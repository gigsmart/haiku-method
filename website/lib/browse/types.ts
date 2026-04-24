import {
	dedupeFrontmatterKeys,
	isDuplicateKeyError,
} from "@haiku/shared/frontmatter"
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
	listIntents(
		onProgress?: (intent: import("@haiku/shared").HaikuIntent) => void,
	): Promise<import("@haiku/shared").HaikuIntent[]>
	/** Get full intent detail including stages, units, knowledge */
	getIntent(
		slug: string,
	): Promise<import("@haiku/shared").HaikuIntentDetail | null>
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

export interface FrontmatterContext {
	provider: string
	path: string
	slug?: string
	branch?: string
}

/**
 * Parse YAML frontmatter from a markdown file. Never throws: duplicate top-level
 * keys are deduped (last-wins) and any other YAML parse error falls back to
 * empty frontmatter with the raw body preserved, so detail views still render
 * something readable. Pass `context` so the recovery path reports the affected
 * file to Sentry — without it, broken files drift silently.
 */
export function parseFrontmatter(
	raw: string,
	context?: FrontmatterContext,
): { data: Record<string, unknown>; content: string } {
	const tryParse = (text: string) => {
		const parsed = matter(text)
		return {
			data: parsed.data as Record<string, unknown>,
			content: parsed.content.trim(),
		}
	}
	try {
		return tryParse(raw)
	} catch (e) {
		const wasDuplicateKey = isDuplicateKeyError(e)
		if (wasDuplicateKey) {
			// Attempt dedupe recovery. Both the dedupe and the reparse are guarded
			// so anything unexpected (weird encoding, shared-util bug) falls through
			// to the empty-frontmatter fallback — parseFrontmatter must never throw.
			try {
				const { text, removed } = dedupeFrontmatterKeys(raw)
				if (removed.length > 0) {
					const parsed = tryParse(text)
					if (context) {
						console.warn(
							`[haiku-browse] Recovered from duplicate keys at ${context.path}: kept last occurrence of ${removed.join(", ")}`,
						)
						Sentry.captureMessage(
							`Duplicate YAML keys auto-recovered: ${removed.join(", ")}`,
							{
								level: "warning",
								tags: {
									component: "haiku-browse",
									provider: context.provider,
									kind: "frontmatter-dedupe",
								},
								extra: {
									slug: context.slug,
									branch: context.branch,
									path: context.path,
									removed,
								},
							},
						)
					}
					return parsed
				}
			} catch {
				// Dedupe didn't help — fall through, tagged as dedupe-failed below.
			}
		}
		const err = e instanceof Error ? e : new Error(String(e))
		if (context) {
			console.error(
				`[haiku-browse] Failed to parse frontmatter at ${context.path}:`,
				err.message,
			)
			// Extract keys from the --- fenced block only — running the regex over
			// the whole document would capture `word:` patterns in markdown body
			// (URLs, assignees, arbitrary prose) and ship them to Sentry.
			const fmBlock = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? ""
			const keyMatches = fmBlock.match(/^([A-Za-z_][A-Za-z0-9_-]*):/gm) ?? []
			const frontmatterKeys = Array.from(
				new Set(keyMatches.map((k) => k.replace(/:$/, ""))),
			)
			Sentry.captureException(err, {
				tags: {
					component: "haiku-browse",
					provider: context.provider,
					// Distinguish irrecoverable dedupe failures from generic parse errors
					// so Sentry triage can separate "bad YAML" from "dedupe-can't-save-it".
					kind: wasDuplicateKey
						? "frontmatter-dedupe-failed"
						: "frontmatter-parse",
				},
				extra: {
					slug: context.slug,
					branch: context.branch,
					path: context.path,
					frontmatterKeys,
				},
			})
		}
		// Strip the fenced frontmatter block so the detail view still renders
		// the body — otherwise the unparseable YAML itself appears as markdown.
		const m = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/)
		const body = m ? m[1] : raw
		return { data: {}, content: body.trim() }
	}
}

/** Parse a unit's frontmatter + content into a HaikuUnit */
export function parseUnit(
	unitFile: string,
	stageName: string,
	raw: string,
	context?: FrontmatterContext,
): import("@haiku/shared").HaikuUnit {
	const { data, content } = parseFrontmatter(raw, context)
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

export function parseCriteria(
	content: string,
): Array<{ text: string; checked: boolean }> {
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
export function normalizeIntentStatus(
	status: string,
	_completedAt: string | null,
	stagesComplete: number,
	stagesTotal: number,
): { status: string; stagesComplete: number } {
	const isComplete = status === "completed" || status === "complete"
	return {
		status: isComplete ? "completed" : status,
		stagesComplete: isComplete ? stagesTotal : Math.max(0, stagesComplete),
	}
}

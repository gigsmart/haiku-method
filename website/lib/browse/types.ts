// Re-export shared types from @haiku/shared
export type {
	HaikuIntent,
	HaikuUnit,
	HaikuStageState,
	HaikuAsset,
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
}

export function parseFrontmatter(raw: string): { data: Record<string, unknown>; content: string } {
	const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
	if (!match) return { data: {}, content: raw }

	const yamlBlock = match[1]
	const content = match[2].trim()
	const data: Record<string, unknown> = {}

	let currentKey = ""
	for (const line of yamlBlock.split("\n")) {
		const kvMatch = line.match(/^(\w[\w-]*):\s*(.*)$/)
		if (kvMatch) {
			currentKey = kvMatch[1]
			const val = kvMatch[2].trim()
			if (val === "" || val === "[]") {
				data[currentKey] = val === "[]" ? [] : ""
			} else if (val.startsWith("[") && val.endsWith("]")) {
				data[currentKey] = val
					.slice(1, -1)
					.split(",")
					.map((s) => s.trim().replace(/^["']|["']$/g, ""))
					.filter(Boolean)
			} else if (val === "true") {
				data[currentKey] = true
			} else if (val === "false") {
				data[currentKey] = false
			} else if (val === "null") {
				data[currentKey] = null
			} else if (/^\d+$/.test(val)) {
				data[currentKey] = parseInt(val, 10)
			} else {
				data[currentKey] = val.replace(/^["']|["']$/g, "")
			}
		} else if (line.match(/^\s+-\s+(.+)$/) && currentKey) {
			const item = line.match(/^\s+-\s+(.+)$/)
			if (item) {
				if (!Array.isArray(data[currentKey])) data[currentKey] = []
				;(data[currentKey] as string[]).push(item[1].trim())
			}
		}
	}

	return { data, content }
}

/** Parse a unit's frontmatter + content into a HaikuUnit */
export function parseUnit(unitFile: string, stageName: string, raw: string): import("@haiku/shared").HaikuUnit {
	const { data, content } = parseFrontmatter(raw)
	return {
		name: unitFile.replace(".md", ""),
		stage: stageName,
		type: (data.type as string) || "",
		status: (data.status as string) || "pending",
		dependsOn: (data.depends_on as string[]) || [],
		refs: (data.refs as string[]) || [],
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

/** Normalize status and compute stagesComplete. Handles "complete" vs "completed" and completedAt. */
export function normalizeIntentStatus(status: string, completedAt: string | null, stagesComplete: number, stagesTotal: number): { status: string; stagesComplete: number } {
	const isComplete = status === "completed" || status === "complete" || !!completedAt
	return {
		status: isComplete ? "completed" : status,
		stagesComplete: isComplete ? stagesTotal : Math.max(0, stagesComplete),
	}
}

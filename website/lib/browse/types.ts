// H·AI·K·U Browse — shared types for local and remote browsing

export interface HaikuIntent {
	slug: string
	title: string
	studio: string
	studioStages: string[]
	activeStage: string
	mode: string
	stagesComplete: number
	stagesTotal: number
	status: string
	startedAt: string | null
	completedAt: string | null
	composite: Array<{ studio: string; stages: string[] }> | null
	raw: Record<string, unknown>
}

export interface HaikuUnit {
	name: string
	stage: string
	type: string
	status: string
	dependsOn: string[]
	bolt: number
	hat: string
	startedAt: string | null
	completedAt: string | null
	criteria: Array<{ text: string; checked: boolean }>
	content: string
	raw: Record<string, unknown>
}

export interface HaikuStageState {
	name: string
	status: "pending" | "active" | "complete"
	phase: string
	startedAt: string | null
	completedAt: string | null
	gateOutcome: string | null
	units: HaikuUnit[]
}

export interface HaikuIntentDetail extends HaikuIntent {
	stages: HaikuStageState[]
	knowledge: string[]
	content: string
}

export interface BrowseProvider {
	/** List all intents in the workspace */
	listIntents(): Promise<HaikuIntent[]>
	/** Get full intent detail including stages, units, knowledge */
	getIntent(slug: string): Promise<HaikuIntentDetail | null>
	/** Read a raw file from the workspace */
	readFile(path: string): Promise<string | null>
	/** List files matching a pattern in a directory */
	listFiles(dir: string): Promise<string[]>
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

export function formatDuration(startedAt: string | null, completedAt: string | null): string {
	if (!startedAt) return ""
	const start = new Date(startedAt).getTime()
	const end = completedAt ? new Date(completedAt).getTime() : Date.now()
	const diffMs = end - start
	const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
	const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
	if (days > 0) return `${days}d ${hours}h`
	if (hours > 0) return `${hours}h`
	const mins = Math.floor(diffMs / (1000 * 60))
	return `${mins}m`
}

export function formatDate(iso: string | null): string {
	if (!iso) return ""
	const d = new Date(iso)
	return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

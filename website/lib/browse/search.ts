import MiniSearch from "minisearch"

export interface SearchDocument {
	id: string
	type: "intent" | "unit" | "knowledge" | "asset"
	title: string
	slug: string
	stage?: string
	studio?: string
	status?: string
	content: string
	path?: string
}

export function createSearchIndex(): MiniSearch<SearchDocument> {
	return new MiniSearch<SearchDocument>({
		fields: ["title", "content", "slug", "stage", "studio", "path"],
		storeFields: [
			"type",
			"title",
			"slug",
			"stage",
			"studio",
			"status",
			"path",
			"content",
		],
		searchOptions: {
			boost: { title: 3, slug: 2, content: 0.5 },
			fuzzy: 0.2,
			prefix: true,
		},
	})
}

/** Extract a short snippet around the first match of the query in the text */
export function extractSnippet(
	text: string,
	query: string,
	maxLen = 120,
): string {
	if (!text || !query) return text.slice(0, maxLen)
	const lower = text.toLowerCase()
	const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
	let bestIdx = -1
	for (const term of terms) {
		const idx = lower.indexOf(term)
		if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) {
			bestIdx = idx
		}
	}
	if (bestIdx === -1) return text.slice(0, maxLen)
	const start = Math.max(0, bestIdx - 40)
	const end = Math.min(text.length, start + maxLen)
	let snippet = text.slice(start, end)
	if (start > 0) snippet = `...${snippet}`
	if (end < text.length) snippet = `${snippet}...`
	return snippet
}

/** Wrap matched terms in the text with <mark> tags, returning an array of React elements */
export function highlightMatches(
	text: string,
	query: string,
): Array<{ text: string; highlighted: boolean }> {
	if (!query.trim()) return [{ text, highlighted: false }]
	const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
	// Build a regex matching any of the search terms
	const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
	const regex = new RegExp(`(${escaped.join("|")})`, "gi")
	const parts: Array<{ text: string; highlighted: boolean }> = []
	let lastIndex = 0
	let match: RegExpExecArray | null = regex.exec(text)
	while (match !== null) {
		if (match.index > lastIndex) {
			parts.push({
				text: text.slice(lastIndex, match.index),
				highlighted: false,
			})
		}
		parts.push({ text: match[0], highlighted: true })
		lastIndex = regex.lastIndex
		match = regex.exec(text)
	}
	if (lastIndex < text.length) {
		parts.push({ text: text.slice(lastIndex), highlighted: false })
	}
	return parts.length > 0 ? parts : [{ text, highlighted: false }]
}

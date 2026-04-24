// Frontmatter YAML utilities shared between the MCP server (packages/haiku)
// and the browse UI (website). Extracted here so duplicate-key recovery
// logic can't drift between call sites.

/**
 * Dedupe top-level keys inside a `---`-fenced YAML frontmatter block, keeping
 * the last occurrence. Returns the rewritten document and the list of keys
 * that had duplicates. If there is no frontmatter or no duplicates, the input
 * is returned unchanged.
 */
export function dedupeFrontmatterKeys(raw: string): {
	text: string
	removed: string[]
} {
	const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n[\s\S]*)?$/)
	if (!m) return { text: raw, removed: [] }
	const { cleaned, removed } = dedupeTopLevelYamlKeys(m[1])
	if (removed.length === 0) return { text: raw, removed: [] }
	return { text: `---\n${cleaned}\n---${m[2] ?? ""}`, removed }
}

/**
 * Given a YAML block (no `---` fences), return a version where duplicate
 * top-level keys are reduced to their last occurrence. A "section" is a
 * top-level key line plus any following indented or blank lines up to the
 * next top-level key, which preserves multi-line nested blocks like
 * `composite:` as a unit.
 */
export function dedupeTopLevelYamlKeys(yamlBlock: string): {
	cleaned: string
	removed: string[]
} {
	const lines = yamlBlock.split(/\r?\n/)
	type Section = { key: string | null; text: string[] }
	const sections: Section[] = []
	let current: Section | null = null
	for (const line of lines) {
		const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:/)
		const isTopLevelKey =
			m != null && !line.startsWith(" ") && !line.startsWith("\t")
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
	const counts = new Map<string, number>()
	for (let i = 0; i < sections.length; i++) {
		const k = sections[i].key
		if (!k) continue
		lastIdx.set(k, i)
		counts.set(k, (counts.get(k) ?? 0) + 1)
	}
	const removed: string[] = []
	for (const [k, n] of counts) if (n > 1) removed.push(k)

	const out: string[] = []
	for (let i = 0; i < sections.length; i++) {
		const s = sections[i]
		if (s.key == null) out.push(...s.text)
		else if (lastIdx.get(s.key) === i) out.push(...s.text)
	}
	return { cleaned: out.join("\n"), removed }
}

// Matches js-yaml v4's "duplicated mapping key" error text (as used by
// gray-matter). The shared `frontmatter-duplicate-key-error` test locks in
// this assumption — if gray-matter ever swaps YAML parsers or the message
// changes, the test catches the drift instead of the recovery path silently
// going dead.
export function isDuplicateKeyError(err: unknown): boolean {
	const msg = err instanceof Error ? err.message : String(err)
	return /duplicated mapping key/i.test(msg)
}

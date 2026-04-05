// hooks/utils.ts — Shared utilities for H·AI·K·U hooks

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs"
import { join, basename, dirname } from "node:path"
import { execSync } from "node:child_process"

/**
 * Read a frontmatter field from a markdown file.
 * Parses the YAML frontmatter block (between --- delimiters) and extracts a scalar value.
 */
export function readFrontmatterField(filePath: string, field: string): string {
	if (!existsSync(filePath)) return ""
	const content = readFileSync(filePath, "utf8")
	const match = content.match(new RegExp(`^${field}:\\s*(.+)$`, "m"))
	return match ? match[1].trim().replace(/^["']|["']$/g, "") : ""
}

/**
 * Read and parse a JSON file, returning empty object if missing/invalid.
 */
export function readJson(filePath: string): Record<string, unknown> {
	if (!existsSync(filePath)) return {}
	try {
		return JSON.parse(readFileSync(filePath, "utf8"))
	} catch {
		return {}
	}
}

/**
 * Write a JSON object to a file atomically.
 */
export function writeJson(filePath: string, data: Record<string, unknown>): void {
	const dir = dirname(filePath)
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
	writeFileSync(filePath, JSON.stringify(data))
}

/**
 * Find the first active intent directory.
 * Scans .haiku/intents/{slug}/intent.md for status: active.
 * Returns the full path to the intent directory, or null if none found.
 */
export function findActiveIntent(): string | null {
	let repoRoot: string
	try {
		repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim()
	} catch {
		repoRoot = process.cwd()
	}
	const intentsDir = join(repoRoot, ".haiku", "intents")
	if (!existsSync(intentsDir)) return null

	const dirs = readdirSync(intentsDir)
	for (const d of dirs) {
		const intentFile = join(intentsDir, d, "intent.md")
		if (!existsSync(intentFile)) continue
		const status = readFrontmatterField(intentFile, "status")
		if (status === "active") {
			return join(intentsDir, d)
		}
	}
	return null
}

/**
 * Load a value from the legacy state/ directory.
 */
export function stateLoad(intentDir: string, key: string): string {
	const filePath = join(intentDir, "state", key)
	if (!existsSync(filePath)) return ""
	return readFileSync(filePath, "utf8")
}

/**
 * Save a value to the legacy state/ directory.
 */
export function stateSave(intentDir: string, key: string, content: string): void {
	const stateDir = join(intentDir, "state")
	if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true })
	writeFileSync(join(stateDir, key), content)
}

/**
 * Check if current branch is a unit branch (haiku/{slug}/{unit}).
 */
export function isUnitBranch(branch: string): boolean {
	if (!branch) return false
	const parts = branch.split("/")
	// haiku/{slug}/{something} where something is not "main"
	return parts.length >= 3 && parts[0] === "haiku" && parts[2] !== "main"
}

/**
 * Get the current git branch name.
 */
export function getCurrentBranch(): string {
	try {
		return execSync("git branch --show-current", { encoding: "utf8" }).trim()
	} catch {
		return ""
	}
}

/**
 * Get the git repo root.
 */
export function getRepoRoot(): string {
	try {
		return execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim()
	} catch {
		return process.cwd()
	}
}

/**
 * Validate JSON string, returns true if valid.
 */
export function isValidJson(s: string): boolean {
	try {
		JSON.parse(s)
		return true
	} catch {
		return false
	}
}

/**
 * Glob for unit files within an intent directory.
 * Returns paths matching stages/{stage}/units/unit-NN-slug.md
 */
export function findUnitFiles(intentDir: string): string[] {
	const results: string[] = []
	const stagesDir = join(intentDir, "stages")
	if (!existsSync(stagesDir)) return results

	for (const stage of readdirSync(stagesDir)) {
		const unitsDir = join(stagesDir, stage, "units")
		if (!existsSync(unitsDir) || !statSync(unitsDir).isDirectory()) continue
		for (const file of readdirSync(unitsDir)) {
			if (file.startsWith("unit-") && file.endsWith(".md")) {
				results.push(join(unitsDir, file))
			}
		}
	}
	return results
}

/**
 * Read frontmatter YAML array from a markdown file (e.g., quality_gates, depends_on).
 * Handles both inline arrays [a, b] and multi-line - item format.
 * Returns parsed array or empty array.
 */
export function readFrontmatterArray(filePath: string, field: string): Array<Record<string, string>> {
	if (!existsSync(filePath)) return []
	const content = readFileSync(filePath, "utf8")

	// Extract frontmatter block
	const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
	if (!fmMatch) return []
	const frontmatter = fmMatch[1]

	// Try to find the field and parse as YAML-ish
	// For quality_gates which is an array of objects with name/command:
	//   quality_gates:
	//     - name: tests
	//       command: npm test
	const lines = frontmatter.split("\n")
	let inField = false
	let currentItem: Record<string, string> = {}
	const items: Array<Record<string, string>> = []

	for (const line of lines) {
		if (line.match(new RegExp(`^${field}:`))) {
			// Check for inline empty array
			if (line.match(/\[\s*\]/)) return []
			inField = true
			continue
		}

		if (inField) {
			// Non-indented line that isn't a continuation = end of field
			if (!line.startsWith(" ") && !line.startsWith("\t") && line.trim() !== "") {
				break
			}

			const itemStart = line.match(/^\s+-\s+(.*)/)
			if (itemStart) {
				// Push previous item if it exists
				if (Object.keys(currentItem).length > 0) {
					items.push(currentItem)
				}
				currentItem = {}
				// Parse key: value on same line as dash
				const kv = itemStart[1].match(/^(\w+):\s*(.+)/)
				if (kv) {
					currentItem[kv[1]] = kv[2].replace(/^["']|["']$/g, "")
				}
			} else {
				// Continuation key: value under current item
				const kv = line.match(/^\s+(\w+):\s*(.+)/)
				if (kv) {
					currentItem[kv[1]] = kv[2].replace(/^["']|["']$/g, "")
				}
			}
		}
	}
	// Push last item
	if (Object.keys(currentItem).length > 0) {
		items.push(currentItem)
	}

	return items
}

/**
 * Set a field in a frontmatter-bearing markdown file.
 * Updates in-place if the field exists, appends to frontmatter if not.
 */
export function setFrontmatterField(filePath: string, field: string, value: string): void {
	if (!existsSync(filePath)) return
	let content = readFileSync(filePath, "utf8")
	const regex = new RegExp(`^(${field}:)\\s*.+$`, "m")
	if (regex.test(content)) {
		content = content.replace(regex, `$1 ${value}`)
	} else {
		// Insert before closing ---
		content = content.replace(/^---$/m, `${field}: ${value}\n---`)
	}
	writeFileSync(filePath, content)
}

/**
 * Check off all markdown checkboxes (- [ ] -> - [x]) in a file,
 * optionally scoped to a section.
 */
export function checkAllCriteria(filePath: string, section?: string): void {
	if (!existsSync(filePath)) return
	let content = readFileSync(filePath, "utf8")

	if (!section) {
		content = content.replace(/- \[ \]/g, "- [x]")
	} else {
		const lines = content.split("\n")
		let inSection = false
		for (let i = 0; i < lines.length; i++) {
			if (lines[i].startsWith("## ")) {
				inSection = lines[i].includes(section)
			}
			if (inSection) {
				lines[i] = lines[i].replace(/- \[ \]/g, "- [x]")
			}
		}
		content = lines.join("\n")
	}
	writeFileSync(filePath, content)
}

/**
 * Check off completion criteria for an intent.
 */
export function checkIntentCriteria(intentDir: string): void {
	const intentFile = join(intentDir, "intent.md")
	if (existsSync(intentFile)) {
		const content = readFileSync(intentFile, "utf8")
		if (content.includes("## Success Criteria")) {
			checkAllCriteria(intentFile, "Success Criteria")
		} else if (content.includes("## Completion Criteria")) {
			checkAllCriteria(intentFile, "Completion Criteria")
		}
	}

	for (const f of [join(intentDir, "completion-criteria.md"), join(intentDir, "state", "completion-criteria.md")]) {
		if (existsSync(f)) checkAllCriteria(f)
	}
}

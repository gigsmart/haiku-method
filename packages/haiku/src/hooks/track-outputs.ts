// track-outputs — PostToolUse hook for Write/Edit
//
// When the agent writes a file inside an intent's stage directory (artifacts,
// knowledge, etc.), auto-append the path to the active unit's `outputs:`
// frontmatter field. This removes the need for the agent to manually track
// what it produces — the harness does it deterministically.

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import matter from "gray-matter"

export async function trackOutputs(
	input: Record<string, unknown>,
	_pluginRoot: string,
): Promise<void> {
	const toolInput = (input.tool_input || {}) as Record<string, unknown>
	const filePath =
		(toolInput.file_path as string) ||
		(toolInput.path as string) ||
		(input.file_path as string) ||
		(input.path as string) ||
		""
	if (!filePath) return

	const absPath = resolve(process.cwd(), filePath)

	// Match files inside .haiku/intents/{slug}/
	const intentMatch = absPath.match(/\.haiku\/intents\/([^/]+)\/(.+)$/)
	if (!intentMatch) return

	const [, intentSlug, intentRelPath] = intentMatch

	// Determine if this is a trackable output
	const stageMatch = intentRelPath.match(/^stages\/([^/]+)\/(.+)$/)
	const knowledgeMatch = intentRelPath.match(/^knowledge\/(.+)$/)

	if (!stageMatch && !knowledgeMatch) return

	// Skip unit spec files and state files — they're not outputs
	if (stageMatch) {
		const rest = stageMatch[2]
		if (rest.startsWith("units/")) return
		if (rest === "state.json") return
	}

	const intentDir = join(process.cwd(), ".haiku", "intents", intentSlug)
	if (!existsSync(intentDir)) return

	const relPath = relative(intentDir, absPath)
	const targetStage = stageMatch ? stageMatch[1] : null

	// Find the active unit — prefer the specific stage, fall back to any active unit
	const activeUnitPath = targetStage
		? findActiveUnitInStage(intentDir, targetStage) ||
			findAnyActiveUnit(intentDir)
		: findAnyActiveUnit(intentDir)

	if (!activeUnitPath) return

	// Read the unit and update outputs
	// NOTE: Unguarded read-modify-write. During parallel wave execution, two hooks
	// can race on the same active unit (especially knowledge/ writes via findAnyActiveUnit).
	// Last write wins — the other output entry is silently lost. Stage-specific writes
	// are safer (findActiveUnitInStage). Future: lock file or append-only sidecar.
	const unitRaw = readFileSync(activeUnitPath, "utf8")
	const { data, content } = matter(unitRaw)
	const outputs = (data.outputs as string[]) || []

	// Don't add duplicates
	if (outputs.includes(relPath)) return

	outputs.push(relPath)
	data.outputs = outputs

	const updated = matter.stringify(content, data)
	writeFileSync(activeUnitPath, updated)
}

function findActiveUnitInStage(
	intentDir: string,
	stage: string,
): string | null {
	const unitsDir = join(intentDir, "stages", stage, "units")
	if (!existsSync(unitsDir)) return null
	for (const f of readdirSync(unitsDir).filter((u) => u.endsWith(".md"))) {
		const unitPath = join(unitsDir, f)
		const { data } = matter(readFileSync(unitPath, "utf8"))
		if (data.status === "active") return unitPath
	}
	return null
}

function findAnyActiveUnit(intentDir: string): string | null {
	const stagesDir = join(intentDir, "stages")
	if (!existsSync(stagesDir)) return null
	for (const stage of readdirSync(stagesDir, { withFileTypes: true })) {
		if (!stage.isDirectory()) continue
		const found = findActiveUnitInStage(intentDir, stage.name)
		if (found) return found
	}
	return null
}

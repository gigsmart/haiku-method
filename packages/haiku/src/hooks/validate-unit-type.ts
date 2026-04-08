// validate-unit-type — PostToolUse hook for Write/Edit on unit files
//
// Layer 1: When the agent writes a unit file, validate that the unit's
// type matches the stage's allowed unit_types. If not, warn the agent
// immediately so it can correct the file before proceeding.
//
// This catches bad units at creation time — before haiku_unit_start.

import { existsSync, readFileSync } from "node:fs"
import { join, resolve, basename, dirname } from "node:path"
import matter from "gray-matter"

function out(s: string): void {
	process.stdout.write(s + "\n")
}

export async function validateUnitType(input: Record<string, unknown>, pluginRoot: string): Promise<void> {
	// Check if the written/edited file is a unit file
	const filePath = (input.file_path as string) || (input.path as string) || ""
	if (!filePath) return

	const absPath = resolve(process.cwd(), filePath)

	// Must be inside .haiku/intents/{slug}/stages/{stage}/units/
	const haikuMatch = absPath.match(/\.haiku\/intents\/([^/]+)\/stages\/([^/]+)\/units\/([^/]+\.md)$/)
	if (!haikuMatch) return

	const [, intentSlug, stageName, unitFile] = haikuMatch

	// Read the unit's frontmatter to get its type
	if (!existsSync(absPath)) return
	const raw = readFileSync(absPath, "utf8")
	const { data } = matter(raw)
	const unitType = (data.type as string) || ""
	if (!unitType) return

	// Read the intent to get its studio
	const intentFile = join(process.cwd(), ".haiku", "intents", intentSlug, "intent.md")
	if (!existsSync(intentFile)) return
	const { data: intentFm } = matter(readFileSync(intentFile, "utf8"))
	const studio = (intentFm.studio as string) || ""
	if (!studio) return

	// Read the stage definition to get allowed unit_types
	const stageFile = findStageFile(studio, stageName, pluginRoot)
	if (!stageFile) return
	const { data: stageFm } = matter(readFileSync(stageFile, "utf8"))
	const allowedTypes = (stageFm.unit_types as string[]) || []
	if (allowedTypes.length === 0) return

	// Validate
	if (!allowedTypes.includes(unitType)) {
		out(`⚠️ UNIT TYPE VIOLATION: Unit '${basename(unitFile, ".md")}' has type '${unitType}' but stage '${stageName}' only allows: ${allowedTypes.join(", ")}.`)
		out(`This unit belongs in a different stage. Change its type to one of [${allowedTypes.join(", ")}] or move it to the appropriate stage.`)
	}
}

function findStageFile(studio: string, stage: string, pluginRoot: string): string | null {
	for (const base of [join(process.cwd(), ".haiku", "studios"), join(pluginRoot, "studios")]) {
		const file = join(base, studio, "stages", stage, "STAGE.md")
		if (existsSync(file)) return file
	}
	return null
}

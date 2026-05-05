// output-declared-by.ts — Build the inverse of `outputs:` frontmatter:
// for every unit-declared output path, list the unit slug(s) that
// declared it.
//
// The review UI uses this map to render a banner above output content
// ("Declared by: unit-04-acceptance, unit-05-coverage") so a reviewer
// inspecting a deliverable can jump back to the unit that owned it.
// This is the inverse of `buildUnitOutputPreviews` (unit → outputs
// map) and is computed server-side at session creation so the SPA
// doesn't have to do the inversion per-render.
//
// Path safety: declared output strings come from agent-authored
// frontmatter that an adversary could craft. We drop anything that
// resolves outside the intent dir, the same guard `parseUnitOutputs`
// uses.

import type { Dirent } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { basename, join, relative, resolve } from "node:path"
import matter from "gray-matter"
import { intentRelativeOutputPath } from "./parser.js"

/** Match the unit-file naming convention. Mirrored from parser.ts so
 *  scratch READMEs / drafts in `units/` don't get scanned. */
const UNIT_FILENAME_RE = /^unit-\d{2,}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/

/**
 * Build the inverse output→units map. Returns a record keyed by the
 * intent-dir-relative output path; each value is the list of unit
 * slugs that declared that path in their `outputs:` frontmatter.
 *
 * Slugs are filename-stems (`unit-04-acceptance.md` → `unit-04-acceptance`)
 * to match the convention `parseAllUnits` uses for `ParsedUnit.slug`.
 *
 * Multiple units may declare the same output (rare, usually the
 * fix-loop's feedback-assessor closing the same artifact); the value
 * preserves declaration order via `readdir` sort.
 */
export async function buildOutputDeclaredBy(
	intentDir: string,
): Promise<Record<string, string[]>> {
	const intentDirAbs = resolve(intentDir)
	const intentDirAbsSlash = `${intentDirAbs}/`

	const out: Record<string, string[]> = {}

	let stageEntries: Dirent<string>[]
	try {
		stageEntries = await readdir(join(intentDir, "stages"), {
			withFileTypes: true,
			encoding: "utf8",
		})
	} catch {
		return out
	}

	for (const stageEntry of stageEntries) {
		if (!stageEntry.isDirectory()) continue
		const unitsDir = join(intentDir, "stages", stageEntry.name, "units")
		let unitFiles: string[]
		try {
			unitFiles = (
				await readdir(unitsDir, { withFileTypes: true, encoding: "utf8" })
			)
				.filter((e) => e.isFile() && UNIT_FILENAME_RE.test(e.name))
				.map((e) => e.name)
				.sort()
		} catch {
			continue
		}

		for (const unitFile of unitFiles) {
			const unitPath = join(unitsDir, unitFile)
			const unitSlug = basename(unitFile, ".md")
			let outputs: string[]
			try {
				const raw = await readFile(unitPath, "utf-8")
				const fmOutputs = (matter(raw).data as { outputs?: unknown }).outputs
				outputs = Array.isArray(fmOutputs)
					? fmOutputs.filter((p): p is string => typeof p === "string")
					: []
			} catch {
				continue
			}
			for (const declared of outputs) {
				const intentRel = intentRelativeOutputPath(declared, intentDir)
				const absPath = resolve(intentDirAbs, intentRel)
				if (
					absPath !== intentDirAbs &&
					!absPath.startsWith(intentDirAbsSlash)
				) {
					continue
				}
				const safeRel = relative(intentDirAbs, absPath)
				if (!out[safeRel]) out[safeRel] = []
				if (!out[safeRel].includes(unitSlug)) out[safeRel].push(unitSlug)
			}
		}
	}
	return out
}

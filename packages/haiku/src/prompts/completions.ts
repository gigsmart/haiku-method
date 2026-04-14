// prompts/completions.ts — Argument completion providers

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { findHaikuRoot, intentDir, parseFrontmatter } from "../state-tools.js"
import {
	listStudios as listStudioInfos,
	resolveStudio,
} from "../studio-reader.js"
import { studioSearchPaths, validateIdentifier } from "./helpers.js"

/**
 * Filter and sort candidates: prefix matches first, then substring, case-insensitive.
 * Max 100 results.
 */
function filterAndSort(candidates: string[], value: string): string[] {
	if (!value) return candidates.slice(0, 100)
	const lower = value.toLowerCase()
	const prefix: string[] = []
	const substring: string[] = []
	for (const c of candidates) {
		const cl = c.toLowerCase()
		if (cl.startsWith(lower)) prefix.push(c)
		else if (cl.includes(lower)) substring.push(c)
	}
	return [...prefix, ...substring].slice(0, 100)
}

/** Complete intent slugs from .haiku/intents/ */
export async function completeIntentSlug(value: string): Promise<string[]> {
	try {
		const root = findHaikuRoot()
		const intentsDir = join(root, "intents")
		if (!existsSync(intentsDir)) return []
		const slugs = readdirSync(intentsDir, { withFileTypes: true })
			.filter(
				(d) =>
					d.isDirectory() && existsSync(join(intentsDir, d.name, "intent.md")),
			)
			.map((d) => {
				const mtime = statSync(join(intentsDir, d.name, "intent.md")).mtimeMs
				return { name: d.name, mtime }
			})
			.sort((a, b) => b.mtime - a.mtime)
			.map((d) => d.name)
		return filterAndSort(slugs, value)
	} catch {
		return []
	}
}

/** Complete stage names from an intent's studio, or all studios if no context */
export async function completeStage(
	value: string,
	context?: Record<string, string>,
): Promise<string[]> {
	try {
		const studio = resolveStudioFromContext(context)
		if (!studio) return []
		const stages = resolveStudioStages(studio)
		return filterAndSort(stages, value)
	} catch {
		return []
	}
}

/** Complete studio names from built-in + project studios */
export async function completeStudio(value: string): Promise<string[]> {
	try {
		const studios = listStudios()
		return filterAndSort(studios, value)
	} catch {
		return []
	}
}

/** Complete template names from a studio's templates/ directory */
export async function completeTemplate(
	value: string,
	context?: Record<string, string>,
): Promise<string[]> {
	try {
		const studio = context?.studio
		if (!studio) {
			// List templates across all studios
			const all: string[] = []
			for (const s of listStudios()) {
				all.push(...listTemplates(s))
			}
			return filterAndSort(all, value)
		}
		return filterAndSort(listTemplates(studio), value)
	} catch {
		return []
	}
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolveStudioFromContext(
	context?: Record<string, string>,
): string | null {
	// If intent is in context, resolve its studio
	if (context?.intent) {
		try {
			validateIdentifier(context.intent, "intent slug")
			const dir = intentDir(context.intent)
			const raw = readFileSync(join(dir, "intent.md"), "utf8")
			const { data } = parseFrontmatter(raw)
			if (typeof data.studio === "string") return data.studio
		} catch {
			// fall through
		}
	}
	// If studio is in context directly
	if (context?.studio) return context.studio
	return null
}

function resolveStudioStages(studio: string): string[] {
	validateIdentifier(studio, "studio")
	// Resolve any identifier (dir, name, slug, alias) to the actual directory first
	const info = resolveStudio(studio)
	const dir = info ? info.dir : studio
	for (const base of studioSearchPaths()) {
		const studioDir = join(base, dir)
		if (!existsSync(join(studioDir, "STUDIO.md"))) continue
		const stagesDir = join(studioDir, "stages")
		if (!existsSync(stagesDir)) continue // fall through to next search path
		const stages = readdirSync(stagesDir, { withFileTypes: true })
			.filter(
				(d) =>
					d.isDirectory() && existsSync(join(stagesDir, d.name, "STAGE.md")),
			)
			.map((d) => d.name)
		if (stages.length > 0) return stages
		// STUDIO.md exists but stages/ is empty — fall through to next search path
	}
	return []
}

// Returns every form a user might type to reach a studio: canonical name, slug,
// dir name, and any aliases. Used for tab-completion.
function listStudios(): string[] {
	const ids = new Set<string>()
	for (const s of listStudioInfos()) {
		ids.add(s.name)
		ids.add(s.slug)
		ids.add(s.dir)
		for (const a of s.aliases) ids.add(a)
	}
	return Array.from(ids)
}

function listTemplates(studio: string): string[] {
	validateIdentifier(studio, "studio")
	const seen = new Set<string>()
	for (const base of studioSearchPaths()) {
		const templatesDir = join(base, studio, "templates")
		if (!existsSync(templatesDir)) continue
		for (const d of readdirSync(templatesDir, { withFileTypes: true })) {
			if (d.isFile() && d.name.endsWith(".md")) {
				seen.add(d.name.replace(/\.md$/, ""))
			}
		}
	}
	return Array.from(seen)
}

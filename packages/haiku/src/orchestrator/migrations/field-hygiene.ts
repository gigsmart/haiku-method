// orchestrator/migrations/field-hygiene.ts — Post-migration cruft
// detector. Walks an intent dir, parses every intent.md / unit.md /
// feedback.md, and lists every frontmatter key that survived the
// migration but is NOT in the v4-known set.
//
// Why: the v0→v4 migrator's `DEPRECATED_*_FIELDS` constants are a
// denylist. Anything not in the denylist persists silently as cruft
// — `additionalProperties: true` on the v4 FM schemas means it
// doesn't break behavior, but it accumulates. A real production v3
// intent may carry abandoned-experimental fields the original
// authors never intended to keep. This script lists them so an
// operator can decide whether to delete or document.
//
// Usage:
//   import { auditIntentFields } from ".../field-hygiene.js"
//   const report = auditIntentFields(intentDir)
//   // report.intent: string[] — unknown intent.md keys
//   // report.units: { unit: string; unknown: string[] }[]
//   // report.feedback: { fb: string; unknown: string[] }[]

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import matter from "gray-matter"

// v4-known key sets. Sourced from the FM schemas + post-migrator
// expected shape. NOT a denylist; if a key isn't here, the script
// flags it as cruft.

const KNOWN_INTENT_KEYS = new Set([
	// Core (preserved through migration)
	"title",
	"description",
	"studio",
	"mode",
	"slug",
	"granularity",
	"skip_stages",
	"intent_completion_review",
	"follows",
	"archived",
	"archived_at",
	"created_at",
	"created", // legacy alias kept for now
	"stages",
	// v4 FSM fields
	"plugin_version",
	"started_at",
	"approvals",
	"sealed_at",
	"reviews",
	"discovery",
])

const KNOWN_UNIT_KEYS = new Set([
	// Core
	"title",
	"depends_on",
	"inputs",
	"refs",
	"outputs",
	"quality_gates",
	"model",
	"closes",
	"applicable_skills",
	"stage",
	"discipline",
	"created_at",
	// v4 FSM fields
	"started_at",
	"iterations",
	"reviews",
	"approvals",
	"discovery",
])

const KNOWN_FB_KEYS = new Set([
	// Create-time fields
	"title",
	"origin",
	"author",
	"author_type",
	"created_at",
	"source_ref",
	"attachment",
	"inline_anchor",
	"targets",
	// Engine-driven
	"iterations",
	"closed_at",
	"closure_reply",
	"closure_reply_unread",
	// Reply thread
	"replies",
])

export interface FieldHygieneReport {
	intent: string[]
	units: { unit: string; unknown: string[] }[]
	feedback: { fb: string; unknown: string[] }[]
}

function unknownKeys(
	data: Record<string, unknown>,
	known: Set<string>,
): string[] {
	return Object.keys(data)
		.filter((k) => !known.has(k))
		.sort()
}

export function auditIntentFields(intentDir: string): FieldHygieneReport {
	const report: FieldHygieneReport = {
		intent: [],
		units: [],
		feedback: [],
	}

	// 1. intent.md
	const intentFile = join(intentDir, "intent.md")
	if (existsSync(intentFile)) {
		const { data } = matter(readFileSync(intentFile, "utf8"))
		report.intent = unknownKeys(
			data as Record<string, unknown>,
			KNOWN_INTENT_KEYS,
		)
	}

	// 2. units (per stage)
	const stagesDir = join(intentDir, "stages")
	if (existsSync(stagesDir)) {
		for (const stage of readdirSync(stagesDir, { withFileTypes: true })) {
			if (!stage.isDirectory()) continue
			const unitsDir = join(stagesDir, stage.name, "units")
			if (existsSync(unitsDir)) {
				for (const f of readdirSync(unitsDir)) {
					if (!f.endsWith(".md")) continue
					const { data } = matter(readFileSync(join(unitsDir, f), "utf8"))
					const unknown = unknownKeys(
						data as Record<string, unknown>,
						KNOWN_UNIT_KEYS,
					)
					if (unknown.length > 0) {
						report.units.push({ unit: `${stage.name}/${f}`, unknown })
					}
				}
			}
			// Stage feedback
			const fbDir = join(stagesDir, stage.name, "feedback")
			if (existsSync(fbDir)) {
				for (const f of readdirSync(fbDir)) {
					if (!f.endsWith(".md")) continue
					const { data } = matter(readFileSync(join(fbDir, f), "utf8"))
					const unknown = unknownKeys(
						data as Record<string, unknown>,
						KNOWN_FB_KEYS,
					)
					if (unknown.length > 0) {
						report.feedback.push({ fb: `${stage.name}/${f}`, unknown })
					}
				}
			}
		}
	}

	// 3. Intent-scope feedback
	const intentFbDir = join(intentDir, "feedback")
	if (existsSync(intentFbDir)) {
		for (const f of readdirSync(intentFbDir)) {
			if (!f.endsWith(".md")) continue
			const { data } = matter(readFileSync(join(intentFbDir, f), "utf8"))
			const unknown = unknownKeys(
				data as Record<string, unknown>,
				KNOWN_FB_KEYS,
			)
			if (unknown.length > 0) {
				report.feedback.push({ fb: `_intent/${f}`, unknown })
			}
		}
	}

	return report
}

/** Render the report as human-readable markdown. Empty report → empty
 *  string (no noise when migration is fully clean). */
export function renderHygieneReport(report: FieldHygieneReport): string {
	const lines: string[] = []
	const totalUnknown =
		report.intent.length +
		report.units.reduce((acc, u) => acc + u.unknown.length, 0) +
		report.feedback.reduce((acc, f) => acc + f.unknown.length, 0)
	if (totalUnknown === 0) return ""

	lines.push("# Field Hygiene Report")
	lines.push("")
	lines.push(
		`Found ${totalUnknown} frontmatter key(s) that aren't in the v4-known set. These persist as cruft after migration — they don't break v4 behavior (FM schemas use \`additionalProperties: true\`) but they're noise on disk.`,
	)
	lines.push("")
	if (report.intent.length > 0) {
		lines.push("## intent.md")
		for (const k of report.intent) lines.push(`  - \`${k}\``)
		lines.push("")
	}
	if (report.units.length > 0) {
		lines.push("## Units")
		for (const u of report.units) {
			lines.push(`  - **${u.unit}**`)
			for (const k of u.unknown) lines.push(`    - \`${k}\``)
		}
		lines.push("")
	}
	if (report.feedback.length > 0) {
		lines.push("## Feedback")
		for (const f of report.feedback) {
			lines.push(`  - **${f.fb}**`)
			for (const k of f.unknown) lines.push(`    - \`${k}\``)
		}
		lines.push("")
	}
	return lines.join("\n")
}

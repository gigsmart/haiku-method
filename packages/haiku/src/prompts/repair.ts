// prompts/repair.ts — Intent repair: scan for metadata issues and guide repair

import { registerPrompt } from "./index.js"
import { completeIntentSlug } from "./completions.js"
import { textMsg, readJson, studioSearchPaths, validateIdentifier, singleMessage } from "./helpers.js"
import { findHaikuRoot, parseFrontmatter } from "../state-tools.js"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

// ── Types ───────────────────────────────────────────────────────────────────

interface Issue {
	intent: string
	field: string
	severity: "error" | "warning"
	message: string
	fix: string
}

// ── haiku:repair ────────────────────────────────────────────────────────────

registerPrompt({
	name: "haiku:repair",
	title: "Repair Intents",
	description: "Scan intents for metadata issues and guide repair",
	arguments: [
		{
			name: "intent",
			description: "Specific intent slug to repair, or omit to scan all",
			required: false,
			completer: completeIntentSlug,
		},
	],
	handler: async (args) => {
		let root: string
		try {
			root = findHaikuRoot()
		} catch {
			return singleMessage("No .haiku/ directory found.")
		}

		// Resolve available studios: name → stage names
		const studioMap = new Map<string, string[]>()
		for (const base of studioSearchPaths()) {
			if (!existsSync(base)) continue
			for (const d of readdirSync(base, { withFileTypes: true })) {
				if (!d.isDirectory() || studioMap.has(d.name)) continue
				const studioMd = join(base, d.name, "STUDIO.md")
				if (!existsSync(studioMd)) continue
				const { data } = parseFrontmatter(readFileSync(studioMd, "utf8"))
				const stages = Array.isArray(data.stages) ? (data.stages as string[]) : []
				studioMap.set(d.name, stages)
			}
		}

		// Collect intent slugs to scan
		const intentsDir = join(root, "intents")
		if (!existsSync(intentsDir)) return singleMessage("No intents directory found.")

		let slugs: string[]
		if (args.intent) {
			validateIdentifier(args.intent, "intent slug")
			if (!existsSync(join(intentsDir, args.intent, "intent.md"))) {
				return singleMessage(`Intent '${args.intent}' not found.`)
			}
			slugs = [args.intent]
		} else {
			slugs = readdirSync(intentsDir, { withFileTypes: true })
				.filter(d => d.isDirectory() && existsSync(join(intentsDir, d.name, "intent.md")))
				.map(d => d.name)
		}

		if (slugs.length === 0) return singleMessage("No intents found.")

		// Scan each intent
		const allIssues: Issue[] = []
		const cleanIntents: string[] = []
		const unitPattern = /^unit-\d{2,}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/

		for (const slug of slugs) {
			const intentPath = join(intentsDir, slug, "intent.md")
			const raw = readFileSync(intentPath, "utf8")
			const { data } = parseFrontmatter(raw)
			const issues: Issue[] = []

			// a. Missing title
			if (!data.title || (typeof data.title === "string" && data.title.trim() === "")) {
				issues.push({ intent: slug, field: "title", severity: "error", message: "Missing title field", fix: "Add `title` field with a descriptive name" })
			}

			// b. Missing studio
			if (!data.studio) {
				issues.push({ intent: slug, field: "studio", severity: "error", message: "Missing studio field", fix: "Set `studio` to an available studio" })
			}

			// c. Invalid studio
			const studio = data.studio as string | undefined
			if (studio && !studioMap.has(studio)) {
				const available = Array.from(studioMap.keys()).join(", ")
				issues.push({ intent: slug, field: "studio", severity: "error", message: `Studio '${studio}' not found`, fix: `Studio '${studio}' not found. Available: ${available}` })
			}

			// d. Missing stages
			const stages = data.stages
			if (!Array.isArray(stages) || stages.length === 0) {
				if (studio && studioMap.has(studio)) {
					const expected = studioMap.get(studio)!.join(", ")
					issues.push({ intent: slug, field: "stages", severity: "error", message: "Missing or empty stages array", fix: `Set \`stages\` to match studio definition: [${expected}]` })
				} else {
					issues.push({ intent: slug, field: "stages", severity: "error", message: "Missing or empty stages array", fix: "Set `stages` to match studio definition" })
				}
			}

			// e. Stages mismatch
			if (Array.isArray(stages) && stages.length > 0 && studio && studioMap.has(studio)) {
				const expected = studioMap.get(studio)!
				const actual = stages as string[]
				if (JSON.stringify(expected) !== JSON.stringify(actual)) {
					issues.push({ intent: slug, field: "stages", severity: "warning", message: "Stages don't match studio definition", fix: `Stages don't match studio definition. Expected: [${expected.join(", ")}], got: [${actual.join(", ")}]` })
				}
			}

			// f. Missing status
			if (!data.status) {
				issues.push({ intent: slug, field: "status", severity: "error", message: "Missing status field", fix: "Set `status` to 'active' or 'completed'" })
			}

			// g. Missing mode
			if (!data.mode) {
				issues.push({ intent: slug, field: "mode", severity: "error", message: "Missing mode field", fix: "Set `mode` to 'continuous' or 'discrete'" })
			}

			// h. Legacy created field
			if (data.created && !data.created_at) {
				issues.push({ intent: slug, field: "created", severity: "warning", message: "Legacy `created` field found", fix: "Rename `created` to `created_at`" })
			}

			// i. Missing created_at
			if (!data.created && !data.created_at) {
				issues.push({ intent: slug, field: "created_at", severity: "warning", message: "Missing created_at field", fix: "Add `created_at` with an ISO date" })
			}

			// j. Invalid active_stage
			if (data.active_stage && Array.isArray(stages) && stages.length > 0) {
				if (!stages.includes(data.active_stage)) {
					issues.push({ intent: slug, field: "active_stage", severity: "error", message: `active_stage '${data.active_stage}' not in stages list`, fix: `active_stage '${data.active_stage}' not in stages list` })
				}
			}

			// k. Missing active_stage for active intents
			if (data.status === "active" && !data.active_stage) {
				issues.push({ intent: slug, field: "active_stage", severity: "warning", message: "Active intent has no active_stage", fix: "Active intent has no active_stage. Set to the first stage." })
			}

			// l. Stage state consistency
			if (Array.isArray(stages) && stages.length > 0) {
				const stagesDir = join(intentsDir, slug, "stages")
				const activeStage = data.active_stage as string | undefined
				const validStatuses = ["pending", "active", "completed"]
				for (const stageName of stages as string[]) {
					const stageDir = join(stagesDir, stageName)
					const stateFile = join(stageDir, "state.json")
					if (existsSync(stateFile)) {
						const state = readJson(stateFile)
						if (state.status && !validStatuses.includes(state.status as string)) {
							issues.push({ intent: slug, field: `stages/${stageName}/state.json`, severity: "error", message: `Invalid stage status: '${state.status}'`, fix: `Set status to one of: ${validStatuses.join(", ")}` })
						}
					} else if (existsSync(stageDir) && activeStage) {
						const activeIdx = (stages as string[]).indexOf(activeStage)
						const thisIdx = (stages as string[]).indexOf(stageName)
						if (thisIdx < activeIdx) {
							issues.push({ intent: slug, field: `stages/${stageName}/state.json`, severity: "warning", message: "Stage directory exists but has no state.json (before active_stage)", fix: `Create state.json with {"status": "pending", "phase": "elaborate"}` })
						}
					}
				}
			}

			// m. Unit filename format
			if (Array.isArray(stages)) {
				for (const stageName of stages as string[]) {
					const unitsDir = join(intentsDir, slug, "stages", stageName, "units")
					if (!existsSync(unitsDir)) continue
					for (const f of readdirSync(unitsDir, { withFileTypes: true })) {
						if (!f.isFile() || !f.name.endsWith(".md")) continue
						if (!unitPattern.test(f.name)) {
							issues.push({ intent: slug, field: `stages/${stageName}/units/${f.name}`, severity: "warning", message: `Unit filename doesn't match expected pattern`, fix: "Rename to match pattern: unit-NN-slug-name.md" })
						}
					}
				}
			}

			// n. Unit required fields
			if (Array.isArray(stages)) {
				for (const stageName of stages as string[]) {
					const unitsDir = join(intentsDir, slug, "stages", stageName, "units")
					if (!existsSync(unitsDir)) continue
					for (const f of readdirSync(unitsDir, { withFileTypes: true })) {
						if (!f.isFile() || !f.name.endsWith(".md")) continue
						const unitRaw = readFileSync(join(unitsDir, f.name), "utf8")
						const { data: unitData } = parseFrontmatter(unitRaw)
						if (!unitData.type) {
							issues.push({ intent: slug, field: `stages/${stageName}/units/${f.name}:type`, severity: "warning", message: `Unit missing 'type' field`, fix: "Add `type` field to unit frontmatter" })
						}
						if (!unitData.status) {
							issues.push({ intent: slug, field: `stages/${stageName}/units/${f.name}:status`, severity: "warning", message: `Unit missing 'status' field`, fix: "Add `status` field to unit frontmatter" })
						}
					}
				}
			}

			if (issues.length === 0) {
				cleanIntents.push(slug)
			} else {
				allIssues.push(...issues)
			}
		}

		// No issues
		if (allIssues.length === 0) {
			return singleMessage("All intents passed validation. No repairs needed.")
		}

		// Build diagnostic report
		const issuesByIntent = new Map<string, Issue[]>()
		for (const issue of allIssues) {
			const list = issuesByIntent.get(issue.intent) || []
			list.push(issue)
			issuesByIntent.set(issue.intent, list)
		}

		const reportLines: string[] = [
			"# Intent Repair Report",
			"",
			`Scanned ${slugs.length} intent(s). Found ${allIssues.length} issue(s).`,
			"",
		]

		for (const [slug, issues] of issuesByIntent) {
			const errors = issues.filter(i => i.severity === "error").length
			const warnings = issues.filter(i => i.severity === "warning").length
			reportLines.push(`## ${slug} — ${errors} errors, ${warnings} warnings`)
			reportLines.push("")
			reportLines.push("| # | Severity | Field | Issue | Fix |")
			reportLines.push("|---|----------|-------|-------|-----|")
			issues.forEach((issue, idx) => {
				reportLines.push(`| ${idx + 1} | ${issue.severity} | ${issue.field} | ${issue.message} | ${issue.fix} |`)
			})
			reportLines.push("")
		}

		if (cleanIntents.length > 0) {
			reportLines.push("## Intents with no issues")
			for (const slug of cleanIntents) {
				reportLines.push(`- ${slug}`)
			}
			reportLines.push("")
		}

		const instructions = [
			"Fix the issues listed above. For each intent:",
			"",
			"1. Read the intent.md file",
			"2. Apply the fixes listed in the report",
			"3. Use the `setFrontmatterField` pattern — read the file with gray-matter, update fields, write back",
			"4. For field renames (e.g., `created` → `created_at`), remove the old field and add the new one",
			"5. For stages mismatches, update the `stages` array to match the studio definition",
			'6. For missing state.json files, create them with `{"status": "pending", "phase": "elaborate"}`',
			"7. After fixing each intent, report what you changed",
			"",
			"Do NOT auto-fix anything without confirming with me first. Show me the proposed changes for each intent and wait for my approval.",
		].join("\n")

		return {
			messages: [
				textMsg("user", "Repair intents with metadata issues"),
				textMsg("assistant", reportLines.join("\n")),
				textMsg("user", instructions),
			],
		}
	},
})

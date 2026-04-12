// migrate.ts — Migrate .ai-dlc/ intents to .haiku/ format
//
// Usage: haiku migrate [--dry-run]
//
// Completed intents: migrate as historical records (completed development stage)
// Active intents: migrate intent.md + knowledge, reset stages for fresh start

import {
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	writeFileSync,
} from "node:fs"
import { basename, join } from "node:path"

function readFrontmatter(filePath: string): {
	data: Record<string, unknown>
	body: string
} {
	const raw = readFileSync(filePath, "utf8")
	const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
	if (!match) return { data: {}, body: raw }
	const data: Record<string, unknown> = {}
	for (const line of match[1].split("\n")) {
		const kv = line.match(/^([\w][\w-]*):\s*(.*)$/)
		if (kv) {
			const [, k, v] = kv
			if (v === "null") data[k] = null
			else if (v === "true") data[k] = true
			else if (v === "false") data[k] = false
			else if (/^-?\d+$/.test(v)) data[k] = Number.parseInt(v, 10)
			else if (v.startsWith("[") && v.endsWith("]")) {
				data[k] = v
					.slice(1, -1)
					.split(",")
					.map((s) => s.trim().replace(/^["']|["']$/g, ""))
					.filter(Boolean)
			} else data[k] = v.replace(/^["']|["']$/g, "")
		}
	}
	return { data, body: match[2].trim() }
}

function timestamp(): string {
	return new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
}

/** Get the first commit date for a file/directory from git history */
function gitFirstCommitDate(path: string): string | null {
	try {
		const { execSync } = require("node:child_process")
		const result = execSync(
			`git log --diff-filter=A --follow --format=%aI -- "${path}" | tail -1`,
			{
				encoding: "utf8",
				timeout: 5000,
				cwd: process.cwd(),
			},
		).trim()
		return result || null
	} catch {
		return null
	}
}

/** Get the last commit date for a file/directory from git history */
function gitLastCommitDate(path: string): string | null {
	try {
		const { execSync } = require("node:child_process")
		const result = execSync(`git log -1 --format=%aI -- "${path}"`, {
			encoding: "utf8",
			timeout: 5000,
			cwd: process.cwd(),
		}).trim()
		return result || null
	} catch {
		return null
	}
}

export async function runMigrate(args: string[]): Promise<void> {
	const dryRun = args.includes("--dry-run")
	const cwd = process.cwd()
	const oldDir = join(cwd, ".ai-dlc")
	const newDir = join(cwd, ".haiku", "intents")

	if (!existsSync(oldDir)) {
		console.log("No .ai-dlc/ directory found. Nothing to migrate.")
		return
	}

	const entries = readdirSync(oldDir).filter((d) => {
		const path = join(oldDir, d)
		return existsSync(join(path, "intent.md"))
	})

	if (entries.length === 0) {
		console.log("No intents found in .ai-dlc/. Nothing to migrate.")
		return
	}

	// Group multi-pass intents: detect slugs ending in -dev, -product, -design, -tests
	// and merge them into the base intent
	const passSuffixes = ["-dev", "-product", "-design", "-tests"]
	const mergeMap = new Map<string, string[]>() // base → [related slugs]
	const mergedSlugs = new Set<string>()

	// Detect follow-up intents: -followup, -v2, -phase2 → linked via follows: field
	const followupSuffixes = ["-followup", "-v2", "-phase2"]
	const followsMap = new Map<string, string>() // slug → parent slug

	for (const slug of entries) {
		for (const suffix of passSuffixes) {
			if (slug.endsWith(suffix)) {
				const base = slug.slice(0, -suffix.length)
				if (entries.includes(base)) {
					if (!mergeMap.has(base)) mergeMap.set(base, [])
					mergeMap.get(base)?.push(slug)
					mergedSlugs.add(slug)
				}
			}
		}
	}

	// Detect follow-up relationships
	for (const slug of entries) {
		if (mergedSlugs.has(slug)) continue // already merged, not a followup
		for (const suffix of followupSuffixes) {
			if (slug.endsWith(suffix)) {
				const parent = slug.slice(0, -suffix.length)
				if (entries.includes(parent)) {
					followsMap.set(slug, parent)
				}
			}
		}
	}

	if (mergeMap.size > 0) {
		console.log(`Detected ${mergeMap.size} multi-pass intent group(s):`)
		for (const [base, related] of mergeMap) {
			console.log(`  ${base} ← [${related.join(", ")}]`)
		}
		console.log()
	}

	if (followsMap.size > 0) {
		console.log(`Detected ${followsMap.size} follow-up intent(s):`)
		for (const [slug, parent] of followsMap) {
			console.log(`  ${slug} follows ${parent}`)
		}
		console.log()
	}

	// Filter out merged slugs — they'll be processed as part of their base intent
	const primarySlugs = entries.filter((s) => !mergedSlugs.has(s))

	console.log(
		`Found ${entries.length} intent(s) to migrate (${primarySlugs.length} primary, ${mergedSlugs.size} merged).\n`,
	)

	let migrated = 0
	let skipped = 0

	for (const slug of primarySlugs) {
		const srcDir = join(oldDir, slug)
		const destDir = join(newDir, slug)

		const force = args.includes("--force")

		// Skip if already migrated — unless --force or missing stages
		if (existsSync(destDir)) {
			const hasStages = existsSync(join(destDir, "stages"))
			if (hasStages && !force) {
				console.log(`  SKIP: ${slug} (already migrated with stages)`)
				skipped++
				continue
			}
			if (!hasStages) {
				console.log(`  RE-MIGRATE: ${slug} (missing stages — upgrading)`)
			}
		}

		const { data: intentFm, body: intentBody } = readFrontmatter(
			join(srcDir, "intent.md"),
		)
		const status = (intentFm.status as string) || "active"
		const title = intentBody.match(/^# (.+)$/m)?.[1] || slug
		const parentSlug = followsMap.get(slug) || ""

		// Get real dates from git history
		const gitCreated = gitFirstCommitDate(join(srcDir, "intent.md"))
		const gitLastModified = gitLastCommitDate(srcDir)
		const fmCreated = (intentFm.created as string) || ""
		const startedAt =
			gitCreated || (fmCreated ? `${fmCreated}T00:00:00Z` : timestamp())
		const completedAt =
			status === "completed" || status === "complete"
				? gitLastModified || startedAt
				: null

		if (dryRun) {
			console.log(`  DRY RUN: ${slug} (status: ${status})`)
			migrated++
			continue
		}

		// Create directory structure
		mkdirSync(join(destDir, "knowledge"), { recursive: true })

		const allStages = [
			"inception",
			"design",
			"product",
			"development",
			"operations",
			"security",
		]

		// Map AI-DLC passes to H·AI·K·U stages
		const passToStage: Record<string, string> = {
			design: "design",
			dev: "development",
			product: "product",
			ops: "operations",
			security: "security",
		}

		// Collect all source directories: primary + any merged pass intents
		const sourceDirs: Array<{ dir: string; defaultStage: string }> = [
			{ dir: srcDir, defaultStage: "" }, // primary — uses pass: field
		]
		const relatedSlugs = mergeMap.get(slug) || []
		const suffixToStage: Record<string, string> = {
			"-dev": "development",
			"-product": "product",
			"-design": "design",
			"-tests": "development",
		}
		for (const related of relatedSlugs) {
			const relatedDir = join(oldDir, related)
			// Determine default stage from suffix
			const suffix = passSuffixes.find((s) => related.endsWith(s)) || ""
			sourceDirs.push({
				dir: relatedDir,
				defaultStage: suffixToStage[suffix] || "development",
			})
		}

		// Read all unit files from all sources and sort by pass/stage
		const unitsByStage = new Map<
			string,
			Array<{ file: string; fm: Record<string, unknown>; body: string }>
		>()
		let totalUnitCount = 0

		for (const { dir: sourceDir, defaultStage } of sourceDirs) {
			const unitFiles = readdirSync(sourceDir).filter(
				(f) => f.startsWith("unit-") && f.endsWith(".md"),
			)
			for (const unitFile of unitFiles) {
				const { data: unitFm, body: unitBody } = readFrontmatter(
					join(sourceDir, unitFile),
				)
				const pass = (unitFm.pass as string) || ""
				const stage = pass
					? passToStage[pass] || "development"
					: defaultStage || "development"
				if (!unitsByStage.has(stage)) unitsByStage.set(stage, [])
				unitsByStage
					.get(stage)
					?.push({ file: unitFile, fm: unitFm, body: unitBody })
				totalUnitCount++
			}

			// Also copy knowledge/discovery from merged intents
			if (sourceDir !== srcDir) {
				if (existsSync(join(sourceDir, "discovery.md"))) {
					const relSlug = basename(sourceDir)
					if (!dryRun) {
						cpSync(
							join(sourceDir, "discovery.md"),
							join(destDir, "knowledge", `${relSlug}-discovery.md`),
						)
					}
				}
				// Copy mockups from merged intents too
				if (existsSync(join(sourceDir, "mockups")) && !dryRun) {
					const artifactsDir = join(destDir, "stages", "design", "artifacts")
					mkdirSync(artifactsDir, { recursive: true })
					try {
						cpSync(join(sourceDir, "mockups"), artifactsDir, {
							recursive: true,
						})
					} catch {
						/* */
					}
				}
			}
		}

		// Determine active stage: use the first stage that has units (not active_pass —
		// that would imply prior stages completed, which they haven't in H·AI·K·U)
		const activePass = (intentFm.active_pass as string) || ""
		const mappedStage = activePass ? passToStage[activePass] || "" : ""

		// Preserve epic/ticket reference
		const epic = (intentFm.epic as string) || ""

		if (status === "completed" || status === "complete") {
			// Completed: all stages marked complete, units in their respective stages
			writeFileSync(
				join(destDir, "intent.md"),
				`---\ntitle: "${title}"\nstudio: software\nstages: [inception, design, product, development, operations, security]\nmode: continuous\nactive_stage: security\nstatus: completed\nstarted_at: ${startedAt}\ncompleted_at: ${completedAt}${epic ? `\nepic: ${epic}` : ""}${parentSlug ? `\nfollows: ${parentSlug}` : ""}\n---\n\n${intentBody}\n`,
			)

			for (const stage of allStages) {
				mkdirSync(join(destDir, "stages", stage, "units"), { recursive: true })
				writeFileSync(
					join(destDir, "stages", stage, "state.json"),
					`${JSON.stringify({ stage, status: "completed", phase: "gate", started_at: `${startedAt}`, completed_at: `${completedAt}`, gate_entered_at: null, gate_outcome: "advanced" }, null, 2)}\n`,
				)
			}

			// Write units to their respective stages
			for (const [stage, units] of unitsByStage) {
				mkdirSync(join(destDir, "stages", stage, "units"), { recursive: true })
				for (const { file, fm, body } of units) {
					const uStatus = (fm.status as string) || "pending"
					const uDeps = (fm.depends_on as string[]) || []
					const uDiscipline = (fm.discipline as string) || "fullstack"
					const uUpdated =
						(fm.last_updated as string) ||
						gitFirstCommitDate(join(srcDir, file)) ||
						null
					const uTicket = (fm.ticket as string) || ""
					const uBranch = (fm.branch as string) || ""

					writeFileSync(
						join(destDir, "stages", stage, "units", file),
						`---\nname: ${basename(file, ".md")}\ntype: ${uDiscipline}\nstatus: ${uStatus}\ndepends_on: [${uDeps.join(", ")}]\nbolt: 0\nhat: ""${uTicket ? `\nticket: ${uTicket}` : ""}${uBranch ? `\nbranch: ${uBranch}` : ""}\nstarted_at: ${uUpdated || "null"}\ncompleted_at: ${uStatus === "completed" ? uUpdated || "null" : "null"}\n---\n\n${body}\n`,
					)
				}
			}

			const mergeNote =
				relatedSlugs.length > 0 ? ` [merged: ${relatedSlugs.join(", ")}]` : ""
			console.log(
				`  MIGRATED: ${slug} (completed, ${totalUnitCount} units across ${unitsByStage.size} stage(s))${mergeNote}`,
			)
		} else {
			// Active: migrate intent + units in their stages, preserve active_stage
			const skipStages = allStages.filter((s) => {
				// Skip stages that have no units and are past the active stage
				if (!unitsByStage.has(s) && s !== mappedStage) return false
				return false // Don't skip — keep all stages for active intents
			})

			// Set active_stage to the first stage that has units
			const firstStageWithUnits =
				allStages.find((s) => unitsByStage.has(s)) || ""

			writeFileSync(
				join(destDir, "intent.md"),
				`---\ntitle: "${title}"\nstudio: software\nstages: [inception, design, product, development, operations, security]\nmode: continuous\nactive_stage: ${firstStageWithUnits || '""'}\nstatus: active\nstarted_at: ${startedAt}\ncompleted_at: null${epic ? `\nepic: ${epic}` : ""}${parentSlug ? `\nfollows: ${parentSlug}` : ""}\n---\n\n${intentBody}\n`,
			)

			// Write state only for stages that have units — don't imply prior stages completed
			for (const stage of allStages) {
				mkdirSync(join(destDir, "stages", stage, "units"), { recursive: true })
				if (unitsByStage.has(stage)) {
					writeFileSync(
						join(destDir, "stages", stage, "state.json"),
						`${JSON.stringify(
							{
								stage,
								status: stage === firstStageWithUnits ? "active" : "pending",
								phase: stage === firstStageWithUnits ? "execute" : "",
								started_at: startedAt,
								completed_at: null,
								gate_entered_at: null,
								gate_outcome: null,
							},
							null,
							2,
						)}\n`,
					)
				}
			}

			// Write units to their respective stages
			for (const [stage, units] of unitsByStage) {
				for (const { file, fm, body } of units) {
					const uStatus = (fm.status as string) || "pending"
					const uDeps = (fm.depends_on as string[]) || []
					const uDiscipline = (fm.discipline as string) || "fullstack"
					const uUpdated =
						(fm.last_updated as string) ||
						gitFirstCommitDate(join(srcDir, file)) ||
						null
					const uTicket = (fm.ticket as string) || ""
					const uBranch = (fm.branch as string) || ""

					writeFileSync(
						join(destDir, "stages", stage, "units", file),
						`---\nname: ${basename(file, ".md")}\ntype: ${uDiscipline}\nstatus: ${uStatus}\ndepends_on: [${uDeps.join(", ")}]\nbolt: 0\nhat: ""${uTicket ? `\nticket: ${uTicket}` : ""}${uBranch ? `\nbranch: ${uBranch}` : ""}\nstarted_at: ${uUpdated || "null"}\ncompleted_at: ${uStatus === "completed" ? uUpdated || "null" : "null"}\n---\n\n${body}\n`,
					)
				}
			}

			const mergeNoteActive =
				relatedSlugs.length > 0 ? ` [merged: ${relatedSlugs.join(", ")}]` : ""
			console.log(
				`  MIGRATED: ${slug} (active, stage: ${mappedStage || "inception"}, ${totalUnitCount} units across ${unitsByStage.size} stage(s))${mergeNoteActive}`,
			)
		}

		// Copy knowledge/discovery files
		if (existsSync(join(srcDir, "discovery.md"))) {
			cpSync(
				join(srcDir, "discovery.md"),
				join(destDir, "knowledge", "DISCOVERY.md"),
			)
		}
		if (existsSync(join(srcDir, "knowledge"))) {
			try {
				cpSync(join(srcDir, "knowledge"), join(destDir, "knowledge"), {
					recursive: true,
				})
			} catch {
				/* ignore if empty */
			}
		}

		// Copy mockups to design stage artifacts
		if (existsSync(join(srcDir, "mockups"))) {
			const artifactsDir = join(destDir, "stages", "design", "artifacts")
			mkdirSync(artifactsDir, { recursive: true })
			try {
				cpSync(join(srcDir, "mockups"), artifactsDir, { recursive: true })
			} catch {
				/* ignore if empty */
			}
		}

		migrated++
	}

	console.log(`\nMigration complete: ${migrated} migrated, ${skipped} skipped.`)
	if (dryRun) {
		console.log(
			"(Dry run — no files were written. Run without --dry-run to migrate.)",
		)
	} else {
		console.log("\nNext steps:")
		console.log(
			"  git add .haiku/intents/ && git commit -m 'haiku: migrate intents from .ai-dlc/'",
		)
		console.log(
			"  For active intents: run /haiku:pickup to start from inception",
		)
	}
}

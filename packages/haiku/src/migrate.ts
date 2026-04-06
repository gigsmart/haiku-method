// migrate.ts — Migrate .ai-dlc/ intents to .haiku/ format
//
// Usage: haiku migrate [--dry-run]
//
// Completed intents: migrate as historical records (completed development stage)
// Active intents: migrate intent.md + knowledge, reset stages for fresh start

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, cpSync } from "node:fs"
import { join, basename } from "node:path"

function readFrontmatter(filePath: string): { data: Record<string, unknown>; body: string } {
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
			else if (/^-?\d+$/.test(v)) data[k] = parseInt(v, 10)
			else if (v.startsWith("[") && v.endsWith("]")) {
				data[k] = v.slice(1, -1).split(",").map(s => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean)
			} else data[k] = v.replace(/^["']|["']$/g, "")
		}
	}
	return { data, body: match[2].trim() }
}

function timestamp(): string {
	return new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
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

	const entries = readdirSync(oldDir).filter(d => {
		const path = join(oldDir, d)
		return existsSync(join(path, "intent.md"))
	})

	if (entries.length === 0) {
		console.log("No intents found in .ai-dlc/. Nothing to migrate.")
		return
	}

	console.log(`Found ${entries.length} intent(s) to migrate.\n`)

	let migrated = 0
	let skipped = 0

	for (const slug of entries) {
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

		const { data: intentFm, body: intentBody } = readFrontmatter(join(srcDir, "intent.md"))
		const status = (intentFm.status as string) || "active"
		const created = (intentFm.created as string) || timestamp().split("T")[0]
		const title = intentBody.match(/^# (.+)$/m)?.[1] || slug

		if (dryRun) {
			console.log(`  DRY RUN: ${slug} (status: ${status})`)
			migrated++
			continue
		}

		// Create directory structure
		mkdirSync(join(destDir, "knowledge"), { recursive: true })

		const allStages = ["inception", "design", "product", "development", "operations", "security"]

		// Map AI-DLC passes to H·AI·K·U stages
		const passToStage: Record<string, string> = {
			design: "design",
			dev: "development",
			product: "product",
			ops: "operations",
			security: "security",
		}

		// Read all unit files and sort by pass
		const unitFiles = readdirSync(srcDir).filter(f => f.startsWith("unit-") && f.endsWith(".md"))
		const unitsByStage = new Map<string, Array<{ file: string; fm: Record<string, unknown>; body: string }>>()

		for (const unitFile of unitFiles) {
			const { data: unitFm, body: unitBody } = readFrontmatter(join(srcDir, unitFile))
			const pass = (unitFm.pass as string) || "dev"
			const stage = passToStage[pass] || "development"
			if (!unitsByStage.has(stage)) unitsByStage.set(stage, [])
			unitsByStage.get(stage)!.push({ file: unitFile, fm: unitFm, body: unitBody })
		}

		// Determine active stage from active_pass
		const activePass = (intentFm.active_pass as string) || ""
		const activeStage = activePass ? (passToStage[activePass] || "") : ""

		// Preserve epic/ticket reference
		const epic = (intentFm.epic as string) || ""

		if (status === "completed" || status === "complete") {
			// Completed: all stages marked complete, units in their respective stages
			writeFileSync(join(destDir, "intent.md"),
				`---\ntitle: "${title}"\nstudio: software\nstages: [inception, design, product, development, operations, security]\nmode: continuous\nactive_stage: security\nstatus: completed\nstarted_at: ${created}T00:00:00Z\ncompleted_at: ${created}T23:59:59Z${epic ? `\nepic: ${epic}` : ""}\n---\n\n${intentBody}\n`)

			for (const stage of allStages) {
				mkdirSync(join(destDir, "stages", stage, "units"), { recursive: true })
				writeFileSync(join(destDir, "stages", stage, "state.json"),
					JSON.stringify({ stage, status: "completed", phase: "gate", started_at: `${created}T00:00:00Z`, completed_at: `${created}T23:59:59Z`, gate_entered_at: null, gate_outcome: "advanced" }, null, 2) + "\n")
			}

			// Write units to their respective stages
			for (const [stage, units] of unitsByStage) {
				mkdirSync(join(destDir, "stages", stage, "units"), { recursive: true })
				for (const { file, fm, body } of units) {
					const uStatus = (fm.status as string) || "pending"
					const uDeps = (fm.depends_on as string[]) || []
					const uDiscipline = (fm.discipline as string) || "fullstack"
					const uUpdated = (fm.last_updated as string) || null
					const uTicket = (fm.ticket as string) || ""
					const uBranch = (fm.branch as string) || ""

					writeFileSync(join(destDir, "stages", stage, "units", file),
						`---\nname: ${basename(file, ".md")}\ntype: ${uDiscipline}\nstatus: ${uStatus}\ndepends_on: [${uDeps.join(", ")}]\nbolt: 0\nhat: ""${uTicket ? `\nticket: ${uTicket}` : ""}${uBranch ? `\nbranch: ${uBranch}` : ""}\nstarted_at: ${uUpdated || "null"}\ncompleted_at: ${uStatus === "completed" ? (uUpdated || "null") : "null"}\n---\n\n${body}\n`)
				}
			}

			console.log(`  MIGRATED: ${slug} (completed, ${unitFiles.length} units across ${unitsByStage.size} stage(s))`)
		} else {
			// Active: migrate intent + units in their stages, preserve active_stage
			const skipStages = allStages.filter(s => {
				// Skip stages that have no units and are past the active stage
				if (!unitsByStage.has(s) && s !== activeStage) return false
				return false // Don't skip — keep all stages for active intents
			})

			writeFileSync(join(destDir, "intent.md"),
				`---\ntitle: "${title}"\nstudio: software\nstages: [inception, design, product, development, operations, security]\nmode: continuous\nactive_stage: ${activeStage || '""'}\nstatus: active\nstarted_at: ${created}T00:00:00Z\ncompleted_at: null${epic ? `\nepic: ${epic}` : ""}\n---\n\n${intentBody}\n`)

			// Write state for stages that have units or are before/at active stage
			for (const stage of allStages) {
				mkdirSync(join(destDir, "stages", stage, "units"), { recursive: true })
				const stageIdx = allStages.indexOf(stage)
				const activeIdx = activeStage ? allStages.indexOf(activeStage) : -1
				const isComplete = activeIdx >= 0 && stageIdx < activeIdx
				const isActive = stage === activeStage

				if (isComplete || isActive || unitsByStage.has(stage)) {
					writeFileSync(join(destDir, "stages", stage, "state.json"),
						JSON.stringify({
							stage,
							status: isComplete ? "completed" : (isActive ? "active" : "pending"),
							phase: isComplete ? "gate" : (isActive ? "execute" : ""),
							started_at: `${created}T00:00:00Z`,
							completed_at: isComplete ? `${created}T23:59:59Z` : null,
							gate_entered_at: null,
							gate_outcome: isComplete ? "advanced" : null,
						}, null, 2) + "\n")
				}
			}

			// Write units to their respective stages
			for (const [stage, units] of unitsByStage) {
				for (const { file, fm, body } of units) {
					const uStatus = (fm.status as string) || "pending"
					const uDeps = (fm.depends_on as string[]) || []
					const uDiscipline = (fm.discipline as string) || "fullstack"
					const uUpdated = (fm.last_updated as string) || null
					const uTicket = (fm.ticket as string) || ""
					const uBranch = (fm.branch as string) || ""

					writeFileSync(join(destDir, "stages", stage, "units", file),
						`---\nname: ${basename(file, ".md")}\ntype: ${uDiscipline}\nstatus: ${uStatus}\ndepends_on: [${uDeps.join(", ")}]\nbolt: 0\nhat: ""${uTicket ? `\nticket: ${uTicket}` : ""}${uBranch ? `\nbranch: ${uBranch}` : ""}\nstarted_at: ${uUpdated || "null"}\ncompleted_at: ${uStatus === "completed" ? (uUpdated || "null") : "null"}\n---\n\n${body}\n`)
				}
			}

			console.log(`  MIGRATED: ${slug} (active, stage: ${activeStage || "inception"}, ${unitFiles.length} units across ${unitsByStage.size} stage(s))`)
		}

		// Copy knowledge/discovery files
		if (existsSync(join(srcDir, "discovery.md"))) {
			cpSync(join(srcDir, "discovery.md"), join(destDir, "knowledge", "DISCOVERY.md"))
		}
		if (existsSync(join(srcDir, "knowledge"))) {
			try {
				cpSync(join(srcDir, "knowledge"), join(destDir, "knowledge"), { recursive: true })
			} catch { /* ignore if empty */ }
		}

		// Copy mockups to design stage artifacts
		if (existsSync(join(srcDir, "mockups"))) {
			const artifactsDir = join(destDir, "stages", "design", "artifacts")
			mkdirSync(artifactsDir, { recursive: true })
			try {
				cpSync(join(srcDir, "mockups"), artifactsDir, { recursive: true })
			} catch { /* ignore if empty */ }
		}

		migrated++
	}

	console.log(`\nMigration complete: ${migrated} migrated, ${skipped} skipped.`)
	if (dryRun) {
		console.log("(Dry run — no files were written. Run without --dry-run to migrate.)")
	} else {
		console.log("\nNext steps:")
		console.log("  git add .haiku/intents/ && git commit -m 'haiku: migrate intents from .ai-dlc/'")
		console.log("  For active intents: run /haiku:run to start from inception")
	}
}

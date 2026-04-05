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

		// Skip if already migrated
		if (existsSync(destDir)) {
			console.log(`  SKIP: ${slug} (already exists in .haiku/intents/)`)
			skipped++
			continue
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

		if (status === "completed") {
			// Completed: migrate as historical record with completed development stage
			mkdirSync(join(destDir, "stages", "development", "units"), { recursive: true })

			// Write intent.md
			writeFileSync(join(destDir, "intent.md"),
				`---\ntitle: "${title}"\nstudio: software\nmode: continuous\nactive_stage: development\nstatus: completed\nstarted_at: ${created}T00:00:00Z\ncompleted_at: ${created}T23:59:59Z\n---\n\n${intentBody}\n`)

			// Write stage state
			writeFileSync(join(destDir, "stages", "development", "state.json"),
				JSON.stringify({ stage: "development", status: "completed", phase: "gate", started_at: `${created}T00:00:00Z`, completed_at: `${created}T23:59:59Z`, gate_entered_at: null, gate_outcome: "advanced" }, null, 2) + "\n")

			// Migrate units
			const unitFiles = readdirSync(srcDir).filter(f => f.startsWith("unit-") && f.endsWith(".md"))
			for (const unitFile of unitFiles) {
				const { data: unitFm, body: unitBody } = readFrontmatter(join(srcDir, unitFile))
				const uStatus = (unitFm.status as string) || "pending"
				const uDeps = (unitFm.depends_on as string[]) || []
				const uDiscipline = (unitFm.discipline as string) || "fullstack"
				const uUpdated = (unitFm.last_updated as string) || null

				writeFileSync(join(destDir, "stages", "development", "units", unitFile),
					`---\nname: ${basename(unitFile, ".md")}\ntype: ${uDiscipline}\nstatus: ${uStatus}\ndepends_on: [${uDeps.join(", ")}]\nbolt: 0\nhat: ""\nstarted_at: ${uUpdated || "null"}\ncompleted_at: ${uStatus === "completed" ? (uUpdated || "null") : "null"}\n---\n\n${unitBody}\n`)
			}

			console.log(`  MIGRATED: ${slug} (completed, ${unitFiles.length} units)`)
		} else {
			// Active/pending: migrate intent + knowledge, reset for fresh start
			writeFileSync(join(destDir, "intent.md"),
				`---\ntitle: "${title}"\nstudio: software\nmode: continuous\nactive_stage: ""\nstatus: active\nstarted_at: ${timestamp()}\ncompleted_at: null\n---\n\n${intentBody}\n`)

			console.log(`  MIGRATED: ${slug} (active — reset for fresh start, run /haiku:run)`)
		}

		// Copy knowledge files
		if (existsSync(join(srcDir, "discovery.md"))) {
			cpSync(join(srcDir, "discovery.md"), join(destDir, "knowledge", "discovery.md"))
		}
		if (existsSync(join(srcDir, "knowledge"))) {
			try {
				cpSync(join(srcDir, "knowledge"), join(destDir, "knowledge"), { recursive: true })
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

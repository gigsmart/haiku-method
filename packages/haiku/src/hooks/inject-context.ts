// inject-context — SessionStart hook for H·AI·K·U
//
// Injects iteration context from filesystem state:
// - Current hat and instructions (from hats/ directory)
// - Intent and completion criteria
// - Previous scratchpad/blockers
// - Iteration number and workflow
// - Post-merge reconciliation
// - Resumable intent discovery

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, basename } from "node:path"
import { execSync } from "node:child_process"
import {
	findActiveIntent,
	stateLoad,
	getCurrentBranch,
	readFrontmatterField,
	setFrontmatterField,
	readJson,
	findUnitFiles,
	checkIntentCriteria,
	getRepoRoot,
} from "./utils.js"

function out(s: string): void {
	process.stdout.write(s + "\n")
}

function getHatSequence(stageName: string, studioName: string, pluginRoot: string): string {
	const stageFile = join(pluginRoot, "studios", studioName, "stages", stageName, "STAGE.md")
	const projectStageFile = join(process.cwd(), ".haiku", "studios", studioName, "stages", stageName, "STAGE.md")

	let targetFile = ""
	if (existsSync(projectStageFile)) targetFile = projectStageFile
	else if (existsSync(stageFile)) targetFile = stageFile

	if (!targetFile) return "planner \u2192 builder \u2192 reviewer"

	const content = readFileSync(targetFile, "utf8")
	const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
	if (!fmMatch) return "planner \u2192 builder \u2192 reviewer"

	const fm = fmMatch[1]
	const hats: string[] = []
	let inHats = false
	for (const line of fm.split("\n")) {
		if (line.match(/^hats:/)) {
			inHats = true
			continue
		}
		if (inHats) {
			if (!line.startsWith(" ") && !line.startsWith("\t") && line.trim() !== "") break
			const m = line.match(/^\s+-\s+(.+)/)
			if (m) hats.push(m[1].trim().replace(/^["']|["']$/g, ""))
		}
	}

	return hats.length > 0 ? hats.join(" \u2192 ") : "planner \u2192 builder \u2192 reviewer"
}

function readHatInstructions(hatName: string, stageName: string, studioName: string, pluginRoot: string): string {
	const projectHatFile = join(process.cwd(), ".haiku", "studios", studioName, "stages", stageName, "hats", `${hatName}.md`)
	const pluginHatFile = join(pluginRoot, "studios", studioName, "stages", stageName, "hats", `${hatName}.md`)

	let hatFile = ""
	if (existsSync(projectHatFile)) hatFile = projectHatFile
	else if (existsSync(pluginHatFile)) hatFile = pluginHatFile

	if (!hatFile) return ""

	const content = readFileSync(hatFile, "utf8")
	const parts = content.split("---")
	if (parts.length >= 3) {
		return parts.slice(2).join("---").trim()
	}
	return content
}

function readHatMetadata(hatName: string, stageName: string, studioName: string, pluginRoot: string): { name: string; description: string } {
	const projectHatFile = join(process.cwd(), ".haiku", "studios", studioName, "stages", stageName, "hats", `${hatName}.md`)
	const pluginHatFile = join(pluginRoot, "studios", studioName, "stages", stageName, "hats", `${hatName}.md`)

	let hatFile = ""
	if (existsSync(projectHatFile)) hatFile = projectHatFile
	else if (existsSync(pluginHatFile)) hatFile = pluginHatFile

	if (!hatFile) return { name: "", description: "" }

	return {
		name: readFrontmatterField(hatFile, "name"),
		description: readFrontmatterField(hatFile, "description"),
	}
}

function outputTaskRouting(): void {
	out("### Task Routing")
	out("")
	out("When a user describes a task without a slash command, assess scope and suggest a path:")
	out("")
	out("| Signal | Quick | Elaborate |")
	out("|--------|-------|-----------|")
	out("| Files touched | 1-2 files | 3+ files or cross-cutting |")
	out("| Nature | Typo, rename, config, lint fix | New feature, refactor, architecture |")
	out("| Tests needed | None or existing pass | New tests required |")
	out("| Design decisions | None | Any |")
	out("")
	out("**Routing:**")
	out("- Simple fix/typo/rename \u2192 `/haiku:quick <task>`")
	out("- New feature / multi-file / architecture \u2192 `/haiku:elaborate`")
	out("")
	out("Always confirm your routing suggestion with the user before proceeding.")
	out("")
}

function outputSetupHint(): void {
	if (!existsSync(join(process.cwd(), ".haiku", "settings.yml"))) {
		out("> **First time?** Run `/haiku:setup` to configure H\u00b7AI\u00b7K\u00b7U for this project (auto-detects providers, VCS settings, etc.)")
		out("")
	}
}

function getDefaultBranch(): string {
	try {
		const ref = execSync("git symbolic-ref refs/remotes/origin/HEAD", { encoding: "utf8" }).trim()
		return ref.split("/").pop() ?? "main"
	} catch {
		return "main"
	}
}

export async function injectContext(input: Record<string, unknown>, pluginRoot: string): Promise<void> {
	// Extract source field
	const source = (input.source as string) ?? "startup"

	const currentBranch = getCurrentBranch()
	const repoRoot = getRepoRoot()

	// ========================================================================
	// AUTO-MIGRATE: Convert .ai-dlc/ intents to .haiku/ on session start
	// ========================================================================
	const oldAiDlcDir = join(repoRoot, ".ai-dlc")
	if (existsSync(oldAiDlcDir)) {
		const haikuIntentsDir = join(repoRoot, ".haiku", "intents")
		const oldEntries = readdirSync(oldAiDlcDir).filter(d =>
			existsSync(join(oldAiDlcDir, d, "intent.md"))
		)
		const needsMigration = oldEntries.some(slug =>
			!existsSync(join(haikuIntentsDir, slug, "intent.md"))
		)
		if (needsMigration) {
			try {
				const { runMigrate } = await import("../migrate.js")
				await runMigrate([])
			} catch { /* migration failure is non-fatal */ }
		}
	}

	// ========================================================================
	// POST-MERGE RECONCILIATION: Fix stale statuses on default branch
	// ========================================================================
	const defaultBranch = getDefaultBranch()
	if (currentBranch === defaultBranch) {
		const intentsDir = join(repoRoot, ".haiku", "intents")
		if (existsSync(intentsDir)) {
			for (const slug of readdirSync(intentsDir)) {
				const intentFile = join(intentsDir, slug, "intent.md")
				if (!existsSync(intentFile)) continue

				const reconcileStatus = readFrontmatterField(intentFile, "status")
				if (reconcileStatus !== "active") continue

				// Check if all units are completed
				const unitFiles = findUnitFiles(join(intentsDir, slug))
				if (unitFiles.length === 0) continue

				let allDone = true
				for (const uf of unitFiles) {
					const unitStatus = readFrontmatterField(uf, "status")
					if (unitStatus !== "completed") {
						allDone = false
						break
					}
				}

				if (allDone) {
					setFrontmatterField(intentFile, "status", "completed")
					checkIntentCriteria(join(intentsDir, slug))
				}
			}
		}
	}

	// ========================================================================
	// CHECK FOR H·AI·K·U STATE
	// ========================================================================
	const intentDir = findActiveIntent()

	// ========================================================================
	// NO ACTIVE INTENT — show available/resumable intents
	// ========================================================================
	if (!intentDir) {
		// Discover resumable intents
		const intentsDir = join(repoRoot, ".haiku", "intents")
		const filesystemIntents: Array<{ slug: string; summary: string }> = []

		if (existsSync(intentsDir)) {
			for (const slug of readdirSync(intentsDir)) {
				const intentFile = join(intentsDir, slug, "intent.md")
				if (!existsSync(intentFile)) continue
				const status = readFrontmatterField(intentFile, "status")
				if (status !== "active") continue

				// Get unit summary
				const unitFiles = findUnitFiles(join(intentsDir, slug))
				let completed = 0
				for (const uf of unitFiles) {
					if (readFrontmatterField(uf, "status") === "completed") completed++
				}
				const summary = unitFiles.length > 0 ? `${completed}/${unitFiles.length} completed` : ""
				filesystemIntents.push({ slug, summary })
			}
		}

		if (filesystemIntents.length > 0) {
			out("## H\u00b7AI\u00b7K\u00b7U: Resumable Intents Found")
			out("")
			out("### In Current Directory")
			out("")
			for (const intent of filesystemIntents) {
				out(`- **${intent.slug}**`)
				if (intent.summary) {
					out(`  - Units: ${intent.summary}`)
				}
			}
			out("")
			out("**To resume:** `/haiku:resume <slug>` or `/haiku:resume` if only one")
			out("")
			if (!existsSync(join(process.cwd(), ".haiku", "settings.yml"))) {
				out("> **Tip:** Run `/haiku:setup` to configure providers and VCS settings. This enables automatic ticket sync during elaboration.")
				out("")
			}
		} else {
			out("## H\u00b7AI\u00b7K\u00b7U Available")
			out("")
			out("No active H\u00b7AI\u00b7K\u00b7U task. Run `/haiku:elaborate` to start a new task.")
			out("")
			outputSetupHint()
			outputTaskRouting()
		}
		return
	}

	// ========================================================================
	// READ STATE FROM NEW MODEL (intent frontmatter + stage state.json + unit frontmatter)
	// ========================================================================
	const intentFile = join(intentDir, "intent.md")
	const intentStatus = readFrontmatterField(intentFile, "status")
	let activeStage = readFrontmatterField(intentFile, "active_stage")
	const studio = readFrontmatterField(intentFile, "studio") || "ideation"
	const activePass = readFrontmatterField(intentFile, "active_pass")
	if (!activeStage) activeStage = "research"

	// Read stage state
	const stageState = readJson(join(intentDir, "stages", activeStage, "state.json"))
	const phase = (stageState.phase as string) ?? ""

	// Find the active unit to get hat and bolt
	const allUnitFiles = findUnitFiles(intentDir)
	let hat = "planner"
	let bolt = 1
	let currentUnit = ""
	for (const uf of allUnitFiles) {
		const uStatus = readFrontmatterField(uf, "status")
		if (uStatus === "active") {
			hat = readFrontmatterField(uf, "hat") || "planner"
			bolt = Number(readFrontmatterField(uf, "bolt") || "1")
			currentUnit = basename(uf, ".md")
			break
		}
	}

	const stageHatsStr = getHatSequence(activeStage, studio, pluginRoot)
	const intentSlug = basename(intentDir)

	// If task is complete, show completion message
	if (intentStatus === "completed") {
		out("## H\u00b7AI\u00b7K\u00b7U: Task Complete")
		out("")
		out("Previous task was completed. Run `/haiku:reset` to start a new task.")
		return
	}

	// ========================================================================
	// ACTIVE TASK — output full context
	// ========================================================================
	out("## H\u00b7AI\u00b7K\u00b7U Context")
	out("")
	let statusLine = `**Bolt:** ${bolt} | **Hat:** ${hat} | **Stage:** ${activeStage} (${stageHatsStr})`
	if (activePass) {
		statusLine += ` | **Pass:** ${activePass}`
	}
	if (phase) {
		statusLine += ` | **Phase:** ${phase}`
	}
	out(statusLine)
	out("")

	// Lazy learnings injection
	const learningsDir = join(process.cwd(), "docs", "solutions")
	if (existsSync(learningsDir)) {
		try {
			const files = readdirSync(learningsDir).filter(f => f.endsWith(".md"))
			if (files.length > 0) {
				out("")
				out(`\ud83d\udcda **${files.length} compound learnings available** in \`docs/solutions/\`.`)
				out("The Planner hat will search these automatically before planning.")
				out("Use `/haiku:compound` to capture new learnings.")
			}
		} catch { /* ignore */ }
	}

	// Load and display intent from filesystem
	if (intentDir && existsSync(join(intentDir, "intent.md"))) {
		out("### Intent")
		out("")
		out(readFileSync(join(intentDir, "intent.md"), "utf8"))
		out("")
	}

	// Load completion criteria
	if (intentDir && existsSync(join(intentDir, "completion-criteria.md"))) {
		out("### Completion Criteria")
		out("")
		out(readFileSync(join(intentDir, "completion-criteria.md"), "utf8"))
		out("")
	}

	// Show discovery.md availability indicator
	if (intentDir && existsSync(join(intentDir, "discovery.md"))) {
		const discoveryContent = readFileSync(join(intentDir, "discovery.md"), "utf8")
		const sectionCount = discoveryContent.split("\n").filter(l => l.startsWith("## ")).length
		if (sectionCount > 0) {
			out("### Discovery Log")
			out("")
			out(`**${sectionCount} sections** of elaboration findings available in \`.haiku/intents/${intentSlug}/discovery.md\``)
			out("")
		}
	}

	// Load state values
	const plan = intentDir ? stateLoad(intentDir, "current-plan.md") : ""
	const blockers = intentDir ? stateLoad(intentDir, "blockers.md") : ""
	const scratchpad = intentDir ? stateLoad(intentDir, "scratchpad.md") : ""
	const nextPrompt = intentDir ? stateLoad(intentDir, "next-prompt.md") : ""

	if (plan) {
		out("### Current Plan")
		out("")
		out(plan)
		out("")
	}

	if (blockers) {
		out("### Previous Blockers")
		out("")
		out(blockers)
		out("")
	}

	if (scratchpad) {
		out("### Learnings from Previous Iteration")
		out("")
		out(scratchpad)
		out("")
	}

	if (nextPrompt) {
		out("### Continue With")
		out("")
		out(nextPrompt)
		out("")
	}

	// Load and display DAG status (if units exist)
	if (intentDir) {
		const unitFiles = findUnitFiles(intentDir)
		if (unitFiles.length > 0) {
			out("### Unit Status")
			out("")
			out("| Unit | Status |")
			out("|------|--------|")

			let completed = 0
			let inProgress = 0
			let pending = 0
			let blocked = 0
			let ready = 0

			for (const uf of unitFiles) {
				const name = basename(uf, ".md")
				const unitStatus = readFrontmatterField(uf, "status") || "pending"
				out(`| ${name} | ${unitStatus} |`)

				switch (unitStatus) {
					case "completed": completed++; break
					case "in_progress": inProgress++; break
					case "blocked": blocked++; break
					case "pending":
					default:
						pending++
						ready++ // simplified
						break
				}
			}
			out("")

			const total = completed + inProgress + pending + blocked
			out(`**Summary:** ${completed} completed, ${inProgress} in_progress, ${pending} pending (${blocked} blocked), ${ready} ready`)
			out("")
		}
	}

	// Display Agent Teams status if enabled
	if (process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS && intentSlug) {
		const teamName = `haiku-${intentSlug}`
		const configDir = process.env.CLAUDE_CONFIG_DIR ?? ""
		if (configDir) {
			const teamConfig = join(configDir, "teams", teamName, "config.json")
			if (existsSync(teamConfig)) {
				out("### Agent Teams")
				out("")
				out(`**Team:** \`${teamName}\``)
				out("**Mode:** Parallel execution enabled")
				out("")
			}
		}
	}

	// Load hat instructions
	const instructions = readHatInstructions(hat, activeStage, studio, pluginRoot)
	const hatMeta = readHatMetadata(hat, activeStage, studio, pluginRoot)

	out("### Current Hat Instructions")
	out("")

	if (instructions) {
		if (hatMeta.description) {
			out(`**${hatMeta.name || hat}** \u2014 ${hatMeta.description}`)
		} else {
			out(`**${hatMeta.name || hat}**`)
		}
		out("")
		out(instructions)
	} else {
		out(`**${hat}** (Custom hat - no instructions found)`)
		out("")
		out(`Create a hat definition at \`.haiku/hats/${hat}.md\` with:`)
		out("")
		out("```markdown")
		out("---")
		out('name: "Your Hat Name"')
		out('description: "What this hat does"')
		out("---")
		out("")
		out("# Hat Name")
		out("")
		out("Instructions for this hat...")
		out("```")
	}

	// ========================================================================
	// ITERATION MANAGEMENT INSTRUCTIONS (shared across all hats)
	// ========================================================================
	out("")
	out("---")
	out("")
	out("## Iteration Management (Required for ALL Hats)")
	out("")
	out("### Branch Per Unit (MANDATORY)")
	out("")
	out("You MUST work on a dedicated branch for this unit:")
	out("")
	out("```bash")
	out("# Create if not exists:")
	out("git checkout -b haiku/{intent-slug}/{unit-number}-{unit-slug}")
	out("# Or use worktrees for parallel work:")
	out("git worktree add ../{unit-slug} haiku/{intent-slug}/{unit-number}-{unit-slug}")
	out("```")
	out("")
	out("You MUST NOT work directly on main/master. This isolates work and prevents conflicts.")
	out("")
	out("### Before Stopping (MANDATORY)")
	out("")
	out("Before every stop, you MUST:")
	out("")
	out("1. **Commit working changes**: `git add -A && git commit`")
	out("2. **Save scratchpad**: save to `.haiku/intents/{intent-slug}/state/scratchpad.md`")
	out("3. **Write next prompt**: save to `.haiku/intents/{intent-slug}/state/next-prompt.md`")
	out("")
	out("The next-prompt.md should contain what to continue with in the next iteration.")
	out("Without this, progress may be lost if the session ends.")
	out("")
	out("### Never Stop Arbitrarily")
	out("")
	out("- You MUST NOT stop mid-bolt without saving state")
	out("- If you need user input, use `AskUserQuestion` tool")
	out("- If blocked, document in `.haiku/intents/{intent-slug}/state/blockers.md`")
	out("")

	// Check branch naming convention
	if (currentBranch && currentBranch !== "main" && currentBranch !== "master") {
		if (!currentBranch.match(/^haiku\/[a-z0-9-]+\/(main|[0-9]+-[a-z0-9-]+)$/)) {
			out(`> **WARNING:** Current branch \`${currentBranch}\` doesn't follow H\u00b7AI\u00b7K\u00b7U convention.`)
			out("> Expected: `haiku/{intent-slug}/main` or `haiku/{intent-slug}/{unit-number}-{unit-slug}`")
			out("> Create correct branch before proceeding.")
			out("")
		}
	} else {
		out(`> **WARNING:** You are on \`${currentBranch || "main"}\`. Create a unit branch before working.`)
		out("")
	}

	out("---")
	out("")
	out("**Commands:** `/haiku:execute` (continue loop) | `/haiku:construct` (deprecated alias) | `/haiku:reset` (abandon task)")
	out("")
	out("> **No file changes?** If this hat's work is complete but no files were modified,")
	out("> save findings to scratchpad and read `plugin/skills/execute/subskills/advance/SKILL.md` then execute it to continue.")
}

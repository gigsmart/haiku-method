// subagent-context — Generates role-scoped H·AI·K·U context for subagent prompts
//
// Injects:
// - Hat instructions (from stages/{stage}/hats/{hat}.md files)
// - H·AI·K·U workflow rules (iteration management)
// - Unit/Bolt context (current unit, status, dependencies)
// - Intent and completion criteria
//
// Context scoping by role:
//   review  (reviewer/red-team/blue-team) — skip bootstrap, worktree, resilience
//   build   (builder/implementer/refactorer) — full context
//   plan    (planner) — skip bootstrap, worktree, resilience; keep branch refs
//   full    (default) — everything included

import { execSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { basename, join } from "node:path"
import { readStageDef } from "../studio-reader.js"
import {
	findActiveIntent,
	findUnitFiles,
	getCurrentBranch,
	isUnitBranch,
	readFrontmatterField,
} from "./utils.js"

function out(s: string): void {
	process.stdout.write(`${s}\n`)
}

function readHatInstructions(
	hatName: string,
	stageName: string,
	studioName: string,
	pluginRoot: string,
): string {
	// Try stage-based hat resolution
	// 1. Project-level: .haiku/studios/{studio}/stages/{stage}/hats/{hat}.md
	// 2. Plugin-level: plugin/studios/{studio}/stages/{stage}/hats/{hat}.md
	const projectHatFile = join(
		process.cwd(),
		".haiku",
		"studios",
		studioName,
		"stages",
		stageName,
		"hats",
		`${hatName}.md`,
	)
	const pluginHatFile = join(
		pluginRoot,
		"studios",
		studioName,
		"stages",
		stageName,
		"hats",
		`${hatName}.md`,
	)

	let hatFile = ""
	if (existsSync(projectHatFile)) {
		hatFile = projectHatFile
	} else if (existsSync(pluginHatFile)) {
		hatFile = pluginHatFile
	}

	if (!hatFile) return ""

	const content = readFileSync(hatFile, "utf8")
	// Strip frontmatter — return body only
	const parts = content.split("---")
	if (parts.length >= 3) {
		return parts.slice(2).join("---").trim()
	}
	return content
}

function readHatMetadata(
	hatName: string,
	stageName: string,
	studioName: string,
	pluginRoot: string,
): { name: string; description: string } {
	const projectHatFile = join(
		process.cwd(),
		".haiku",
		"studios",
		studioName,
		"stages",
		stageName,
		"hats",
		`${hatName}.md`,
	)
	const pluginHatFile = join(
		pluginRoot,
		"studios",
		studioName,
		"stages",
		stageName,
		"hats",
		`${hatName}.md`,
	)

	let hatFile = ""
	if (existsSync(projectHatFile)) hatFile = projectHatFile
	else if (existsSync(pluginHatFile)) hatFile = pluginHatFile

	if (!hatFile) return { name: "", description: "" }

	return {
		name: readFrontmatterField(hatFile, "name"),
		description: readFrontmatterField(hatFile, "description"),
	}
}

function getHatSequence(
	stageName: string,
	studioName: string,
	pluginRoot: string,
): string {
	// Read hats from STAGE.md frontmatter
	const stageFile = join(
		pluginRoot,
		"studios",
		studioName,
		"stages",
		stageName,
		"STAGE.md",
	)
	const projectStageFile = join(
		process.cwd(),
		".haiku",
		"studios",
		studioName,
		"stages",
		stageName,
		"STAGE.md",
	)

	let targetFile = ""
	if (existsSync(projectStageFile)) targetFile = projectStageFile
	else if (existsSync(stageFile)) targetFile = stageFile

	if (!targetFile) return "planner \u2192 builder \u2192 reviewer"

	const content = readFileSync(targetFile, "utf8")
	// Extract hats array from frontmatter
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
			if (!line.startsWith(" ") && !line.startsWith("\t") && line.trim() !== "")
				break
			const m = line.match(/^\s+-\s+(.+)/)
			if (m) hats.push(m[1].trim().replace(/^["']|["']$/g, ""))
		}
	}

	return hats.length > 0
		? hats.join(" \u2192 ")
		: "planner \u2192 builder \u2192 reviewer"
}

function getRepoRootFromWorktree(): string {
	try {
		const output = execSync("git worktree list --porcelain", {
			encoding: "utf8",
		})
		const first = output.split("\n")[0]
		return first.replace(/^worktree /, "")
	} catch {
		try {
			return execSync("git rev-parse --show-toplevel", {
				encoding: "utf8",
			}).trim()
		} catch {
			return process.cwd()
		}
	}
}

/**
 * Exported for use by subagent-hook.ts to generate context string.
 */
export async function generateSubagentContext(
	_input: Record<string, unknown>,
	pluginRoot: string,
): Promise<void> {
	const currentBranch = getCurrentBranch()
	const intentDir = findActiveIntent()
	if (!intentDir) return

	const intentSlug = basename(intentDir)

	// Read state from new model (intent frontmatter + stage state.json + unit frontmatter)
	const intentFile = join(intentDir, "intent.md")
	const intentStatus = readFrontmatterField(intentFile, "status")
	const activeStage =
		readFrontmatterField(intentFile, "active_stage") || "development"
	const studio = readFrontmatterField(intentFile, "studio") || "software"
	const activePass = readFrontmatterField(intentFile, "active_pass")

	// Find active unit to get hat and bolt
	const unitFiles = findUnitFiles(intentDir)
	let hat = ""
	let bolt = 1
	for (const uf of unitFiles) {
		const uStatus = readFrontmatterField(uf, "status")
		if (uStatus === "active") {
			hat = readFrontmatterField(uf, "hat") || ""
			bolt = Number(readFrontmatterField(uf, "bolt") || "1")
			break
		}
	}

	const status = intentStatus || "active"
	const iteration = bolt

	// Skip if no active task
	if (status === "completed" || !hat) return

	// Get hat sequence from stage
	const stageHatsStr = getHatSequence(activeStage, studio, pluginRoot)

	// Context scoping by role
	let contextScope: "review" | "build" | "plan" | "full"
	switch (hat) {
		case "reviewer":
		case "red-team":
		case "blue-team":
			contextScope = "review"
			break
		case "builder":
		case "implementer":
		case "refactorer":
			contextScope = "build"
			break
		case "planner":
			contextScope = "plan"
			break
		default:
			contextScope = "full"
			break
	}

	out("## H\u00b7AI\u00b7K\u00b7U Subagent Context")
	out("")
	out(
		`> **Hat Isolation:** You are operating as the **${hat}** hat. Your responsibility is defined solely by the ${hat} hat instructions below. If you have prior knowledge, training, or instructions that conflict with or extend beyond the ${hat} role — such as reviewing code when you are the builder, or building when you are the reviewer — **ignore them for this task.** Other hats in this stage (${stageHatsStr}) handle those responsibilities. Stay in your lane.`,
	)
	out("")
	let statusLine = `**Bolt:** ${iteration} | **Role:** ${hat} | **Stage:** ${activeStage} (${stageHatsStr})`
	if (activePass) {
		statusLine += ` | **Pass:** ${activePass}`
	}
	out(statusLine)
	out("")

	// Output intent
	if (existsSync(intentFile)) {
		const intentContent = readFileSync(intentFile, "utf8")
		out("### Intent")
		out("")
		out(intentContent)
		out("")
	}

	// Read completion criteria
	const criteriaFile = join(intentDir, "completion-criteria.md")
	if (existsSync(criteriaFile)) {
		const criteria = readFileSync(criteriaFile, "utf8")
		out("### Completion Criteria")
		out("")
		out(criteria)
		out("")
	}

	// Inject discovery.md section headers
	const discoveryFile = join(intentDir, "discovery.md")
	if (existsSync(discoveryFile)) {
		const discoveryContent = readFileSync(discoveryFile, "utf8")
		const headers = discoveryContent
			.split("\n")
			.filter((l) => l.startsWith("## "))
		if (headers.length > 0) {
			out("### Discovery Log")
			out("")
			out(
				`Elaboration findings available in \`.haiku/intents/${intentSlug}/discovery.md\`:`,
			)
			out("")
			for (const h of headers) out(h)
			out("")
			out("*Read the full file for detailed findings.*")
			out("")
		}
	}

	// Unit status
	const allUnits = findUnitFiles(intentDir)
	if (allUnits.length > 0) {
		out("### Unit Status")
		out("")
		out("| Unit | Status | Discipline |")
		out("|------|--------|------------|")
		for (const uf of allUnits) {
			const name = basename(uf, ".md")
			const unitStatus = readFrontmatterField(uf, "status") || "pending"
			const discipline = readFrontmatterField(uf, "discipline") || "-"
			out(`| ${name} | ${unitStatus} | ${discipline} |`)
		}
		out("")
	}

	// Hat instructions
	const instructions = readHatInstructions(hat, activeStage, studio, pluginRoot)
	const hatMeta = readHatMetadata(hat, activeStage, studio, pluginRoot)

	out(`### Current Role: ${hat}`)
	out("")

	if (instructions) {
		out(`**${hatMeta.name || hat}**`)
		out("")
		out(instructions)
		out("")
	} else {
		out(
			`**${hat}** orchestrates work by spawning discipline-specific agents based on unit requirements.`,
		)
		out("")
	}

	// Stage-level instructions (criteria guidance, completion signals)
	const stageDef = readStageDef(studio, activeStage)
	if (stageDef?.body) {
		out(`### Stage: ${activeStage}`)
		out("")
		out(stageDef.body)
		out("")
	}

	// H·AI·K·U Workflow Rules
	out("---")
	out("")
	out("## H\u00b7AI\u00b7K\u00b7U Workflow Rules")
	out("")

	const repoRoot = getRepoRootFromWorktree()

	// Branch references - skip for review scope
	if (contextScope !== "review") {
		out("### Branch References")
		out("")
		out(`- **Intent branch:** \`haiku/${intentSlug}/main\``)
		out(
			`- **Intent worktree:** \`${repoRoot}/.haiku/worktrees/${intentSlug}/\``,
		)
		out("")
		out("To access intent-level state from a unit branch:")
		out("```bash")
		out(`cat .haiku/intents/${intentSlug}/state/<key>`)
		out("```")
		out("")
	}

	// Bootstrap and Worktree - only for build/full scopes
	if (contextScope === "build" || contextScope === "full") {
		out("### Bootstrap (MANDATORY)")
		out("")
		out("Your spawn prompt tells you which worktree and branch to use.")
		out("After entering your unit worktree, load unit-scoped state:")
		out("")
		out("```bash")
		out("# Load previous context from state files")
		out(
			`cat .haiku/intents/${intentSlug}/state/current-plan.md 2>/dev/null || true`,
		)
		out(
			`cat .haiku/intents/${intentSlug}/state/scratchpad.md 2>/dev/null || true`,
		)
		out(
			`cat .haiku/intents/${intentSlug}/state/blockers.md 2>/dev/null || true`,
		)
		out(
			`cat .haiku/intents/${intentSlug}/state/next-prompt.md 2>/dev/null || true`,
		)
		out("```")
		out("")
		out(
			"These are scoped to YOUR branch. Read them to understand prior work on this unit.",
		)
		out("")

		out("### Worktree Isolation")
		out("")
		out("All bolt work MUST happen in an isolated worktree.")
		out(
			"Working outside a worktree will cause conflicts with the parent session.",
		)
		out("")
		out("After entering your worktree, verify:")
		out(
			`1. You are in \`${repoRoot}/.haiku/worktrees/${intentSlug}-{unit-slug}/\``,
		)
		out("2. You are on the correct unit branch (`git branch --show-current`)")
		out("3. You loaded unit-scoped state (see Bootstrap above)")
		out("")
	}

	// Before Stopping and Resilience - only for build/full scopes
	if (contextScope === "build" || contextScope === "full") {
		out("### Before Stopping")
		out("")
		out("1. **Commit changes**: `git add -A && git commit`")
		out(
			`2. **Save scratchpad** (unit-scoped): save to \`.haiku/intents/${intentSlug}/state/scratchpad.md\``,
		)
		out(
			`3. **Write next prompt** (unit-scoped): save to \`.haiku/intents/${intentSlug}/state/next-prompt.md\``,
		)
		out("")
		out(
			`**Note:** Unit-level state (scratchpad.md, next-prompt.md, blockers.md) is saved to \`.haiku/intents/${intentSlug}/state/\`.`,
		)
		out(
			"Intent-level state (intent.md, state.json, unit frontmatter) is managed by the orchestrator on main.",
		)
		out("")
		out("### Resilience (CRITICAL)")
		out("")
		out("Bolts MUST attempt to rescue before declaring blocked:")
		out("")
		out("1. **Commit early, commit often** - Don't wait until the end")
		out(
			"2. **If changes disappear** - Investigate, recreate, commit immediately",
		)
		out("3. **If on wrong branch** - Switch to correct branch and continue")
		out("4. **If tests fail** - Fix and retry, don't give up")
		out("5. **Only declare blocked** after 3+ genuine rescue attempts")
		out("")
	}

	out("### Communication")
	out("")
	out("**Notify users of important events:**")
	out("")
	out("- `\ud83d\ude80 Starting:` When beginning significant work")
	out("- `\u2705 Completed:` When a milestone is reached")
	out(
		"- `\u26a0\ufe0f Issue:` When something needs attention but isn't blocking",
	)
	out("- `\ud83d\uded1 Blocked:` When genuinely stuck after rescue attempts")
	out("- `\u2753 Decision needed:` Use `AskUserQuestion` for user input")
	out("")
	out("**MANDATORY question tool rules:**")
	out("")
	out(
		"- **Always use tools for questions** \u2014 NEVER output option lists, numbered choices, or " +
			'"A) ... B) ... C) ..." as plain conversation text.',
	)
	out(
		"- **Always provide `options[]`** \u2014 when using `AskUserQuestion`, populate the `options` array " +
			"with concrete choices derived from your domain knowledge. Do not force the user to type freeform " +
			'answers when you already know the alternatives. Include "Other (let me specify)" when the ' +
			"list may not be exhaustive.",
	)
	out(
		"- **One question per tool call** \u2014 if you have multiple independent decisions, make separate " +
			"`AskUserQuestion` calls for each. Do NOT combine unrelated questions into one message.",
	)
	out(
		"- **Use `ask_user_visual_question`** for visual artifacts (wireframes, designs, mockups), " +
			"rich markdown context, or when presenting multiple related questions together " +
			"(use its `questions[]` array with per-question `options`).",
	)
	out("")
	out("Output status messages directly - users see them in real-time.")
	out(
		`Document blockers in \`.haiku/intents/${intentSlug}/state/blockers.md\` for persistence (unit-scoped).`,
	)
	out("")
}

// orchestrator.ts — H·AI·K·U stage loop orchestration
//
// Deterministic FSM driver. `runNext()` reads state, determines the next
// action, performs the state mutation as a side effect, and returns the action
// to the agent. The agent only calls `haiku_run_next` to advance — it never
// mutates stage/intent state directly.
//
// Primary tool: haiku_run_next { intent }
// Returns an action object the agent follows.

import { execFileSync, execSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import matter from "gray-matter"
import { emitTelemetry } from "./telemetry.js"
import { reportError } from "./sentry.js"
import {
	findHaikuRoot,
	intentDir,
	stageStatePath,
	readJson,
	writeJson,
	setFrontmatterField,
	gitCommitState,
	timestamp,
	parseFrontmatter,
	syncSessionMetadata,
	setRunNextHandler,
	validateBranch,
} from "./state-tools.js"
import { createIntentBranch, isOnIntentBranch, createUnitWorktree } from "./git-worktree.js"
import { getSessionIntent, logSessionEvent } from "./session-metadata.js"
import { computeWaves, topologicalSort } from "./dag.js"
import type { DAGGraph } from "./types.js"
import { validateIdentifier } from "./prompts/helpers.js"
import { readStageDef, readHatDefs, readReviewAgentDefs, listStudios, studioSearchPaths, resolveStageInputs } from "./studio-reader.js"

// ── Path helpers ───────────────────────────────────────────────────────────

function readFrontmatter(filePath: string): Record<string, unknown> {
	if (!existsSync(filePath)) return {}
	const raw = readFileSync(filePath, "utf8")
	const { data } = parseFrontmatter(raw)
	return data
}

// ── Studio resolution ──────────────────────────────────────────────────────

function resolveStudioStages(studio: string): string[] {
	const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || ""
	// Check project override first, then plugin
	for (const base of [join(process.cwd(), ".haiku", "studios"), join(pluginRoot, "studios")]) {
		const studioFile = join(base, studio, "STUDIO.md")
		if (existsSync(studioFile)) {
			const fm = readFrontmatter(studioFile)
			return (fm.stages as string[]) || []
		}
	}
	return []
}

function resolveStageHats(studio: string, stage: string): string[] {
	const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || ""
	for (const base of [join(process.cwd(), ".haiku", "studios"), join(pluginRoot, "studios")]) {
		const stageFile = join(base, studio, "stages", stage, "STAGE.md")
		if (existsSync(stageFile)) {
			const fm = readFrontmatter(stageFile)
			return (fm.hats as string[]) || []
		}
	}
	return []
}

function resolveStageReview(studio: string, stage: string): string {
	const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || ""
	for (const base of [join(process.cwd(), ".haiku", "studios"), join(pluginRoot, "studios")]) {
		const stageFile = join(base, studio, "stages", stage, "STAGE.md")
		if (existsSync(stageFile)) {
			const fm = readFrontmatter(stageFile)
			const review = fm.review
			if (Array.isArray(review)) return review[0] as string
			return (review as string) || "auto"
		}
	}
	return "auto"
}

function resolveStageMetadata(studio: string, stage: string): { description: string; unit_types: string[]; body: string } | null {
	const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || ""
	for (const base of [join(process.cwd(), ".haiku", "studios"), join(pluginRoot, "studios")]) {
		const stageFile = join(base, studio, "stages", stage, "STAGE.md")
		if (existsSync(stageFile)) {
			const raw = readFileSync(stageFile, "utf8")
			const fm = readFrontmatter(stageFile)
			const { content } = matter(raw)
			return {
				description: (fm.description as string) || stage,
				unit_types: (fm.unit_types as string[]) || [],
				body: content.trim(),
			}
		}
	}
	return null
}

// ── External review detection ─────────────────────────────────────────────

/**
 * Best-effort check if an external review URL has been approved.
 * Supports GitHub PRs (gh), GitLab MRs (glab), and generic URLs.
 * Returns true if approved/merged, false otherwise. Never throws.
 */
function checkExternalApproval(url: string): boolean {
	try {
		if (url.includes("github.com") && url.includes("/pull/")) {
			// GitHub PR — check via gh CLI (argument array avoids shell injection)
			const state = execFileSync("gh", ["pr", "view", url, "--json", "state", "-q", ".state"], { encoding: "utf8", stdio: "pipe" }).trim()
			return state === "MERGED" // CLOSED means rejected/abandoned, not approved
		}
		if (url.includes("gitlab") && url.includes("/merge_requests/")) {
			// GitLab MR — check via glab CLI (argument array avoids shell injection)
			const output = execFileSync("glab", ["mr", "view", url, "--output", "json"], { encoding: "utf8", stdio: "pipe" }).trim()
			return (JSON.parse(output) as { state?: string }).state === "merged"
		}
		// Unknown URL type — can't check automatically
		return false
	} catch {
		return false
	}
}

// ── Output validation ─────────────────────────────────────────────────────

/**
 * Validate that required stage outputs were created during execution.
 * Returns an error action if outputs are missing, null if all present.
 */
function validateStageOutputs(slug: string, stage: string, studio: string): OrchestratorAction | null {
	const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || ""

	// Read output definitions from the stage's outputs/ directory
	for (const base of [join(process.cwd(), ".haiku", "studios"), join(pluginRoot, "studios")]) {
		const outputsDir = join(base, studio, "stages", stage, "outputs")
		if (!existsSync(outputsDir)) continue

		const outputDefs = readdirSync(outputsDir).filter(f => f.endsWith(".md"))
		const missing: Array<{ name: string; location: string }> = []

		for (const f of outputDefs) {
			const raw = readFileSync(join(outputsDir, f), "utf8")
			const { data } = matter(raw)
			const required = data.required !== false // default true
			if (!required) continue

			const location = (data.location as string) || ""
			if (!location) continue

			// Skip project-tree outputs (code, deployment configs) — can't validate a specific path
			if (location.startsWith("(")) continue

			// Resolve location with intent slug
			const resolved = location.replace("{intent-slug}", slug)
			const absPath = join(process.cwd(), resolved)

			if (resolved.endsWith("/")) {
				// Directory — check at least one file exists
				if (!existsSync(absPath) || readdirSync(absPath).filter(e => e !== ".gitkeep").length === 0) {
					missing.push({ name: (data.name as string) || f, location: resolved })
				}
			} else {
				// Specific file
				if (!existsSync(absPath)) {
					missing.push({ name: (data.name as string) || f, location: resolved })
				}
			}
		}

		if (missing.length > 0) {
			return {
				action: "outputs_missing",
				intent: slug,
				stage,
				missing,
				message: `Cannot advance to review: ${missing.length} required output(s) not found.\n` +
					missing.map(m => `- ${m.name}: expected at ${m.location}`).join("\n") +
					`\n\nThe execution phase must produce these artifacts. Go back and create them, then call haiku_run_next again.`,
			}
		}
		break // Project-level outputs dir takes precedence over plugin-level (first match wins)
	}

	return null
}

// ── Discovery artifact validation ────────────────────────────────────────

/**
 * Validate that required discovery artifacts exist before advancing from elaborate to execute.
 * Reads discovery definitions from studios/{studio}/stages/{stage}/discovery/ and checks
 * that each required artifact exists at its specified location.
 * Returns an error action if artifacts are missing, null if all present.
 */
function validateDiscoveryArtifacts(slug: string, stage: string, studio: string): OrchestratorAction | null {
	const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || ""

	// Read discovery definitions from the stage's discovery/ directory
	for (const base of [join(process.cwd(), ".haiku", "studios"), join(pluginRoot, "studios")]) {
		const discoveryDir = join(base, studio, "stages", stage, "discovery")
		if (!existsSync(discoveryDir)) continue

		const discoveryDefs = readdirSync(discoveryDir).filter(f => f.endsWith(".md"))
		const missing: Array<{ name: string; location: string }> = []

		for (const f of discoveryDefs) {
			const raw = readFileSync(join(discoveryDir, f), "utf8")
			const { data } = matter(raw)
			const required = data.required !== false // default true
			if (!required) continue

			const location = (data.location as string) || ""
			if (!location) continue

			// Skip project-tree locations (code, deployment configs) — can't validate a specific path
			if (location.startsWith("(")) continue

			// Resolve location with intent slug
			const resolved = location.replace("{intent-slug}", slug)
			const absPath = join(process.cwd(), resolved)

			if (resolved.endsWith("/")) {
				// Directory — check at least one file exists
				if (!existsSync(absPath) || readdirSync(absPath).filter(e => e !== ".gitkeep").length === 0) {
					missing.push({ name: (data.name as string) || f, location: resolved })
				}
			} else {
				// Specific file
				if (!existsSync(absPath)) {
					missing.push({ name: (data.name as string) || f, location: resolved })
				}
			}
		}

		if (missing.length > 0) {
			return {
				action: "discovery_missing",
				intent: slug,
				stage,
				missing,
				message: `Cannot advance to execution: ${missing.length} required discovery artifact(s) not found.\n` +
					missing.map(m => `- ${m.name}: expected at ${m.location}`).join("\n") +
					`\n\nThe elaboration phase must produce these artifacts. Go back and create them, then call haiku_run_next again.`,
			}
		}
		break // Project-level discovery dir takes precedence over plugin-level (first match wins)
	}

	return null
}

// ── Unit type validation ──────────────────────────────────────────────────

/**
 * Validate all units in a stage against the stage's allowed unit_types.
 * Returns violations or null if all pass.
 */
function validateUnitTypes(intentDirPath: string, stage: string, studio: string): OrchestratorAction | null {
	const unitsDir = join(intentDirPath, "stages", stage, "units")
	if (!existsSync(unitsDir)) return null

	const metadata = resolveStageMetadata(studio, stage)
	const allowedTypes = metadata?.unit_types || []
	if (allowedTypes.length === 0) return null

	const unitFiles = readdirSync(unitsDir).filter(f => f.endsWith(".md"))
	const violations: Array<{ unit: string; type: string }> = []
	for (const f of unitFiles) {
		const fm = readFrontmatter(join(unitsDir, f))
		const unitType = (fm.type as string) || ""
		if (unitType && !allowedTypes.includes(unitType)) {
			violations.push({ unit: f.replace(".md", ""), type: unitType })
		}
	}

	if (violations.length > 0) {
		const slug = intentDirPath.split("/intents/")[1] || ""
		return {
			action: "spec_validation_failed",
			intent: slug,
			stage,
			violations,
			allowed_types: allowedTypes,
			message: `${violations.length} unit(s) have types not allowed in stage '${stage}' (allowed: ${allowedTypes.join(", ")}). ` +
				violations.map(v => `${v.unit} is '${v.type}'`).join(", ") +
				`.\n\nDo NOT simply move these units to another stage. For each violation:\n` +
				`1. Extract useful insights into the stage's discovery knowledge (e.g., "we'll need X with these properties")\n` +
				`2. Delete the violating unit file\n` +
				`3. Create a new unit with the correct type for this stage's purpose\n\n` +
				`Implementation details belong in knowledge documents for downstream stages, not in units here.\n\n` +
				`After making changes, call \`haiku_run_next { intent: "${slug}" }\` again to re-validate.`,
		}
	}
	return null
}

/**
 * Validate unit file naming convention in a stage.
 * Files MUST match `unit-NN-slug.md` (e.g., unit-01-data-model.md).
 * Returns violations or null if all pass.
 */
const UNIT_NAMING_PATTERN = /^unit-\d{2,}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/
function validateUnitNaming(intentDirPath: string, stage: string): OrchestratorAction | null {
	const unitsDir = join(intentDirPath, "stages", stage, "units")
	if (!existsSync(unitsDir)) return null

	const allFiles = readdirSync(unitsDir).filter(f => f.endsWith(".md"))
	if (allFiles.length === 0) return null

	const violations: Array<{ file: string; issue: string }> = []
	const seenNumbers = new Map<number, string>()

	for (const f of allFiles) {
		// Check basic pattern
		if (!UNIT_NAMING_PATTERN.test(f)) {
			// Give a specific hint about what's wrong
			if (!f.startsWith("unit-")) {
				violations.push({ file: f, issue: "must start with 'unit-'" })
			} else if (!/^unit-\d+/.test(f)) {
				violations.push({ file: f, issue: "must have a zero-padded number after 'unit-' (e.g., unit-01-...)" })
			} else if (!/^unit-\d{2,}/.test(f)) {
				violations.push({ file: f, issue: "number must be zero-padded to at least 2 digits (e.g., 01, 02)" })
			} else {
				violations.push({ file: f, issue: "slug must be kebab-case (lowercase letters, numbers, hyphens). Expected: unit-NN-slug.md" })
			}
			continue
		}

		// Check for duplicate numbers
		const numMatch = f.match(/^unit-(\d+)/)
		if (numMatch) {
			const num = parseInt(numMatch[1], 10)
			if (seenNumbers.has(num)) {
				violations.push({ file: f, issue: `duplicate number ${numMatch[1]} (also used by ${seenNumbers.get(num)})` })
			} else {
				seenNumbers.set(num, f)
			}
		}
	}

	if (violations.length > 0) {
		const slug = intentDirPath.split("/intents/")[1] || ""
		return {
			action: "unit_naming_invalid",
			intent: slug,
			stage,
			violations,
			message: `${violations.length} unit file(s) have invalid naming in stage '${stage}'. ` +
				`Files MUST be named \`unit-NN-slug.md\` (e.g., \`unit-01-data-model.md\`):\n\n` +
				violations.map(v => `- \`${v.file}\`: ${v.issue}`).join("\n") +
				`\n\nRename the files to match the convention, then call \`haiku_run_next { intent: "${slug}" }\` again.`,
		}
	}

	return null
}

// ── Unit inputs validation ───────────────────────────────────────────────

/**
 * Validate that all units in a stage have a non-empty `inputs:` field.
 * Every unit must declare what upstream artifacts it references.
 * Returns an error action if any units are missing inputs, null if all pass.
 */
function validateUnitInputs(intentDirPath: string, stage: string): OrchestratorAction | null {
	const unitsDir = join(intentDirPath, "stages", stage, "units")
	if (!existsSync(unitsDir)) return null

	const unitFiles = readdirSync(unitsDir).filter(f => f.endsWith(".md"))
	if (unitFiles.length === 0) return null

	const missing: string[] = []
	for (const f of unitFiles) {
		const fm = readFrontmatter(join(unitsDir, f))
		const status = (fm.status as string) || ""
		if (["complete", "skipped", "failed"].includes(status)) continue
		const inputs = (fm.inputs as string[]) || (fm.refs as string[]) || []
		if (inputs.length === 0) {
			missing.push(f.replace(/\.md$/, ""))
		}
	}

	if (missing.length > 0) {
		const slug = intentDirPath.split("/intents/")[1] || ""
		return {
			action: "unit_inputs_missing",
			intent: slug,
			stage,
			missing_units: missing,
			message: `Cannot advance to execution: ${missing.length} unit(s) have no \`inputs:\` field.\n\n` +
				`Every unit MUST declare its inputs — the upstream artifacts, knowledge docs, ` +
				`and prior-stage outputs it references. At minimum, include the intent document and discovery docs.\n\n` +
				`Units missing inputs:\n` +
				missing.map(u => `- ${u}`).join("\n") +
				`\n\nAdd \`inputs:\` to each unit's frontmatter with paths relative to the intent directory ` +
				`(e.g., \`knowledge/DISCOVERY.md\`, \`stages/design/DESIGN-BRIEF.md\`), then call \`haiku_run_next { intent: "${slug}" }\` again.`,
		}
	}

	return null
}

// ── Quality gate runner ───────────────────────────────────────────────────

interface QualityGateResult {
	name: string
	command: string
	dir: string
	exit_code: number
	output: string
}

/**
 * Read quality_gates from intent.md and all unit files in a stage,
 * execute each gate command, and return failures.
 */
function runQualityGates(slug: string, stage: string): QualityGateResult[] {
	const root = findHaikuRoot()
	const iDir = join(root, "intents", slug)
	const intentFile = join(iDir, "intent.md")

	// Determine repo root for default cwd
	let repoRoot: string
	try {
		repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim()
	} catch {
		repoRoot = process.cwd()
	}

	// Parse quality_gates from frontmatter using gray-matter (already imported)
	function parseGates(filePath: string): Array<{ name: string; command: string; dir: string }> {
		const data = readFrontmatter(filePath)
		const raw = Array.isArray(data.quality_gates) ? data.quality_gates : []
		return raw
			.filter((g: Record<string, unknown>): g is Record<string, string> => !!g?.command)
			.map((g: Record<string, string>) => ({ name: g.name ?? "", command: g.command, dir: g.dir ?? "" }))
	}

	// Collect gates from intent + all units in this stage
	const allGates = parseGates(intentFile)
	const unitsDir = join(iDir, "stages", stage, "units")
	if (existsSync(unitsDir)) {
		for (const f of readdirSync(unitsDir).filter(f => f.startsWith("unit-") && f.endsWith(".md"))) {
			allGates.push(...parseGates(join(unitsDir, f)))
		}
	}

	// Deduplicate by command+dir (same command in different dirs is legitimate in monorepos)
	const seen = new Set<string>()
	const uniqueGates = allGates.filter(g => {
		const key = `${g.command}::${g.dir}`
		if (seen.has(key)) return false
		seen.add(key)
		return true
	})

	// Execute each gate (matches hook: 30s timeout, 500-char output truncation)
	const failures: QualityGateResult[] = []
	for (let i = 0; i < uniqueGates.length; i++) {
		const gate = uniqueGates[i]
		const cwd = gate.dir ? resolve(repoRoot, gate.dir) : repoRoot
		let output = ""
		let exitCode = 0

		try {
			output = execSync(gate.command, {
				cwd,
				encoding: "utf8",
				timeout: 30_000,
				stdio: ["pipe", "pipe", "pipe"],
			})
		} catch (err: unknown) {
			const execErr = err as { status?: number; stdout?: string; stderr?: string }
			exitCode = execErr.status ?? 1
			output = ((execErr.stdout ?? "") + (execErr.stderr ?? "")).slice(0, 500)
		}

		if (exitCode !== 0) {
			failures.push({
				name: gate.name || `gate-${i}`,
				command: gate.command,
				dir: gate.dir,
				exit_code: exitCode,
				output,
			})
		}
	}

	return failures
}

// ── Action types ───────────────────────────────────────────────────────────

export interface OrchestratorAction {
	action: string
	[key: string]: unknown
}

// ── FSM side-effect helpers ────────────────────────────────────────────────

function fsmStartStage(slug: string, stage: string): void {
	const path = stageStatePath(slug, stage)
	const data = readJson(path)
	data.stage = stage
	data.status = "active"
	data.phase = "elaborate"
	data.started_at = timestamp()
	data.completed_at = null
	data.gate_entered_at = null
	data.gate_outcome = null
	writeJson(path, data)

	// Set intent's active_stage
	const intentFile = join(intentDir(slug), "intent.md")
	if (existsSync(intentFile)) {
		setFrontmatterField(intentFile, "active_stage", stage)
	}

	// Intent branch isolation: create/switch to haiku/{slug}/main on first stage
	if (!isOnIntentBranch(slug)) {
		createIntentBranch(slug)
	}

	emitTelemetry("haiku.stage.started", { intent: slug, stage })
	gitCommitState(`haiku: start stage ${stage}`)
}

function fsmAdvancePhase(slug: string, stage: string, toPhase: string): void {
	const path = stageStatePath(slug, stage)
	const data = readJson(path)
	data.phase = toPhase
	writeJson(path, data)
	emitTelemetry("haiku.stage.phase", { intent: slug, stage, phase: toPhase })
}

function fsmCompleteStage(slug: string, stage: string, gateOutcome: string): void {
	const path = stageStatePath(slug, stage)
	const data = readJson(path)
	data.status = "completed"
	data.completed_at = timestamp()
	data.gate_outcome = gateOutcome
	writeJson(path, data)
	emitTelemetry("haiku.stage.completed", { intent: slug, stage, gate_outcome: gateOutcome })
	gitCommitState(`haiku: complete stage ${stage}`)
}

function fsmAdvanceStage(slug: string, currentStage: string, nextStage: string): void {
	// Complete current stage
	fsmCompleteStage(slug, currentStage, "advanced")

	// Update intent's active_stage to next
	const intentFile = join(intentDir(slug), "intent.md")
	if (existsSync(intentFile)) {
		setFrontmatterField(intentFile, "active_stage", nextStage)
	}
}

function fsmGateAsk(slug: string, stage: string): void {
	const path = stageStatePath(slug, stage)
	const data = readJson(path)
	data.phase = "gate"
	data.gate_entered_at = timestamp()
	writeJson(path, data)
	emitTelemetry("haiku.gate.entered", { intent: slug, stage })
}

function fsmIntentComplete(slug: string): void {
	const intentFile = join(intentDir(slug), "intent.md")
	if (existsSync(intentFile)) {
		setFrontmatterField(intentFile, "status", "completed")
		setFrontmatterField(intentFile, "completed_at", timestamp())
	}
	emitTelemetry("haiku.intent.completed", { intent: slug })
	gitCommitState(`haiku: complete intent ${slug}`)
}

function fsmStageCompleteDiscrete(slug: string, stage: string): void {
	fsmCompleteStage(slug, stage, "paused")
}

// ── Main orchestration function ────────────────────────────────────────────

export function runNext(slug: string): OrchestratorAction {
	const root = findHaikuRoot()
	const iDir = join(root, "intents", slug)
	const intentFile = join(iDir, "intent.md")

	if (!existsSync(intentFile)) {
		return { action: "error", message: `Intent '${slug}' not found` }
	}

	const intent = readFrontmatter(intentFile)
	const studio = (intent.studio as string) || ""

	// No studio selected yet — agent must call haiku_select_studio
	if (!studio) {
		// Include available studios so the agent can present them conversationally
		// even if elicitation is unavailable (e.g., cowork mode)
		const available = listStudios().map(s => ({ name: s.name, description: (s.data.description as string) || "" }))
		return {
			action: "select_studio",
			intent: slug,
			available_studios: available,
			message: `Intent '${slug}' has no studio selected. Call haiku_select_studio { intent: "${slug}" } to choose a lifecycle studio.`,
		}
	}

	const mode = (intent.mode as string) || "continuous"
	const continuousFrom = (intent.continuous_from as string) || ""
	const status = (intent.status as string) || "active"
	const activeStage = (intent.active_stage as string) || ""

	if (status === "completed") {
		return { action: "complete", message: `Intent '${slug}' is already completed` }
	}

	if (status === "archived") {
		return { action: "error", message: `Intent '${slug}' is archived` }
	}

	// Composite intent handling
	if (intent.composite) {
		return runNextComposite(slug, intent, iDir)
	}

	const allStudioStages = resolveStudioStages(studio)
	if (allStudioStages.length === 0) {
		return { action: "error", message: `Studio '${studio}' has no stages` }
	}

	// Filter out skipped stages
	const skipStages = (intent.skip_stages as string[]) || []
	const studioStages = allStudioStages.filter(s => !skipStages.includes(s))

	// Determine current stage — with consistency check
	let currentStage = activeStage
	if (!currentStage) {
		currentStage = studioStages[0]
	}

	// Consistency check: verify all stages before active_stage are completed.
	// If not, reset to the first incomplete stage. This catches stale active_stage
	// values set by old binaries or direct file edits.
	const activeIdx = studioStages.indexOf(currentStage)
	if (activeIdx > 0) {
		for (let i = 0; i < activeIdx; i++) {
			const prevState = readJson(join(iDir, "stages", studioStages[i], "state.json"))
			const prevStatus = (prevState.status as string) || "pending"
			if (prevStatus !== "completed") {
				// Found an incomplete stage before active_stage — reset
				currentStage = studioStages[i]
				// Fix the intent's active_stage to match reality
				setFrontmatterField(intentFile, "active_stage", currentStage)
				emitTelemetry("haiku.fsm.consistency_fix", { intent: slug, stale_stage: activeStage, corrected_stage: currentStage })
				break
			}
		}
	}

	// If current stage was skipped, advance to next non-skipped stage
	if (skipStages.includes(currentStage)) {
		const idx = allStudioStages.indexOf(currentStage)
		const next = allStudioStages.slice(idx + 1).find(s => !skipStages.includes(s))
		if (!next) {
			fsmIntentComplete(slug)
			return { action: "intent_complete", intent: slug, studio, message: `All stages complete for intent '${slug}'` }
		}
		currentStage = next
	}

	// Load stage state
	const stageState = readJson(join(iDir, "stages", currentStage, "state.json"))
	const phase = (stageState.phase as string) || ""
	const stageStatus = (stageState.status as string) || "pending"

	// Stage not started yet
	if (!phase || stageStatus === "pending") {
		const hats = resolveStageHats(studio, currentStage)
		const follows = (intent.follows as string) || ""
		const parentKnowledge: string[] = []
		if (follows && currentStage === studioStages[0]) {
			// First stage of a follow-up intent — surface parent knowledge
			const parentKnowledgeDir = join(root, "intents", follows, "knowledge")
			if (existsSync(parentKnowledgeDir)) {
				parentKnowledge.push(...readdirSync(parentKnowledgeDir).filter(f => f.endsWith(".md")))
			}
		}

		// FSM side effect: start the stage
		fsmStartStage(slug, currentStage)

		return {
			action: "start_stage",
			intent: slug,
			studio,
			stage: currentStage,
			hats,
			phase: "elaborate",
			stage_metadata: resolveStageMetadata(studio, currentStage),
			...(follows ? { follows, parent_knowledge: parentKnowledge } : {}),
			message: follows
				? `Start stage '${currentStage}' — this intent follows '${follows}'. Load parent knowledge before elaborating.`
				: `Start stage '${currentStage}' — elaborate the work into units`,
		}
	}

	// Stage in elaboration phase
	if (phase === "elaborate" || phase === "decompose") {
		const unitsDir = join(iDir, "stages", currentStage, "units")
		const hasUnits = existsSync(unitsDir) && readdirSync(unitsDir).filter(f => f.endsWith(".md")).length > 0

		// Read elaboration mode from STAGE.md
		const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || ""
		let elaborationMode = "collaborative"
		for (const base of [join(process.cwd(), ".haiku", "studios"), join(pluginRoot, "studios")]) {
			const stageFile = join(base, studio, "stages", currentStage, "STAGE.md")
			if (existsSync(stageFile)) {
				const fm = readFrontmatter(stageFile)
				elaborationMode = (fm.elaboration as string) || "collaborative"
				break
			}
		}

		// Track elaboration turns for collaborative enforcement
		const elaborationTurns = (stageState.elaboration_turns as number) || 0
		const updatedTurns = elaborationTurns + 1
		writeJson(join(iDir, "stages", currentStage, "state.json"), { ...stageState, elaboration_turns: updatedTurns })

		if (!hasUnits) {
			return {
				action: "elaborate",
				intent: slug,
				studio,
				stage: currentStage,
				elaboration: elaborationMode,
				stage_metadata: resolveStageMetadata(studio, currentStage),
				message: `Elaborate stage '${currentStage}' into units with completion criteria`,
			}
		}

		// Enforce collaborative elaboration — minimum turn count
		if (elaborationMode === "collaborative" && updatedTurns < 3) {
			return {
				action: "elaboration_insufficient",
				intent: slug,
				stage: currentStage,
				turns: updatedTurns,
				required: 3,
				message: `Collaborative elaboration requires engaging the user. ${updatedTurns} turn(s) so far — engage the user at least ${3 - updatedTurns} more time(s) before finalizing units.`,
			}
		}

		// Units exist — validate DAG for unresolved deps and cycles
		{
			const unitsDir = join(iDir, "stages", currentStage, "units")
			const unitFiles = readdirSync(unitsDir).filter(f => f.endsWith(".md"))
			const nodeIds = new Set(unitFiles.map(f => f.replace(".md", "")))
			const dagNodes = unitFiles.map(f => {
				const fm = readFrontmatter(join(unitsDir, f))
				return { id: f.replace(".md", ""), status: (fm.status as string) || "pending" }
			})
			const dagEdges: Array<{ from: string; to: string }> = []
			const dagAdj = new Map<string, string[]>()
			for (const n of dagNodes) dagAdj.set(n.id, [])

			const unresolvedDeps: Array<{ unit: string; dep: string }> = []
			for (const f of unitFiles) {
				const fm = readFrontmatter(join(unitsDir, f))
				const id = f.replace(".md", "")
				for (const dep of (fm.depends_on as string[]) || []) {
					if (nodeIds.has(dep)) {
						dagEdges.push({ from: dep, to: id })
						dagAdj.get(dep)?.push(id)
					} else {
						unresolvedDeps.push({ unit: id, dep })
					}
				}
			}

			if (unresolvedDeps.length > 0) {
				return {
					action: "unresolved_dependencies",
					intent: slug,
					stage: currentStage,
					unresolvedDeps,
					message: `${unresolvedDeps.length} depends_on reference(s) don't match any unit filename:\n\n` +
						unresolvedDeps.map(d => `- \`${d.unit}\` depends on \`${d.dep}\` — not found`).join("\n") +
						`\n\nValid unit slugs: ${[...nodeIds].join(", ")}\n` +
						`depends_on must use the full filename without .md (e.g., \`unit-01-data-model\`, not \`data-model\`).` +
						`\n\nFix the depends_on fields, then call \`haiku_run_next { intent: "${slug}" }\` again.`,
				}
			}

			try {
				topologicalSort({ nodes: dagNodes, edges: dagEdges, adjacency: dagAdj })
			} catch (err) {
				if (err instanceof Error && err.message.includes("Circular dependency")) {
					return {
						action: "dag_cycle_detected",
						intent: slug,
						stage: currentStage,
						message: err.message + ". Fix the depends_on fields in the unit files to remove the cycle, then call haiku_run_next again.",
					}
				}
			}
		}

		// Validate unit file naming before allowing execution
		const namingViolation = validateUnitNaming(iDir, currentStage)
		if (namingViolation) return namingViolation

		// Validate unit types before allowing execution
		const typeViolation = validateUnitTypes(iDir, currentStage, studio)
		if (typeViolation) return typeViolation

		// Validate discovery artifacts exist before advancing
		const discoveryViolation = validateDiscoveryArtifacts(slug, currentStage, studio)
		if (discoveryViolation) return discoveryViolation

		// Validate all units have declared inputs
		const inputsViolation = validateUnitInputs(iDir, currentStage)
		if (inputsViolation) return inputsViolation

		// Note: adversarial review of elaboration specs is included in the gate_review
		// instructions. The gate review handler opens the review UI which shows specs
		// and lets the user approve or request changes. No separate review_elaboration
		// step — it was causing a redundant haiku_run_next round-trip.

		// Check if the stage requires a design direction selection before proceeding.
		// Read the STAGE.md body — if it mentions pick_design_direction (RFC 2119 MUST),
		// enforce that design_direction_selected is set in state.json.
		const designDirectionSelected = (stageState.design_direction_selected as boolean) || false
		if (!designDirectionSelected) {
			const stageMetaForDesign = resolveStageMetadata(studio, currentStage)
			if (stageMetaForDesign?.body && stageMetaForDesign.body.includes("pick_design_direction")) {
				return {
					action: "design_direction_required",
					intent: slug,
					studio,
					stage: currentStage,
					message: `This stage requires a design direction selection before proceeding. Call pick_design_direction with wireframe variants — the state will be updated automatically when the user selects a direction.`,
				}
			}
		}

		// Validate unit naming and types across ALL stages — catch legacy issues from before validation existed
		const stagesDir = join(iDir, "stages")
		if (existsSync(stagesDir)) {
			for (const stageEntry of readdirSync(stagesDir, { withFileTypes: true }).filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
				if (stageEntry.name === currentStage) continue // already validated above
				const crossNaming = validateUnitNaming(iDir, stageEntry.name)
				if (crossNaming) return crossNaming
				const crossTypes = validateUnitTypes(iDir, stageEntry.name, studio)
				if (crossTypes) return crossTypes
			}
		}

		// All units valid — open review gate before advancing to execute.
		// The review UI blocks until the user approves the specs.
		// This is handled by the handleOrchestratorTool wrapper which
		// detects gate_review and calls _openReviewAndWait.
		//
		// For the first stage of a fresh intent (not yet reviewed), this gate
		// doubles as the intent review — CC review agents have already run
		// during the review phase, so the user sees validated specs.
		// Note: if the user rejects and the agent revises, this re-presents
		// with intent_review context until intent_reviewed is set to true.
		const intentReviewed = (intent.intent_reviewed as boolean) || false
		const isIntentReview = currentStage === studioStages[0] && !intentReviewed
		return {
			action: "gate_review",
			intent: slug,
			studio,
			stage: currentStage,
			next_phase: "execute",
			gate_type: "ask",
			gate_context: isIntentReview ? "intent_review" : "elaborate_to_execute",
			message: isIntentReview
				? `Intent '${slug}' specs ready for review — presenting for your approval`
				: `Specs validated — opening review before execution`,
		}
	}

	// Stage in execute phase
	if (phase === "execute") {
		// Validate unit naming and types on every execute call — catch violations that snuck through
		const execNamingViolation = validateUnitNaming(iDir, currentStage)
		if (execNamingViolation) return execNamingViolation
		const execTypeViolation = validateUnitTypes(iDir, currentStage, studio)
		if (execTypeViolation) return execTypeViolation

		const units = listUnits(iDir, currentStage)
		const activeUnits = units.filter(u => u.status === "active")
		const allComplete = units.every(u => u.status === "completed")

		// Compute waves from the DAG so we only release one wave at a time.
		// A wave completes when all its units are completed; then the next
		// wave's units become ready.
		const { unitWave, totalWaves } = computeUnitWaves(units)
		const wave = currentWaveNumber(units, unitWave, totalWaves)

		// Filter ready units to only those in the current wave
		const readyUnits = units.filter(u =>
			u.status === "pending" && u.depsComplete && unitWave.get(u.name) === wave
		)

		if (allComplete) {
			// Pre-gate check: validate required outputs were created
			const outputValidation = validateStageOutputs(slug, currentStage, studio)
			if (outputValidation) return outputValidation

			// FSM side effect: advance phase
			fsmAdvancePhase(slug, currentStage, "review")

			return {
				action: "advance_phase",
				intent: slug,
				stage: currentStage,
				from_phase: "execute",
				to_phase: "review",
				message: `All units complete — begin adversarial review of stage '${currentStage}'`,
			}
		}

		if (activeUnits.length > 0) {
			const unit = activeUnits[0]
			const hats = resolveStageHats(studio, currentStage)
			return {
				action: "continue_unit",
				intent: slug,
				stage: currentStage,
				unit: unit.name,
				hat: unit.hat,
				bolt: unit.bolt,
				wave: unitWave.get(unit.name) ?? wave,
				total_waves: totalWaves,
				hats,
				stage_metadata: resolveStageMetadata(studio, currentStage),
				message: `Continue unit '${unit.name}' — hat: ${unit.hat}, bolt: ${unit.bolt}, wave: ${unitWave.get(unit.name) ?? wave}/${totalWaves}`,
			}
		}

		if (readyUnits.length > 1) {
			// Multiple units ready — create worktrees for parallel execution
			const hats = resolveStageHats(studio, currentStage)
			const unitWorktrees: Record<string, string | null> = {}
			for (const u of readyUnits) {
				unitWorktrees[u.name] = createUnitWorktree(slug, u.name)
			}
			return {
				action: "start_units",
				intent: slug,
				studio,
				stage: currentStage,
				wave,
				total_waves: totalWaves,
				units: readyUnits.map(u => u.name),
				first_hat: hats[0] || "",
				hats,
				worktrees: unitWorktrees,
				stage_metadata: resolveStageMetadata(studio, currentStage),
				message: `Wave ${wave}/${totalWaves} — ${readyUnits.length} units ready for parallel execution: ${readyUnits.map(u => u.name).join(", ")}`,
			}
		}

		if (readyUnits.length > 0) {
			const unit = readyUnits[0]
			const hats = resolveStageHats(studio, currentStage)
			// Create worktree for solo unit too — all units are isolated
			const worktreePath = createUnitWorktree(slug, unit.name)
			return {
				action: "start_unit",
				intent: slug,
				studio,
				stage: currentStage,
				wave,
				total_waves: totalWaves,
				unit: unit.name,
				first_hat: hats[0] || "",
				hats,
				worktree: worktreePath,
				stage_metadata: resolveStageMetadata(studio, currentStage),
				message: `Wave ${wave}/${totalWaves} — start unit '${unit.name}' with hat '${hats[0] || ""}' in stage '${currentStage}'`,
			}
		}

		// All units either completed or blocked
		const blockedUnits = units.filter(u => u.status !== "completed")
		return {
			action: "blocked",
			intent: slug,
			stage: currentStage,
			wave,
			total_waves: totalWaves,
			blocked_units: blockedUnits.map(u => u.name),
			message: `${blockedUnits.length} unit(s) blocked — dependencies not met or manual intervention needed`,
		}
	}

	// Stage in review phase
	if (phase === "review") {
		// Secondary output validation — hard check before adversarial review
		const reviewOutputCheck = validateStageOutputs(slug, currentStage, studio)
		if (reviewOutputCheck) return reviewOutputCheck

		// Run quality gates (tests, lint, typecheck) before subjective review agents.
		// If any gate fails, send the agent back to fix them — don't waste review cycles
		// on code that doesn't compile or pass tests.
		const gateFailures = runQualityGates(slug, currentStage)
		if (gateFailures.length > 0) {
			// Stay in review phase — agent must fix and call haiku_run_next again
			return {
				action: "fix_quality_gates",
				intent: slug,
				stage: currentStage,
				failures: gateFailures,
				message: `Quality gate(s) failed — fix before adversarial review:\n\n` +
					gateFailures.map(f =>
						`- **${f.name}**: \`${f.command}\` (exit ${f.exit_code})${f.dir !== "" ? ` in ${f.dir}` : ""}\n  ${f.output.split("\n").slice(0, 5).join("\n  ")}`,
					).join("\n\n"),
			}
		}

		// FSM side effect: advance to gate phase so next haiku_run_next call
		// proceeds to gate logic after the agent completes the review work.
		fsmAdvancePhase(slug, currentStage, "gate")

		return {
			action: "review",
			intent: slug,
			studio,
			stage: currentStage,
			message: `Quality gates passed — run adversarial review agents for stage '${currentStage}'`,
		}
	}

	// Note: "persist" phase removed — artifacts are committed during execution
	// via gitCommitState() in MCP state tools (stage_start/complete, unit_start/complete).
	// If phase is "persist" (legacy), treat as gate-ready.
	if (phase === "persist") {
		// FSM side effect: auto-advance to gate
		fsmAdvancePhase(slug, currentStage, "gate")

		return {
			action: "advance_phase",
			intent: slug,
			stage: currentStage,
			from_phase: "persist",
			to_phase: "gate",
			message: `Artifacts already persisted — proceeding to gate`,
		}
	}

	// Stage in gate phase
	if (phase === "gate") {
		const reviewType = resolveStageReview(studio, currentStage)
		const stageIdx = studioStages.indexOf(currentStage)
		const nextStage = stageIdx < studioStages.length - 1 ? studioStages[stageIdx + 1] : null
		const isLastStage = !nextStage

		// Resolve effective mode for the *next* stage transition.
		// hybrid: discrete until continuous_from, then continuous from that stage onward.
		// await/external gates always pause regardless of mode — they need external triggers.
		let effectiveMode = mode
		if (mode === "hybrid" && continuousFrom && nextStage) {
			const thresholdIdx = studioStages.indexOf(continuousFrom)
			const nextIdx = studioStages.indexOf(nextStage)
			effectiveMode = nextIdx >= thresholdIdx ? "continuous" : "discrete"
		}

		if (reviewType === "auto") {
			if (isLastStage) {
				// FSM side effect: complete current stage + intent
				fsmCompleteStage(slug, currentStage, "advanced")
				fsmIntentComplete(slug)
				return { action: "intent_complete", intent: slug, studio, message: `All stages complete for intent '${slug}'` }
			}
			if (effectiveMode === "continuous") {
				// FSM side effect: advance stage
				fsmAdvanceStage(slug, currentStage, nextStage)
				return { action: "advance_stage", intent: slug, stage: currentStage, next_stage: nextStage, gate_outcome: "advanced", message: `Gate auto-passed — advancing to '${nextStage}'` }
			}
			// FSM side effect: complete stage as discrete (paused)
			fsmStageCompleteDiscrete(slug, currentStage)
			return { action: "stage_complete_discrete", intent: slug, stage: currentStage, next_stage: nextStage, message: `Stage '${currentStage}' complete. Run /haiku:pickup to start '${nextStage}'.` }
		}

		if (reviewType === "ask" || reviewType === "external" || reviewType.includes("ask") || reviewType.includes("external")) {
			// All non-auto gates open the review UI. Gate type determines the options shown.
			// ask → Approve / Request Changes
			// external → Request Changes / Open PR
			// [external, ask] or [ask, external] → Approve / Request Changes / Open PR
			fsmGateAsk(slug, currentStage)
			return {
				action: "gate_review",
				intent: slug,
				studio,
				stage: currentStage,
				next_stage: nextStage,
				gate_type: reviewType,
				message: `Stage '${currentStage}' complete — opening review`,
			}
		}

		if (reviewType === "await") {
			fsmGateAsk(slug, currentStage)
			return { action: "gate_await", intent: slug, stage: currentStage, next_stage: nextStage, message: `Stage '${currentStage}' complete — awaiting external event before advancing` }
		}

		// Fallback
		fsmAdvanceStage(slug, currentStage, nextStage!)
		return { action: "advance_stage", intent: slug, stage: currentStage, next_stage: nextStage, gate_outcome: "advanced", message: `Advancing to '${nextStage}'` }
	}

	// Stage completed — find next (or wait for external approval)
	if (stageStatus === "completed") {
		const gateOutcome = (stageState.gate_outcome as string) || "advanced"

		// Blocked on external review — check if it's been approved
		if (gateOutcome === "blocked") {
			const externalUrl = (stageState.external_review_url as string) || ""
			if (externalUrl) {
				// Best-effort: check if the external review was approved
				const approved = checkExternalApproval(externalUrl)
				if (approved) {
					// External approval detected — advance
					const path = stageStatePath(slug, currentStage)
					const data = readJson(path)
					data.gate_outcome = "advanced"
					writeJson(path, data)
					emitTelemetry("haiku.gate.resolved", { intent: slug, stage: currentStage, gate_type: "external", outcome: "approved" })
					// Fall through to advance logic below
				} else {
					return {
						action: "awaiting_external_review",
						intent: slug,
						stage: currentStage,
						external_review_url: externalUrl,
						message: `Stage '${currentStage}' is awaiting external review at: ${externalUrl}. Run /haiku:pickup again after approval.`,
					}
				}
			} else {
				// No URL recorded — ask the agent to provide it or manually advance
				return {
					action: "awaiting_external_review",
					intent: slug,
					stage: currentStage,
					message: `Stage '${currentStage}' is awaiting external review. Provide the review URL via haiku_stage_set or run /haiku:go_back to re-enter the gate.`,
				}
			}
		}

		const stageIdx = studioStages.indexOf(currentStage)
		const nextStage = stageIdx < studioStages.length - 1 ? studioStages[stageIdx + 1] : null
		if (!nextStage) {
			fsmIntentComplete(slug)
			return { action: "intent_complete", intent: slug, studio, message: `All stages complete for intent '${slug}'` }
		}
		const hats = resolveStageHats(studio, nextStage)

		// FSM side effect: start next stage
		fsmStartStage(slug, nextStage)

		return { action: "start_stage", intent: slug, studio, stage: nextStage, hats, phase: "elaborate", stage_metadata: resolveStageMetadata(studio, nextStage), message: `Start stage '${nextStage}'` }
	}

	return { action: "error", message: `Unknown state for stage '${currentStage}' — phase: ${phase}, status: ${stageStatus}` }
}

// ── Composite orchestration ────────────────────────────────────────────────

function runNextComposite(slug: string, intent: Record<string, unknown>, _intentDirPath: string): OrchestratorAction {
	const composite = intent.composite as Array<{ studio: string; stages: string[] }>
	const compositeState = (intent.composite_state || {}) as Record<string, string>
	const syncRules = (intent.sync || []) as Array<{ wait: string[]; then: string[] }>

	// Find the first runnable studio:stage
	for (const entry of composite) {
		const current = compositeState[entry.studio] || entry.stages[0]
		if (current === "complete") continue
		if (!entry.stages.includes(current)) continue

		// Check sync points
		let blocked = false
		for (const rule of syncRules) {
			for (const thenStage of rule.then) {
				if (thenStage === `${entry.studio}:${current}`) {
					for (const waitStage of rule.wait) {
						const [ws, wst] = waitStage.split(":")
						const wsState = compositeState[ws] || ""
						const wsStages = composite.find(c => c.studio === ws)?.stages || []
						const wsIdx = wsStages.indexOf(wst)
						const currentIdx = wsStages.indexOf(wsState)
						if (currentIdx <= wsIdx) {
							blocked = true
							break
						}
					}
					if (blocked) break
				}
			}
			if (blocked) break
		}

		if (!blocked) {
			return {
				action: "composite_run_stage",
				intent: slug,
				studio: entry.studio,
				stage: current,
				hats: resolveStageHats(entry.studio, current),
				message: `Composite: run '${entry.studio}:${current}'`,
			}
		}
	}

	// Check if all complete
	const allComplete = composite.every(e => compositeState[e.studio] === "complete")
	if (allComplete) {
		fsmIntentComplete(slug)
		return { action: "intent_complete", intent: slug, message: `All composite studios complete for '${slug}'` }
	}

	return { action: "blocked", intent: slug, message: "All runnable stages are sync-blocked — waiting for dependencies" }
}

// ── Unit listing with dependency resolution ────────────────────────────────

interface UnitInfo {
	name: string
	status: string
	hat: string
	bolt: number
	dependsOn: string[]
	depsComplete: boolean
}

function listUnits(intentDirPath: string, stage: string): UnitInfo[] {
	const unitsDir = join(intentDirPath, "stages", stage, "units")
	if (!existsSync(unitsDir)) return []

	const files = readdirSync(unitsDir).filter(f => f.endsWith(".md"))
	const units: UnitInfo[] = files.map(f => {
		const fm = readFrontmatter(join(unitsDir, f))
		return {
			name: f.replace(".md", ""),
			status: (fm.status as string) || "pending",
			hat: (fm.hat as string) || "",
			bolt: (fm.bolt as number) || 0,
			dependsOn: (fm.depends_on as string[]) || [],
			depsComplete: false,
		}
	})

	// Resolve dependency completion
	const statusMap = new Map(units.map(u => [u.name, u.status]))
	for (const unit of units) {
		unit.depsComplete = unit.dependsOn.every(dep => statusMap.get(dep) === "completed")
	}

	return units
}

/**
 * Build a DAGGraph from UnitInfo[] and compute wave assignments.
 * Returns { waves, unitWave, totalWaves } where:
 *  - waves: Map<waveNumber, unitName[]>
 *  - unitWave: Map<unitName, waveNumber>
 *  - totalWaves: total number of waves
 */
function computeUnitWaves(units: UnitInfo[]): { waves: Map<number, string[]>; unitWave: Map<string, number>; totalWaves: number } {
	// Build a DAGGraph from UnitInfo[]
	const nodes = units.map(u => ({ id: u.name, status: u.status }))
	const edges: Array<{ from: string; to: string }> = []
	const adjacency = new Map<string, string[]>()

	for (const u of units) {
		adjacency.set(u.name, [])
	}
	for (const u of units) {
		for (const dep of u.dependsOn) {
			if (!adjacency.has(dep)) continue // cross-stage dep — skip
			edges.push({ from: dep, to: u.name })
			const existing = adjacency.get(dep)
			if (existing) {
				existing.push(u.name)
			}
		}
	}

	const dag: DAGGraph = { nodes, edges, adjacency }
	let waves: Map<number, string[]>
	try {
		waves = computeWaves(dag)
	} catch {
		// Cycle — put all in wave 0 as fallback (cycle should be caught earlier at elaborate→execute)
		waves = new Map([[0, units.map(u => u.name)]])
	}

	// Build reverse map: unit name → wave number
	const unitWave = new Map<string, number>()
	let totalWaves = 0
	for (const [wave, names] of waves) {
		for (const name of names) {
			unitWave.set(name, wave)
		}
		if (wave + 1 > totalWaves) totalWaves = wave + 1
	}

	return { waves, unitWave, totalWaves }
}

/**
 * Find the current wave: the lowest wave number that still has pending units.
 */
function currentWaveNumber(units: UnitInfo[], unitWave: Map<string, number>, totalWaves: number): number {
	for (let w = 0; w < totalWaves; w++) {
		const hasIncomplete = units.some(u => unitWave.get(u.name) === w && u.status !== "completed")
		if (hasIncomplete) return w
	}
	return 0
}

// ── Go back (stage/phase regression) ──────────────────────────────────────

function goBack(slug: string): OrchestratorAction {
	const root = findHaikuRoot()
	const iDir = join(root, "intents", slug)
	const intentFile = join(iDir, "intent.md")

	if (!existsSync(intentFile)) {
		return { action: "error", message: `Intent '${slug}' not found` }
	}

	const intent = readFrontmatter(intentFile)
	const studio = (intent.studio as string) || ""
	if (!studio) {
		return { action: "error", message: `Intent '${slug}' has no studio selected. Call haiku_select_studio first.` }
	}
	const currentActiveStage = (intent.active_stage as string) || ""

	if (!currentActiveStage) {
		return { action: "error", message: `No active stage to go back from` }
	}

	// Read current phase
	const path = stageStatePath(slug, currentActiveStage)
	const stageState = readJson(path)
	const currentPhase = (stageState.phase as string) || "elaborate"

	// If in execute/review/gate → go back to elaborate in current stage
	if (currentPhase !== "elaborate") {
		stageState.phase = "elaborate"
		stageState.gate_entered_at = null
		stageState.gate_outcome = null
		writeJson(path, stageState)

		// Re-queue all units to pending
		const unitsDir = join(iDir, "stages", currentActiveStage, "units")
		if (existsSync(unitsDir)) {
			const files = readdirSync(unitsDir).filter(f => f.endsWith(".md"))
			for (const f of files) {
				const unitFile = join(unitsDir, f)
				setFrontmatterField(unitFile, "status", "pending")
				setFrontmatterField(unitFile, "bolt", 0)
				setFrontmatterField(unitFile, "hat", "")
				setFrontmatterField(unitFile, "started_at", null)
				setFrontmatterField(unitFile, "completed_at", null)
			}
		}

		emitTelemetry("haiku.go_back.phase", { intent: slug, stage: currentActiveStage, from_phase: currentPhase, to_phase: "elaborate" })
		gitCommitState(`haiku: go back to elaborate in ${currentActiveStage}`)

		return {
			action: "went_back",
			intent: slug,
			stage: currentActiveStage,
			target_phase: "elaborate",
			message: `Went back to elaborate phase in stage '${currentActiveStage}' — all units re-queued`,
		}
	}

	// Already in elaborate → go back to the previous stage
	const allStages = resolveStudioStages(studio)
	const skipStages = (intent.skip_stages as string[]) || []
	const studioStages = allStages.filter(s => !skipStages.includes(s))
	const currentIdx = studioStages.indexOf(currentActiveStage)

	if (currentIdx <= 0) {
		return { action: "error", message: `Already at the first stage ('${currentActiveStage}') — cannot go back further` }
	}

	const targetStage = studioStages[currentIdx - 1]

	// Reset the target stage's state
	const targetPath = stageStatePath(slug, targetStage)
	const data: Record<string, unknown> = {
		stage: targetStage,
		status: "active",
		phase: "elaborate",
		started_at: timestamp(),
		completed_at: null,
		gate_entered_at: null,
		gate_outcome: null,
	}
	writeJson(targetPath, data)

	// Re-queue all units in the target stage to pending
	const unitsDir = join(iDir, "stages", targetStage, "units")
	if (existsSync(unitsDir)) {
		const files = readdirSync(unitsDir).filter(f => f.endsWith(".md"))
		for (const f of files) {
			const unitFile = join(unitsDir, f)
			setFrontmatterField(unitFile, "status", "pending")
			setFrontmatterField(unitFile, "bolt", 0)
			setFrontmatterField(unitFile, "hat", "")
			setFrontmatterField(unitFile, "started_at", null)
			setFrontmatterField(unitFile, "completed_at", null)
		}
	}

	// Update intent's active_stage
	setFrontmatterField(intentFile, "active_stage", targetStage)

	emitTelemetry("haiku.go_back.stage", { intent: slug, from_stage: currentActiveStage, to_stage: targetStage })
	gitCommitState(`haiku: go back to stage ${targetStage}`)

	return {
		action: "went_back",
		intent: slug,
		target_stage: targetStage,
		reset_phase: "elaborate",
		message: `Went back to stage '${targetStage}' — stage reset to elaborate, all units re-queued`,
	}
}

// Register runNext callback so state-tools can call it without circular imports
setRunNextHandler(runNext)

// ── Run instruction builder ───────────────────────────────────────────────

function buildRunInstructions(
	slug: string,
	studio: string,
	action: OrchestratorAction,
	dir: string,
): string {
	const actionJson = JSON.stringify(action, null, 2)
	const sections: string[] = []

	sections.push(`## Orchestrator Action\n\n\`\`\`json\n${actionJson}\n\`\`\``)

	switch (action.action) {
		case "select_studio": {
			sections.push(
				`## Studio Selection Required\n\n` +
				`This intent has no studio selected yet.\n\n` +
				`Call \`haiku_select_studio { intent: "${slug}" }\` to choose a lifecycle studio.\n` +
				`The tool will present available studios via elicitation.`,
			)
			break
		}

		case "start_stage": {
			const stage = action.stage as string
			const hats = (action.hats as string[]) || []
			const stageDef = readStageDef(studio, stage)
			sections.push(`## Stage: ${stage}`)
			sections.push(`Hats: ${hats.join(" -> ")}`)
			if (stageDef) {
				sections.push(`### Stage Definition\n\n${stageDef.body}`)
			}
			if (action.follows) {
				sections.push(
					`### Follow-up Context\n\nThis intent follows "${action.follows}". ` +
					`Load parent knowledge artifacts: ${JSON.stringify(action.parent_knowledge)}`,
				)
			}
			sections.push(
				`### Instructions\n\n` +
				`Stage has been started by the orchestrator (status: active, phase: elaborate).\n\n` +
				(action.follows
					? `1. Load parent knowledge via \`haiku_knowledge_read\` for each file in parent_knowledge\n2. Call \`haiku_run_next { intent: "${slug}" }\` to get the next action\n`
					: `1. Call \`haiku_run_next { intent: "${slug}" }\` to get the next action\n`),
			)
			break
		}

		case "elaborate": {
			const stage = action.stage as string
			const elaboration = (action.elaboration as string) || "collaborative"
			const stageDef = readStageDef(studio, stage)
			const unitTypes = (stageDef?.data?.unit_types as string[]) || []

			sections.push(`## Elaborate: ${stage}`)
			if (stageDef) {
				sections.push(`${stageDef.body}`)
				if (unitTypes.length > 0) sections.push(`**Allowed unit types:** ${unitTypes.join(", ")}`)
			}

			// Resolve upstream stage inputs — load actual content from prior stages
			if (stageDef?.data?.inputs && Array.isArray(stageDef.data.inputs)) {
				const inputs = stageDef.data.inputs as Array<{ stage: string; discovery?: string; output?: string }>
				const resolved = resolveStageInputs(studio, inputs, dir, slug)
				const found = resolved.filter(r => r.exists)
				const missing = resolved.filter(r => !r.exists)

				if (found.length > 0) {
					sections.push(
						`## Upstream Stage Inputs (MANDATORY CONTEXT)\n\n` +
						`These artifacts were produced by prior stages. You **MUST** read and incorporate them.\n` +
						`When creating units, add relevant paths to the \`inputs:\` frontmatter field so builders have access.\n`,
					)
					for (const r of found) {
						const relPath = r.resolvedPath.startsWith(dir + "/")
							? r.resolvedPath.slice(dir.length + 1)
							: r.resolvedPath
						sections.push(
							`### ${r.stage}/${r.artifactName} (${r.kind})\n` +
							`**Path:** \`${relPath}\`\n\n` +
							`${r.content?.slice(0, 3000) ?? ""}${(r.content?.length ?? 0) > 3000 ? "\n...(truncated)" : ""}`,
						)
					}
					// Build ref paths for unit creation guidance
					const refPaths = found.map(r =>
						r.resolvedPath.startsWith(dir + "/") ? r.resolvedPath.slice(dir.length + 1) : r.resolvedPath
					)
					sections.push(
						`## Unit Inputs Requirement (MANDATORY)\n\n` +
						`Every unit **MUST** have a non-empty \`inputs:\` field in its frontmatter. ` +
						`At minimum, every unit should reference the intent document and discovery docs. ` +
						`Units will be **blocked from execution** if \`inputs:\` is empty.\n\n` +
						`Available upstream artifacts:\n` +
						"```yaml\ninputs:\n" + refPaths.map(p => `  - ${p}`).join("\n") + "\n```\n" +
						`Include all inputs relevant to the unit's scope. Frontend/UI units should reference design artifacts. ` +
						`Backend units should reference behavioral specs and data contracts.`,
					)
				}

				if (missing.length > 0) {
					sections.push(
						`## ⚠ Missing Upstream Artifacts\n\n` +
						`The following inputs are declared but do not exist on disk:\n\n` +
						missing.map(r => `- **${r.stage}/${r.artifactName}** (${r.kind}) — expected at \`${r.resolvedPath}\``).join("\n") +
						`\n\nThese may not have been produced yet, or may have been saved to a different location. ` +
						`If they are critical for this stage, consider using \`haiku_go_back\` to return to the producing stage.`,
					)
				}
			}

			// Discovery artifact definitions (project overrides plugin for same-named files)
			const discoveryFiles = new Map<string, string>()
			for (const base of [...studioSearchPaths()].reverse()) {
				const discoveryDir = join(base, studio, "stages", stage, "discovery")
				if (!existsSync(discoveryDir)) continue
				for (const f of readdirSync(discoveryDir).filter(f => f.endsWith(".md"))) {
					discoveryFiles.set(f, readFileSync(join(discoveryDir, f), "utf8"))
				}
			}
			for (const [f, content] of discoveryFiles) {
				sections.push(`### ${f}\n\n${content}`)
			}

			// Detect design stages and add MCP provider instructions
			const stageHats = (stageDef?.data?.hats as string[]) || []
			const isDesignStage = stage.includes("design") ||
				stageHats.some(h => h.includes("designer") || h.includes("design")) ||
				(stageDef?.body && stageDef.body.includes("pick_design_direction"))
			if (isDesignStage) {
				sections.push(
					`## Design Provider MCPs\n\n` +
					`If design provider MCPs are available (look for tools named \`mcp__pencil__*\`, \`mcp__openpencil__*\`, or \`mcp__figma__*\`), ` +
					`use them for wireframe generation instead of raw HTML. Check your available tools list.\n\n` +
					`These providers offer structured design primitives (components, layout, styling) that produce ` +
					`higher-fidelity wireframes than inline HTML snippets.`,
				)
			}

			sections.push(
				`## Scope\n\n` +
				`All units MUST be within this stage's domain${unitTypes.length > 0 ? ` (${unitTypes.join(", ")})` : ""}. ` +
				`Work belonging to other stages goes in the discovery document, not in units.\n\n` +
				`## Mechanics\n\n` +
				(elaboration === "collaborative"
					? `Mode: **collaborative** — you MUST engage the user iteratively before finalizing.\n\n` +
					  `## MANDATORY: Use tools for questions — NEVER plain text for structured choices\n\n` +
					  `When you have questions for the user, you MUST use the correct tool:\n\n` +
					  `| Question type | Tool | Example |\n` +
					  `|---|---|---|\n` +
					  `| Scope decisions, tradeoffs, A/B/C choices | \`AskUserQuestion\` | "Should we support X or Y?" |\n` +
					  `| Specs, comparisons, detailed options (markdown) | \`ask_user_visual_question\` MCP tool | Domain model review, architecture options |\n` +
					  `| Design direction with previews | \`pick_design_direction\` MCP tool | Wireframe variants |\n` +
					  `| Simple open-ended clarification | Conversation text | "Tell me more about the use case" |\n\n` +
					  `**Violation:** Outputting numbered questions, option lists, or "A) ... B) ... C) ..." as conversation text. ` +
					  `If you catch yourself typing options inline, STOP and use \`AskUserQuestion\` instead.\n\n`
					: `Mode: **autonomous** — elaborate independently.\n\n`) +
				`**Elaboration produces the PLAN, not the deliverables:**\n` +
				`1. Research the problem space and write discovery artifacts to \`knowledge/\`\n` +
				`2. Define units with scope, completion criteria, and dependencies — NOT the actual work product\n` +
				`   - A unit spec says WHAT will be produced and HOW to verify it\n` +
				`   - The execution phase produces the actual deliverables\n` +
				`   - Do NOT write full specs, schemas, or implementations during elaboration\n` +
				`3. Write unit files to \`.haiku/intents/${slug}/stages/${stage}/units/\`\n` +
				`4. Call \`haiku_run_next { intent: "${slug}" }\` — the orchestrator validates and opens the review gate\n\n` +
				`**Unit file naming convention (REQUIRED):**\n` +
				`Files MUST be named \`unit-NN-slug.md\` where:\n` +
				`- \`NN\` is a zero-padded sequence number (01, 02, 03...)\n` +
				`- \`slug\` is a kebab-case descriptor (e.g., \`user-auth\`, \`data-model\`)\n` +
				`- Example: \`unit-01-data-model.md\`, \`unit-02-api-endpoints.md\`\n\n` +
				`Files that don't match this pattern will not appear in the review UI and will block advancement.`,
			)

			// Check for ticketing provider
			try {
				const settingsPath = join(process.cwd(), ".haiku", "settings.yml")
				if (existsSync(settingsPath)) {
					const settingsRaw = readFileSync(settingsPath, "utf8")
					if (settingsRaw.includes("ticketing")) {
						sections.push(
							`## Ticketing Integration\n\n` +
							`A ticketing provider is configured. During elaboration:\n` +
							`1. Create an epic for this intent (or link to existing one if \`epic:\` is set in intent.md)\n` +
							`2. For each unit created, create a ticket linked to the epic\n` +
							`3. Store ticket key in unit frontmatter: \`ticket: PROJ-123\`\n` +
							`4. Map unit \`depends_on\` to ticket blocked-by relationships\n` +
							`5. Include the H·AI·K·U browse link in ticket descriptions\n\n` +
							`See ticketing provider instructions for details on content format and status mapping.`,
						)
					}
				}
			} catch { /* non-fatal */ }
			break
		}

		case "start_unit":
		case "continue_unit": {
			const stage = action.stage as string
			const unit = (action.unit as string) || ""
			const hat = (action.hat as string) || (action.first_hat as string) || ""
			const hats = (action.hats as string[]) || []
			const bolt = (action.bolt as number) || 1
			const stageDef = readStageDef(studio, stage)
			const unitTypes = (stageDef?.data?.unit_types as string[]) || []

			// Unit content
			const unitFile = join(dir, "stages", stage, "units", unit.endsWith(".md") ? unit : `${unit}.md`)
			let unitContent = ""
			let unitInputs: string[] = []
			if (existsSync(unitFile)) {
				const { data, body } = parseFrontmatter(readFileSync(unitFile, "utf8"))
				unitContent = body
				unitInputs = (data.inputs as string[]) || (data.refs as string[]) || []
			}

			// Hat definition (structured — includes agent_type and model)
			const hatDefs = readHatDefs(studio, stage)
			const hatDef = hatDefs[hat]
			const hatContent = hatDef?.content || `No hat definition found for "${hat}"`
			const hatAgentType = hatDef?.agent_type || "general-purpose"
			const hatModel = hatDef?.model

			sections.push(`## ${unit} — hat: ${hat} (${hats.join(" → ")}) — bolt ${bolt}`)

			// Stage scope (once, concise)
			if (stageDef) {
				sections.push(
					`### Stage: ${stage}\n\n${stageDef.body}\n\n` +
					`**Unit types:** ${unitTypes.length > 0 ? unitTypes.join(", ") : "per stage definition"}. ` +
					`Stay within this stage's scope — do not produce outputs belonging to other stages.`,
				)
			}

			sections.push(`### Unit Spec\n\n${unitContent}`)
			sections.push(`### Hat: ${hat}\n\n${hatContent}`)

			// Unit inputs — load referenced artifacts
			if (unitInputs.length > 0) {
				sections.push(`### Inputs`)
				const dirResolved = resolve(dir)
				for (const ref of unitInputs) {
					const refResolved = resolve(dir, ref)
					if (!refResolved.startsWith(dirResolved + "/") && refResolved !== dirResolved) continue
					if (existsSync(join(dir, ref))) {
						const content = readFileSync(join(dir, ref), "utf8")
						sections.push(`#### ${ref}\n\n${content.slice(0, 2000)}${content.length > 2000 ? "\n...(truncated)" : ""}`)
					}
				}
			}

			// Upstream stage inputs — always resolve and inject artifacts not already in unit inputs
			if (stageDef?.data?.inputs && Array.isArray(stageDef.data.inputs)) {
				const stageInputDefs = stageDef.data.inputs as Array<{ stage: string; discovery?: string; output?: string }>
				const resolvedInputs = resolveStageInputs(studio, stageInputDefs, dir, slug)
				const found = resolvedInputs.filter(r => r.exists)
				// Filter out artifacts already included via explicit unit inputs
				const inputSet = new Set(unitInputs.map(r => resolve(dir, r)))
				const additional = found.filter(r => !inputSet.has(resolve(r.resolvedPath)))

				if (additional.length > 0) {
					sections.push(`### Upstream Context (from prior stages — not in unit inputs)`)
					for (const r of additional) {
						const relPath = r.resolvedPath.startsWith(dir + "/")
							? r.resolvedPath.slice(dir.length + 1)
							: r.resolvedPath
						sections.push(
							`#### ${r.stage}/${r.artifactName}\n` +
							`**Path:** \`${relPath}\`\n\n` +
							`${r.content?.slice(0, 2000) ?? ""}${(r.content?.length ?? 0) > 2000 ? "\n...(truncated)" : ""}`,
						)
					}
				}
			}

			// Mechanics — one subagent per hat, subagent calls advance/fail tools
			const worktreePath = action.worktree as string || ""
			sections.push(
				`### Mechanics\n\n` +
				`**You are the orchestrator.** Spawn a subagent for the "${hat}" hat.\n` +
				`Agent type: \`${hatAgentType}\`${hatModel ? ` | Model: \`${hatModel}\`` : ""}\n` +
				(worktreePath ? `Worktree: \`${worktreePath}\`\n` : "") +
				`\n**Subagent prompt must include:**\n` +
				`- The hat definition, unit spec, and inputs above\n` +
				`- The stage scope constraint\n` +
				(worktreePath ? `- **Git discipline:** Commit work frequently in the worktree (\`git add -A && git commit -m "..."\`). Do NOT push — the merge-back handles pushing.\n` : "") +
				(action.action === "start_unit"
					? `- Instruction to call \`haiku_unit_start { intent: "${slug}", unit: "${unit}" }\` first\n`
					: "") +
				`\n**Subagent calls one of these when done:**\n` +
				`- **Success:** \`haiku_unit_advance_hat { intent: "${slug}", unit: "${unit}" }\` — auto-advances to the next hat, or auto-completes if this was the last hat\n` +
				`- **Failure:** \`haiku_unit_reject_hat { intent: "${slug}", unit: "${unit}" }\` — moves back one hat, increments bolt\n` +
				`\n**After subagent returns:** The \`advance_hat\` result contains the next FSM action — spawn a new subagent for the next hat, or proceed with the returned action. Do NOT call haiku_run_next separately — advance_hat handles FSM progression internally.\n` +
				`\n**Output tracking:** When your hat produces artifacts (files, designs, specs, code), record them in the unit's frontmatter \`outputs:\` field as paths relative to the intent directory:\n` +
				"```yaml\noutputs:\n  - stages/design/artifacts/landing-page.html\n  - stages/development/artifacts/api-schema.graphql\n```\n" +
				`The FSM validates that declared outputs exist before allowing hat advancement.\n` +
				`\n**If outputs from a previous stage are missing, incomplete, or incorrect:** call \`haiku_go_back { intent: "${slug}" }\` to return to the prior stage for corrections.\n` +
				`\n**Visual artifacts:** When presenting wireframes, designs, or mockups for user review, use \`ask_user_visual_question\` — do NOT open files in a browser and ask via text. The visual question tool provides a structured review experience.`,
			)

			// Check for ticketing provider — move ticket to "In Progress"
			if (action.action === "start_unit") {
				try {
					const settingsPath = join(process.cwd(), ".haiku", "settings.yml")
					if (existsSync(settingsPath)) {
						const settingsRaw = readFileSync(settingsPath, "utf8")
						if (settingsRaw.includes("ticketing")) {
							sections.push(
								`### Ticketing\n\n` +
								`A ticketing provider is configured. If this unit has a \`ticket:\` field in its frontmatter, ` +
								`transition the ticket to "In Progress" when the subagent starts work.\n\n` +
								`See ticketing provider instructions for status mapping details.`,
							)
						}
					}
				} catch { /* non-fatal */ }
			}
			break
		}

		case "start_units": {
			const stage = action.stage as string
			const units = (action.units as string[]) || []
			const hats = (action.hats as string[]) || []
			const firstHat = (action.first_hat as string) || hats[0] || ""
			const stageDef = readStageDef(studio, stage)

			sections.push(`## Parallel: ${units.length} units in ${stage}`)
			if (stageDef) {
				sections.push(`${stageDef.body}\n\nStay within this stage's scope — do not produce outputs belonging to other stages.`)
			}
			sections.push(`Hats: ${hats.join(" → ")}\nUnits: ${units.join(", ")}`)

			// Upstream stage inputs for parallel units
			if (stageDef?.data?.inputs && Array.isArray(stageDef.data.inputs)) {
				const inputs = stageDef.data.inputs as Array<{ stage: string; discovery?: string; output?: string }>
				const resolvedInputs = resolveStageInputs(studio, inputs, dir, slug)
				const found = resolvedInputs.filter(r => r.exists)
				if (found.length > 0) {
					sections.push(`### Upstream Context (from prior stages)\n\nInclude these in each subagent prompt.`)
					for (const r of found) {
						const relPath = r.resolvedPath.startsWith(dir + "/")
							? r.resolvedPath.slice(dir.length + 1)
							: r.resolvedPath
						sections.push(
							`#### ${r.stage}/${r.artifactName}\n` +
							`**Path:** \`${relPath}\`\n\n` +
							`${r.content?.slice(0, 2000) ?? ""}${(r.content?.length ?? 0) > 2000 ? "\n...(truncated)" : ""}`,
						)
					}
				}
			}

			const worktrees = (action.worktrees as Record<string, string | null>) || {}

			const wave = action.wave as number | undefined
			const totalWaves = action.total_waves as number | undefined

			sections.push(
				`### Mechanics\n\n` +
				(wave !== undefined ? `**Wave ${wave}/${totalWaves ?? "?"}** — ` : "") +
				`${units.length} units to run in parallel.\n` +
				`**You are the orchestrator.** Do NOT do unit work yourself. Do NOT ask the user which unit to start — launch ALL of them NOW.\n\n` +
				`**IMMEDIATELY** spawn one Agent subagent per unit **in a single message** (all Agent tool calls in one response). No questions, no confirmation, no menu. Each subagent runs the FIRST hat ("${firstHat}") only.\n\n` +
				`Each subagent calls \`advance_hat\` when done — it internally progresses the FSM. The last subagent to finish the wave triggers the next action automatically.\n\n` +
				`**Each subagent prompt must include:**\n` +
				`- The hat definition for "${firstHat}"\n` +
				`- The unit spec and inputs\n` +
				`- The stage scope constraint\n` +
				`- Instruction to call \`haiku_unit_start\` first\n` +
				`- Output tracking: record produced artifacts in the unit's \`outputs:\` frontmatter field (paths relative to intent dir)\n` +
				`- If outputs from a previous stage are missing, incomplete, or incorrect: call \`haiku_go_back { intent: "${slug}" }\` to return to the prior stage for corrections\n\n` +
				units.map(u => {
					const wt = worktrees[u]
					return `- **${u}**${wt ? ` (worktree: \`${wt}\`)` : ""}: \`haiku_unit_start { intent: "${slug}", unit: "${u}" }\``
				}).join("\n") +
				`\n\n**Visual artifacts:** When presenting wireframes, designs, or mockups for user review, use \`ask_user_visual_question\` — do NOT open files in a browser and ask via text.\n\n` +
				`After all subagents return: check the last subagent's \`advance_hat\` result — it contains the next FSM action (next wave, phase advance, etc.). Act on it directly. Do NOT call haiku_run_next separately.`,
			)
			break
		}

		case "intent_approved": {
			sections.push(
				`## Intent Approved\n\n` +
				`The user has approved the intent.\n\n` +
				`**Call \`haiku_run_next { intent: "${slug}" }\` immediately.** Do NOT ask the user — the transition was already approved.`,
			)
			break
		}

		case "advance_phase": {
			const toPhase = action.to_phase as string
			sections.push(
				`## Advance Phase\n\n` +
				`Phase advanced to "${toPhase}" by the orchestrator.\n\n` +
				`**Call \`haiku_run_next { intent: "${slug}" }\` immediately.** Do NOT ask the user — the transition was already approved.`,
			)
			break
		}

		case "review": {
			const stage = action.stage as string
			const agents = readReviewAgentDefs(studio, stage)
			sections.push(`## Adversarial Review: ${stage}`)

			if (Object.keys(agents).length > 0) {
				sections.push(`### Review Agents\n`)
				for (const [name, content] of Object.entries(agents)) {
					sections.push(`#### ${name}\n\n${content}`)
				}
			}

			sections.push(
				`### Instructions\n\n` +
				`1. Spawn one subagent per review agent (in parallel), each with the diff and stage outputs\n` +
				`2. Collect findings; if HIGH severity, fix and re-review (up to 3 cycles)\n` +
				`3. Call \`haiku_run_next { intent: "${slug}" }\` — the orchestrator advances to the gate phase automatically`,
			)
			break
		}

		case "gate_review": {
			const stage = action.stage as string
			const nextStage = action.next_stage as string | null

			sections.push(
				`## Gate: Awaiting Approval\n\n` +
				`Stage "${stage}" is complete and awaiting your approval to advance` +
				(nextStage ? ` to "${nextStage}"` : "") + `.\n\n` +
				`### Instructions\n\n` +
				`1. Call \`haiku_run_next { intent: "${slug}" }\` — the orchestrator opens the review UI and blocks until the user responds\n` +
				`2. If approved: the FSM advances automatically\n` +
				`3. If changes_requested: analyze annotations and route to /haiku:refine for the appropriate upstream stage`,
			)
			break
		}

		case "gate_external": {
			const stage = action.stage as string
			sections.push(
				`## Gate: External Review\n\n` +
				`Stage "${stage}" is complete. The gate has been entered by the orchestrator.\n\n` +
				`### Instructions\n\n` +
				`1. Push the branch and commit stage artifacts\n` +
				`2. Share the review URL with the reviewer\n` +
				`3. Report: "Awaiting external review. Run /haiku:pickup when review is complete."`,
			)
			break
		}

		case "gate_await": {
			const stage = action.stage as string
			sections.push(
				`## Gate: Awaiting External Event\n\n` +
				`Stage "${stage}" is complete. The gate has been entered by the orchestrator.\n\n` +
				`### Instructions\n\n` +
				`1. Report what is being awaited\n` +
				`2. Stop. Run /haiku:pickup when the event occurs.`,
			)
			break
		}

		case "advance_stage": {
			const stage = action.stage as string
			const nextStage = action.next_stage as string
			sections.push(
				`## Advance Stage\n\n` +
				`Gate passed. The orchestrator has advanced from "${stage}" to "${nextStage}".\n\n` +
				`**Call \`haiku_run_next { intent: "${slug}" }\` immediately.** Do NOT ask the user for confirmation — the gate was already approved. Do NOT present summaries or ask "want me to continue?" — just call the tool.`,
			)
			break
		}

		case "stage_complete_discrete": {
			const stage = action.stage as string
			const nextStage = action.next_stage as string
			sections.push(
				`## Stage Complete (Discrete Mode)\n\n` +
				`Stage "${stage}" has been completed by the orchestrator.\n\n` +
				`### Instructions\n\n` +
				`Report: "Stage complete. Run /haiku:pickup to start '${nextStage}'."`,
			)
			break
		}

		case "intent_complete": {
			sections.push(
				`## Intent Complete\n\n` +
				`All stages are done for intent "${slug}". The orchestrator has marked it as completed.\n\n` +
				`### Instructions\n\n` +
				`Report completion summary. Suggest /haiku:gate-review then PR creation.`,
			)
			break
		}

		case "blocked": {
			const blockedUnits = (action.blocked_units as string[]) || []
			sections.push(
				`## Blocked\n\n` +
				`Units are blocked: ${blockedUnits.join(", ")}\n\n` +
				`### Instructions\n\n` +
				`Report which units are blocked and why. Ask the user for guidance.`,
			)
			break
		}

		case "composite_run_stage": {
			const stage = action.stage as string
			const compositeStudio = action.studio as string
			const hats = (action.hats as string[]) || []
			sections.push(
				`## Composite: Run ${compositeStudio}:${stage}\n\n` +
				`Hats: ${hats.join(" -> ")}\n\n` +
				`Follow the same instructions as start_stage, but for this composite studio:stage pair.\n\n` +
				`Call \`haiku_run_next { intent: "${slug}" }\` to continue.`,
			)
			break
		}

		case "outputs_missing": {
			sections.push(`## Missing Required Outputs\n\n${action.message}`)
			break
		}

		case "elaboration_insufficient": {
			sections.push(`## Elaboration Insufficient\n\n${action.message}`)
			break
		}

		case "spec_validation_failed": {
			sections.push(`## Spec Validation Failed\n\n${action.message}`)
			break
		}

		case "review_elaboration": {
			const stage = action.stage as string
			const agents = readReviewAgentDefs(studio, stage)
			sections.push(`## Review Elaboration Artifacts\n\n`)
			sections.push(`Run adversarial review agents on the elaboration specs before the pre-execution gate opens.\n\n`)
			if (Object.keys(agents).length > 0) {
				sections.push(`### Review Agents\n`)
				for (const [name, content] of Object.entries(agents)) {
					sections.push(`#### ${name}\n\n${content}`)
				}
			}
			sections.push(
				`### Mechanics\n\n` +
				`1. Spawn one subagent per review agent (in parallel)\n` +
				`2. Each reviews the elaboration specs (units, discovery, knowledge)\n` +
				`3. Fix any HIGH findings\n` +
				`4. Call \`haiku_run_next { intent: "${slug}" }\` to advance`,
			)
			break
		}

		case "awaiting_external_review": {
			const externalUrl = action.external_review_url as string || ""
			sections.push(
				`## Awaiting External Review\n\n` +
				(externalUrl
					? `The stage is awaiting external review at: ${externalUrl}\n\n`
					: `The stage is awaiting external review but no review URL has been recorded.\n\n`) +
				`Ask the user for the status of the external review. If approved, call \`haiku_run_next { intent: "${slug}" }\` — the FSM will detect the approval and advance.\n\n` +
				(externalUrl ? "" : `If the user provides a review URL, pass it: \`haiku_run_next { intent: "${slug}", external_review_url: "<url>" }\`\n`),
			)
			break
		}

		case "design_direction_required": {
			sections.push(
				`## Design Direction Required\n\n` +
				`This stage requires wireframe variants before proceeding.\n\n` +
				`1. Generate 2-3 distinct design approaches as HTML wireframe snippets\n` +
				`2. Call \`pick_design_direction\` with the variants\n` +
				`3. After the user selects a direction, call \`haiku_run_next { intent: "${slug}", design_direction_selected: true }\`\n\n` +
				`Check for design provider MCPs (\`mcp__pencil__*\`, \`mcp__openpencil__*\`) and use them if available.`,
			)
			break
		}

		case "discovery_missing": {
			sections.push(`## Missing Discovery Artifacts\n\n${action.message}`)
			break
		}

		case "dag_cycle_detected": {
			sections.push(`## Circular Dependency Detected\n\n${action.message}`)
			break
		}

		case "error": {
			sections.push(`## Error\n\n${action.message}`)
			break
		}

		case "complete": {
			sections.push(`## Already Complete\n\n${action.message}`)
			break
		}

		case "unit_inputs_missing": {
			sections.push(`## Missing Unit Inputs\n\n${action.message}`)
			break
		}

		default: {
			sections.push(`## Unknown Action: ${action.action}\n\n${JSON.stringify(action, null, 2)}`)
			break
		}
	}

	return sections.join("\n\n")
}

// ── Tool definitions ───────────────────────────────────────────────────────

export const orchestratorToolDefs = [
	{
		name: "haiku_run_next",
		description:
			"Advance an intent through its lifecycle. The FSM reads state, determines the next action, " +
			"performs the state mutation (start stage, advance phase, complete stage, etc.), and returns " +
			"the action to the agent. The agent follows the returned action — it never mutates stage or " +
			"intent state directly.",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent: { type: "string", description: "Intent slug" },
				external_review_url: { type: "string", description: "URL where stage was submitted for external review (PR, MR, etc.)" },
			},
			required: ["intent"],
		},
	},
	// haiku_gate_approve removed — gates are handled by the FSM (review UI + elicitation fallback)
	{
		name: "haiku_intent_create",
		description:
			"Create a new H·AI·K·U intent. Studio selection happens separately via haiku_select_studio.",
		inputSchema: {
			type: "object" as const,
			properties: {
				description: { type: "string", description: "What the intent is about" },
				slug: { type: "string", description: "URL-friendly slug for the intent (auto-generated from description if not provided)" },
				context: { type: "string", description: "Conversation context summary — highlights from the conversation that led to this intent" },
				mode: { type: "string", description: "Execution mode: continuous (stages auto-advance) or discrete (pause between stages). Defaults to continuous.", enum: ["continuous", "discrete"] },
				stages: { type: "array", items: { type: "string" }, description: "Explicit stage list — overrides the studio's default stages. Use to run a subset of stages (e.g. just ['development'] for quick tasks)." },
			},
			required: ["description"],
		},
	},
	{
		name: "haiku_select_studio",
		description: "Select or change the studio for an intent. Uses elicitation to present studio options. Cannot be used after the intent has entered any stage.",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent: { type: "string", description: "Intent slug" },
				options: {
					type: "array",
					items: { type: "string" },
					description: "Studio names to present. Empty or omitted = all studios. Single item = auto-select.",
				},
			},
			required: ["intent"],
		},
	},
	{
		name: "haiku_go_back",
		description:
			"Go back to the previous stage or phase. The FSM determines the target based on current position: " +
			"if in execute/review/gate phase, goes back to elaborate in the current stage; " +
			"if already in elaborate phase, goes back to the previous stage. " +
			"Agents can call this when they detect missing information from a prior stage.",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent: { type: "string", description: "Intent slug" },
			},
			required: ["intent"],
		},
	},
	{
		name: "haiku_intent_reset",
		description: "Reset an intent — preserves the description, deletes all state, and recreates the intent from scratch. Asks for confirmation via elicitation before proceeding.",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent: { type: "string", description: "Intent slug to reset" },
			},
			required: ["intent"],
		},
	},
]

// ── Tool handlers ──────────────────────────────────────────────────────────

/**
 * Callback for opening a review and blocking until the user decides.
 * Set by server.ts at startup to avoid circular imports.
 */
let _openReviewAndWait: ((intentDir: string, reviewType: string, gateType?: string) => Promise<{ decision: string; feedback: string; annotations?: unknown }>) | null = null

/**
 * Callback for elicitation — asks the user a question via the MCP client's native UI.
 * Used as fallback when the review UI fails to open.
 */
let _elicitInput: ((params: { message: string; requestedSchema: unknown }) => Promise<{ action: string; content?: unknown }>) | null = null

export function setOpenReviewHandler(handler: typeof _openReviewAndWait): void {
	_openReviewAndWait = handler
}

export function setElicitInputHandler(handler: typeof _elicitInput): void {
	_elicitInput = handler
}

export async function handleOrchestratorTool(name: string, args: Record<string, unknown>): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
	const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] })

	if (name === "haiku_run_next") {
		const slug = args.intent as string
		const stFile = args.state_file as string | undefined

		// Gap 8: If external_review_url is passed and stage is blocked, store it
		if (args.external_review_url) {
			try {
				const root = findHaikuRoot()
				const intentFile = join(root, "intents", slug, "intent.md")
				if (existsSync(intentFile)) {
					const intentFm = readFrontmatter(intentFile)
					const activeStage = (intentFm.active_stage as string) || ""
					if (activeStage) {
						const ssPath = stageStatePath(slug, activeStage)
						const ssData = readJson(ssPath)
						ssData.external_review_url = args.external_review_url as string
						writeJson(ssPath, ssData)
					}
				}
			} catch { /* non-fatal */ }
		}

		// Validate we're on the correct intent branch
		const branchCheck = validateBranch(slug, "intent")
		if (branchCheck) {
			return { content: [{ type: "text" as const, text: branchCheck }], isError: true }
		}

		const result = runNext(slug)
		emitTelemetry("haiku.orchestrator.action", { intent: slug, action: result.action })
		if (stFile) logSessionEvent(stFile, { event: "run_next", intent: slug, action: result.action, stage: result.stage, unit: result.unit, hat: result.hat, wave: result.wave })

		// Log validation failures
		if (stFile && result.action === "spec_validation_failed") {
			logSessionEvent(stFile, { event: "spec_validation_failed", intent: slug, stage: result.stage, violations: result.violations, allowed_types: result.allowed_types })
		}
		if (stFile && result.action === "outputs_missing") {
			logSessionEvent(stFile, { event: "outputs_missing", intent: slug, stage: result.stage, missing: result.missing })
		}
		if (stFile && result.action === "discovery_missing") {
			logSessionEvent(stFile, { event: "discovery_missing", intent: slug, stage: result.stage, missing: result.missing })
		}
		if (stFile && result.action === "review_elaboration") {
			logSessionEvent(stFile, { event: "review_elaboration", intent: slug, stage: result.stage })
		}

		// Read intent metadata for instruction building (used in all return paths)
		let intentMeta: Record<string, unknown> = {}
		try {
			const iDir = intentDir(slug)
			const intentRaw = readFileSync(join(iDir, "intent.md"), "utf8")
			const parsed = parseFrontmatter(intentRaw)
			intentMeta = parsed.data
		} catch { /* intent might not exist for error actions */ }
		const intentStudio = (intentMeta.studio as string) || ""

		// Helper to append instructions to a result object
		const withInstructions = (resultObj: Record<string, unknown>): string => {
			const instructions = buildRunInstructions(slug, intentStudio, resultObj as OrchestratorAction, intentDir(slug))
			return JSON.stringify(resultObj, null, 2) + "\n\n---\n\n" + instructions
		}

		// External review: include instructions about recording the URL
		if (result.action === "external_review_requested") {
			result.message = (result.message as string || "") +
				"\n\nIMPORTANT: Ask the user WHERE they submitted the work for review (PR URL, MR link, email, Slack channel, etc.). " +
				"Record the URL by calling haiku_run_next { intent: \"" + slug + "\", external_review_url: \"<url>\" } so the FSM can track approval status."
		}

		// Gate review: open review UI, block until user decides, process decision
		if (result.action === "gate_review" && _openReviewAndWait) {
			const stage = result.stage as string
			const nextStage = result.next_stage as string | null
			const nextPhase = result.next_phase as string | null
			const gateContext = (result.gate_context as string) || "stage_gate"
			const gateType = result.gate_type as string
			const intentDirPath = `.haiku/intents/${slug}`
			if (stFile) logSessionEvent(stFile, { event: "gate_review_opened", intent: slug, stage, gate_type: gateType })
			try {
				const reviewResult = await _openReviewAndWait(intentDirPath, "intent", gateType)
				if (stFile) logSessionEvent(stFile, { event: "gate_decision", intent: slug, stage, decision: reviewResult.decision, feedback: reviewResult.feedback })
				if (reviewResult.decision === "approved") {
					if (gateContext === "intent_review") {
						// Intent approved — mark as reviewed AND advance phase to execute
						const intentFilePath = join(process.cwd(), intentDirPath, "intent.md")
						setFrontmatterField(intentFilePath, "intent_reviewed", true)
						if (nextPhase) fsmAdvancePhase(slug, stage, nextPhase)
						gitCommitState(`haiku: intent ${slug} approved by user`)
						syncSessionMetadata(slug, args.state_file as string | undefined)
						const gateResult = { action: "intent_approved", intent: slug, stage, from_phase: "elaborate", to_phase: nextPhase, message: `Intent approved — advancing to ${nextPhase || "execute"}. IMPORTANT: Call haiku_run_next { intent: "${slug}" } immediately. Do NOT ask the user — the transition was already approved.` }
						return text(withInstructions(gateResult))
					}
					if (gateContext === "elaborate_to_execute" && nextPhase) {
						// Phase advancement (specs approved → start execution)
						fsmAdvancePhase(slug, stage, nextPhase)
						syncSessionMetadata(slug, args.state_file as string | undefined)
						const gateResult = { action: "advance_phase", intent: slug, stage, from_phase: "elaborate", to_phase: nextPhase, message: `Specs approved — advancing to ${nextPhase}. IMPORTANT: Call haiku_run_next { intent: "${slug}" } immediately. Do NOT ask the user — the transition was already approved.` }
						return text(withInstructions(gateResult))
					}
					if (nextStage) {
						fsmAdvanceStage(slug, stage, nextStage)
						syncSessionMetadata(slug, args.state_file as string | undefined)
						const gateResult = { action: "advance_stage", intent: slug, stage, next_stage: nextStage, gate_outcome: "advanced", message: `Approved — advancing to '${nextStage}'. IMPORTANT: Call haiku_run_next { intent: "${slug}" } immediately. Do NOT ask the user, do NOT summarize, do NOT say "want me to continue?" — the gate was already approved. Just call the tool.` }
						return text(withInstructions(gateResult))
					}
					fsmCompleteStage(slug, stage, "advanced")
					fsmIntentComplete(slug)
					syncSessionMetadata(slug, args.state_file as string | undefined)
					const gateResult = { action: "intent_complete", intent: slug, message: "Approved — intent complete. IMPORTANT: Report completion summary. Do NOT ask what to do next — the intent is done." }
					return text(withInstructions(gateResult))
				}
				if (reviewResult.decision === "external_review") {
					fsmCompleteStage(slug, stage, "blocked")
					syncSessionMetadata(slug, args.state_file as string | undefined)
					const gateResult = {
						action: "external_review_requested",
						intent: slug,
						stage,
						feedback: reviewResult.feedback,
						message: "External review requested. Submit the work for review through your project's review process (PR, MR, review board, etc.). Include the H·AI·K·U browse link in the description so reviewers can see the intent, units, and knowledge artifacts. Record the review URL via haiku_run_next { intent, external_review_url }. Run /haiku:pickup again after approval.",
					}
					return text(withInstructions(gateResult))
				}
				// changes_requested
				if (gateContext === "intent_review") {
					// Intent rejected — stay in pending, agent must revise intent.md
					syncSessionMetadata(slug, args.state_file as string | undefined)
					const gateResult = { action: "changes_requested", intent: slug, stage, feedback: reviewResult.feedback, annotations: reviewResult.annotations, message: `Changes requested on intent: ${reviewResult.feedback || "(see annotations)"}. Revise the intent description, then call haiku_run_next { intent: "${slug}" } again.` }
					return text(withInstructions(gateResult))
				}
				if (gateContext === "elaborate_to_execute") {
					// Don't advance phase — stay in elaborate so agent can fix
					syncSessionMetadata(slug, args.state_file as string | undefined)
					const gateResult = { action: "changes_requested", intent: slug, stage, feedback: reviewResult.feedback, annotations: reviewResult.annotations, message: `Changes requested on specs: ${reviewResult.feedback || "(see annotations)"}. Fix the specs, then call haiku_run_next { intent: "${slug}" } again.` }
					return text(withInstructions(gateResult))
				}
				syncSessionMetadata(slug, args.state_file as string | undefined)
				const gateResult = { action: "changes_requested", intent: slug, stage, feedback: reviewResult.feedback, annotations: reviewResult.annotations, message: `Changes requested: ${reviewResult.feedback || "(see annotations)"}. Address the feedback, then call haiku_run_next { intent: "${slug}" } again.` }
				return text(withInstructions(gateResult))
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err)
				const errorStack = err instanceof Error ? err.stack : ""
				console.error(`[haiku] gate_review failed: ${errorMsg}`)
				reportError(err, { intent: slug, stage })

				// Log full error to .haiku/ for debugging
				try {
					const logDir = join(process.cwd(), ".haiku", "logs")
					mkdirSync(logDir, { recursive: true })
					writeFileSync(join(logDir, "gate-review-error.log"),
						`${new Date().toISOString()}\nintent: ${slug}\nstage: ${stage}\nerror: ${errorMsg}\n${errorStack}\n---\n`,
						{ flag: "a" })
				} catch { /* logging failure is non-fatal */ }

				// Classify error: agent-fixable or retryable errors go back to the agent
				const agentFixable = errorMsg.includes("Could not parse intent") ||
					errorMsg.includes("No such file") ||
					errorMsg.includes("ENOENT") ||
					errorMsg.includes("frontmatter") ||
					errorMsg.includes("invalid identifier") ||
					errorMsg.includes("Circular dependency") ||
					errorMsg.includes("timeout") ||
					errorMsg.includes("Timeout")

				if (agentFixable) {
					syncSessionMetadata(slug, args.state_file as string | undefined)
					return {
						content: [{ type: "text" as const, text: `GATE BLOCKED: ${errorMsg}. This is a data issue the agent can fix — check that the intent directory and files are correctly structured, then call haiku_run_next again.` }],
						isError: true,
					}
				}

				// Infrastructure failure — fall back to elicitation
				if (stFile) logSessionEvent(stFile, { event: "gate_elicitation_fallback", intent: slug, stage, error: errorMsg })
				if (_elicitInput) {
					try {
						const elicitResult = await _elicitInput({
							message: gateContext === "intent_review"
								? `Review UI failed (${errorMsg}). Approve intent '${slug}' to begin work?`
								: `Review UI failed (${errorMsg}). Approve stage '${stage}' specs to proceed to execution?`,
							requestedSchema: {
								type: "object" as const,
								properties: {
									decision: {
										type: "string",
										title: "Decision",
										description: "Approve specs or request changes",
										enum: ["approve", "request_changes"],
									},
									feedback: {
										type: "string",
										title: "Feedback (optional)",
										description: "Any notes or requested changes",
									},
								},
								required: ["decision"],
							},
						})
						if (elicitResult.action === "accept" && elicitResult.content) {
							const decision = (elicitResult.content as Record<string, string>).decision
							const feedback = (elicitResult.content as Record<string, string>).feedback || ""
							if (decision === "approve") {
								if (gateContext === "intent_review") {
									const intentFilePath = join(process.cwd(), intentDirPath, "intent.md")
									setFrontmatterField(intentFilePath, "intent_reviewed", true)
									if (nextPhase) fsmAdvancePhase(slug, stage, nextPhase)
									gitCommitState(`haiku: intent ${slug} approved by user (elicitation)`)
									syncSessionMetadata(slug, args.state_file as string | undefined)
									const elicitApproveResult = { action: "intent_approved", intent: slug, stage, from_phase: "elaborate", to_phase: nextPhase, message: `Intent approved — advancing to ${nextPhase || "execute"}. Call haiku_run_next immediately.` }
									return text(withInstructions(elicitApproveResult))
								}
								if (gateContext === "elaborate_to_execute" && nextPhase) {
									fsmAdvancePhase(slug, stage, nextPhase)
									syncSessionMetadata(slug, args.state_file as string | undefined)
									const elicitApproveResult = { action: "advance_phase", intent: slug, stage, from_phase: "elaborate", to_phase: nextPhase, message: "Specs approved via elicitation — advancing to execute" }
									return text(withInstructions(elicitApproveResult))
								}
								if (nextStage) {
									fsmAdvanceStage(slug, stage, nextStage)
									syncSessionMetadata(slug, args.state_file as string | undefined)
									const elicitApproveResult = { action: "advance_stage", intent: slug, stage, next_stage: nextStage, gate_outcome: "advanced", message: "Approved via elicitation" }
									return text(withInstructions(elicitApproveResult))
								}
								fsmCompleteStage(slug, stage, "advanced")
								fsmIntentComplete(slug)
								syncSessionMetadata(slug, args.state_file as string | undefined)
								const elicitApproveResult = { action: "intent_complete", intent: slug, message: "Approved via elicitation — intent complete" }
								return text(withInstructions(elicitApproveResult))
							}
							// request_changes
							syncSessionMetadata(slug, args.state_file as string | undefined)
							const changeMsg = gateContext === "intent_review"
								? `Changes requested on intent: ${feedback}. Revise the intent description, then call haiku_run_next { intent: "${slug}" } again.`
								: `Changes requested: ${feedback}. Call haiku_run_next { intent: "${slug}" } again after fixing.`
							const elicitChangesResult = { action: "changes_requested", intent: slug, stage, feedback, message: changeMsg }
							return text(withInstructions(elicitChangesResult))
						}
						// User declined/cancelled elicitation — stay blocked
						syncSessionMetadata(slug, args.state_file as string | undefined)
						const elicitCancelResult = { action: "gate_blocked", intent: slug, stage, message: "Gate review cancelled. Call haiku_run_next again to retry." }
						return text(withInstructions(elicitCancelResult))
					} catch {
						// Elicitation also failed — return error
					}
				}

				syncSessionMetadata(slug, args.state_file as string | undefined)
				// Return as an MCP error — isError: true prevents the agent from treating this as a valid response
				return {
					content: [{ type: "text" as const, text: `GATE BLOCKED: Review UI and elicitation both failed. Error: ${errorMsg}. Logged to .haiku/logs/gate-review-error.log. Call haiku_run_next to retry.` }],
					isError: true,
				}
			}
		}

		syncSessionMetadata(slug, args.state_file as string | undefined)
		return text(withInstructions(result))
	}

	// haiku_gate_approve was removed — ask-gate approval is now handled
	// directly by haiku_run_next via the FSM (see gate_review flow).

	if (name === "haiku_intent_create") {
		const description = args.description as string
		let slug = args.slug as string | undefined

		// Generate slug from description if not provided
		if (!slug) {
			slug = description
				.toLowerCase()
				.replace(/[^a-z0-9\s-]/g, "")
				.replace(/\s+/g, "-")
				.replace(/-+/g, "-")
				.replace(/^-|-$/g, "")
				.slice(0, 50)
				.replace(/-$/, "")
		}

		slug = validateIdentifier(slug, "intent slug")

		// One intent per session — reject if this session already has an active intent
		const stateFile = args.state_file as string | undefined
		if (stateFile) {
			const existingIntent = getSessionIntent(stateFile)
			if (existingIntent) {
				return {
					content: [{ type: "text" as const, text: `This session already has an active intent: '${existingIntent}'. Only one intent per session is allowed. Use /clear to start a new session, then create a new intent.` }],
					isError: true,
				}
			}
		}

		// Check if intent already exists
		const root = findHaikuRoot()
		const iDir = join(root, "intents", slug)
		if (existsSync(join(iDir, "intent.md"))) {
			return text(JSON.stringify({ error: "intent_exists", slug, message: `Intent '${slug}' already exists` }))
		}

		// Create directory structure
		mkdirSync(join(iDir, "knowledge"), { recursive: true })
		mkdirSync(join(iDir, "stages"), { recursive: true })

		// Build intent.md with frontmatter + body (no studio — selected separately)
		const context = args.context as string | undefined
		const mode = (args.mode as string) || "continuous"
		const stagesOverride = args.stages as string[] | undefined
		const intentContent = [
			"---",
			`title: "${description.replace(/"/g, '\\"')}"`,
			`studio: ""`,
			`mode: ${mode}`,
			`status: active`,
			...(stagesOverride ? [`stages:\n${stagesOverride.map(s => `  - ${s}`).join("\n")}`] : []),
			`created_at: ${timestamp()}`,
			"---",
			"",
			`# ${description}`,
			"",
			...(context ? [context, ""] : []),
		].join("\n")

		writeFileSync(join(iDir, "intent.md"), intentContent)

		// Also write conversation context to knowledge for discoverability
		if (context) {
			const knowledgeDir = join(iDir, "knowledge")
			mkdirSync(knowledgeDir, { recursive: true })
			writeFileSync(join(knowledgeDir, "CONVERSATION-CONTEXT.md"), `# Conversation Context\n\n${context}\n`)
		}

		// Git commit (+ push for git-persisted studios)
		gitCommitState(`haiku: create intent ${slug}`)

		emitTelemetry("haiku.intent.created", { intent: slug })
		if (stateFile) logSessionEvent(stateFile, { event: "intent_created", intent: slug })

		return text(JSON.stringify({
			action: "intent_created",
			slug,
			path: `.haiku/intents/${slug}`,
			message: `Intent '${slug}' created. Call haiku_run_next { intent: "${slug}" } to begin.`,
		}, null, 2))
	}

	if (name === "haiku_select_studio") {
		const slug = args.intent as string
		const root = findHaikuRoot()
		const iDir = join(root, "intents", slug)
		const intentFile = join(iDir, "intent.md")

		if (!existsSync(intentFile)) {
			return text(JSON.stringify({ error: "not_found", message: `Intent '${slug}' not found` }))
		}

		// Check if intent has entered any stage (any state.json with status != "pending")
		const stagesDir = join(iDir, "stages")
		if (existsSync(stagesDir)) {
			for (const entry of readdirSync(stagesDir, { withFileTypes: true })) {
				if (!entry.isDirectory()) continue
				const statePath = join(stagesDir, entry.name, "state.json")
				if (existsSync(statePath)) {
					const state = readJson(statePath)
					if (state.status && state.status !== "pending") {
						return {
							content: [{ type: "text" as const, text: "Cannot change studio after intent has entered a stage." }],
							isError: true,
						}
					}
				}
			}
		}

		// Get available studios
		const allStudios = listStudios()
		const allStudioNames = allStudios.map(s => s.name)

		if (allStudioNames.length === 0) {
			return {
				content: [{ type: "text" as const, text: "No studios available." }],
				isError: true,
			}
		}

		const options = (args.options as string[] | undefined) || []
		let selectedStudio = ""

		// Single option — auto-select
		if (options.length === 1) {
			if (!allStudioNames.includes(options[0])) {
				return {
					content: [{ type: "text" as const, text: `Studio '${options[0]}' not found. Available: ${allStudioNames.join(", ")}` }],
					isError: true,
				}
			}
			selectedStudio = options[0]
		} else if (_elicitInput) {
			// Determine elicitation choices
			let elicitChoices: string[]
			let showAllOption = false

			if (!options || options.length === 0 || options.length >= allStudioNames.length) {
				// Show all studios
				elicitChoices = allStudioNames
			} else {
				// Show filtered options + "Show all studios..."
				const validOptions = options.filter(o => allStudioNames.includes(o))
				if (validOptions.length === 0) {
					elicitChoices = allStudioNames
				} else {
					elicitChoices = [...validOptions, "Show all studios..."]
					showAllOption = true
				}
			}

			// Build descriptions
			const descriptionLines = allStudios
				.filter(s => elicitChoices.includes(s.name))
				.map(s => `${s.name}: ${(s.data.description as string) || s.name}`)
				.join("\n")

			try {
				const elicitResult = await _elicitInput({
					message: `Select a studio for intent "${slug}":\n\n${descriptionLines}`,
					requestedSchema: {
						type: "object" as const,
						properties: {
							studio: {
								type: "string",
								title: "Studio",
								description: "Which studio lifecycle to use",
								enum: elicitChoices,
							},
						},
						required: ["studio"],
					},
				})

				if (elicitResult.action === "accept" && elicitResult.content) {
					const content = elicitResult.content as Record<string, string>
					if (content.studio === "Show all studios..." && showAllOption) {
						// Re-elicit with full list
						const allDescriptions = allStudios
							.map(s => `${s.name}: ${(s.data.description as string) || s.name}`)
							.join("\n")
						const reElicit = await _elicitInput({
							message: `All available studios:\n\n${allDescriptions}`,
							requestedSchema: {
								type: "object" as const,
								properties: {
									studio: { type: "string", title: "Studio", enum: allStudioNames },
								},
								required: ["studio"],
							},
						})
						if (reElicit.action === "accept" && reElicit.content) {
							selectedStudio = (reElicit.content as Record<string, string>).studio || ""
						} else {
							return text(JSON.stringify({ action: "cancelled", message: "Studio selection cancelled by user" }))
						}
					} else {
						selectedStudio = content.studio || ""
					}
				} else {
					return text(JSON.stringify({ action: "cancelled", message: "Studio selection cancelled by user" }))
				}
			} catch {
				return {
					content: [{ type: "text" as const, text: "Elicitation failed. Pass a single studio in the options array to auto-select." }],
					isError: true,
				}
			}
		} else {
			// No elicitation available — return studio list so agent can ask conversationally
			const studioDescriptions = allStudios.map(s => `- **${s.name}**: ${(s.data.description as string) || ""}`).join("\n")
			return text(JSON.stringify({
				action: "select_studio_conversational",
				intent: slug,
				available_studios: allStudios.map(s => ({ name: s.name, description: (s.data.description as string) || "" })),
				message: `Elicitation unavailable. Ask the user which studio to use, then call haiku_select_studio { intent: "${slug}", options: ["<chosen-studio>"] } with a single option to auto-select.\n\nAvailable studios:\n${studioDescriptions}`,
			}, null, 2))
		}

		if (!selectedStudio) {
			return {
				content: [{ type: "text" as const, text: "No studio selected." }],
				isError: true,
			}
		}

		// Update intent.md with selected studio — only set stages if not already overridden
		const intentFmCheck = readFrontmatter(intentFile)
		const existingStages = intentFmCheck.stages as string[] | undefined
		const allStudioStages = resolveStudioStages(selectedStudio)

		// Validate pre-set stages exist in the selected studio
		if (existingStages && existingStages.length > 0) {
			const invalid = existingStages.filter(s => !allStudioStages.includes(s))
			if (invalid.length > 0) {
				return {
					content: [{ type: "text" as const, text: `Invalid stages for studio '${selectedStudio}': ${invalid.join(", ")}. Available stages: ${allStudioStages.join(", ")}` }],
					isError: true,
				}
			}
		}

		const activeStages = existingStages && existingStages.length > 0
			? existingStages  // stages were set at creation time (e.g. quick mode)
			: allStudioStages
		setFrontmatterField(intentFile, "studio", selectedStudio)
		if (!existingStages || existingStages.length === 0) {
			setFrontmatterField(intentFile, "stages", activeStages)
		}

		gitCommitState(`haiku: select studio ${selectedStudio} for intent ${slug}`)
		emitTelemetry("haiku.studio.selected", { intent: slug, studio: selectedStudio })

		return text(JSON.stringify({
			action: "studio_selected",
			intent: slug,
			studio: selectedStudio,
			stages: activeStages,
			all_studio_stages: allStudioStages,
			message: `Studio '${selectedStudio}' selected for intent '${slug}'. Call haiku_run_next { intent: "${slug}" } to begin.`,
		}, null, 2))
	}

	if (name === "haiku_go_back") {
		const result = goBack(args.intent as string)
		emitTelemetry("haiku.orchestrator.action", { intent: args.intent as string, action: result.action })
		syncSessionMetadata(args.intent as string, args.state_file as string | undefined)
		return text(JSON.stringify(result, null, 2))
	}

	if (name === "haiku_intent_reset") {
		const slug = args.intent as string

		// Validate intent exists
		const root = findHaikuRoot()
		const iDir = join(root, "intents", slug)
		const intentFile = join(iDir, "intent.md")
		if (!existsSync(intentFile)) {
			return { content: [{ type: "text" as const, text: `Intent '${slug}' not found.` }], isError: true }
		}

		// Read the description before deleting
		const raw = readFileSync(intentFile, "utf8")
		const { data, body } = parseFrontmatter(raw)
		const title = (data.title as string) || ""
		const description = title || body.replace(/^#\s+.*\n/, "").trim()

		// Ask for confirmation via elicitation
		if (_elicitInput) {
			const result = await _elicitInput({
				message: `Reset intent "${slug}"?\n\nThis will DELETE all state (stages, units, knowledge) and recreate the intent with the same description.\n\nDescription: "${description}"`,
				requestedSchema: {
					type: "object" as const,
					properties: {
						confirm: {
							type: "string",
							title: "Confirm Reset",
							description: "This cannot be undone",
							enum: ["Reset", "Cancel"],
						},
					},
					required: ["confirm"],
				},
			})

			if (result.action !== "accept" || (result.content as Record<string, string>)?.confirm !== "Reset") {
				return text(JSON.stringify({ action: "cancelled", message: "Reset cancelled." }))
			}
		} else {
			return { content: [{ type: "text" as const, text: "Reset requires user confirmation via elicitation." }], isError: true }
		}

		// Read conversation context if it exists (preserve it)
		let conversationContext = ""
		const ctxFile = join(iDir, "knowledge", "CONVERSATION-CONTEXT.md")
		if (existsSync(ctxFile)) {
			conversationContext = readFileSync(ctxFile, "utf8").replace(/^# Conversation Context\n\n/, "")
		}

		// Delete the intent directory
		rmSync(iDir, { recursive: true, force: true })

		// Git commit the deletion
		gitCommitState(`haiku: reset intent ${slug} (deleted)`)

		// Return instruction to recreate
		return text(JSON.stringify({
			action: "intent_reset",
			slug,
			description,
			context: conversationContext,
			message: `Intent '${slug}' has been reset. Call haiku_intent_create { description: "${description.replace(/"/g, '\\"')}", slug: "${slug}"${conversationContext ? ', context: "<preserved context>"' : ""} } to recreate it.`,
		}, null, 2))
	}

	return text(`Unknown orchestrator tool: ${name}`)
}

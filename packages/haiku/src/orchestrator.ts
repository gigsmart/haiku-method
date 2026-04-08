// orchestrator.ts — H·AI·K·U stage loop orchestration
//
// Deterministic FSM driver. `runNext()` reads state, determines the next
// action, performs the state mutation as a side effect, and returns the action
// to the agent. The agent only calls `haiku_run_next` to advance — it never
// mutates stage/intent state directly.
//
// Primary tool: haiku_run_next { intent }
// Returns an action object the agent follows.

import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import matter from "gray-matter"
import { emitTelemetry } from "./telemetry.js"
import { reportError } from "./sentry.js"
import {
	findHaikuRoot,
	intentDir,
	stageDir,
	stageStatePath,
	readJson,
	writeJson,
	setFrontmatterField,
	gitCommitState,
	timestamp,
	parseFrontmatter,
	unitPath,
	syncSessionMetadata,
} from "./state-tools.js"
import { createIntentBranch, isOnIntentBranch, createUnitWorktree } from "./git-worktree.js"
import { getSessionIntent, logSessionEvent } from "./session-metadata.js"
import { computeWaves, buildDAG, topologicalSort } from "./dag.js"
import { parseAllUnits } from "./index.js"
import type { DAGGraph } from "./types.js"
import { validateIdentifier } from "./prompts/helpers.js"

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
	const studio = (intent.studio as string) || "ideation"
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

		// Units exist — validate DAG for cycles
		try {
			const unitsDir = join(iDir, "stages", currentStage, "units")
			const unitFiles = readdirSync(unitsDir).filter(f => f.endsWith(".md"))
			const dagNodes = unitFiles.map(f => {
				const fm = readFrontmatter(join(unitsDir, f))
				return { id: f.replace(".md", ""), status: (fm.status as string) || "pending" }
			})
			const dagEdges: Array<{ from: string; to: string }> = []
			const dagAdj = new Map<string, string[]>()
			for (const n of dagNodes) dagAdj.set(n.id, [])
			for (const f of unitFiles) {
				const fm = readFrontmatter(join(unitsDir, f))
				const id = f.replace(".md", "")
				for (const dep of (fm.depends_on as string[]) || []) {
					dagEdges.push({ from: dep, to: id })
					dagAdj.get(dep)?.push(id)
				}
			}
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

		// Validate unit types before allowing execution
		const typeViolation = validateUnitTypes(iDir, currentStage, studio)
		if (typeViolation) return typeViolation

		// Validate discovery artifacts exist before advancing
		const discoveryViolation = validateDiscoveryArtifacts(slug, currentStage, studio)
		if (discoveryViolation) return discoveryViolation

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
					message: `This stage requires a design direction selection before proceeding. Call pick_design_direction with wireframe variants, then call haiku_run_next { intent: "${slug}", design_direction_selected: true } after the user selects a direction.`,
				}
			}
		}

		// All units valid — open review gate before advancing to execute.
		// The review UI blocks until the user approves the specs.
		// This is handled by the handleOrchestratorTool wrapper which
		// detects gate_review and calls _openReviewAndWait.
		return {
			action: "gate_review",
			intent: slug,
			studio,
			stage: currentStage,
			next_phase: "execute",
			gate_type: "ask",
			gate_context: "elaborate_to_execute",
			message: `Specs validated — opening review before execution`,
		}
	}

	// Stage in execute phase
	if (phase === "execute") {
		// Validate unit types on every execute call — catch violations that snuck through
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

		// FSM side effect: advance to gate phase so next haiku_run_next call
		// proceeds to gate logic after the agent completes the review work.
		fsmAdvancePhase(slug, currentStage, "gate")

		return {
			action: "review",
			intent: slug,
			studio,
			stage: currentStage,
			message: `Run adversarial review agents for stage '${currentStage}'`,
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
			return { action: "stage_complete_discrete", intent: slug, stage: currentStage, next_stage: nextStage, message: `Stage '${currentStage}' complete. Run /haiku:run to start '${nextStage}'.` }
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
						message: `Stage '${currentStage}' is awaiting external review at: ${externalUrl}. Run /haiku:run again after approval.`,
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

function runNextComposite(slug: string, intent: Record<string, unknown>, intentDirPath: string): OrchestratorAction {
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

function goBack(slug: string, targetStage?: string, targetPhase?: string): OrchestratorAction {
	const root = findHaikuRoot()
	const iDir = join(root, "intents", slug)
	const intentFile = join(iDir, "intent.md")

	if (!existsSync(intentFile)) {
		return { action: "error", message: `Intent '${slug}' not found` }
	}

	const intent = readFrontmatter(intentFile)
	const studio = (intent.studio as string) || "ideation"
	const currentActiveStage = (intent.active_stage as string) || ""

	if (targetStage) {
		// Validate target stage exists in the studio
		const allStages = resolveStudioStages(studio)
		if (!allStages.includes(targetStage)) {
			return { action: "error", message: `Stage '${targetStage}' not found in studio '${studio}'` }
		}

		// Reset the target stage's state
		const path = stageStatePath(slug, targetStage)
		const data: Record<string, unknown> = {
			stage: targetStage,
			status: "active",
			phase: "elaborate",
			started_at: timestamp(),
			completed_at: null,
			gate_entered_at: null,
			gate_outcome: null,
		}
		writeJson(path, data)

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

	if (targetPhase) {
		if (!currentActiveStage) {
			return { action: "error", message: `No active stage to go back within` }
		}

		// Valid phases in order
		const phaseOrder = ["elaborate", "execute", "review", "gate"]
		const targetIdx = phaseOrder.indexOf(targetPhase)
		if (targetIdx < 0) {
			return { action: "error", message: `Invalid phase '${targetPhase}'. Valid phases: ${phaseOrder.join(", ")}` }
		}

		const path = stageStatePath(slug, currentActiveStage)
		const stageState = readJson(path)
		const currentPhase = (stageState.phase as string) || ""
		const currentIdx = phaseOrder.indexOf(currentPhase)

		if (targetIdx >= currentIdx) {
			return { action: "error", message: `Cannot go back: '${targetPhase}' is not before current phase '${currentPhase}'` }
		}

		// Set phase back
		stageState.phase = targetPhase
		stageState.gate_entered_at = null
		stageState.gate_outcome = null
		writeJson(path, stageState)

		// If going back to elaborate or execute, re-queue affected units
		if (targetPhase === "elaborate" || targetPhase === "execute") {
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
		}

		emitTelemetry("haiku.go_back.phase", { intent: slug, stage: currentActiveStage, from_phase: currentPhase, to_phase: targetPhase })
		gitCommitState(`haiku: go back to phase ${targetPhase} in ${currentActiveStage}`)

		return {
			action: "went_back",
			intent: slug,
			stage: currentActiveStage,
			target_phase: targetPhase,
			message: `Went back to phase '${targetPhase}' in stage '${currentActiveStage}'`,
		}
	}

	return { action: "error", message: "Must specify either target_stage or target_phase" }
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
				elaboration_reviewed: { type: "boolean", description: "Set to true after review agents have reviewed the elaboration specs" },
				design_direction_selected: { type: "boolean", description: "Set to true after the user has selected a design direction via pick_design_direction" },
				external_review_url: { type: "string", description: "URL where stage was submitted for external review (PR, MR, etc.)" },
			},
			required: ["intent"],
		},
	},
	// haiku_gate_approve removed — gates are handled by the FSM (review UI + elicitation fallback)
	{
		name: "haiku_intent_create",
		description:
			"Create a new H·AI·K·U intent. Uses elicitation to ask the user for studio selection and execution mode. " +
			"If elicitation is unavailable, auto-detects the studio from the description and defaults to continuous mode.",
		inputSchema: {
			type: "object" as const,
			properties: {
				description: { type: "string", description: "What the intent is about" },
				slug: { type: "string", description: "URL-friendly slug for the intent (auto-generated from description if not provided)" },
				context: { type: "string", description: "Conversation context summary — highlights from the conversation that led to this intent" },
			},
			required: ["description"],
		},
	},
	{
		name: "haiku_go_back",
		description:
			"Go back to a previous stage or phase within the current stage. " +
			"If target_stage is provided: resets that stage (status: active, phase: elaborate), re-queues all its units. " +
			"If target_phase is provided: sets phase back within the current active stage, re-queues affected units. " +
			"This is a human-initiated action — the agent should only call this when explicitly requested.",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent: { type: "string", description: "Intent slug" },
				target_stage: { type: "string", description: "Stage to go back to (resets the stage entirely)" },
				target_phase: { type: "string", description: "Phase to go back to within the current active stage (elaborate, execute, review)" },
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

export async function handleOrchestratorTool(name: string, args: Record<string, unknown>): Promise<{ content: Array<{ type: "text"; text: string }> }> {
	const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] })

	if (name === "haiku_run_next") {
		const slug = args.intent as string
		const stFile = args.state_file as string | undefined

		// Gap 4: If elaboration_reviewed flag is passed, persist it to stage state
		if (args.elaboration_reviewed === true) {
			try {
				const root = findHaikuRoot()
				const intentFile = join(root, "intents", slug, "intent.md")
				if (existsSync(intentFile)) {
					const intentFm = readFrontmatter(intentFile)
					const activeStage = (intentFm.active_stage as string) || ""
					if (activeStage) {
						const ssPath = stageStatePath(slug, activeStage)
						const ssData = readJson(ssPath)
						ssData.elaboration_reviewed = true
						writeJson(ssPath, ssData)
					}
				}
			} catch { /* non-fatal */ }
		}

		// If design_direction_selected flag is passed, persist it to stage state
		if (args.design_direction_selected === true) {
			try {
				const root = findHaikuRoot()
				const intentFile = join(root, "intents", slug, "intent.md")
				if (existsSync(intentFile)) {
					const intentFm = readFrontmatter(intentFile)
					const activeStage = (intentFm.active_stage as string) || ""
					if (activeStage) {
						const ssPath = stageStatePath(slug, activeStage)
						const ssData = readJson(ssPath)
						ssData.design_direction_selected = true
						writeJson(ssPath, ssData)
					}
				}
			} catch { /* non-fatal */ }
		}

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
					if (gateContext === "elaborate_to_execute" && nextPhase) {
						// Phase advancement (specs approved → start execution)
						fsmAdvancePhase(slug, stage, nextPhase)
						syncSessionMetadata(slug, args.state_file as string | undefined)
						return text(JSON.stringify({ action: "advance_phase", intent: slug, stage, from_phase: "elaborate", to_phase: nextPhase, message: `Specs approved — advancing to ${nextPhase}` }, null, 2))
					}
					if (nextStage) {
						fsmAdvanceStage(slug, stage, nextStage)
						syncSessionMetadata(slug, args.state_file as string | undefined)
						return text(JSON.stringify({ action: "advance_stage", intent: slug, stage, next_stage: nextStage, gate_outcome: "advanced", message: `Approved — advancing to '${nextStage}'` }, null, 2))
					}
					fsmCompleteStage(slug, stage, "advanced")
					fsmIntentComplete(slug)
					syncSessionMetadata(slug, args.state_file as string | undefined)
					return text(JSON.stringify({ action: "intent_complete", intent: slug, message: "Approved — intent complete" }, null, 2))
				}
				if (reviewResult.decision === "external_review") {
					fsmCompleteStage(slug, stage, "blocked")
					syncSessionMetadata(slug, args.state_file as string | undefined)
					return text(JSON.stringify({
						action: "external_review_requested",
						intent: slug,
						stage,
						feedback: reviewResult.feedback,
						message: "External review requested. Submit the work for review through your project's review process (PR, MR, review board, etc.). Include the H·AI·K·U browse link in the description so reviewers can see the intent, units, and knowledge artifacts. Record the review URL via haiku_run_next { intent, external_review_url }. Run /haiku:run again after approval.",
					}, null, 2))
				}
				// changes_requested — go back to elaborate to fix specs
				if (gateContext === "elaborate_to_execute") {
					// Don't advance phase — stay in elaborate so agent can fix
					syncSessionMetadata(slug, args.state_file as string | undefined)
					return text(JSON.stringify({ action: "changes_requested", intent: slug, stage, feedback: reviewResult.feedback, annotations: reviewResult.annotations, message: `Changes requested on specs: ${reviewResult.feedback || "(see annotations)"}. Fix the specs, then call haiku_run_next { intent: "${slug}" } again.` }, null, 2))
				}
				syncSessionMetadata(slug, args.state_file as string | undefined)
				return text(JSON.stringify({ action: "changes_requested", intent: slug, stage, feedback: reviewResult.feedback, annotations: reviewResult.annotations, message: `Changes requested: ${reviewResult.feedback || "(see annotations)"}. Address the feedback, then call haiku_run_next { intent: "${slug}" } again.` }, null, 2))
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
					errorMsg.includes("not found") ||
					errorMsg.includes("No such file") ||
					errorMsg.includes("ENOENT") ||
					errorMsg.includes("frontmatter") ||
					errorMsg.includes("Invalid") ||
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
							message: `Review UI failed (${errorMsg}). Approve stage '${stage}' specs to proceed to execution?`,
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
								if (gateContext === "elaborate_to_execute" && nextPhase) {
									fsmAdvancePhase(slug, stage, nextPhase)
									syncSessionMetadata(slug, args.state_file as string | undefined)
									return text(JSON.stringify({ action: "advance_phase", intent: slug, stage, from_phase: "elaborate", to_phase: nextPhase, message: "Specs approved via elicitation — advancing to execute" }, null, 2))
								}
								if (nextStage) {
									fsmAdvanceStage(slug, stage, nextStage)
									syncSessionMetadata(slug, args.state_file as string | undefined)
									return text(JSON.stringify({ action: "advance_stage", intent: slug, stage, next_stage: nextStage, gate_outcome: "advanced", message: "Approved via elicitation" }, null, 2))
								}
								fsmCompleteStage(slug, stage, "advanced")
								fsmIntentComplete(slug)
								syncSessionMetadata(slug, args.state_file as string | undefined)
								return text(JSON.stringify({ action: "intent_complete", intent: slug, message: "Approved via elicitation — intent complete" }, null, 2))
							}
							// request_changes
							syncSessionMetadata(slug, args.state_file as string | undefined)
							return text(JSON.stringify({ action: "changes_requested", intent: slug, stage, feedback, message: `Changes requested: ${feedback}. Call haiku_run_next { intent: "${slug}" } again after fixing.` }, null, 2))
						}
						// User declined/cancelled elicitation — stay blocked
						syncSessionMetadata(slug, args.state_file as string | undefined)
						return text(JSON.stringify({ action: "gate_blocked", intent: slug, stage, message: "Gate review cancelled. Call haiku_run_next again to retry." }, null, 2))
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
		return text(JSON.stringify(result, null, 2))
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

		// List available studios
		const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || ""
		const studioEntries: Array<{ name: string; description: string; stages: string[] }> = []
		const builtinDir = join(pluginRoot, "studios")
		if (existsSync(builtinDir)) {
			for (const name of readdirSync(builtinDir)) {
				const studioFile = join(builtinDir, name, "STUDIO.md")
				if (existsSync(studioFile)) {
					const fm = readFrontmatter(studioFile)
					studioEntries.push({
						name,
						description: (fm.description as string) || name,
						stages: (fm.stages as string[]) || [],
					})
				}
			}
		}
		// Project-level overrides
		try {
			const projectDir = join(root, "studios")
			if (existsSync(projectDir)) {
				for (const name of readdirSync(projectDir)) {
					const studioFile = join(projectDir, name, "STUDIO.md")
					if (existsSync(studioFile)) {
						const fm = readFrontmatter(studioFile)
						const existing = studioEntries.findIndex(s => s.name === name)
						const entry = {
							name,
							description: (fm.description as string) || name,
							stages: (fm.stages as string[]) || [],
						}
						if (existing >= 0) studioEntries[existing] = entry
						else studioEntries.push(entry)
					}
				}
			}
		} catch { /* no .haiku dir */ }

		let selectedStudio = ""
		let selectedMode = "continuous"
		let studioStages: string[] = []

		// Try elicitation first
		if (_elicitInput) {
			try {
				const studioNames = studioEntries.map(s => s.name)
				const studioDescriptions = studioEntries.map(s => `${s.name}: ${s.description}`).join("\n")

				const elicitResult = await _elicitInput({
					message: `Creating intent: "${description}"\n\nSelect a studio and execution mode.\n\nAvailable studios:\n${studioDescriptions}`,
					requestedSchema: {
						type: "object" as const,
						properties: {
							studio: {
								type: "string",
								title: "Studio",
								description: "Which studio lifecycle to use",
								enum: studioNames,
							},
							mode: {
								type: "string",
								title: "Execution Mode",
								description: "continuous = stages auto-advance, discrete = pause between stages",
								enum: ["continuous", "discrete"],
							},
						},
						required: ["studio", "mode"],
					},
				})

				if (elicitResult.action === "accept" && elicitResult.content) {
					const content = elicitResult.content as Record<string, string>
					selectedStudio = content.studio || ""
					selectedMode = content.mode || "continuous"
				} else {
					// User cancelled
					return text(JSON.stringify({ action: "cancelled", message: "Intent creation cancelled by user" }))
				}
			} catch {
				// Elicitation failed — fall through to auto-detection
			}
		}

		// Fallback: auto-detect studio from description
		if (!selectedStudio) {
			const desc = description.toLowerCase()
			if (/\b(software|code|build|feature|implement|develop|api|app)\b/.test(desc)) {
				selectedStudio = "software"
			} else if (/\b(doc|write|content|documentation|article|guide)\b/.test(desc)) {
				selectedStudio = "documentation"
			} else {
				selectedStudio = "ideation"
			}
			selectedMode = "continuous"
		}

		// Resolve stages for the selected studio
		studioStages = resolveStudioStages(selectedStudio)
		if (studioStages.length === 0) {
			return text(JSON.stringify({ error: "no_stages", studio: selectedStudio, message: `Studio '${selectedStudio}' has no stages` }))
		}

		// Create directory structure
		mkdirSync(join(iDir, "knowledge"), { recursive: true })
		mkdirSync(join(iDir, "stages"), { recursive: true })

		// Build intent.md frontmatter
		const frontmatter = [
			"---",
			`title: "${description.replace(/"/g, '\\"')}"`,
			`studio: ${selectedStudio}`,
			`mode: ${selectedMode}`,
			`status: active`,
			`stages:`,
			...studioStages.map(s => `  - ${s}`),
			`created_at: ${timestamp()}`,
			"---",
			"",
			`# ${description}`,
			"",
		].join("\n")

		writeFileSync(join(iDir, "intent.md"), frontmatter)

		// Gap 5: Write conversation context if provided
		const context = args.context as string | undefined
		if (context) {
			const knowledgeDir = join(iDir, "knowledge")
			mkdirSync(knowledgeDir, { recursive: true })
			writeFileSync(join(knowledgeDir, "CONVERSATION-CONTEXT.md"), `# Conversation Context\n\n${context}\n`)
		}

		// Git commit
		gitCommitState(`haiku: create intent ${slug}`)

		emitTelemetry("haiku.intent.created", { intent: slug, studio: selectedStudio, mode: selectedMode })
		if (stateFile) logSessionEvent(stateFile, { event: "intent_created", intent: slug, studio: selectedStudio, mode: selectedMode, stages: studioStages })

		// Gap 6: Pre-start confirmation — open review UI to let user confirm intent before proceeding
		if (_openReviewAndWait) {
			try {
				const intentDirPath = `.haiku/intents/${slug}`
				const reviewResult = await _openReviewAndWait(intentDirPath, "intent", "ask")
				if (stateFile) logSessionEvent(stateFile, { event: "intent_confirmation", intent: slug, decision: reviewResult.decision, feedback: reviewResult.feedback })
				if (reviewResult.decision === "approved") {
					return text(JSON.stringify({
						action: "intent_created",
						slug,
						studio: selectedStudio,
						mode: selectedMode,
						stages: studioStages,
						path: `.haiku/intents/${slug}`,
						message: `Intent '${slug}' confirmed and created with studio '${selectedStudio}' (${selectedMode} mode). Run haiku_run_next { intent: "${slug}" } to begin.`,
					}, null, 2))
				}
				// Changes requested — return feedback for the agent to adjust
				return text(JSON.stringify({
					action: "intent_changes_requested",
					slug,
					studio: selectedStudio,
					mode: selectedMode,
					stages: studioStages,
					path: `.haiku/intents/${slug}`,
					feedback: reviewResult.feedback,
					message: `Intent '${slug}' created but user requested changes: ${reviewResult.feedback || "(see review)"}. Adjust the intent, then run haiku_run_next { intent: "${slug}" } to begin.`,
				}, null, 2))
			} catch {
				// Review UI failed — fall back to elicitation
				if (_elicitInput) {
					try {
						const elicitResult = await _elicitInput({
							message: `Created intent '${slug}' with studio '${selectedStudio}'. Confirm to proceed?`,
							requestedSchema: {
								type: "object" as const,
								properties: {
									decision: {
										type: "string",
										title: "Decision",
										description: "Approve intent or request changes",
										enum: ["approve", "request_changes"],
									},
									feedback: {
										type: "string",
										title: "Feedback (optional)",
										description: "Any changes to the intent",
									},
								},
								required: ["decision"],
							},
						})
						if (elicitResult.action === "accept" && elicitResult.content) {
							const decision = (elicitResult.content as Record<string, string>).decision
							const feedback = (elicitResult.content as Record<string, string>).feedback || ""
							if (decision === "approve") {
								return text(JSON.stringify({
									action: "intent_created",
									slug,
									studio: selectedStudio,
									mode: selectedMode,
									stages: studioStages,
									path: `.haiku/intents/${slug}`,
									message: `Intent '${slug}' confirmed via elicitation and created with studio '${selectedStudio}' (${selectedMode} mode). Run haiku_run_next { intent: "${slug}" } to begin.`,
								}, null, 2))
							}
							return text(JSON.stringify({
								action: "intent_changes_requested",
								slug,
								studio: selectedStudio,
								mode: selectedMode,
								stages: studioStages,
								path: `.haiku/intents/${slug}`,
								feedback,
								message: `Intent '${slug}' created but user requested changes: ${feedback}. Adjust the intent, then run haiku_run_next { intent: "${slug}" } to begin.`,
							}, null, 2))
						}
					} catch { /* elicitation also failed — fall through to default return */ }
				}
			}
		}

		return text(JSON.stringify({
			action: "intent_created",
			slug,
			studio: selectedStudio,
			mode: selectedMode,
			stages: studioStages,
			path: `.haiku/intents/${slug}`,
			message: `Intent '${slug}' created with studio '${selectedStudio}' (${selectedMode} mode). Run haiku_run_next { intent: "${slug}" } to begin.`,
		}, null, 2))
	}

	if (name === "haiku_go_back") {
		const result = goBack(
			args.intent as string,
			args.target_stage as string | undefined,
			args.target_phase as string | undefined,
		)
		emitTelemetry("haiku.orchestrator.action", { intent: args.intent as string, action: result.action })
		syncSessionMetadata(args.intent as string, args.state_file as string | undefined)
		return text(JSON.stringify(result, null, 2))
	}

	return text(`Unknown orchestrator tool: ${name}`)
}

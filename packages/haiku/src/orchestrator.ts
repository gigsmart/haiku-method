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
import { existsSync, readFileSync, readdirSync } from "node:fs"
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
		if (!hasUnits) {
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
		// Units exist — validate types before allowing execution
		const typeViolation = validateUnitTypes(iDir, currentStage, studio)
		if (typeViolation) return typeViolation

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
		const readyUnits = units.filter(u => u.status === "pending" && u.depsComplete)
		const activeUnits = units.filter(u => u.status === "active")
		const allComplete = units.every(u => u.status === "completed")

		if (allComplete) {
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
				hats,
				stage_metadata: resolveStageMetadata(studio, currentStage),
				message: `Continue unit '${unit.name}' — hat: ${unit.hat}, bolt: ${unit.bolt}`,
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
				units: readyUnits.map(u => u.name),
				first_hat: hats[0] || "",
				hats,
				worktrees: unitWorktrees,
				stage_metadata: resolveStageMetadata(studio, currentStage),
				message: `${readyUnits.length} units ready for parallel execution: ${readyUnits.map(u => u.name).join(", ")}`,
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
				unit: unit.name,
				first_hat: hats[0] || "",
				hats,
				worktree: worktreePath,
				stage_metadata: resolveStageMetadata(studio, currentStage),
				message: `Start unit '${unit.name}' with hat '${hats[0] || ""}' in stage '${currentStage}'`,
			}
		}

		// All units either completed or blocked
		const blockedUnits = units.filter(u => u.status !== "completed")
		return {
			action: "blocked",
			intent: slug,
			stage: currentStage,
			blocked_units: blockedUnits.map(u => u.name),
			message: `${blockedUnits.length} unit(s) blocked — dependencies not met or manual intervention needed`,
		}
	}

	// Stage in review phase
	if (phase === "review") {
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
			},
			required: ["intent"],
		},
	},
	// haiku_gate_approve removed — gates are handled by the FSM (review UI + elicitation fallback)
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
		const result = runNext(slug)
		emitTelemetry("haiku.orchestrator.action", { intent: slug, action: result.action })

		// Gate review: open review UI, block until user decides, process decision
		if (result.action === "gate_review" && _openReviewAndWait) {
			const stage = result.stage as string
			const nextStage = result.next_stage as string | null
			const nextPhase = result.next_phase as string | null
			const gateContext = (result.gate_context as string) || "stage_gate"
			const gateType = result.gate_type as string
			const intentDirPath = `.haiku/intents/${slug}`
			try {
				const reviewResult = await _openReviewAndWait(intentDirPath, "intent", gateType)
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
						message: "External review requested. Submit the work for review through your project's review process (PR, MR, review board, etc.). Run /haiku:run again after approval.",
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
					const { writeFileSync, mkdirSync } = await import("node:fs")
					const { join } = await import("node:path")
					const logDir = join(process.cwd(), ".haiku", "logs")
					mkdirSync(logDir, { recursive: true })
					writeFileSync(join(logDir, "gate-review-error.log"),
						`${new Date().toISOString()}\nintent: ${slug}\nstage: ${stage}\nerror: ${errorMsg}\n${errorStack}\n---\n`,
						{ flag: "a" })
				} catch { /* logging failure is non-fatal */ }

				// Fall back to elicitation — ask the user directly via MCP client UI
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

	if (name === "haiku_gate_approve") {
		// Approve an ask gate — advance to next stage
		const root = findHaikuRoot()
		const iDir = join(root, "intents", args.intent as string)
		const intentFm = readFrontmatter(join(iDir, "intent.md"))
		const studio = (intentFm.studio as string) || "ideation"
		const stages = resolveStudioStages(studio)
		const currentIdx = stages.indexOf(args.stage as string)
		const nextStage = currentIdx < stages.length - 1 ? stages[currentIdx + 1] : null

		emitTelemetry("haiku.gate.resolved", { intent: args.intent as string, stage: args.stage as string, gate_type: "ask", outcome: "advanced" })

		if (nextStage) {
			// FSM side effect: advance stage
			fsmAdvanceStage(args.intent as string, args.stage as string, nextStage)
			syncSessionMetadata(args.intent as string, args.state_file as string | undefined)
			return text(JSON.stringify({ action: "advance_stage", intent: args.intent, stage: args.stage, next_stage: nextStage, gate_outcome: "advanced" }))
		}

		// Last stage — complete the intent
		fsmCompleteStage(args.intent as string, args.stage as string, "advanced")
		fsmIntentComplete(args.intent as string)
		syncSessionMetadata(args.intent as string, args.state_file as string | undefined)
		return text(JSON.stringify({ action: "intent_complete", intent: args.intent }))
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

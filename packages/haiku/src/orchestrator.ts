// orchestrator.ts — H·AI·K·U stage loop orchestration
//
// Deterministic orchestration logic. The MCP tells the agent what to do next.
// The agent executes. No interpretation of prose instructions needed.
//
// Primary tool: haiku_run_next { intent }
// Returns an action object the agent follows.

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import matter from "gray-matter"
import { emitTelemetry } from "./telemetry.js"

// ── Path helpers ───────────────────────────────────────────────────────────

function findHaikuRoot(): string {
	let dir = process.cwd()
	for (let i = 0; i < 20; i++) {
		if (existsSync(join(dir, ".haiku"))) return join(dir, ".haiku")
		const parent = join(dir, "..")
		if (parent === dir) break
		dir = parent
	}
	throw new Error("No .haiku/ directory found")
}

function readFrontmatter(filePath: string): Record<string, unknown> {
	if (!existsSync(filePath)) return {}
	const raw = readFileSync(filePath, "utf8")
	const { data } = matter(raw)
	// Normalize Date objects to ISO date strings
	for (const key in data) {
		if (data[key] instanceof Date) {
			data[key] = (data[key] as Date).toISOString().split("T")[0]
		}
	}
	return data as Record<string, unknown>
}

function readJson(path: string): Record<string, unknown> {
	if (!existsSync(path)) return {}
	return JSON.parse(readFileSync(path, "utf8"))
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

// ── Action types ───────────────────────────────────────────────────────────

export interface OrchestratorAction {
	action: string
	[key: string]: unknown
}

// ── Main orchestration function ────────────────────────────────────────────

export function runNext(slug: string): OrchestratorAction {
	const root = findHaikuRoot()
	const intentDir = join(root, "intents", slug)
	const intentFile = join(intentDir, "intent.md")

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
		return runNextComposite(slug, intent, intentDir)
	}

	const allStudioStages = resolveStudioStages(studio)
	if (allStudioStages.length === 0) {
		return { action: "error", message: `Studio '${studio}' has no stages` }
	}

	// Filter out skipped stages
	const skipStages = (intent.skip_stages as string[]) || []
	const studioStages = allStudioStages.filter(s => !skipStages.includes(s))

	// Determine current stage
	let currentStage = activeStage
	if (!currentStage) {
		currentStage = studioStages[0]
	}
	// If current stage was skipped, advance to next non-skipped stage
	if (skipStages.includes(currentStage)) {
		const idx = allStudioStages.indexOf(currentStage)
		const next = allStudioStages.slice(idx + 1).find(s => !skipStages.includes(s))
		if (!next) {
			return { action: "intent_complete", intent: slug, studio, message: `All stages complete for intent '${slug}'` }
		}
		currentStage = next
	}

	// Load stage state
	const stageState = readJson(join(intentDir, "stages", currentStage, "state.json"))
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
		return {
			action: "start_stage",
			intent: slug,
			studio,
			stage: currentStage,
			hats,
			phase: "decompose",
			...(follows ? { follows, parent_knowledge: parentKnowledge } : {}),
			message: follows
				? `Start stage '${currentStage}' — this intent follows '${follows}'. Load parent knowledge before elaborating.`
				: `Start stage '${currentStage}' — elaborate the work into units`,
		}
	}

	// Stage in elaboration phase
	if (phase === "decompose") {
		const unitsDir = join(intentDir, "stages", currentStage, "units")
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
				action: "decompose",
				intent: slug,
				studio,
				stage: currentStage,
				elaboration: elaborationMode,
				message: `Elaborate stage '${currentStage}' into units with completion criteria`,
			}
		}
		// Units exist — move to execute
		return {
			action: "advance_phase",
			intent: slug,
			stage: currentStage,
			from_phase: "decompose",
			to_phase: "execute",
			message: `Units ready — begin execution of stage '${currentStage}'`,
		}
	}

	// Stage in execute phase
	if (phase === "execute") {
		const units = listUnits(intentDir, currentStage)
		const readyUnits = units.filter(u => u.status === "pending" && u.depsComplete)
		const activeUnits = units.filter(u => u.status === "active")
		const allComplete = units.every(u => u.status === "completed")

		if (allComplete) {
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
				message: `Continue unit '${unit.name}' — hat: ${unit.hat}, bolt: ${unit.bolt}`,
			}
		}

		if (readyUnits.length > 1) {
			// Multiple units ready — return all for parallel team execution
			const hats = resolveStageHats(studio, currentStage)
			return {
				action: "start_units",
				intent: slug,
				studio,
				stage: currentStage,
				units: readyUnits.map(u => u.name),
				first_hat: hats[0] || "",
				hats,
				message: `${readyUnits.length} units ready for parallel execution: ${readyUnits.map(u => u.name).join(", ")}`,
			}
		}

		if (readyUnits.length > 0) {
			const unit = readyUnits[0]
			const hats = resolveStageHats(studio, currentStage)
			return {
				action: "start_unit",
				intent: slug,
				studio,
				stage: currentStage,
				unit: unit.name,
				first_hat: hats[0] || "",
				hats,
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
		// Auto-advance to gate
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
				return { action: "intent_complete", intent: slug, studio, message: `All stages complete for intent '${slug}'` }
			}
			if (effectiveMode === "continuous") {
				return { action: "advance_stage", intent: slug, stage: currentStage, next_stage: nextStage, gate_outcome: "advanced", message: `Gate auto-passed — advancing to '${nextStage}'` }
			}
			return { action: "stage_complete_discrete", intent: slug, stage: currentStage, next_stage: nextStage, message: `Stage '${currentStage}' complete. Run /haiku:run to start '${nextStage}'.` }
		}

		if (reviewType === "ask") {
			return { action: "gate_ask", intent: slug, stage: currentStage, next_stage: nextStage, message: `Stage '${currentStage}' complete — awaiting your approval to advance` }
		}

		if (reviewType === "external") {
			return { action: "gate_external", intent: slug, stage: currentStage, next_stage: nextStage, message: `Stage '${currentStage}' complete — push for external review` }
		}

		if (reviewType === "await") {
			return { action: "gate_await", intent: slug, stage: currentStage, next_stage: nextStage, message: `Stage '${currentStage}' complete — awaiting external event before advancing` }
		}

		// Fallback
		return { action: "advance_stage", intent: slug, stage: currentStage, next_stage: nextStage, gate_outcome: "advanced", message: `Advancing to '${nextStage}'` }
	}

	// Stage completed — find next
	if (stageStatus === "completed") {
		const stageIdx = studioStages.indexOf(currentStage)
		const nextStage = stageIdx < studioStages.length - 1 ? studioStages[stageIdx + 1] : null
		if (!nextStage) {
			return { action: "intent_complete", intent: slug, studio, message: `All stages complete for intent '${slug}'` }
		}
		const hats = resolveStageHats(studio, nextStage)
		return { action: "start_stage", intent: slug, studio, stage: nextStage, hats, phase: "decompose", message: `Start stage '${nextStage}'` }
	}

	return { action: "error", message: `Unknown state for stage '${currentStage}' — phase: ${phase}, status: ${stageStatus}` }
}

// ── Composite orchestration ────────────────────────────────────────────────

function runNextComposite(slug: string, intent: Record<string, unknown>, intentDir: string): OrchestratorAction {
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

function listUnits(intentDir: string, stage: string): UnitInfo[] {
	const unitsDir = join(intentDir, "stages", stage, "units")
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

// ── Tool definitions ───────────────────────────────────────────────────────

export const orchestratorToolDefs = [
	{
		name: "haiku_run_next",
		description:
			"Get the next action for an intent. Returns what the agent should do next: " +
			"start a stage, elaborate, execute a unit, review, advance, or report completion. " +
			"The orchestrator handles all state logic — the agent just follows the returned action.",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent: { type: "string", description: "Intent slug" },
			},
			required: ["intent"],
		},
	},
	{
		name: "haiku_gate_approve",
		description: "Approve an 'ask' gate, advancing the intent to the next stage",
		inputSchema: {
			type: "object" as const,
			properties: {
				intent: { type: "string" },
				stage: { type: "string" },
			},
			required: ["intent", "stage"],
		},
	},
]

// ── Tool handlers ──────────────────────────────────────────────────────────

export function handleOrchestratorTool(name: string, args: Record<string, unknown>): { content: Array<{ type: "text"; text: string }> } {
	const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] })

	if (name === "haiku_run_next") {
		const result = runNext(args.intent as string)
		emitTelemetry("haiku.orchestrator.action", { intent: args.intent as string, action: result.action })
		return text(JSON.stringify(result, null, 2))
	}

	if (name === "haiku_gate_approve") {
		// Approve an ask gate — advance to next stage
		const root = findHaikuRoot()
		const intentDir = join(root, "intents", args.intent as string)
		const intentFm = readFrontmatter(join(intentDir, "intent.md"))
		const studio = (intentFm.studio as string) || "ideation"
		const stages = resolveStudioStages(studio)
		const currentIdx = stages.indexOf(args.stage as string)
		const nextStage = currentIdx < stages.length - 1 ? stages[currentIdx + 1] : null

		emitTelemetry("haiku.gate.resolved", { intent: args.intent as string, stage: args.stage as string, gate_type: "ask", outcome: "advanced" })

		if (nextStage) {
			return text(JSON.stringify({ action: "advance_stage", intent: args.intent, stage: args.stage, next_stage: nextStage, gate_outcome: "advanced" }))
		}
		return text(JSON.stringify({ action: "intent_complete", intent: args.intent }))
	}

	return text(`Unknown orchestrator tool: ${name}`)
}

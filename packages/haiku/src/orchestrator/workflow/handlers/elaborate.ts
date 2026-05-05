// orchestrator/workflow/handlers/elaborate.ts — Emit for the
// `elaborate` state.
//
// Owns the entire elaborate-phase emission chain that runNext
// previously inlined at orchestrator.ts:2473-3182. Sub-cases handled
// (in branch order):
//
//   1. Discovery worktree reconciliation (git path):
//        - integrator cap exceeded → escalate
//        - pending merge conflicts → integrate_fix_chains
//   2. Iterative re-entry (completed units, no pending, iteration 1):
//        - first tick → elaborate (iterative mode)
//        - second+ tick → advance_phase (skip to gate)
//   3. First-time elaborate (no units yet) → elaborate
//   4. Additive elaborate (iteration > 1, post-execute): closes:
//      validation, orphaned-feedback gate → elaborate w/ validation_error
//      or pending feedback context.
//   5. Collaborative elaboration gate → elaboration_insufficient
//   6. DAG validation → unresolved_dependencies, dag_cycle_detected
//   7. Unit naming / discovery / inputs validation → various
//   8. Design direction required → design_direction_required
//   9. Cross-stage naming validation → unit_naming_invalid
//  10. Pre-execution adversarial review:
//        - first dispatch → pre_review (with side-effect: stage state
//          dispatch flag + git commit)
//        - grace window before ack → pre_review_waiting
//  11. Spec gate (auto/ask): auto-advance via workflowAdvancePhase or
//      open gate_review.

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { resolvePluginRoot } from "../../../config.js"
import { topologicalSort } from "../../../dag.js"
import {
	discoveryBranchName,
	discoveryWorktreePath,
	mergeDiscoveryWorktree,
} from "../../../git-worktree.js"
import {
	cleanupPreExecuteFeedback,
	isStagePreExecute,
	listUnits,
	type OrchestratorAction,
	resolveIntentStages,
	resolveStageMetadata,
	resolveStageReview,
	summarizeFeedback,
	validateCumulativeInputCoverage,
	validateDiscoveryArtifacts,
	validateUnitInputs,
	validateUnitNaming,
	workflowAdvancePhase,
} from "../../../orchestrator.js"
import {
	getStageIterationCount,
	gitCommitState,
	intentDir,
	isGitRepo,
	MAX_INTEGRATOR_ATTEMPTS,
	parseFrontmatter,
	readFeedbackFiles,
	readJson,
	setFrontmatterField,
	timestamp,
	writeJson,
} from "../../../state-tools.js"
import {
	filterReviewAgentsByScope,
	readReviewAgentPaths,
	studioSearchPaths,
} from "../../../studio-reader.js"
import { writeActionPromptFile } from "../../../subagent-prompt-file.js"
import { emitTelemetry } from "../../../telemetry.js"
import { buildElaboratePromptBody } from "../../prompts/elaborate.js"
import { countOpenFeedbackForGateCheck } from "../feedback-triage-gate.js"
import type { WorkflowHandler } from "./_types.js"

/**
 * Render the full elaborate prompt body, write it to a session-scoped
 * tmpfile, and return the action with `prompt_file` stamped + a short
 * "Read this file" message replacing whatever long-form message the
 * caller suggested. Mutates and returns `action` for ergonomic use at
 * the return sites in this handler.
 */
function withPromptFile(
	action: Record<string, unknown>,
	slug: string,
	studio: string,
): OrchestratorAction {
	let body: string
	try {
		const dir = intentDir(slug)
		body = buildElaboratePromptBody({
			slug,
			studio,
			action: action as OrchestratorAction,
			dir,
		})
	} catch (err) {
		// Render failed (e.g. TypeError in prompt builder) — return the
		// action as-is so the inline prompt-builder rethrows the real
		// error through the normal response path.
		console.error(
			`[haiku] elaborate prompt-body render failed for ${slug}: ${err instanceof Error ? err.message : String(err)}. Falling back to inline rendering.`,
		)
		return action as OrchestratorAction
	}

	try {
		const stage = (action.stage as string) || ""
		const iteration = (action.iteration as number | undefined) ?? 0
		const tickHint = `${iteration}-${Date.now()}`
		const { path } = writeActionPromptFile({
			action: "elaborate",
			intent: slug,
			stage,
			content: body,
			tickHint,
		})
		action.prompt_file = path
		action.message = `Read \`${path}\` and execute its instructions exactly. The file is the canonical, authoritative elaboration prompt for this tick.`
	} catch (err) {
		// Best-effort: if the file write fails, leave the action
		// untouched and let the legacy inline prompt-builder render
		// the body in the response. This keeps the workflow alive
		// even when /tmp is unwritable.
		console.error(
			`[haiku] elaborate prompt-file write failed for ${slug}: ${err instanceof Error ? err.message : String(err)}. Falling back to inline rendering.`,
		)
	}
	return action as OrchestratorAction
}

function readFrontmatter(filePath: string): Record<string, unknown> {
	const { data } = parseFrontmatter(readFileSync(filePath, "utf8"))
	return data
}

/** Tool-enforced feature coverage check. For each `.feature` file
 *  under `<intent>/features/`, walk every unit in the current stage
 *  looking for an owner. A unit owns a feature when ANY of:
 *
 *    - the unit body or its closes: list cites `features/<name>.feature`
 *    - a unit `quality_gates:` command path matches the feature's
 *      relative path (covers test runners that target the feature)
 *
 *  Returns an `error` action when ≥1 feature has zero owners; null
 *  when every feature is covered (or the features dir is absent). */
function validateFeatureCoverage(
	slug: string,
	currentStage: string,
): OrchestratorAction | null {
	const iDir = intentDir(slug)
	const featuresDir = join(iDir, "features")
	if (!existsSync(featuresDir)) return null
	let featureFiles: string[]
	try {
		featureFiles = readdirSync(featuresDir).filter((f) =>
			f.endsWith(".feature"),
		)
	} catch {
		return null
	}
	if (featureFiles.length === 0) return null

	const unitsDir = join(iDir, "stages", currentStage, "units")
	if (!existsSync(unitsDir)) {
		// No units yet — surface the orphan list rather than blocking
		// the elaborator before they've even drafted anything. This is
		// rare in practice (we only enter this gate in fresh-elaborate
		// mode after at least one unit exists), but keep the contract
		// explicit.
		return null
	}

	interface UnitCorpus {
		name: string
		body: string
		closes: string[]
		gateCommands: string[]
	}
	const unitCorpus: UnitCorpus[] = []
	for (const f of readdirSync(unitsDir).filter((f) => f.endsWith(".md"))) {
		const path = join(unitsDir, f)
		try {
			const raw = readFileSync(path, "utf8")
			const { data, body } = parseFrontmatter(raw)
			const closes = Array.isArray(data.closes) ? (data.closes as string[]) : []
			const gates = Array.isArray(data.quality_gates)
				? (data.quality_gates as Array<unknown>)
				: []
			const gateCommands: string[] = []
			for (const g of gates) {
				if (typeof g === "string") {
					gateCommands.push(g)
				} else if (g && typeof g === "object") {
					const cmd = (g as Record<string, unknown>).command
					if (typeof cmd === "string") gateCommands.push(cmd)
					const verify = (g as Record<string, unknown>).verify
					if (typeof verify === "string") gateCommands.push(verify)
				}
			}
			unitCorpus.push({
				name: f.replace(/\.md$/, ""),
				body: body || "",
				closes,
				gateCommands,
			})
		} catch {
			/* skip unreadable */
		}
	}

	const uncovered: string[] = []
	for (const fname of featureFiles) {
		const relPath = `features/${fname}`
		let owned = false
		for (const u of unitCorpus) {
			if (
				u.body.includes(fname) ||
				u.body.includes(relPath) ||
				u.closes.some((c) => c === relPath || c.endsWith(`/${fname}`)) ||
				u.gateCommands.some(
					(c) => c.includes(relPath) || c.includes(`/${fname}`),
				)
			) {
				owned = true
				break
			}
		}
		if (!owned) uncovered.push(relPath)
	}

	if (uncovered.length === 0) return null

	return {
		action: "error",
		error: "feature_coverage_gap",
		intent: slug,
		stage: currentStage,
		uncovered,
		message: `Feature coverage gap: ${uncovered.length} feature file(s) under \`features/\` are not owned by any unit in stage '${currentStage}'.\n\nOrphan feature(s):\n${uncovered.map((p) => `  - ${p}`).join("\n")}\n\nFor each orphan feature, either:\n- Update an existing unit's body to cite \`${uncovered[0]}\` (or one of the orphans) so it's clear which unit owns the behavior, OR\n- Add a unit \`closes:\` entry referencing the feature path, OR\n- Reference the feature path in a unit's \`quality_gates:\` command (e.g. \`bun test ${uncovered[0]}\`), OR\n- If a feature is genuinely out of scope for this intent, delete the feature file. Do NOT leave orphans.\n\nAfter wiring coverage, call \`haiku_run_next { intent: "${slug}" }\` to re-validate.`,
	}
}

const emit: WorkflowHandler = (ctx) => {
	const slug = ctx.slug
	const studio = ctx.studio
	const intent = ctx.intent
	const currentStage = ctx.currentStage
	const iDir = ctx.intentDirPath
	const intentFile = join(iDir, "intent.md")

	if (!currentStage) return null

	// Phase routing: derive-state returns "elaborate" only when
	// stageState.phase === "elaborate". The original runNext branch
	// also handled "decompose" which was a legacy alias; we surface
	// it via a deeper fallback by checking stage state directly.
	const stageState: Record<string, unknown> = { ...ctx.stageState }
	const phase = (stageState.phase as string) || ""
	if (phase !== "elaborate" && phase !== "decompose") return null

	const studioStages = resolveIntentStages(intent, studio)

	const unitsDir = join(iDir, "stages", currentStage, "units")
	const hasUnits =
		existsSync(unitsDir) &&
		readdirSync(unitsDir).filter((f) => f.endsWith(".md")).length > 0

	const cleanedPreExecFb = cleanupPreExecuteFeedback(iDir, currentStage)
	if (cleanedPreExecFb.length > 0) {
		console.error(
			`[haiku] cleaned ${cleanedPreExecFb.length} legacy pre-execute feedback file(s) from ${slug}/${currentStage}: ${cleanedPreExecFb.join(", ")}`,
		)
	}

	const pluginRoot = resolvePluginRoot()
	let elaborationMode = "collaborative"
	for (const base of [
		join(process.cwd(), ".haiku", "studios"),
		join(pluginRoot, "studios"),
	]) {
		const stageFile = join(base, studio, "stages", currentStage, "STAGE.md")
		if (existsSync(stageFile)) {
			const fm = readFrontmatter(stageFile)
			elaborationMode = (fm.elaboration as string) || "collaborative"
			break
		}
	}

	const elaborationTurns = (stageState.elaboration_turns as number) || 0
	const updatedTurns = elaborationTurns + 1
	stageState.elaboration_turns = updatedTurns
	writeJson(join(iDir, "stages", currentStage, "state.json"), stageState)

	// ── Discovery worktree reconciliation ─────────────────────────────
	if (isGitRepo()) {
		const discoveryTemplates: string[] = []
		{
			const seen = new Set<string>()
			for (const base of [...studioSearchPaths()].reverse()) {
				const discoveryDir = join(
					base,
					studio,
					"stages",
					currentStage,
					"discovery",
				)
				if (!existsSync(discoveryDir)) continue
				for (const f of readdirSync(discoveryDir).filter((f) =>
					f.endsWith(".md"),
				)) {
					if (seen.has(f)) continue
					seen.add(f)
					discoveryTemplates.push(f.replace(/\.md$/i, "").toLowerCase())
				}
			}
		}

		const pendingDiscoveryIntegration: Array<{
			feedback_id: string
			feedback_title: string
			feedback_file: string
			worktree: string
			branch: string
			conflict_files: string[]
			attempt: number
		}> = []
		const exhaustedDiscoveryIntegration: Array<{
			feedback_id: string
			title: string
			attempts: number
		}> = []
		// Non-conflict merge failures (e.g. branch already checked out
		// at a foreign worktree with uncommitted changes) — collected and
		// surfaced as a structured error rather than logged-and-swallowed.
		// Without this, the elaborate prompt fans out fresh discovery
		// subagents on every tick because outputPath stays absent on disk
		// — looks like an infinite loop to the user. The agent now sees
		// the underlying git error and can act on it.
		const failedDiscoveryMerges: Array<{
			template: string
			worktree: string
			branch: string
			message: string
		}> = []
		for (const template of discoveryTemplates) {
			const wtPath = discoveryWorktreePath(slug, currentStage, template)
			if (!existsSync(wtPath)) continue
			const res = mergeDiscoveryWorktree(slug, currentStage, template)
			if (res.success) {
				emitTelemetry("haiku.discovery.merged", {
					intent: slug,
					stage: currentStage,
					template,
				})
				continue
			}
			if (!res.isConflict) {
				console.error(
					`[haiku] discovery merge failed for ${template}: ${res.message}. Leaving worktree; next tick will retry after operator action.`,
				)
				failedDiscoveryMerges.push({
					template,
					worktree: wtPath,
					branch: discoveryBranchName(slug, currentStage, template),
					message: res.message,
				})
				continue
			}
			const attemptKey = `discovery_${template}_integrator_attempts`
			const stateOnDisk = readJson(
				join(iDir, "stages", currentStage, "state.json"),
			)
			const prevAttempts = Number(
				(stateOnDisk as Record<string, unknown>)[attemptKey] ?? 0,
			)
			const nextAttempt = prevAttempts + 1
			writeJson(join(iDir, "stages", currentStage, "state.json"), {
				...stateOnDisk,
				[attemptKey]: nextAttempt,
			})
			if (nextAttempt > MAX_INTEGRATOR_ATTEMPTS) {
				exhaustedDiscoveryIntegration.push({
					feedback_id: `DISC-${template}`,
					title: `discovery artifact: ${template}`,
					attempts: nextAttempt - 1,
				})
			} else {
				pendingDiscoveryIntegration.push({
					feedback_id: `DISC-${template}`,
					feedback_title: `discovery artifact: ${template}`,
					feedback_file: `(discovery template ${template})`,
					worktree: wtPath,
					branch: discoveryBranchName(slug, currentStage, template),
					conflict_files: res.conflictFiles || [],
					attempt: nextAttempt,
				})
			}
		}

		if (failedDiscoveryMerges.length > 0) {
			const lines = failedDiscoveryMerges.map(
				(f) =>
					`- **${f.template}** — ${f.message}\n  worktree: \`${f.worktree}\`\n  branch: \`${f.branch}\``,
			)
			return {
				action: "error",
				intent: slug,
				stage: currentStage,
				reason: "discovery_merge_failed",
				failed_merges: failedDiscoveryMerges,
				message: `Discovery merge failed for ${failedDiscoveryMerges.length} artifact(s) in stage '${currentStage}'. The most common cause is the stage branch \`haiku/${slug}/${currentStage}\` being checked out at another worktree with uncommitted changes — commit/stash there, then retry. If the listed worktree's content was already merged manually, run \`git worktree remove --force <worktree>\` and retry.\n\n${lines.join("\n")}`,
			}
		}

		if (exhaustedDiscoveryIntegration.length > 0) {
			const target = exhaustedDiscoveryIntegration[0]
			return {
				action: "escalate",
				intent: slug,
				stage: currentStage,
				reason: "integrator_cap_exceeded",
				iteration: target.attempts,
				max_iterations: MAX_INTEGRATOR_ATTEMPTS,
				message: `Discovery worktree ${target.feedback_id} still has unresolved conflicts after ${target.attempts} integrator attempts. Resolve manually inside the worktree, commit, then run \`haiku_run_next\`.`,
				pending_items: exhaustedDiscoveryIntegration.map((e) => ({
					feedback_id: e.feedback_id,
					title: e.title,
				})),
			}
		}

		if (pendingDiscoveryIntegration.length > 0) {
			gitCommitState(
				`haiku: integrate_fix_chains dispatch ${pendingDiscoveryIntegration.length} discovery conflict(s) in ${currentStage}`,
			)
			return {
				action: "integrate_fix_chains",
				intent: slug,
				studio,
				stage: currentStage,
				scope: currentStage,
				max_attempts: MAX_INTEGRATOR_ATTEMPTS,
				items: pendingDiscoveryIntegration,
				message: `Discovery worktree merges hit conflicts on ${pendingDiscoveryIntegration.length} artifact(s) in stage '${currentStage}'. Dispatching the integrator per worktree.`,
			}
		}
	}

	// ── Re-entry iterative elaborate ───────────────────────────────────
	const existingUnits = hasUnits ? listUnits(iDir, currentStage) : []
	const completedUnitsList = existingUnits.filter(
		(u) => u.status === "completed",
	)
	const pendingUnitsList = existingUnits.filter((u) => u.status !== "completed")
	const iterativeEntryIteration = getStageIterationCount(stageState)

	if (
		iterativeEntryIteration === 1 &&
		completedUnitsList.length > 0 &&
		pendingUnitsList.length === 0
	) {
		if (updatedTurns === 1) {
			return withPromptFile(
				{
					action: "elaborate",
					intent: slug,
					studio,
					stage: currentStage,
					elaboration: elaborationMode,
					iteration: iterativeEntryIteration,
					visits: iterativeEntryIteration,
					iterative: true,
					completed_units: completedUnitsList.map((u) => u.name),
					pending_units: pendingUnitsList.map((u) => u.name),
					stage_metadata: resolveStageMetadata(studio, currentStage),
					message: `Re-entering stage '${currentStage}' with ${completedUnitsList.length} completed unit(s) from prior iteration(s). Treat completed work as knowledge; decide whether this iteration needs new or modified units.`,
				},
				slug,
				studio,
			)
		}
		workflowAdvancePhase(slug, currentStage, "gate")
		return {
			action: "advance_phase",
			intent: slug,
			studio,
			stage: currentStage,
			from_phase: "elaborate",
			to_phase: "gate",
			message: `No new units needed for this iteration of '${currentStage}' — advancing directly to the gate.`,
		}
	}

	if (!hasUnits) {
		return withPromptFile(
			{
				action: "elaborate",
				intent: slug,
				studio,
				stage: currentStage,
				elaboration: elaborationMode,
				stage_metadata: resolveStageMetadata(studio, currentStage),
				message: `Elaborate stage '${currentStage}' into units with completion criteria`,
			},
			slug,
			studio,
		)
	}

	// ── Additive elaborate mode (iteration > 1, post-execute only) ─────
	const iteration = getStageIterationCount(stageState)
	if (iteration > 1 && !isStagePreExecute(iDir, currentStage)) {
		const allUnits = listUnits(iDir, currentStage)
		const completedUnits = allUnits.filter((u) => u.status === "completed")
		const pendingUnits = allUnits.filter((u) => u.status !== "completed")
		const pendingFeedback = readFeedbackFiles(slug, currentStage).filter(
			(item) => item.status === "pending",
		)

		const basePayload = {
			action: "elaborate" as const,
			intent: slug,
			studio,
			stage: currentStage,
			elaboration: elaborationMode,
			iteration,
			visits: iteration,
			completed_units: completedUnits.map((u) => u.name),
			pending_feedback: pendingFeedback.map(summarizeFeedback),
			stage_metadata: resolveStageMetadata(studio, currentStage),
		}

		const validFeedbackIds = new Set(pendingFeedback.map((f) => f.id))
		const unitsWithoutCloses: string[] = []
		const invalidCloseRefs: Array<{ unit: string; ref: string }> = []

		for (const u of pendingUnits) {
			const unitFile = join(
				iDir,
				"stages",
				currentStage,
				"units",
				`${u.name}.md`,
			)
			if (!existsSync(unitFile)) continue
			const fm = readFrontmatter(unitFile)
			const closes = (fm.closes as string[]) || []
			if (closes.length === 0) {
				unitsWithoutCloses.push(u.name)
			} else {
				for (const ref of closes) {
					if (!validFeedbackIds.has(ref)) {
						invalidCloseRefs.push({ unit: u.name, ref })
					}
				}
			}
		}

		if (pendingUnits.length > 0 && unitsWithoutCloses.length > 0) {
			const validation_error = `New units missing \`closes:\` field: ${unitsWithoutCloses.join(", ")}. Every new unit in a revisit cycle MUST declare \`closes: [FB-NN]\` referencing the feedback items it addresses.`
			return withPromptFile(
				{
					...basePayload,
					validation_error,
				},
				slug,
				studio,
			)
		}

		if (invalidCloseRefs.length > 0) {
			const validation_error = `Invalid \`closes:\` references: ${invalidCloseRefs.map((r) => `${r.unit} → ${r.ref}`).join(", ")}. References must match existing pending feedback IDs.`
			return withPromptFile(
				{
					...basePayload,
					validation_error,
				},
				slug,
				studio,
			)
		}

		if (pendingUnits.length > 0 && pendingFeedback.length > 0) {
			const closedFeedbackIds = new Set<string>()
			for (const u of pendingUnits) {
				const unitFile = join(
					iDir,
					"stages",
					currentStage,
					"units",
					`${u.name}.md`,
				)
				if (!existsSync(unitFile)) continue
				const fm = readFrontmatter(unitFile)
				const closes = (fm.closes as string[]) || []
				for (const ref of closes) closedFeedbackIds.add(ref)
			}
			const orphaned = pendingFeedback.filter(
				(f) => !closedFeedbackIds.has(f.id),
			)
			if (orphaned.length > 0) {
				const validation_error = `Orphaned feedback — not referenced by any unit's \`closes:\` field: ${orphaned.map((f) => `${f.id}: ${f.title}`).join("; ")}. Create units for these or reject the feedback items.`
				return withPromptFile(
					{
						...basePayload,
						validation_error,
					},
					slug,
					studio,
				)
			}
		}

		if (pendingUnits.length === 0 && pendingFeedback.length > 0) {
			return withPromptFile(
				{
					...basePayload,
				},
				slug,
				studio,
			)
		}
	}

	// Collaborative elaboration gate
	if (elaborationMode === "collaborative") {
		const decisionLog = (stageState.decision_log as unknown[]) || []
		const noDecisionsDeclared = stageState.elaboration_no_decisions === true
		if (decisionLog.length === 0 && !noDecisionsDeclared) {
			return {
				action: "elaboration_insufficient",
				intent: slug,
				stage: currentStage,
				turns: updatedTurns,
				decisions_recorded: decisionLog.length,
				message: `Collaborative elaboration advances when (a) at least one decision has been recorded in the stage's \`decision_log\` via \`haiku_decision_record\`, OR (b) you have honestly declared that no architectural decisions are in scope via \`haiku_decision_record { no_decisions: true, rationale: "..." }\`. ${updatedTurns} turn(s) so far, 0 decisions recorded. A decision is a real architectural choice between concrete options — either user-resolved (the user picked) or autonomous-acknowledged (you chose and surfaced the choice for veto-style approval, the user did not push back). Padding questions don't count. If the work is genuinely conventional with no choices to make, declare no_decisions=true with a rationale.`,
			}
		}
	}

	// DAG validation
	{
		const unitsDir2 = join(iDir, "stages", currentStage, "units")
		const unitFiles = readdirSync(unitsDir2).filter((f) => f.endsWith(".md"))
		const nodeIds = new Set(unitFiles.map((f) => f.replace(".md", "")))
		const dagNodes = unitFiles.map((f) => {
			const fm = readFrontmatter(join(unitsDir2, f))
			return {
				id: f.replace(".md", ""),
				status: (fm.status as string) || "pending",
			}
		})
		const dagEdges: Array<{ from: string; to: string }> = []
		const dagAdj = new Map<string, string[]>()
		for (const n of dagNodes) dagAdj.set(n.id, [])

		const unresolvedDeps: Array<{ unit: string; dep: string }> = []
		for (const f of unitFiles) {
			const fm = readFrontmatter(join(unitsDir2, f))
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
				message: `${unresolvedDeps.length} depends_on reference(s) don't match any unit filename:\n\n${unresolvedDeps.map((d) => `- \`${d.unit}\` depends on \`${d.dep}\` — not found`).join("\n")}\n\nValid unit slugs: ${[...nodeIds].join(", ")}\ndepends_on must use the full filename without .md (e.g., \`unit-01-data-model\`, not \`data-model\`).\n\nFix the depends_on fields, then call \`haiku_run_next { intent: "${slug}" }\` again.`,
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
					message: `${err.message}. Fix the depends_on fields in the unit files to remove the cycle, then call haiku_run_next again.`,
				}
			}
		}
	}

	const namingViolation = validateUnitNaming(iDir, currentStage)
	if (namingViolation) return namingViolation

	const discoveryViolation = validateDiscoveryArtifacts(
		slug,
		currentStage,
		studio,
	)
	if (discoveryViolation) return discoveryViolation

	const inputsViolation = validateUnitInputs(iDir, currentStage)
	if (inputsViolation) return inputsViolation

	// Cumulative input coverage — every prior-stage output MUST be
	// referenced by some current-stage unit's `inputs:` OR explicitly
	// acknowledged via `haiku_coverage_acknowledge`. Catches the
	// silent-skip class of failure (e.g., dev stage drops design's SPA
	// spec, ships components no one renders). Fires after the per-unit
	// inputs-empty check and before adversarial-spec-review dispatch so
	// reviewers see fully-coverage-resolved units.
	const studioStagesForCoverage = resolveIntentStages(intent, studio)
	const currentIdx = studioStagesForCoverage.indexOf(currentStage)
	const priorStagesForCoverage =
		currentIdx > 0 ? studioStagesForCoverage.slice(0, currentIdx) : []
	const coverageViolation = validateCumulativeInputCoverage(
		iDir,
		currentStage,
		priorStagesForCoverage,
	)
	if (coverageViolation) return coverageViolation

	// Design direction selection enforcement
	const designDirectionSelected =
		stageState.design_direction_selected as boolean
	if (!designDirectionSelected) {
		const stageMetaForDesign = resolveStageMetadata(studio, currentStage)
		if (stageMetaForDesign?.body?.includes("pick_design_direction")) {
			return {
				action: "design_direction_required",
				intent: slug,
				studio,
				stage: currentStage,
				message:
					"This stage requires a design direction selection before proceeding. Call pick_design_direction with wireframe variants — the state will be updated automatically when the user selects a direction.",
			}
		}
	} else if (!stageState.design_direction_surfaced) {
		// Recovery / surface-once: the HTTP submit route persisted the
		// selection (+ any annotated screenshot PNGs) to state.json. The
		// `pick_design_direction` MCP tool result may have been
		// discarded by a cancelled MCP request, so this is the durable
		// path that hands the selection — including screenshot paths
		// for the agent to Read — back into the conversation. Flip the
		// surfaced flag so we don't re-emit on every subsequent tick.
		const dd = stageState.design_direction as
			| {
					archetype?: string
					comments?: string
					annotations?: Array<{ comment: string; screenshot_path: string }>
			  }
			| undefined
		if (dd?.archetype) {
			stageState.design_direction_surfaced = true
			writeJson(join(iDir, "stages", currentStage, "state.json"), stageState)
			return {
				action: "design_direction_complete",
				intent: slug,
				studio,
				stage: currentStage,
				archetype: dd.archetype,
				...(dd.comments ? { comments: dd.comments } : {}),
				...(dd.annotations && dd.annotations.length > 0
					? { annotations: dd.annotations }
					: {}),
				message: `Design direction "${dd.archetype}" recorded. Read any screenshot_path entries to view the user's annotations, then continue elaboration.`,
			}
		}
	}

	// Cross-stage naming validation
	const stagesDir = join(iDir, "stages")
	if (existsSync(stagesDir)) {
		for (const stageEntry of readdirSync(stagesDir, { withFileTypes: true })
			.filter((e) => e.isDirectory())
			.sort((a, b) => a.name.localeCompare(b.name))) {
			if (stageEntry.name === currentStage) continue
			const crossNaming = validateUnitNaming(iDir, stageEntry.name)
			if (crossNaming) return crossNaming
		}
	}

	// Feature coverage gate: every intent-root .feature file must be
	// owned by at least one unit in the current stage. Owners count as
	// any of:
	//   - The unit body cites the feature filename (`features/foo.feature`
	//     mentioned in the body, OR `closes:` cite list).
	//   - A unit's `quality_gates:` command names a path that touches
	//     the feature's relative path.
	// Run BEFORE pre-review dispatch so we don't spin up reviewers
	// against specs that already have orphan features — they'll flag
	// the orphan as a finding and create noise that the coverage gate
	// would have caught for free.
	const featureCoverageError = validateFeatureCoverage(slug, currentStage)
	if (featureCoverageError) return featureCoverageError

	// Pre-execution adversarial review
	{
		const preReviewDispatched = stageState.pre_review_dispatched as boolean

		if (!preReviewDispatched) {
			const agentPaths = filterReviewAgentsByScope(
				readReviewAgentPaths(studio, currentStage),
				join(iDir, "stages", currentStage, "artifacts"),
				{ studio, stage: currentStage },
			)
			if (Object.keys(agentPaths).length === 0) {
				stageState.pre_review_dispatched = true
				stageState.pre_review_dispatched_at = timestamp()
				stageState.pre_review_skipped_no_agents = true
				writeJson(join(iDir, "stages", currentStage, "state.json"), stageState)
			} else {
				stageState.pre_review_dispatched = true
				stageState.pre_review_dispatched_at = timestamp()
				writeJson(join(iDir, "stages", currentStage, "state.json"), stageState)
				gitCommitState(
					`haiku: dispatch pre-execute review on ${currentStage} unit specs`,
				)
				return {
					action: "pre_review",
					intent: slug,
					studio,
					stage: currentStage,
					units_dir: `.haiku/intents/${slug}/stages/${currentStage}/units/`,
					message:
						"Pre-execute adversarial review of unit SPECS. Spawn conditional review agents against every unit.md file and log findings via haiku_feedback. When all findings are resolved (closed or rejected), call haiku_run_next to advance.",
				}
			}
		}

		const skippedNoAgents = stageState.pre_review_skipped_no_agents === true
		if (!skippedNoAgents) {
			const dispatchedAtStr =
				typeof stageState.pre_review_dispatched_at === "string"
					? (stageState.pre_review_dispatched_at as string)
					: ""
			const dispatchedAtMs = dispatchedAtStr
				? new Date(dispatchedAtStr).getTime()
				: 0
			const ackd = stageState.pre_review_reviewers_acknowledged === true
			const elapsedMs = dispatchedAtMs
				? Date.now() - dispatchedAtMs
				: Number.POSITIVE_INFINITY
			const GRACE_MS =
				Number.parseInt(process.env.HAIKU_PRE_REVIEW_GRACE_MS ?? "", 10) ||
				15000
			if (!ackd && elapsedMs < GRACE_MS) {
				return {
					action: "pre_review_waiting",
					intent: slug,
					studio,
					stage: currentStage,
					dispatched_at: dispatchedAtStr,
					grace_remaining_ms: Math.max(0, GRACE_MS - elapsedMs),
					message: `Pre-execute review dispatched ${Math.floor(elapsedMs / 1000)}s ago — reviewer subagents may still be running. Wait for all subagents to return, then call haiku_run_next again. (Grace window: ${GRACE_MS}ms; override via HAIKU_PRE_REVIEW_GRACE_MS. To skip the grace window when you're confident reviewers have all returned, set stage state \`pre_review_reviewers_acknowledged: true\`.)`,
				}
			}
			if (!ackd) {
				stageState.pre_review_reviewers_acknowledged = true
				stageState.pre_review_reviewers_acknowledged_at = timestamp()
				writeJson(join(iDir, "stages", currentStage, "state.json"), stageState)
			}
		}
	}

	// Spec gate: auto-advance or open gate_review
	const intentReviewed = intent.intent_reviewed as boolean
	const isIntentReview = currentStage === studioStages[0] && !intentReviewed
	const stageReviewType = resolveStageReview(studio, currentStage)
	const intentMode = (intent.mode as string) || "continuous"
	const specGateAsks =
		intentMode === "discrete" ? true : stageReviewType !== "auto"

	if (!specGateAsks) {
		if (isIntentReview) {
			setFrontmatterField(intentFile, "intent_reviewed", true)
			gitCommitState(`haiku: intent ${slug} auto-approved`)
		}
		workflowAdvancePhase(slug, currentStage, "execute")
		emitTelemetry("haiku.gate.auto_advanced", {
			intent: slug,
			stage: currentStage,
			gate_context: isIntentReview ? "intent_review" : "elaborate_to_execute",
		})
		return {
			action: isIntentReview ? "intent_approved" : "advance_phase",
			intent: slug,
			studio,
			stage: currentStage,
			from_phase: "elaborate",
			to_phase: "execute",
			message: isIntentReview
				? `Auto-gate: intent approved — advancing to execution. Call haiku_run_next { intent: "${slug}" } immediately.`
				: `Auto-gate: specs validated — advancing to execution. Call haiku_run_next { intent: "${slug}" } immediately.`,
		}
	}

	// Defensive invariant: never emit gate_review while open feedback
	// exists. Pre-tick (feedback-triage-gate.ts) is the primary
	// enforcer; if it falls through here with open feedback, that's
	// a bug in pre-tick we want to surface loudly rather than silently
	// surface a gate to the user.
	const openFbCount = countOpenFeedbackForGateCheck(
		slug,
		studioStages,
		studioStages.indexOf(currentStage),
	)
	if (openFbCount > 0) {
		return {
			action: "error",
			intent: slug,
			message: `Refusing to emit gate_review for stage '${currentStage}' (elaborate→execute): ${openFbCount} open feedback item(s) on or before this stage. The pre-tick feedback gate should have intercepted this — file a bug citing feedback-triage-gate.ts. Workaround: call haiku_run_next again to re-enter pre-tick, or close / reject the open items via the review UI first.`,
		}
	}

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
			: "Specs validated — opening review before execution",
	}
}

export default emit

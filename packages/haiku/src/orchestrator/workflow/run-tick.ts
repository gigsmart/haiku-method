// orchestrator/workflow/run-tick.ts — Workflow-engine tick. Read disk
// → derive current state → run pre-tick consistency repair → dispatch
// the per-state handler → return the action.
//
// This is the runtime entry point for the H·AI·K·U workflow engine.
// State of record is on disk (intent.md frontmatter + per-stage
// state.json files); each tick is a fresh derive-from-disk →
// dispatch → emit cycle. There is no in-memory state machine, no
// long-lived actor — the durability + replayability comes from the
// fact that every tick reads its own truth.
//
// Per-state handlers live in `handlers/{state}.ts`. The registry in
// `handlers/index.ts` maps state names to handlers. Adding a new
// state name = adding the entry to the registry + the file.

import { existsSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { broadcastIntent } from "../../intent-broadcaster.js"
import type { OrchestratorAction } from "../../orchestrator.js"
import { verifyIntentState } from "../../state-integrity.js"
import {
	getStageIterationCount,
	readJson,
	writeJson,
} from "../../state-tools.js"
import { writeActionPromptFile } from "../../subagent-prompt-file.js"
import { emitTelemetry } from "../../telemetry.js"
import { resolveIntentStages } from "../studio.js"
import { type DerivedState, deriveCurrentState } from "./derive-state.js"
import { runDriftDetectionGate } from "./drift-detection-gate.js"
import { buildDriftDispatch, writeDriftDispatch } from "./drift-dispatch.js"
import { preTickFeedbackGate } from "./feedback-triage-gate.js"
import { dispatchHandler, WORKFLOW_STATES } from "./handlers/index.js"
import { buildManualChangeAssessmentAction } from "./handlers/manual-change-assessment.js"
import { preTickConsistency } from "./pre-tick.js"
import type { StateName } from "./types.js"
import {
	checkUpstreamReconciliation,
	computeCorpusFingerprintInstrumented,
	type ReconciliationFinding,
} from "./upstream-reconciliation.js"

/** Re-export of the registry's key set + dispatch function so
 *  callers don't have to reach into handlers/index.js for them. */
export { dispatchHandler, WORKFLOW_STATES }

/** Result of a single workflow tick. */
export interface WorkflowTickResult {
	readonly state: StateName
	readonly context: DerivedState["context"]
	readonly action: OrchestratorAction | null
}

/** Convenience: drive one workflow tick and unwrap to an
 *  OrchestratorAction. Surfaces intent-not-found and registry-gap
 *  cases as concrete error actions so callers don't have to handle
 *  null tick results. Used by haiku_run_next, haiku_unit_advance_hat,
 *  and tests that drive the workflow end-to-end. */
export function dispatchOrchestratorAction(
	slug: string,
	root?: string,
): OrchestratorAction {
	const tick = runWorkflowTick(slug, root)
	if (tick?.action) return tick.action
	if (!tick) {
		return { action: "error", message: `Intent '${slug}' not found` }
	}
	return {
		action: "error",
		message: `runWorkflowTick produced no action for intent '${slug}' (state: ${tick.state}). Indicates a derive-state output without a registered handler.`,
	}
}

/** Wrap a tick result with a broadcast to the per-intent live-state
 *  pub/sub. Every committed tick fans out an event to any SPA tab
 *  subscribed to this intent's channel so the dashboard can refresh
 *  without polling. Best-effort — the broadcaster is async-fire-and-
 *  forget and never throws. */
function broadcastTick(
	slug: string,
	result: WorkflowTickResult,
): WorkflowTickResult {
	if (result.action) {
		const stageState = result.context?.stageState as
			| Record<string, unknown>
			| undefined
		broadcastIntent(slug, {
			type: "tick_committed",
			action: (result.action as { action?: string }).action ?? "unknown",
			phase:
				typeof stageState?.phase === "string" ? stageState.phase : undefined,
			stage: result.context?.currentStage,
			iteration:
				typeof stageState?.iteration === "number"
					? stageState.iteration
					: undefined,
		})
	}
	return result
}

/** Persist the most recent action's name to `.last_action.json` for
 *  the Stop hook's "should I block?" decision. Best-effort — the
 *  sentinel is out-of-band; a write failure must never abort a tick. */
function writeLastActionSentinel(result: WorkflowTickResult): void {
	if (!result.action) return
	try {
		writeFileSync(
			join(result.context.intentDirPath, ".last_action.json"),
			`${JSON.stringify({ name: result.action.action, at: new Date().toISOString() })}\n`,
		)
	} catch {
		/* best-effort sentinel; never fail the tick */
	}
}

/** Run one workflow tick for an intent. Wrapper that fans out a
 *  `tick_committed` event to any SPA tab subscribed to this intent's
 *  live-state channel and writes the `last_action` sentinel before
 *  returning. Doing both in the wrapper guarantees every tick path —
 *  including early-return gates like `manual_change_assessment` and
 *  `upstream_reconciliation_required` — produces the same out-of-band
 *  state that the Stop hook depends on. Returns null only when the
 *  intent doesn't exist on disk. */
export function runWorkflowTick(
	slug: string,
	root?: string,
): WorkflowTickResult | null {
	const result = runWorkflowTickInner(slug, root)
	if (result) {
		writeLastActionSentinel(result)
		broadcastTick(slug, result)
	}
	return result
}

/** Run one workflow tick for an intent. Steps:
 *
 *   1. Pre-tick consistency repair (may mutate disk, may short-circuit
 *      with a safe_intent_repair action).
 *   2. Derive the current state from disk.
 *   3. Tamper detection (refuse to advance on integrity-violated
 *      intents).
 *   4. Look up the handler for the derived state and run it.
 *
 *  Returns null only when the intent doesn't exist on disk. */
function runWorkflowTickInner(
	slug: string,
	root?: string,
): WorkflowTickResult | null {
	const repair = preTickConsistency(slug, root)

	const derived = deriveCurrentState(slug, root)
	if (!derived) return null

	if (repair) {
		// Deliberate ordering: repair short-circuits BEFORE the
		// tamper check. preTickConsistency only flags structural
		// inconsistencies it produced itself (machine-driven repair
		// of disk state), so its output is trusted. Running tamper
		// detection on an intent that's mid-repair would surface
		// transient state as an integrity violation. The next tick
		// (post-repair) re-runs verifyIntentState on a settled tree.
		return {
			state: "error",
			context: derived.context,
			action: repair,
		}
	}

	const tamperError = verifyIntentState(slug)
	if (tamperError) {
		return {
			state: "error",
			context: derived.context,
			action: { action: "error", message: tamperError },
		}
	}

	// Pre-tick feedback triage gate. Walks every stage from index 0
	// through the current stage looking for open (non-terminal) FBs.
	// Four outcomes (see feedback-triage-gate.ts header):
	//   - any untriaged FB found → emit `feedback_triage`
	//   - every FB triaged but ≥ 1 on an earlier stage → emit `revisited`
	//   - human FB on current stage with null/question resolution →
	//     emit `feedback_dispatch` (prevents elaborate.ts / gate.ts
	//     from re-popping the review UI on unaddressed feedback)
	//   - else → null (fall through to the normal handler chain)
	// Intentionally runs AFTER tamper detection (we never advance on
	// a tampered tree) and BEFORE handler dispatch (so misplaced or
	// untriaged feedback can't be force-fixed by the wrong stage's
	// hats).
	const triageAction = preTickFeedbackGate(derived.context)
	if (triageAction) {
		// Explicit per-action mapping: every action `preTickFeedbackGate`
		// can return is enumerated here. If a future outcome adds a new
		// action type without updating this map, the `default` branch
		// fails loudly via an `error` action rather than silently
		// dropping into the wrong state name. Cheaper than a runtime
		// invariant since the action surface is small + closed.
		const triageState: StateName =
			triageAction.action === "feedback_triage"
				? "feedback_triage"
				: triageAction.action === "feedback_dispatch"
					? "feedback_dispatch"
					: triageAction.action === "revisited"
						? "revisited"
						: triageAction.action === "review_fix"
							? "review_fix"
							: triageAction.action === "escalate"
								? "escalate"
								: "error"
		if (triageState === "error") {
			return {
				state: "error",
				context: derived.context,
				action: {
					action: "error",
					message: `preTickFeedbackGate emitted unmapped action '${triageAction.action}'. run-tick.ts:triageState mapping needs an entry for it.`,
				},
			}
		}
		return {
			state: triageState,
			context: derived.context,
			action: triageAction,
		}
	}

	// Pre-tick drift-detection gate (AC-G13 / ARCHITECTURE.md §2.1).
	// Position in chain: tamper-detection → feedback-triage → drift-detection → dispatch.
	// Only fires when a stage is active (currentStage non-empty) — no surface to
	// enumerate pre-stage or post-final.
	if (derived.context.currentStage) {
		// haikuRoot = dirname(dirname(intentDirPath)) — intentDirPath is
		// <haikuRoot>/intents/<slug>, so two dirname() calls walk up to .haiku.
		const haikuRoot = dirname(dirname(derived.context.intentDirPath))
		const tickCounter =
			typeof derived.context.stageState.iteration === "number"
				? (derived.context.stageState.iteration as number)
				: 0

		const driftResult = runDriftDetectionGate({
			intentDir: derived.context.intentDirPath,
			intentSlug: slug,
			activeStage: derived.context.currentStage,
			haikuRoot,
			tickCounter,
		})

		if (driftResult.error === "baseline_corrupt") {
			return {
				state: "error",
				context: derived.context,
				action: {
					action: "error",
					message:
						driftResult.errorMessage ??
						`Baseline file for stage '${derived.context.currentStage}' is corrupt. Run haiku_repair to re-establish the baseline.`,
				},
			}
		}

		if (driftResult.action === "manual_change_assessment") {
			const intentMode =
				typeof derived.context.intent.mode === "string"
					? (derived.context.intent.mode as string)
					: "continuous"
			const action = buildManualChangeAssessmentAction(
				{
					intentSlug: slug,
					stage: derived.context.currentStage,
					tickCounter,
					mode: intentMode,
				},
				driftResult.findings,
			)
			// Saturation: count of pre-existing drift assessments for this
			// stage. Surfaces assessments-dir growth (per-finding files
			// accumulate forever), which the runbook needs for the "stale
			// assessments backlog" alarm.
			emitTelemetry("haiku.drift.assessments.count", {
				intent_slug: slug,
				stage: derived.context.currentStage,
				tick_iteration: String(tickCounter),
				count: String(
					countAssessmentFiles(
						derived.context.intentDirPath,
						derived.context.currentStage,
					),
				),
			})
			// Persist the active dispatch so haiku_classify_drift can validate
			// tick_id, hydrate findings into the assessment record, and apply
			// the per-finding legal_outcomes filter without trusting agent
			// input for any of those values.
			writeDriftDispatch(
				derived.context.intentDirPath,
				buildDriftDispatch({
					tickId: action.tick_id,
					stage: action.stage,
					tickCounter,
					mode: action.mode,
					findings: action.findings,
					legalOutcomes: action.legal_outcomes,
				}),
			)
			return {
				state: "manual_change_assessment",
				context: derived.context,
				action,
			}
		}
	}

	// Pre-elaboration upstream reconciliation gate. Fires only on the
	// FIRST elaboration of a stage that has at least one completed
	// upstream stage — that's the moment cross-document contradictions
	// in inherited artifacts will silently shape the elaborator's
	// decomposition. Once findings are acknowledged via
	// `haiku_reconciliation_acknowledge`, the stage's state.json
	// records the choice so subsequent ticks fall through.
	const reconAction = maybeUpstreamReconciliationGate(derived.context, root)
	if (reconAction) {
		return {
			state: "upstream_reconciliation_required",
			context: derived.context,
			action: reconAction,
		}
	}

	const action = dispatchHandler(derived.state, derived.context, root)

	// `.last_action.json` is written by the outer `runWorkflowTick`
	// wrapper so every early-return path above also persists the
	// sentinel, not just this main dispatch path.

	return {
		state: derived.state,
		context: derived.context,
		action,
	}
}

/** Pre-elaboration reconciliation gate. Returns an
 *  `upstream_reconciliation_required` action when the corpus has
 *  divergences AND the agent hasn't already acknowledged them, OR
 *  null to fall through to the per-state handler chain. */
function maybeUpstreamReconciliationGate(
	context: DerivedState["context"],
	root: string | undefined,
): OrchestratorAction | null {
	const { slug, studio, intent, currentStage, stageState, intentDirPath } =
		context
	if (!currentStage) return null
	if ((stageState.phase as string) !== "elaborate") return null
	// First elaboration only — re-runs of the elaborate phase don't
	// re-trigger reconciliation. The signal: iterations array length
	// is exactly 1 (the initial entry).
	if (getStageIterationCount(stageState) !== 1) return null
	const tickIteration =
		typeof stageState.iteration === "number"
			? (stageState.iteration as number)
			: 0
	const reconAttrs: Record<string, string> = {
		intent_slug: slug,
		stage: currentStage,
		tick_iteration: String(tickIteration),
	}
	// Skip if already acknowledged on this stage. The acknowledge tool
	// stamps `upstream_reconciliation_acknowledged: true` here.
	if (stageState.upstream_reconciliation_acknowledged === true) {
		emitTelemetry("haiku.reconciliation.fingerprint.skipped", {
			...reconAttrs,
			reason: "acknowledged",
		})
		return null
	}

	const studioStages = resolveIntentStages(intent, studio)
	const myIdx = studioStages.indexOf(currentStage)
	if (myIdx <= 0) return null

	// Walk prior stages and pick the ones with a completed marker.
	const priorStages: string[] = []
	for (let i = 0; i < myIdx; i++) {
		const stage = studioStages[i]
		const stateFile = root
			? join(root, "intents", slug, "stages", stage, "state.json")
			: join(intentDirPath, "stages", stage, "state.json")
		if (!existsSync(stateFile)) continue
		try {
			const ss = readJson(stateFile) as Record<string, unknown>
			if ((ss.status as string) === "completed") priorStages.push(stage)
		} catch {
			/* unreadable state.json — skip */
		}
	}
	if (priorStages.length === 0) return null

	// Fingerprint short-circuit. Compare a SHA256 of the upstream corpus
	// against the value last stamped on this stage's state.json.
	//
	//   - stored is null/undefined → silently establish: stamp the current
	//     fingerprint and skip the detector pass entirely. This is the
	//     migration / first-run path: existing intents that predate the
	//     reconciliation gate (or this stage's first elaborate) will not
	//     be flooded with findings about pre-existing upstream drift.
	//   - stored equals current → corpus unchanged since last successful
	//     scan or acknowledgment, skip the detector pass.
	//   - stored differs → fall through to detectors below; if they emit
	//     findings, fire the gate. If they emit none, stamp the new
	//     fingerprint silently.
	const fpResult = computeCorpusFingerprintInstrumented(slug, priorStages, root)
	const currentFingerprint = fpResult.fingerprint
	emitTelemetry("haiku.reconciliation.fingerprint.duration_ms", {
		...reconAttrs,
		duration_ms: String(fpResult.durationMs),
	})
	emitTelemetry("haiku.reconciliation.corpus.bytes", {
		...reconAttrs,
		bytes: String(fpResult.corpusBytes),
	})

	const stageStateFile = root
		? join(root, "intents", slug, "stages", currentStage, "state.json")
		: join(intentDirPath, "stages", currentStage, "state.json")
	const storedFingerprint =
		typeof stageState.upstream_reconciliation_fingerprint === "string"
			? stageState.upstream_reconciliation_fingerprint
			: null

	const stampFingerprint = (fp: string | null): void => {
		if (fp === null) return
		// Mutate the in-memory stageState first so downstream handlers
		// (e.g. the elaborate handler, which writes stageState back to
		// state.json) carry the fingerprint forward instead of dropping
		// it on a subsequent serialization. The on-disk write is a
		// belt-and-suspenders second step in case the tick short-circuits
		// before any other writer flushes state.json.
		stageState.upstream_reconciliation_fingerprint = fp
		try {
			const ss = readJson(stageStateFile) as Record<string, unknown>
			ss.upstream_reconciliation_fingerprint = fp
			writeJson(stageStateFile, ss)
		} catch (err) {
			// Errors signal — emit BEFORE rethrow so the failure is observable
			// even when the rethrow gets swallowed at a higher layer. The
			// rethrow promotes a previously-silent failure (which would let
			// the tick pretend the gate was acknowledged on the next pass)
			// into a hard error the runbook can alarm on.
			emitTelemetry("haiku.reconciliation.fingerprint.write_failed", {
				...reconAttrs,
				error: err instanceof Error ? err.message : String(err),
			})
			throw err
		}
	}

	if (storedFingerprint === null) {
		// Silent first-time establish — no detectors run.
		emitTelemetry("haiku.reconciliation.fingerprint.established", {
			...reconAttrs,
		})
		stampFingerprint(currentFingerprint)
		return null
	}
	if (currentFingerprint !== null && storedFingerprint === currentFingerprint) {
		// Steady-state happy path — corpus unchanged since last clean scan.
		emitTelemetry("haiku.reconciliation.fingerprint.matched", {
			...reconAttrs,
		})
		return null
	}

	// Fingerprint differs → run the detectors.
	emitTelemetry("haiku.reconciliation.fingerprint.drifted", {
		...reconAttrs,
	})
	const result = checkUpstreamReconciliation(slug, priorStages, root)
	if (!result || result.findings.length === 0) {
		// Corpus changed but is now consistent — silently update the
		// fingerprint so future ticks see the new clean state.
		stampFingerprint(currentFingerprint)
		return null
	}
	emitTelemetry("haiku.reconciliation.findings.emitted", {
		...reconAttrs,
		count: String(result.findings.length),
	})

	const body = renderReconciliationPrompt(slug, currentStage, result.findings)
	let promptFile: string | null = null
	try {
		const { path } = writeActionPromptFile({
			action: "upstream_reconciliation_required",
			intent: slug,
			stage: currentStage,
			content: body,
			tickHint: `recon-${Date.now()}`,
		})
		promptFile = path
	} catch (err) {
		console.error(
			`[haiku] reconciliation prompt-file write failed for ${slug}/${currentStage}: ${err instanceof Error ? err.message : String(err)}. Falling back to inline message.`,
		)
	}

	return {
		action: "upstream_reconciliation_required",
		intent: slug,
		stage: currentStage,
		findings: result.findings,
		...(promptFile
			? {
					prompt_file: promptFile,
					message: `Read \`${promptFile}\` and execute its instructions exactly. ${result.findings.length} upstream-artifact divergence(s) require reconciliation before this stage can elaborate.`,
				}
			: {
					message: `Detected ${result.findings.length} upstream-artifact divergence(s) before first elaboration of stage '${currentStage}'. Reconcile the upstream artifacts (and re-run \`haiku_run_next\`), or call \`haiku_reconciliation_acknowledge\` to record the decision and proceed.`,
				}),
	}
}

/** Render a markdown prompt body for the reconciliation gate. */
function renderReconciliationPrompt(
	slug: string,
	stage: string,
	findings: readonly ReconciliationFinding[],
): string {
	const sections: string[] = []
	sections.push(`## Upstream Reconciliation Required: ${stage}`)
	sections.push(
		[
			`Before elaborating stage **${stage}**, the workflow engine detected **${findings.length} cross-document divergence(s)** in the upstream-artifact corpus. The elaborator inherits these contradictions silently — fix them now or acknowledge the choice on record.`,
			"",
			"Two paths:",
			"",
			"1. **Reconcile.** Edit the upstream artifacts to use one canonical name / status / field. Then re-run `haiku_run_next` — the gate re-checks and falls through if the corpus is consistent.",
			'2. **Acknowledge.** If the divergence is intentional (e.g. the artifacts describe different surfaces that genuinely need different names), call `haiku_reconciliation_acknowledge { intent: "' +
				slug +
				'", stage: "' +
				stage +
				'", rationale: "<why this divergence is correct>" }`. The decision lands in the stage\'s `decision_log` for audit and the gate falls through on the next tick.',
		].join("\n"),
	)

	for (const f of findings) {
		const lines: string[] = []
		lines.push(`### ${f.kind} divergence: ${f.concept}`)
		lines.push("")
		lines.push(f.message)
		lines.push("")
		lines.push("**Occurrences:**")
		for (const o of f.occurrences.slice(0, 12)) {
			lines.push(`- \`${o.file}:${o.line}\` — \`${o.name}\` — _${o.excerpt}_`)
		}
		if (f.occurrences.length > 12) {
			lines.push(`- … ${f.occurrences.length - 12} more`)
		}
		sections.push(lines.join("\n"))
	}
	return sections.join("\n\n")
}

/** Count `.json` files under `<intentDir>/stages/<stage>/drift-assessments/`.
 *  Returns 0 when the directory doesn't exist (no assessments yet) or any
 *  read error occurs — telemetry is best-effort by contract, never blocking. */
function countAssessmentFiles(intentDir: string, stage: string): number {
	const dir = join(intentDir, "stages", stage, "drift-assessments")
	if (!existsSync(dir)) return 0
	try {
		return readdirSync(dir).filter((f) => f.endsWith(".json")).length
	} catch {
		return 0
	}
}

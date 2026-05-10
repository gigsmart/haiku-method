// orchestrator/workflow/side-effects.ts — All workflow-engine state
// mutators. Every function here writes disk (intent.md frontmatter,
// per-stage sidecar JSONL logs like iterations.jsonl), runs git
// operations (branch create / merge / reap), or both. State.json is
// dead in v4 — stage status / phase / gate outcome are derived on
// demand from per-unit FM and branch-merge state via
// `derived-stage-state.ts`. The workflow handlers in `handlers/`
// call the functions here after deciding what action to emit.
//
// The split from emission keeps the contract clean: handlers are
// (mostly) pure functions that compute an OrchestratorAction from
// disk state; side-effects are the explicit mutation boundary that
// transitions disk state between ticks.
//
// Functions:
//   - workflowStartStage              — enter a stage (branch isolation,
//     prev-stage merge+reap, Guard 3 cleanup, first iteration log
//     entry, intent.md active_stage)
//   - workflowAdvancePhase            — telemetry-only no-op (v4 derives
//     phase from per-unit FM)
//   - workflowCompleteStage           — close iteration log + drift
//     marker cleanup (status/completed_at/gate_outcome are derived)
//   - workflowAdvanceStage            — atomic complete+enter-next
//   - workflowGateAsk                 — telemetry-only no-op (v4 derives
//     phase=gate from per-unit approvals state)
//   - workflowEnterIntentCompletionReview — set intent.phase = awaiting...
//   - workflowFinalizeStageIntoIntentMain — final-stage merge+reap+switch
//   - completeOrReviewIntent          — terminal completion routing
//     (studio-level review opt-in vs immediate intent_complete)
//   - workflowIntentComplete          — mark intent completed + reap branches

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import {
	branchExists,
	cleanupIntentWorktrees,
	cleanupOrphanedStageBranches,
	createIntentBranch,
	createStageBranch,
	deleteStageBranch,
	ensureOnIntentMain,
	ensureOnStageBranch,
	finalizeIntentBranches,
	isBranchMerged,
	isOnStageBranch,
	markPullRequestReady,
	mergeStageBranchForward,
	mergeStageBranchIntoMain,
	pushStageBranch,
} from "../../git-worktree.js"
import { withIntentMainLock } from "../../locks.js"
import type { OrchestratorAction } from "../../orchestrator.js"
import { resolveIntentStages } from "../../orchestrator.js"
import { sealIntentState } from "../../state-integrity.js"
import {
	appendStageIteration,
	closeCurrentStageIteration,
	gitCommitState,
	intentDir,
	isGitRepo,
	parseFrontmatter,
	setFrontmatterField,
	timestamp,
} from "../../state-tools.js"
import { emitTelemetry } from "../../telemetry.js"
import { clearMarkersForRevisitSync } from "./baseline-clear-marker.js"
import { deriveStageState } from "./derived-stage-state.js"

/** Best-effort push of the stage branch to origin after an engine
 *  state mutation. Swallows everything: never throws, never blocks the
 *  workflow tick. The push itself is gated on no-git / no-origin /
 *  HAIKU_NO_AUTO_PUSH=1 inside `pushStageBranch`. Logs to console.error
 *  on real push failures so operators can see why their stage branch
 *  isn't on origin. */
function syncStageToOrigin(slug: string, stage: string): void {
	if (!stage) return
	try {
		const result = pushStageBranch(slug, stage)
		if (!result.ok && result.error) {
			console.error(
				`[haiku] auto-push of haiku/${slug}/${stage} failed: ${result.error}`,
			)
		}
	} catch (err) {
		console.error(
			`[haiku] auto-push of haiku/${slug}/${stage} threw: ${err instanceof Error ? err.message : String(err)}`,
		)
	}
}

function readFrontmatter(filePath: string): Record<string, unknown> {
	if (!existsSync(filePath)) return {}
	const raw = readFileSync(filePath, "utf8")
	const { data } = parseFrontmatter(raw)
	return data
}

/** Find the previous completed stage for branch chaining. */
function findPreviousStage(slug: string, stage: string): string | undefined {
	const intentFile = join(intentDir(slug), "intent.md")
	const intent = readFrontmatter(intentFile)
	const studio = (intent.studio as string) || ""
	const studioStages = resolveIntentStages(intent, studio)
	const idx = studioStages.indexOf(stage)
	return idx > 0 ? studioStages[idx - 1] : undefined
}

/** Enter a stage. Branch isolation first; if it fails (merge conflict)
 *  no state is mutated. Unified topology: every stage runs on its own
 *  branch `haiku/<slug>/<stage>`, and `haiku/<slug>/main` is the
 *  consolidation hub. Stage advance A → B:
 *    1. Ensure main exists.
 *    2. Guard 3 (pre-stage cleanup): delete any merged stage branches
 *       that shouldn't still exist — e.g. a prior stage whose work is
 *       on main but whose branch lingered because an earlier session
 *       crashed.
 *    3. If prev stage branch A exists and isn't merged, merge A → main.
 *    4. Reap A's branch (commits now live on main). Delete remote too.
 *    5. Checkout B: if B's branch already exists (go-back), merge main
 *       forward into it; otherwise create B from main.
 *    6. Open the first iteration entry on the per-stage iterations.jsonl
 *       log (status="active" + phase="elaborate" are derived from this
 *       on the next tick — there is no state.json write).
 *    7. Guard 3 (post-stage cleanup): scan again for orphans that
 *       slipped through the merge-reap cycle.
 *
 *  The intent's `mode` field controls iteration cadence and review
 *  rules but not branching topology — both modes branch per-stage. */
export function workflowStartStage(slug: string, stage: string): void {
	const intentFile = join(intentDir(slug), "intent.md")

	createIntentBranch(slug)
	cleanupOrphanedStageBranches(slug)

	// Self-heal: commit any uncommitted intent files BEFORE we attempt
	// the stage-branch checkout below. This catches the dirty-tree
	// refusal pattern (Tara hit it on 2026-05-05) where intent_create
	// or select_studio's silent best-effort gitCommitState failed,
	// leaving intent.md / knowledge/CONVERSATION-CONTEXT.md uncommitted.
	// `git checkout -b <stageBranch> <main>` then refuses with "Your
	// local changes to the following files would be overwritten by
	// checkout."
	//
	// We try once to commit pending intent state. If the commit
	// itself fails (pre-commit hook error, etc.), we fall through —
	// the checkout downstream will surface the real error to the
	// agent rather than silently writing stage state.json on top of
	// an unstable foundation.
	gitCommitState(`haiku: pre-stage cleanup for ${slug}/${stage}`)
	syncStageToOrigin(slug, stage)

	const prevStage = findPreviousStage(slug, stage)
	const prevStageBranch = prevStage ? `haiku/${slug}/${prevStage}` : ""
	if (
		prevStage &&
		branchExists(prevStageBranch) &&
		!isBranchMerged(prevStageBranch, `haiku/${slug}/main`)
	) {
		// Lock the stage→intent-main merge. Two concurrent ticks
		// targeting the same intent (autopilot retry overlapping a
		// manual run, or a parallel CI runner) would otherwise race on
		// the merge commit.
		const mergeResult = withIntentMainLock(slug, () =>
			mergeStageBranchIntoMain(slug, prevStage),
		)
		if (!mergeResult.success) {
			throw new Error(
				`Merge of completed stage '${prevStage}' into main failed: ${mergeResult.message}. Resolve conflicts on 'haiku/${slug}/main' manually, then retry.`,
			)
		}
	}

	if (prevStage && branchExists(prevStageBranch)) {
		deleteStageBranch(slug, prevStage)
		try {
			execFileSync("git", ["push", "origin", "--delete", prevStageBranch], {
				stdio: "pipe",
			})
		} catch {
			/* non-fatal */
		}
	}

	// v4: no state.json write on stage entry. The previous Guard-1
	// pos-0 reset is replaced by the absence of the file — the v4
	// cursor + `deriveStageState` derive `status: "active"`,
	// `phase: "elaborate"` from the empty units/ directory + the
	// stage branch existing. Per ARCHITECTURE.md / cursor.ts header:
	// "no state.json anywhere."

	if (!isOnStageBranch(slug, stage)) {
		const stageBranch = `haiku/${slug}/${stage}`
		if (branchExists(stageBranch) && prevStage) {
			const mergeResult = mergeStageBranchForward(slug, "main", stage)
			if (!mergeResult.success) {
				throw new Error(
					`Merge forward from main to '${stage}' failed: ${mergeResult.message}. Resolve conflicts on branch '${stageBranch}' manually, then retry.`,
				)
			}
		} else {
			createStageBranch(slug, stage)
		}
	}

	appendStageIteration(slug, stage, { trigger: "initial" })

	if (existsSync(intentFile)) {
		setFrontmatterField(intentFile, "active_stage", stage)
	}

	cleanupOrphanedStageBranches(slug)

	emitTelemetry("haiku.stage.started", { intent: slug, stage })
	gitCommitState(`haiku: start stage ${stage}`)
	syncStageToOrigin(slug, stage)
	sealIntentState(slug)
}

export function workflowAdvancePhase(
	slug: string,
	stage: string,
	toPhase: string,
): void {
	// v4: phase is derived from per-unit FM (verifier-slot completion
	// across hat sequences). The engine no longer stamps `phase:` on
	// state.json — `deriveStageState` reads the truth from disk on
	// every tick. This call survives only as a telemetry hook so the
	// "phase changed" event is still observable; the state mutation
	// it used to perform is now the no-op the v4 model makes it.
	emitTelemetry("haiku.stage.phase", { intent: slug, stage, phase: toPhase })
	sealIntentState(slug)
}

export function workflowCompleteStage(
	slug: string,
	stage: string,
	gateOutcome: string,
): void {
	// v4: status / completed_at / gate_outcome are derived from
	// branch-merge state + per-unit approvals. No state.json mutation.
	// `closeCurrentStageIteration` still runs to maintain the per-stage
	// iteration log (loop detection, cap checking) — that log is the
	// next piece slated for migration to a JSONL disk artifact.
	closeCurrentStageIteration(
		slug,
		stage,
		gateOutcome === "advanced" ? "advanced" : "rejected",
	)
	emitTelemetry("haiku.stage.completed", {
		intent: slug,
		stage,
		gate_outcome: gateOutcome,
	})
	gitCommitState(`haiku: complete stage ${stage}`)
	syncStageToOrigin(slug, stage)
	sealIntentState(slug)

	// Drift-detection lifecycle hook (unit-09): when a stage completes
	// with `advanced` outcome, walk drift-markers.json for any open
	// trigger-revisit marker linked to this stage and clear each. Per
	// AC-TR2 / DATA-CONTRACTS.md §3.6, "revisit complete" means the
	// targeted stage re-passes its gate; that is exactly the path
	// reaching here when `gateOutcome === "advanced"`. Best-effort:
	// failures inside the clear path do not roll back the stage advance
	// (the marker store is a suppression optimisation per ARCHITECTURE.md
	// §8.4).
	if (gateOutcome === "advanced") {
		try {
			clearMarkersForRevisitSync(intentDir(slug), stage, {
				intentSlug: slug,
			})
		} catch (err) {
			emitTelemetry("haiku.drift.clear_marker_failed", {
				intent: slug,
				revisit_target_stage: stage,
				trigger: "revisit-complete",
				error: String((err as Error)?.message ?? err),
			})
		}
	}
}

/** Atomic complete + enter-next. Avoids leaving dirty state on the
 *  completed branch between ticks (which would otherwise force the
 *  next tick's `ensureOnStageBranch` guard onto intent main via an
 *  auto-commit detour, stranding the advance). */
export function workflowAdvanceStage(
	slug: string,
	currentStage: string,
	nextStage: string,
): void {
	workflowCompleteStage(slug, currentStage, "advanced")

	const intentFile = join(intentDir(slug), "intent.md")
	if (existsSync(intentFile)) {
		setFrontmatterField(intentFile, "active_stage", nextStage)
	}

	workflowStartStage(slug, nextStage)

	// Reseal: workflowCompleteStage sealed against active_stage=currentStage,
	// then workflowStartStage rewrote frontmatter again; the prior checksums are
	// stale and verifyIntentState() would false-positive as tampering.
	sealIntentState(slug)
}

export function workflowGateAsk(slug: string, stage: string): void {
	// v4: phase=gate / gate_entered_at are derived from per-unit
	// approvals state (all reviews signed, awaiting approvals).
	// `gate_entered_at` doesn't have a derived equivalent yet — it's
	// an "I just entered the gate phase" timestamp. Future work: stamp
	// on a per-stage gate-session marker file. For now, telemetry
	// captures the transition and that's enough for the engine.
	emitTelemetry("haiku.gate.entered", { intent: slug, stage })
	sealIntentState(slug)
}

/** Enter the intent-completion-review phase. Stage work is done; the
 *  intent awaits a terminal review before completion. This is the
 *  bookend that prevents a stage-level auto-gate from silently
 *  completing the whole intent. Distinct from the existing
 *  `intent_review` gate_context which fires at the FIRST stage's
 *  elaborate→execute gate to review initial specs; this one fires at
 *  the END after the final stage's gate passes. */
function workflowEnterIntentCompletionReview(slug: string): void {
	const intentFile = join(intentDir(slug), "intent.md")
	if (!existsSync(intentFile)) return
	setFrontmatterField(intentFile, "phase", "awaiting_completion_review")
	setFrontmatterField(intentFile, "completion_review_entered_at", timestamp())
	emitTelemetry("haiku.intent.completion_review_entered", { intent: slug })
	sealIntentState(slug)
}

/** Merge the just-completed final stage's branch into intent main,
 *  reap the stage branch (local + remote), and switch the current
 *  checkout to intent main.
 *
 *  Mirror of the prev-stage merge+reap that workflowStartStage runs
 *  on every non-final transition. There's no next stage to trigger
 *  that merge when the final stage completes — without this, the
 *  primary worktree stays parked on the dead stage branch, intent
 *  main misses the final stage's commits, and intent-completion work
 *  runs on stale state.
 *
 *  Best-effort: merge conflicts don't throw. The completion-review
 *  phase still opens so a human can diagnose + reconcile manually
 *  rather than blocking the intent forever on an unresolved merge. */
function workflowFinalizeStageIntoIntentMain(
	slug: string,
	stage: string,
): void {
	if (!isGitRepo()) return
	if (!stage) return
	const stageBranch = `haiku/${slug}/${stage}`
	const intentMain = `haiku/${slug}/main`

	if (branchExists(stageBranch) && !isBranchMerged(stageBranch, intentMain)) {
		const mergeResult = withIntentMainLock(slug, () =>
			mergeStageBranchIntoMain(slug, stage),
		)
		if (!mergeResult.success) {
			console.error(
				`[workflowFinalizeStageIntoIntentMain] merge ${stageBranch}→${intentMain} failed: ${mergeResult.message}.\nIntent-completion review will still open; resolve the merge manually before approving the final gate.\nRecovery paths for the stage branch if the reap below loses it before you can merge:\n  - \`git reflog show ${stageBranch}\` — the branch's tip is still in reflog until gc runs (default 90 days).\n  - \`origin/${stageBranch}\` — if the branch was pushed, the remote tracking ref still has the tip.\n  - \`git fsck --lost-found\` — catches dangling commits even after the branch ref is deleted.`,
			)
		}
	}

	if (branchExists(stageBranch)) {
		deleteStageBranch(slug, stage)
		try {
			execFileSync("git", ["push", "origin", "--delete", stageBranch], {
				stdio: "pipe",
			})
		} catch {
			/* non-fatal: offline, no push perms, or branch already gone */
		}
	}

	ensureOnStageBranch(slug, undefined)
}

/** Guard: walk every stage declared in `resolveIntentStages(intent, studio)`
 *  and return the names of any whose derived status isn't `"completed"`.
 *
 *  Called from `completeOrReviewIntent` (pre-review-entry and pre-immediate-
 *  complete paths) and from the human-approval path in `haiku_run_next.ts`
 *  (before `workflowIntentComplete`). If the engine arrives at the completion
 *  gate while upstream stages are still pending — e.g., the user manually
 *  reopened a completed intent or an unusual topology left gaps — this catches
 *  it before sealing and routes back to the incomplete stage.
 *
 *  v4 derivation: `deriveStageState` reports `status: "completed"` when the
 *  stage's units appear on intent main's tree (= the stage merged forward).
 *  No stage `state.json` read — the file is migrator-deleted in v4 and the
 *  workflow engine no longer recreates it.
 *
 *  Composite intents (studio === "composite") deliberately resolve to an empty
 *  stages list here — there is no `plugin/studios/composite/STUDIO.md` because
 *  composite topology is per-intent (`intent.composite`). The composite handler
 *  performs its own completion check (`allComplete`) over `compositeState`
 *  before calling `completeOrReviewIntent`, so the no-op is safe and intentional
 *  rather than a missing guard. */
export function findIncompleteStages(
	slug: string,
	studio: string,
	root?: string,
): string[] {
	const iDir = root ? join(root, "intents", slug) : intentDir(slug)
	const intentFile = join(iDir, "intent.md")
	const intent = existsSync(intentFile) ? readFrontmatter(intentFile) : {}
	const stages = resolveIntentStages(intent, studio)
	const intentMode =
		typeof intent.mode === "string" && (intent.mode as string).length > 0
			? (intent.mode as string)
			: "continuous"
	const incomplete: string[] = []
	for (const stage of stages) {
		const derived = deriveStageState({
			slug,
			studio,
			stage,
			intentDir: iDir,
			intentMode,
		})
		if (derived.status !== "completed") incomplete.push(stage)
	}
	return incomplete
}

/** Roll back an intent that's stuck in completion-review phase with
 *  incomplete stages still on disk. Called from `completeOrReviewIntent`
 *  (when the guard fails on a fresh approach) and from `pre-tick`
 *  (when a stale completion-review marker is detected before any handler
 *  runs). Idempotent — calling it on a healthy intent is a no-op.
 *
 *  Resets every workflow-tracked completion field plus `status` and
 *  `active_stage`, then re-seals the integrity checksum. The first
 *  incomplete stage becomes the new `active_stage` so the next tick
 *  routes through `start_stage` instead of looping back into
 *  `awaiting_completion_review`. */
export function rewindFromCompletionReview(
	slug: string,
	firstIncomplete: string,
	root?: string,
): void {
	const iDir = root ? join(root, "intents", slug) : intentDir(slug)
	const intentFile = join(iDir, "intent.md")
	if (!existsSync(intentFile)) return
	setFrontmatterField(intentFile, "status", "active")
	setFrontmatterField(intentFile, "active_stage", firstIncomplete)
	setFrontmatterField(intentFile, "phase", "")
	setFrontmatterField(intentFile, "completed_at", "")
	setFrontmatterField(intentFile, "completion_review_entered_at", "")
	setFrontmatterField(intentFile, "completion_review_dispatched", false)
	setFrontmatterField(intentFile, "completion_review_skipped", false)
	setFrontmatterField(intentFile, "completion_review_dispatched_at", "")
	// sealIntentState always reads from findHaikuRoot() — no-op under
	// test fixtures rooted in tmpdir. That's fine; the integrity seal
	// only matters for hookless harnesses in production deployments.
	sealIntentState(slug)
}

/** Shared completion path used by every gate-pass site that used to
 *  call workflowIntentComplete + return intent_complete directly.
 *  Returns the correct action for the current opt-in/opt-out state:
 *    - intent_completion_review = false → fire intent_complete
 *    - otherwise → enter completion-review phase, open a gate_review
 *
 *  Pre-seals guard: verifies that every stage declared in
 *  `resolveIntentStages(intent, studio)` has a completed `state.json`.
 *  If any stage is missing or non-completed, returns an error action
 *  pointing at the first incomplete stage instead of sealing the intent.
 *  Also rewinds the completion-review marker fields so the next tick
 *  routes through `start_stage` for the first incomplete stage instead
 *  of looping back into `awaiting_completion_review`.
 *
 *  This decouples stage-gate approval from intent completion. Stages
 *  approving (auto or otherwise) must NEVER by themselves mark an
 *  intent completed — the terminal review is a separate, explicit
 *  step. */
export function completeOrReviewIntent(
	slug: string,
	studio: string,
	sourceMessage: string,
): OrchestratorAction {
	// Pre-seal guard: all declared stages must be completed before
	// we enter the completion review or seal the intent. A gap means
	// the engine arrived at the completion gate while upstream stages
	// are still pending — most likely a manually reopened completed
	// intent or a topology inconsistency. Refuse to seal; route back
	// to the first incomplete stage so the user sees what's missing.
	const incompleteStages = findIncompleteStages(slug, studio)
	if (incompleteStages.length > 0) {
		rewindFromCompletionReview(slug, incompleteStages[0])
		emitTelemetry("haiku.intent.completion_guard_failed", {
			intent: slug,
			studio,
			incomplete_stages: incompleteStages.join(","),
		})
		return {
			action: "error",
			intent: slug,
			message:
				`Cannot complete intent '${slug}': ${incompleteStages.length} stage(s) are not yet completed: ` +
				`[${incompleteStages.join(", ")}]. ` +
				`Reset active_stage to '${incompleteStages[0]}' and cleared completion-review markers. ` +
				`Call \`haiku_run_next { intent: "${slug}" }\` to resume.`,
		}
	}

	const intentFile = join(intentDir(slug), "intent.md")
	const intent = existsSync(intentFile) ? readFrontmatter(intentFile) : {}
	// Opt-OUT default: studio-level intent-completion review is on.
	// Authors disable per-intent with intent_completion_review: false.
	const reviewOnCompletion = intent.intent_completion_review !== false

	const finalStage =
		typeof intent.active_stage === "string"
			? (intent.active_stage as string)
			: ""
	if (finalStage) {
		workflowFinalizeStageIntoIntentMain(slug, finalStage)
	}

	if (!reviewOnCompletion) {
		workflowIntentComplete(slug)
		return {
			action: "intent_complete",
			intent: slug,
			studio,
			message: sourceMessage,
		}
	}
	workflowEnterIntentCompletionReview(slug)
	return {
		action: "advance_phase",
		intent: slug,
		stage: null,
		from_phase: (intent.phase as string) || "active",
		to_phase: "awaiting_completion_review",
		message: `${sourceMessage} All stages passed — entering intent-completion review phase. Call \`haiku_run_next { intent: "${slug}" }\` to dispatch studio-level review agents (if any) and the final gate.`,
	}
}

/** Mark intent completed and fan the last stage (and any unmerged
 *  prior stages) into intent main, checkout intent main, reap every
 *  merged stage branch so the intent lands on a single clean ref. */
export function workflowIntentComplete(slug: string): void {
	const intentFile = join(intentDir(slug), "intent.md")
	if (existsSync(intentFile)) {
		// If we opened a draft PR at intent_create time, flip it to
		// ready-for-review now (just before the user's merge action).
		// Best-effort: failures are logged but don't block completion.
		// The user's merge IS the explicit close signal — if `gh pr ready`
		// fails because the PR was force-pushed/closed externally, the
		// merge still proceeds.
		const fmRaw = readFrontmatter(intentFile)
		const draftUrl = fmRaw.draft_pr_url as string | undefined
		const draftStatus = fmRaw.draft_pr_status as string | undefined
		if (draftUrl && draftStatus === "draft") {
			const ready = markPullRequestReady(draftUrl)
			if (ready.ok) {
				setFrontmatterField(intentFile, "draft_pr_status", "ready")
				setFrontmatterField(intentFile, "draft_pr_ready_at", timestamp())
			} else {
				console.error(
					`[haiku] mark-ready of ${draftUrl} failed: ${ready.error}`,
				)
				setFrontmatterField(intentFile, "draft_pr_status", "failed")
			}
		}
		setFrontmatterField(intentFile, "status", "completed")
		setFrontmatterField(intentFile, "completed_at", timestamp())
	}
	emitTelemetry("haiku.intent.completed", { intent: slug })
	gitCommitState(`haiku: complete intent ${slug}`)

	const intent = existsSync(intentFile) ? readFrontmatter(intentFile) : {}
	const studio = (intent.studio as string) || ""
	const stages = studio ? resolveIntentStages(intent, studio) : []
	if (stages.length > 0) {
		const finalized = finalizeIntentBranches(slug, stages)
		if (!finalized.success) {
			console.error(
				`[haiku] finalizeIntentBranches warning for ${slug}: ${finalized.message}`,
			)
		}
	}
	cleanupIntentWorktrees(slug)
	sealIntentState(slug)
	// Belt-and-suspenders: finalizeIntentBranches above does the
	// intent-main checkout, but if a stage-merge step short-circuited
	// or a caller hits this path with main already merged, re-assert
	// the working tree position so the agent always lands on the
	// intent's hub branch on intent_complete.
	ensureOnIntentMain(slug)
}

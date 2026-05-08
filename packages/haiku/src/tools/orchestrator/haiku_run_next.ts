// tools/orchestrator/haiku_run_next.ts — The workflow driver. Sole tool
// agents call to advance the H·AI·K·U lifecycle.
//
// Flow per call:
//   1. Auto-resolve `intent` when omitted (current branch → sole
//      active intent → error).
//   2. Validate we're on the intent branch.
//   3. Stage-branch enforcement (align checkout to active stage so
//      writes land on the right branch).
//   4. Optional external_review_url write (records URL on the
//      blocked stage's state.json for approval polling).
//   5. Drive `runNext(slug)` — the canonical workflow tick.
//   6. Telemetry + session log.
//   7. Per-action processing:
//      - external_review_requested: append the "where did you submit"
//        prompt to the message.
//      - gate_review: open the review UI, block, process the
//        decision (approved → workflowAdvancePhase/Stage/Complete or
//        completeOrReviewIntent; external_review → mark blocked;
//        revisit_action short-circuit; otherwise persist feedback
//        files and route by gate context).
//      - safe_intent_repair: try the embedded repair agent; if it
//        succeeds, re-run runNext for the real next action.
//      - everything else: enrich + render and return.
//
// Output shape: JSON action body + "---" separator + per-action
// prompt instructions (rendered by buildRunInstructions, harness-
// adapted by adaptInstructions).

import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
	ensureOnStageBranch,
	fetchOrigin,
	pushStageBranch,
} from "../../git-worktree.js"
import { adaptInstructions } from "../../harness-instructions.js"
import { firstUnmergedStage } from "../../orchestrator/workflow/cursor.js"
import { runWorkflowTick } from "../../orchestrator/workflow/run-tick.js"
import type { OrchestratorAction as OrchestratorActionType } from "../../orchestrator.js"
import {
	buildGuardResponse,
	buildRunInstructions,
	enrichActionWithPreview,
	getPrepareGateReview,
	type OrchestratorAction,
} from "../../orchestrator.js"

/** Single-source dispatch: one workflow tick → one action. Handles
 *  the intent-not-found and registry-gap cases inline. */
function dispatchOrchestratorAction(slug: string): OrchestratorActionType {
	const tick = runWorkflowTick(slug)
	if (tick?.action) return tick.action
	if (!tick) {
		return { action: "error", message: `Intent '${slug}' not found` }
	}
	return {
		action: "error",
		message: `runWorkflowTick produced no action for intent '${slug}' (track: ${tick.position.track}). The cursor is mid-wave or sealed — wait for outstanding subagents and retick.`,
	}
}

/**
 * Extract the orchestrator action name from a haiku_await_gate
 * response. The await tool renders its result as `<json>\n\n---\n\n<instructions>`
 * — the JSON head carries `action: "<name>"`. Used by haiku_run_next's
 * inline gate-review path to decide whether to re-tick (advance cases)
 * or surface the await response directly (terminal / changes-requested
 * / external-review cases).
 */
function extractActionFromAwaitResponse(response: {
	content?: Array<{ type: string; text?: string }>
}): string | null {
	for (const block of response.content ?? []) {
		if (block.type !== "text" || typeof block.text !== "string") continue
		const headEnd = block.text.indexOf("\n\n---")
		const head = headEnd >= 0 ? block.text.slice(0, headEnd) : block.text
		const trimmed = head.trim()
		if (!trimmed.startsWith("{")) continue
		try {
			const parsed = JSON.parse(trimmed) as { action?: unknown }
			if (typeof parsed.action === "string") return parsed.action
		} catch {
			/* not JSON — keep scanning */
		}
	}
	return null
}

/**
 * Run the SPA picker for studio / mode / stage selection in response
 * to a tick that emitted `select_*`. Dispatches by name to the matching
 * orchestrator tool handler — same code path the user-explicit
 * `/haiku:change-mode` skill takes, but invoked engine-side so the
 * agent never sees the prompt-to-call. The handler does the picker +
 * frontmatter write + telemetry; we discard its rendered response and
 * just signal "ok / not ok" back to the dispatch loop.
 */
async function runSelectionPicker(
	actionName: string,
	slug: string,
	signal?: AbortSignal,
): Promise<{ ok: true } | { ok: false; message: string }> {
	const { orchestratorToolHandlers } = await import("./index.js")
	const tool = orchestratorToolHandlers.get(actionName as string)
	if (!tool) {
		return {
			ok: false,
			message: `Engine bug: no handler registered for selection action '${actionName}'.`,
		}
	}
	try {
		const result = await tool.handle({ intent: slug }, signal)
		// Selection tools return text; the side effect (write to
		// intent.md) is what matters. Surface their isError status as
		// a hard failure so the agent sees a clean stop instead of
		// looping forever on the same select_* tick.
		if (result.isError) {
			const text =
				result.content
					?.map((c) => (c.type === "text" ? c.text : ""))
					.join("\n")
					.trim() || `Picker failed for ${actionName}.`
			return { ok: false, message: text }
		}
		return { ok: true }
	} catch (err) {
		return {
			ok: false,
			message: `Picker for ${actionName} threw: ${err instanceof Error ? err.message : String(err)}`,
		}
	}
}

import { reportError } from "../../sentry.js"
import { logSessionEvent } from "../../session-metadata.js"
import { getSession, updateSession } from "../../sessions.js"
import {
	findFeedbackFile,
	findHaikuRoot,
	intentDir,
	intentFromCurrentBranch,
	isGitRepo,
	listVisibleIntents,
	parseFrontmatter,
	setFrontmatterField,
	syncSessionMetadata,
	validateBranch,
} from "../../state-tools.js"
import { resolveStudio } from "../../studio-reader.js"
import { emitTelemetry } from "../../telemetry.js"
import { defineTool } from "../define.js"
import { text } from "./_text.js"

function readFrontmatter(filePath: string): Record<string, unknown> {
	if (!existsSync(filePath)) return {}
	const raw = readFileSync(filePath, "utf8")
	const { data } = parseFrontmatter(raw)
	return data
}

export default defineTool({
	name: "haiku_run_next",
	description:
		"Advance the workflow. Returns the next action for the agent to take, with rendered instructions appended. Auto-resolves `intent` from the current branch when omitted; if multiple intents are active, requires explicit `intent`. Pass `external_review_url` when a stage is blocked on external review to record the URL for approval polling.",
	inputSchema: {
		type: "object" as const,
		properties: {
			intent: { type: "string" },
			external_review_url: { type: "string" },
			state_file: { type: "string" },
			pickup: {
				type: "boolean" as const,
				description:
					"Set true when invoked from /haiku:pickup. The engine fetches origin and materializes the active stage branch locally so the user can `git switch` into in-flight work, then appends a pickup hint to the response.",
			},
		},
	},
	async handle(args, signal) {
		// Auto-resolve `intent` when omitted. The contract: the engine
		// only touches an intent when we're explicitly working with it.
		// Two signals count as "explicitly":
		//   1. Caller passed `intent` directly.
		//   2. Current git branch is `haiku/<slug>/main` or
		//      `haiku/<slug>/<stage>` — the checkout itself is the
		//      declaration that this intent is in scope.
		// In a git repo, those are the ONLY signals. Falling back to
		// "the sole active intent on disk" is wrong: a checked-in intent
		// directory with `status: active` does not mean the user is
		// working on it right now (e.g. you're reviewing main, doing
		// engine work on another worktree, or the intent was committed
		// by an unrelated PR). Touching an intent the user isn't on
		// pollutes its on-disk runtime journals (action-log.jsonl,
		// state.json, baseline-content/) and shows up as untracked
		// noise in `git status`.
		// Filesystem mode (no git) has no branch signal, so the
		// "sole active" fallback is the only auto-resolve available
		// there — keep it gated behind !isGitRepo().
		let slug = (args.intent as string) || ""
		if (!slug) {
			const branchMatch = intentFromCurrentBranch()
			if (branchMatch) {
				slug = branchMatch.slug
			} else if (isGitRepo()) {
				return {
					content: [
						{
							type: "text" as const,
							text: "No intent specified and the current branch isn't an intent branch (`haiku/<slug>/main` or `haiku/<slug>/<stage>`). Pass `intent` explicitly, or `git switch haiku/<slug>/main` to scope the engine to a specific intent. The engine refuses to auto-target an intent the user isn't actively on — that's how stray intent dirs end up touched and polluting `git status`.",
						},
					],
					isError: true,
				}
			} else {
				const root = findHaikuRoot()
				const intentsDir = join(root, "intents")
				const active = existsSync(intentsDir)
					? listVisibleIntents(intentsDir).filter(
							(i) => (i.data.status as string) !== "completed",
						)
					: []
				if (active.length === 1) {
					slug = active[0].slug
				} else if (active.length === 0) {
					return {
						content: [
							{
								type: "text" as const,
								text: "No active intents found. Start one with /haiku:start.",
							},
						],
						isError: true,
					}
				} else {
					return {
						content: [
							{
								type: "text" as const,
								text: `Multiple active intents (${active.map((i) => i.slug).join(", ")}). Pass \`intent\` explicitly.`,
							},
						],
						isError: true,
					}
				}
			}
		}
		const stFile = args.state_file as string | undefined

		const branchCheck = validateBranch(slug, "intent")
		if (branchCheck) {
			return {
				content: [{ type: "text" as const, text: branchCheck }],
				isError: true,
			}
		}

		// Pre-cursor reconciliation: when external review is pending OR
		// the user might have merged a stage PR externally, fetch from
		// origin and check for the "merged into wrong branch" footgun.
		//
		// The footgun: User A's stage PR landed on the repo default
		// (`main`) instead of `haiku/<slug>/main`, so the cursor's
		// firstUnmergedStage check keeps the stage pinned and User B's
		// pickup never advances. Reconciliation fast-forwards intent
		// main to the repo default when safe, so the merge propagates
		// to where the cursor expects it.
		//
		// Skip on filesystem mode (no remote to fetch from), and when
		// the intent has no studio yet (the picker gate fires first).
		try {
			const intentFile = join(findHaikuRoot(), "intents", slug, "intent.md")
			if (existsSync(intentFile)) {
				const im = readFrontmatter(intentFile)
				const studio = (im.studio as string) || ""
				const hasExternalReview =
					typeof im.external_review_url === "string" &&
					(im.external_review_url as string).length > 0
				if (studio && hasExternalReview) {
					const { isGitRepo: checkGitRepo } = await import(
						"../../state-tools.js"
					)
					if (checkGitRepo()) {
						fetchOrigin()
						const { resolveStudioStages } = await import(
							"../../orchestrator.js"
						)
						const { reconcileMisroutedStageMerges } = await import(
							"../../git-worktree.js"
						)
						const stages = resolveStudioStages(studio)
						const reconciliations = reconcileMisroutedStageMerges(slug, stages)
						const hardErrors = reconciliations.filter(
							(r) => r.misrouted && !r.reconciled && r.error,
						)
						if (hardErrors.length > 0) {
							return {
								content: [
									{
										type: "text" as const,
										text: `Stage merge routed to the wrong branch — manual reconciliation needed:\n\n${hardErrors.map((e) => `- **Stage ${e.stage}**: ${e.error}`).join("\n")}\n\nWhen reconciled, re-run \`haiku_run_next\` to continue.`,
									},
								],
								isError: true,
							}
						}
						// On successful reconciliation, the merge is now on
						// haiku/<slug>/main and the cursor walk that follows
						// will pick up the next stage naturally. No need to
						// surface anything to the agent — the recovery is
						// invisible (which is what the user wants for the
						// pickup case).
					}
				}
			}
		} catch (err) {
			// Reconciliation is best-effort; failures here just mean we
			// surface the same wedged-stage state we'd see otherwise.
			console.error(
				`[haiku_run_next] pre-cursor reconciliation failed: ${err instanceof Error ? err.message : String(err)}`,
			)
		}

		// Pickup auto-fetch: when /haiku:pickup hands off to a fresh user,
		// they only have intent main locally. The cursor's state.json and
		// any pending feedback live there, but the active stage branch's
		// in-flight unit work doesn't. Fetch origin, materialize the
		// active stage branch as a local ref (no checkout — keep the
		// user's working tree intact), and surface a hint naming the
		// branch so they know how to inspect it. Best-effort: never
		// blocks the tick.
		let pickupHint = ""
		if (args.pickup === true && isGitRepo()) {
			try {
				fetchOrigin()
				const intentFile = join(findHaikuRoot(), "intents", slug, "intent.md")
				if (existsSync(intentFile)) {
					const im = readFrontmatter(intentFile)
					const studio = (im.studio as string) || ""
					if (studio) {
						const activeStage = firstUnmergedStage(slug, studio)
						if (activeStage) {
							const branch = `haiku/${slug}/${activeStage}`
							try {
								// `git fetch origin <branch>:<branch>` creates or
								// fast-forwards the local ref to origin's tip.
								// Fails when origin lacks the branch (the user is
								// way ahead, no one's pushed it yet) or when the
								// local branch has diverged — both are fine, we
								// just don't make a hint promise we can't keep.
								execFileSync(
									"git",
									["fetch", "origin", `${branch}:${branch}`],
									{ encoding: "utf8", stdio: "pipe" },
								)
								pickupHint = `Active stage branch \`${branch}\` was fetched from origin. Run \`git switch ${branch}\` to inspect in-flight unit work; the engine drives the workflow from intent main and doesn't need you on the stage branch.`
							} catch {
								// Origin doesn't have the branch yet, or there's
								// a divergence we can't fast-forward through.
								// Fall through silently — the engine still works
								// from intent main.
							}
						}
					}
				}
			} catch (err) {
				console.error(
					`[haiku_run_next] pickup auto-fetch threw: ${
						err instanceof Error ? err.message : String(err)
					}`,
				)
			}
		}

		// Stage-branch enforcement: before ANY stage-scoped write, align
		// the current checkout with the active stage branch. If main has
		// drifted ahead (feedback files or state leaked there), merge
		// main → stage first so the workflow engine sees a consistent view. No-op in
		// filesystem mode. Must run BEFORE the external_review_url write
		// below — otherwise that write could land on the wrong branch.
		{
			const intentFile = join(findHaikuRoot(), "intents", slug, "intent.md")
			if (existsSync(intentFile)) {
				const im = readFrontmatter(intentFile)
				// v4: active_stage is derived (first stage not merged into
				// intent main). intent.md no longer carries it. Resolve via
				// cursor.firstUnmergedStage which uses git --is-ancestor.
				const studio = (im.studio as string) || ""
				let activeStage = ""
				if (studio) {
					try {
						const { firstUnmergedStage } = await import(
							"../../orchestrator/workflow/cursor.js"
						)
						activeStage = firstUnmergedStage(slug, studio) || ""
					} catch {
						activeStage = (im.active_stage as string) || ""
					}
				} else {
					activeStage = (im.active_stage as string) || ""
				}
				const guard = ensureOnStageBranch(slug, activeStage || undefined)
				if (!guard.ok) {
					return buildGuardResponse(slug, activeStage, guard, "run_next entry")
				}
			}
		}

		// Gap 8: If external_review_url is passed and stage is blocked,
		// store it. Placed AFTER the stage-branch guard so this write
		// lands on the stage branch, not intent main.
		// v4: external_review_url is no longer persisted on stage state.json
		// (state.json is gone). Discrete-mode external review now signals
		// approval through the actual GitHub MR merge into intent main —
		// the cursor's firstUnmergedStage check naturally advances when the
		// merge lands. The url itself, if a caller still passes it, is
		// stamped on intent.md as a transient marker for the review UI to
		// display; nothing in the engine reads it.
		if (args.external_review_url) {
			try {
				const root = findHaikuRoot()
				const intentFile = join(root, "intents", slug, "intent.md")
				if (existsSync(intentFile)) {
					setFrontmatterField(
						intentFile,
						"external_review_url",
						args.external_review_url as string,
					)
				}
			} catch {
				/* non-fatal */
			}
		}

		// Drain any review/approval dispatches the cursor emitted on a
		// prior tick. Each pending entry came from the cursor returning
		// `dispatch_review` / `dispatch_approval` — the agent has now
		// had a chance to spawn the review-agent subagent and process
		// any FBs it filed (Track B drains before Track A). Drain
		// stamps `reviews.<role>` / `approvals.<role>` on each unit
		// that the review pass didn't flag with a still-open FB. See
		// dispatch-stamps.ts for the contract.
		try {
			const { drainPendingDispatches } = await import(
				"../../orchestrator/workflow/dispatch-stamps.js"
			)
			drainPendingDispatches(slug)
		} catch (err) {
			console.error(
				`[haiku_run_next] drainPendingDispatches failed: ${err instanceof Error ? err.message : String(err)}`,
			)
		}

		// Workflow-engine dispatch: read disk → derive state → run
		// per-state handler. The handler registry lives in
		// orchestrator/workflow/handlers/.
		//
		// Selection-picker interception: when the tick emits
		// `select_studio`, `select_mode`, or `select_stage`, the engine
		// itself runs the SPA picker inline, writes the chosen value,
		// and re-ticks. The agent NEVER sees these actions — it just
		// experiences a blocking tick until the user picks. The select_*
		// MCP tools still exist for explicit user-driven invocation
		// (`/haiku:change-mode`, etc.) but the tick path drives them
		// engine-side here so the agent stays out of the loop.
		let result = dispatchOrchestratorAction(slug)
		while (
			result.action === "select_studio" ||
			result.action === "select_mode" ||
			result.action === "select_stage"
		) {
			const pickerResult = await runSelectionPicker(result.action, slug, signal)
			if (!pickerResult.ok) {
				return {
					content: [{ type: "text" as const, text: pickerResult.message }],
					isError: true,
				}
			}
			result = dispatchOrchestratorAction(slug)
		}

		// Surface-once stamping for the design-direction handoff actions.
		// The cursor's design_direction gate emits one of:
		//   - design_direction_complete   (archetype mode + screenshots)
		//   - design_direction_uploaded   (upload/intake mode)
		// after the user submits a selection. The agent must see the
		// payload exactly once so it can Read screenshots / uploaded
		// files; on subsequent ticks the cursor must walk past to
		// elaborate. Stamp `surfaced_at` on the per-stage record before
		// returning so the next tick falls through. Failure here leaves
		// the cursor re-emitting the action — annoying but not fatal.
		if (
			(result.action === "design_direction_complete" ||
				result.action === "design_direction_uploaded") &&
			typeof result.stage === "string"
		) {
			try {
				const stage = result.stage as string
				const intentMdPath = join(findHaikuRoot(), "intents", slug, "intent.md")
				if (existsSync(intentMdPath)) {
					const raw = readFileSync(intentMdPath, "utf8")
					const parsed = parseFrontmatter(raw)
					const fm = (parsed.data as Record<string, unknown>) || {}
					const directions =
						fm.design_directions && typeof fm.design_directions === "object"
							? { ...(fm.design_directions as Record<string, unknown>) }
							: {}
					const dd =
						directions[stage] && typeof directions[stage] === "object"
							? { ...(directions[stage] as Record<string, unknown>) }
							: {}
					dd.surfaced_at = new Date().toISOString()
					directions[stage] = dd
					setFrontmatterField(intentMdPath, "design_directions", directions)
				}
			} catch (err) {
				console.error(
					`[haiku_run_next] design_direction surface stamp failed: ${err instanceof Error ? err.message : String(err)}`,
				)
			}
		}

		// Stash dispatch_review / dispatch_approval action context on
		// intent.md so the next tick's drainPendingDispatches stamps
		// reviews.<role> / approvals.<role>. Without this, the cursor
		// would re-emit the same dispatch action forever — the prompt
		// promises "the engine stamps the sigs" but no engine code
		// stamped them before this fix. See dispatch-stamps.ts for the
		// full lifecycle contract.
		if (
			(result.action === "dispatch_review" ||
				result.action === "dispatch_approval") &&
			typeof result.stage === "string" &&
			typeof result.role === "string" &&
			Array.isArray(result.units)
		) {
			try {
				const { stashPendingDispatch } = await import(
					"../../orchestrator/workflow/dispatch-stamps.js"
				)
				stashPendingDispatch(
					slug,
					result.action === "dispatch_review" ? "review" : "approval",
					result.stage as string,
					result.role as string,
					result.units as string[],
				)
			} catch (err) {
				console.error(
					`[haiku_run_next] stashPendingDispatch failed: ${err instanceof Error ? err.message : String(err)}`,
				)
			}
		}

		// Same shape for intent_review (non-user roles). The user role
		// goes through haiku_await_gate which stamps approvals.user
		// directly — no stashing needed there. Agent roles (spec,
		// continuity, studio review-agents) need this engine-side
		// stamp because nothing else writes their slot on intent.md.
		if (
			result.action === "intent_review" &&
			typeof result.role === "string" &&
			result.role !== "user"
		) {
			try {
				const { stashPendingIntentReview } = await import(
					"../../orchestrator/workflow/dispatch-stamps.js"
				)
				stashPendingIntentReview(slug, result.role as string)
			} catch (err) {
				console.error(
					`[haiku_run_next] stashPendingIntentReview failed: ${err instanceof Error ? err.message : String(err)}`,
				)
			}
		}

		// Auto-close for `close_feedback`: the cursor returns this when
		// every fix-hat for an FB has signed advance. The prompt
		// promises "the engine writes the closure" — same gap as
		// merge_stage/merge_intent was. We stamp `closed_at` on the FB
		// file, apply the FB's `targets.invalidates` (clearing the
		// named role keys on the target unit so the cursor reroutes
		// through them), and when the FB has `origin: "drift"`, refresh
		// the witnessed reviews/approvals timestamps on the targeted
		// unit so the drift sweep stops flagging the same commit.
		while (
			result.action === "close_feedback" &&
			typeof result.stage === "string" &&
			typeof result.feedback_id === "string"
		) {
			try {
				const stage = result.stage as string
				const fbId = result.feedback_id as string
				// `fbId` is the canonical wire form (`FB-NNN`); files on
				// disk are `NNN-slug.md`. A naive `f.startsWith(fbId+"-")`
				// match never fires because `"01-foo.md".startsWith("FB-01-")`
				// is false. `findFeedbackFile` already normalises both
				// forms (FB-NN, FB-N, NN, N) to a numeric prefix and
				// matches the file's leading-digit prefix — single source
				// of truth for the lookup, no chance of drift.
				const found = findFeedbackFile(slug, stage, fbId)
				if (!found) break
				const fbFile = found.path
				const fbFm = found.data
				const closedAt = new Date().toISOString()
				setFrontmatterField(fbFile, "closed_at", closedAt)
				// Apply targets.invalidates — delete the named role keys
				// from the targeted unit's reviews / approvals so the
				// cursor reroutes through them. The start_feedback_hat
				// prompt promises this happens on close.
				const targets = (fbFm.targets as Record<string, unknown>) ?? {}
				const targetUnit = targets.unit as string | undefined
				const invalidates = Array.isArray(targets.invalidates)
					? (targets.invalidates as string[])
					: []
				if (targetUnit && invalidates.length > 0) {
					const { applyFeedbackInvalidations } = await import(
						"../../orchestrator/workflow/dispatch-stamps.js"
					)
					applyFeedbackInvalidations({
						slug,
						stage,
						targetUnit,
						invalidates,
					})
				}
				// Refresh witnessed signed_at on the targeted unit when
				// this is a drift FB — otherwise the drift sweep keeps
				// finding the same commit past the original sign time.
				// `targets` and `targetUnit` are reused from the
				// invalidations block above — same FB, same fields.
				if (fbFm.origin === "drift" && targetUnit) {
					const unitPath = join(
						findHaikuRoot(),
						"intents",
						slug,
						"stages",
						stage,
						"units",
						`${targetUnit}.md`,
					)
					if (existsSync(unitPath)) {
						const intentDirAbs = join(findHaikuRoot(), "intents", slug)
						const { buildApprovalRecord, buildReviewRecord } = await import(
							"../../orchestrator/workflow/sign-slot.js"
						)
						const raw = readFileSync(unitPath, "utf8")
						const parsed = parseFrontmatter(raw)
						const fm = parsed.data as Record<string, unknown>
						const outputs = Array.isArray(fm.outputs)
							? (fm.outputs as string[])
							: []
						const reviews =
							fm.reviews && typeof fm.reviews === "object"
								? { ...(fm.reviews as Record<string, unknown>) }
								: {}
						for (const role of Object.keys(reviews)) {
							reviews[role] = buildReviewRecord(unitPath)
						}
						const approvals =
							fm.approvals && typeof fm.approvals === "object"
								? { ...(fm.approvals as Record<string, unknown>) }
								: {}
						for (const role of Object.keys(approvals)) {
							approvals[role] = buildApprovalRecord(intentDirAbs, outputs)
						}
						setFrontmatterField(unitPath, "reviews", reviews)
						setFrontmatterField(unitPath, "approvals", approvals)
					}
				}
				result = dispatchOrchestratorAction(slug)
			} catch (err) {
				console.error(
					`[haiku_run_next] close_feedback execution failed: ${err instanceof Error ? err.message : String(err)}`,
				)
				break
			}
		}

		// Auto-merge for `merge_stage`: the cursor returns this when a
		// stage's gates are all signed and the branch is ready to land
		// on intent main. Until 2026-05-07 the engine relied on the
		// agent calling run_next a second time to "trigger" the merge,
		// but no handler actually executed the merge — the cursor just
		// kept emitting merge_stage. Now we perform the merge inline,
		// under the intent-main lock, then re-walk the cursor so the
		// agent sees the next post-merge action (typically the next
		// stage's elaborate, or intent_review when the final stage
		// merged).
		// Auto-seal for `merge_intent`: cursor returns this when every
		// stage is merged and every intent-level approval is signed.
		// The engine stamps `sealed_at` and re-walks. Same fix as
		// merge_stage — was promised by the prompt, never executed by a
		// handler.
		if (result.action === "merge_intent") {
			try {
				const intentMd = join(findHaikuRoot(), "intents", slug, "intent.md")
				if (existsSync(intentMd)) {
					setFrontmatterField(intentMd, "sealed_at", new Date().toISOString())
					result = dispatchOrchestratorAction(slug)
				}
			} catch (err) {
				console.error(
					`[haiku_run_next] merge_intent execution failed: ${err instanceof Error ? err.message : String(err)}`,
				)
			}
		}

		while (
			result.action === "merge_stage" &&
			typeof result.stage === "string"
		) {
			const stageToMerge = result.stage
			try {
				const { isGitRepo } = await import("../../state-tools.js")
				if (!isGitRepo()) {
					// Filesystem mode: no git merge to perform. Mark the
					// stage as merged on intent.md.stages_merged so the
					// cursor's firstUnmergedStage advances on the next
					// tick. (Same observable effect as a successful git
					// merge, just without the SCM machinery.)
					const intentMd = join(findHaikuRoot(), "intents", slug, "intent.md")
					if (existsSync(intentMd)) {
						const raw = readFileSync(intentMd, "utf8")
						const parsed = parseFrontmatter(raw)
						const fm = parsed.data as Record<string, unknown>
						const merged: string[] = Array.isArray(fm.stages_merged)
							? (fm.stages_merged as string[])
							: []
						if (!merged.includes(stageToMerge)) {
							setFrontmatterField(intentMd, "stages_merged", [
								...merged,
								stageToMerge,
							])
						}
					}
					result = dispatchOrchestratorAction(slug)
					continue
				}
				const { mergeStageBranchIntoMain } = await import(
					"../../git-worktree.js"
				)
				const { withIntentMainLock } = await import("../../locks.js")
				// Serialize stage → intent-main merges. Two concurrent
				// haiku_run_next ticks targeting the same intent (e.g. an
				// autopilot retry overlapping a manual run) would otherwise
				// race on the merge commit, producing `merge in progress`
				// git errors or silently clobbering each other's writes.
				// merge_stage.ts:28 already promises this lock to the
				// agent — this call makes that promise true.
				const mergeOutcome = withIntentMainLock(slug, () =>
					mergeStageBranchIntoMain(slug, stageToMerge),
				)
				if (!mergeOutcome.success) {
					if (mergeOutcome.isConflict) {
						return {
							content: [
								{
									type: "text" as const,
									text: `Stage merge ${stageToMerge} → main blocked by conflict: ${mergeOutcome.message}`,
								},
							],
							isError: true,
						}
					}
					// Non-conflict failure (dirty tree, missing branch,
					// etc.). Return the original merge_stage action so
					// the agent sees the engine's diagnostic message and
					// can investigate, instead of hanging in a loop.
					break
				}
				// No-op success path: branch was missing locally + on
				// origin (v3 merged-and-deleted) so the merge function
				// short-circuited without actually performing a merge.
				// Without stamping `stages_merged` here, the next
				// `dispatchOrchestratorAction` would see the same
				// branch-missing-and-not-merged state and emit
				// `merge_stage` for the same stage again — the loop
				// would spin forever within a single tool call. Mirror
				// the filesystem-mode branch above and stamp the stage
				// onto intent.md so the cursor advances on the next
				// iteration. Mostly redundant with the migrator's step 5
				// (which already stamps `stages_merged` from v3 state.json
				// statuses), but defensive in case the migrator skipped
				// or its writeMatter failed silently.
				if (mergeOutcome.noop) {
					const intentMd = join(findHaikuRoot(), "intents", slug, "intent.md")
					if (existsSync(intentMd)) {
						const raw = readFileSync(intentMd, "utf8")
						const parsed = parseFrontmatter(raw)
						const fm = parsed.data as Record<string, unknown>
						const merged: string[] = Array.isArray(fm.stages_merged)
							? (fm.stages_merged as string[])
							: []
						if (!merged.includes(stageToMerge)) {
							setFrontmatterField(intentMd, "stages_merged", [
								...merged,
								stageToMerge,
							])
						}
					}
				}
				result = dispatchOrchestratorAction(slug)
			} catch (err) {
				console.error(
					`[haiku_run_next] merge_stage execution failed: ${err instanceof Error ? err.message : String(err)}`,
				)
				break
			}
		}

		// Revisit-branch guard: when the cursor returned a Track-B
		// action whose `stage` is *earlier* than firstUnmergedStage
		// (a feedback rewind), the pre-tick guard above checked out
		// the wrong branch — it always uses firstUnmergedStage.
		// Re-align so the agent's fix work lands on the right
		// stage's branch. Only relevant for actions that name a
		// concrete stage AND differ from the active one. Other
		// actions (intent_review, merge_intent, sealed) don't carry
		// a stage; they no-op this guard.
		if (typeof result.stage === "string" && result.stage.length > 0) {
			try {
				const intentFile = join(findHaikuRoot(), "intents", slug, "intent.md")
				if (existsSync(intentFile)) {
					const guard = ensureOnStageBranch(slug, result.stage)
					if (!guard.ok) {
						return buildGuardResponse(
							slug,
							result.stage,
							guard,
							"run_next post-cursor revisit alignment",
						)
					}
				}
			} catch {
				/* non-fatal — branch alignment is best-effort */
			}
		}

		emitTelemetry("haiku.orchestrator.action", {
			intent: slug,
			action: result.action,
		})
		if (stFile)
			logSessionEvent(stFile, {
				event: "run_next",
				intent: slug,
				action: result.action,
				stage: result.stage,
				unit: result.unit,
				hat: result.hat,
				wave: result.wave,
			})

		if (stFile && result.action === "outputs_missing") {
			logSessionEvent(stFile, {
				event: "outputs_missing",
				intent: slug,
				stage: result.stage,
				missing: result.missing,
			})
		}
		if (stFile && result.action === "discovery_missing") {
			logSessionEvent(stFile, {
				event: "discovery_missing",
				intent: slug,
				stage: result.stage,
				missing: result.missing,
			})
		}
		// Read intent metadata for instruction building (used in all
		// return paths).
		let intentMeta: Record<string, unknown> = {}
		try {
			const iDir = intentDir(slug)
			const intentRaw = readFileSync(join(iDir, "intent.md"), "utf8")
			const parsed = parseFrontmatter(intentRaw)
			intentMeta = parsed.data
		} catch {
			/* intent might not exist for error actions */
		}
		const intentStudio = (intentMeta.studio as string) || ""

		// Helper to enrich result with preview and append instructions.
		const withInstructions = (resultObj: Record<string, unknown>): string => {
			enrichActionWithPreview(resultObj as OrchestratorAction)
			const instructions = buildRunInstructions(
				slug,
				intentStudio,
				resultObj as OrchestratorAction,
				intentDir(slug),
			)
			const adapted = adaptInstructions(instructions)
			// Strip tell_user/next_step from outer JSON — they appear in
			// the announcement section.
			const { tell_user: _tu, next_step: _ns, ...resultForJson } = resultObj
			return `${JSON.stringify(resultForJson, null, 2)}\n\n---\n\n${adapted}`
		}

		// External review: when the action surfaces with no URL on hand,
		// try opening the MR programmatically here too. This is the
		// fallback path for `external_review_requested` cases that
		// originate from the cursor (rather than from gate-review's
		// inline await_gate, which already tried). Engine-opened MRs
		// always target `haiku/<slug>/main` so the merge signal lands on
		// the intent main branch, not the repo default — that was the
		// real-world footgun where stage-merge-detection broke because
		// the PR landed on `main` and never on `haiku/<slug>/main`.
		if (
			result.action === "external_review_requested" &&
			!args.external_review_url &&
			!intentMeta.external_review_url &&
			typeof result.stage === "string" &&
			(result.stage as string).length > 0
		) {
			try {
				const { openStagePullRequest } = await import("../../git-worktree.js")
				const opened = openStagePullRequest({
					slug,
					stage: result.stage as string,
				})
				if (opened.createdUrl) {
					try {
						const intentMd = join(findHaikuRoot(), "intents", slug, "intent.md")
						setFrontmatterField(
							intentMd,
							"external_review_url",
							opened.createdUrl,
						)
					} catch {
						/* non-fatal */
					}
					result.message = `${(result.message as string) || ""}\n\nThe engine opened the MR for you: ${opened.createdUrl} — base is \`haiku/${slug}/main\` so the workflow engine can detect the merge. Tell the user; they review and merge when ready, then run /haiku:pickup.`
				} else if (opened.compareUrl) {
					result.message = `${(result.message as string) || ""}\n\nEngine couldn't open the MR via gh/glab (${opened.prError ?? opened.pushError ?? "no CLI found"}). Surface this URL to the user — clicking it opens the MR with base \`haiku/${slug}/main\` pre-filled: ${opened.compareUrl}. After the user pastes the resulting URL, call haiku_run_next { intent: "${slug}", external_review_url: "<url>" }.`
				} else {
					result.message = `${(result.message as string) || ""}\n\n${opened.message} Open ONE merge request from branch \`haiku/${slug}/${result.stage}\` to \`haiku/${slug}/main\` (NOT the repo default branch — the engine detects merges via intent main, not the repo default). Record the URL via haiku_run_next { intent: "${slug}", external_review_url: "<url>" }.`
				}
			} catch (err) {
				result.message = `${(result.message as string) || ""}\n\nIMPORTANT: Open the change request from \`haiku/${slug}/${result.stage}\` to \`haiku/${slug}/main\` (NOT the repo default). Try \`gh pr create --base haiku/${slug}/main\` for GitHub or \`glab mr create --target-branch haiku/${slug}/main\` for GitLab. (Engine helper threw: ${err instanceof Error ? err.message : String(err)}.) Record the URL via haiku_run_next { intent: "${slug}", external_review_url: "<url>" }.`
			}
		}

		// Gate review — engine-side blocking path.
		//
		// Single blocking tick: prepare the session, launch the browser
		// best-effort, await the user's decision, post-process side
		// effects, and (for advance cases) re-tick to surface the
		// natural-next workflow action. The agent sees ONE blocking
		// haiku_run_next call instead of the old "post URL + call
		// haiku_await_gate" two-step. haiku_await_gate stays as a
		// resume entry point for the case where the original tick
		// timed out or was interrupted.
		while (result.action === "gate_review") {
			const stage = (result.stage as string | null) ?? ""
			const nextStage = result.next_stage as string | null
			const nextPhase = result.next_phase as string | null
			const gateContext = (result.gate_context as string) || "stage_gate"
			const gateType = result.gate_type as string
			const intentDirPath = `.haiku/intents/${slug}`
			if (stFile)
				logSessionEvent(stFile, {
					event: "gate_review_prepared",
					intent: slug,
					stage,
					gate_type: gateType,
				})

			const _prepareGateReview = getPrepareGateReview()
			if (!_prepareGateReview) {
				return text(
					"Gate-review prepare handler not registered — server.ts wiring is broken. File a bug.",
				)
			}

			try {
				const prepared = await _prepareGateReview(intentDirPath, gateType, {
					gateContext,
					stage,
					nextStage,
					nextPhase,
				})

				// v4: gate session pointers land on intent.md regardless of
				// scope (stage state.json is gone). Stage-scope gates use
				// keyed fields so multiple stages can have concurrent
				// sessions without colliding (a discrete-mode intent could
				// have an external MR open on stage A while stage B's user
				// gate is also open on the local review server).
				//
				// M6 will move these to a session-server side store; for now
				// stamping intent.md as a transient pointer keeps await_gate
				// recovery working.
				try {
					const intentMdPath = join(intentDir(slug), "intent.md")
					const sessionKey = stage
						? `gate_review_session_${stage}`
						: "gate_review_session_id"
					const urlKey = stage ? `gate_review_url_${stage}` : "gate_review_url"
					setFrontmatterField(intentMdPath, sessionKey, prepared.session_id)
					setFrontmatterField(intentMdPath, urlKey, prepared.review_url)
					setFrontmatterField(intentMdPath, "gate_review_context", gateContext)
					if (nextStage !== undefined && nextStage !== null) {
						setFrontmatterField(
							intentMdPath,
							"gate_review_next_stage",
							nextStage,
						)
					}
					if (nextPhase !== undefined && nextPhase !== null) {
						setFrontmatterField(
							intentMdPath,
							"gate_review_next_phase",
							nextPhase,
						)
					}
				} catch {
					/* non-fatal — agent can still pass session_id explicitly */
				}

				syncSessionMetadata(slug, args.state_file as string | undefined)

				// Stamp announced_at on first prepare so the SPA's "new
				// gate" toast doesn't double-fire if the resume entry
				// point (haiku_await_gate) reattaches after a host
				// timeout.
				const existingSession = getSession(prepared.session_id)
				const alreadyAnnounced =
					existingSession?.session_type === "review" &&
					!!existingSession.announced_at
				if (!alreadyAnnounced) {
					try {
						updateSession(prepared.session_id, {
							announced_at: new Date().toISOString(),
						})
					} catch {
						/* non-fatal */
					}
				}

				// Engine-side blocking: dispatch to haiku_await_gate
				// inline. The await tool drains the session, blocks on
				// the user's decision, runs every post-decision side
				// effect (stampGateApproval, workflowAdvancePhase/Stage,
				// writeReviewFeedbackFiles, sealIntentState, etc.), and
				// returns a rendered response. We then either re-tick
				// (advance cases — cursor surfaces the next real
				// workflow action) or return the response directly
				// (terminal / changes-requested / external-review
				// cases).
				const { orchestratorToolHandlers: gateHandlers } = await import(
					"./index.js"
				)
				const awaitTool = gateHandlers.get("haiku_await_gate")
				if (!awaitTool) {
					return text(
						"haiku_await_gate handler not registered — server.ts wiring is broken. File a bug.",
					)
				}
				const awaitResponse = await awaitTool.handle(
					{
						intent: slug,
						session_id: prepared.session_id,
						review_url: prepared.review_url,
						...(stFile ? { state_file: stFile } : {}),
					},
					signal,
				)
				if (awaitResponse.isError) {
					return awaitResponse
				}

				const awaitedAction = extractActionFromAwaitResponse(awaitResponse)
				// "approved" decisions that advance the workflow get
				// re-ticked: the cursor sees the new sigs and emits the
				// next real action (start_unit_hat, elaborate, gate_review
				// for the next gate, merge_stage, etc.). Everything else
				// — external_review_requested, changes_requested,
				// revise_unit_specs, intent_complete, revisit_*,
				// stage_revisit, error — is a terminal-this-turn signal
				// the agent should see directly.
				const RETICK_ACTIONS: ReadonlySet<string> = new Set([
					"advance_phase",
					"advance_stage",
					"intent_approved",
				])
				if (awaitedAction && RETICK_ACTIONS.has(awaitedAction)) {
					result = dispatchOrchestratorAction(slug)
					continue
				}
				return awaitResponse
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err)
				const errorStack = err instanceof Error ? err.stack : ""

				console.error(`[haiku] gate_review prepare failed: ${errorMsg}`)
				reportError(err, { intent: slug, stage })

				try {
					const logDir = join(process.cwd(), ".haiku", "logs")
					mkdirSync(logDir, { recursive: true })
					writeFileSync(
						join(logDir, "gate-review-error.log"),
						`${new Date().toISOString()}\nintent: ${slug}\nstage: ${stage}\nphase: prepare\nerror: ${errorMsg}\n${errorStack}\n---\n`,
						{ flag: "a" },
					)
				} catch {
					/* non-fatal */
				}

				syncSessionMetadata(slug, args.state_file as string | undefined)
				return {
					content: [
						{
							type: "text" as const,
							text: `GATE PREPARE FAILED: ${errorMsg}. Logged to .haiku/logs/gate-review-error.log. Call haiku_run_next { intent: "${slug}" } to retry.`,
						},
					],
					isError: true,
				}
			}
		}

		// Repair agent intercept — if runNext detected a broken migrated
		// intent, try the embedded repair agent before returning to the
		// outer agent. Falls through to the normal withInstructions
		// return if the agent isn't available or repair fails.
		if (result.action === "safe_intent_repair") {
			try {
				const { runRepairAgent } = await import("../../repair-agent.js")
				const root = findHaikuRoot()
				const iDir = join(root, "intents", slug)

				const studioInfo = resolveStudio(intentStudio)
				const studioDir = studioInfo?.path
				if (!studioDir) {
					syncSessionMetadata(slug, args.state_file as string | undefined)
					return text(withInstructions(result))
				}

				const activeStage = (result.stage as string) || ""
				const diagnosis = {
					slug,
					intentDir: iDir,
					studio: intentStudio,
					studioDir,
					activeStage,
					synthesizedStages: (result.synthesized_stages as string[]) || [],
					needsManualReview: (result.needs_manual_review as string[]) || [],
					phaseRegressed: result.phase_regressed as boolean,
					unitsMissingInputs: (result.units_missing_inputs as string[]) || [],
				}

				const repairResult = await runRepairAgent(diagnosis)

				// Re-enforce stage branch after the repair-agent await — it
				// can take minutes, during which the user or the repair
				// agent itself may have touched the checkout. Every
				// downstream write depends on the correct branch.
				{
					const postRepairGuard = ensureOnStageBranch(
						slug,
						(result.stage as string) || undefined,
					)
					if (!postRepairGuard.ok) {
						return buildGuardResponse(
							slug,
							(result.stage as string) || undefined,
							postRepairGuard,
							"after repair-agent run",
						)
					}
				}

				if (repairResult.success && !repairResult.fallbackUsed) {
					// Repair agent succeeded — run the workflow again to get the real
					// next action.
					const postRepairResult = dispatchOrchestratorAction(slug)

					// Guard: if repair didn't actually fix things, don't loop.
					if (postRepairResult.action === "safe_intent_repair") {
						// Fall through to return the original result as-is.
					} else {
						emitTelemetry("haiku.orchestrator.action", {
							intent: slug,
							action: postRepairResult.action,
						})
						if (stFile)
							logSessionEvent(stFile, {
								event: "run_next",
								intent: slug,
								action: postRepairResult.action,
								stage: postRepairResult.stage,
								unit: postRepairResult.unit,
								hat: postRepairResult.hat,
								wave: postRepairResult.wave,
							})

						syncSessionMetadata(slug, args.state_file as string | undefined)

						const repairNote = `**Intent repaired automatically:** ${repairResult.summary}\n\n---\n\n`
						return {
							content: [
								{
									type: "text" as const,
									text: repairNote + withInstructions(postRepairResult),
								},
							],
						}
					}
				}
				// Repair failed or used fallback — fall through to return
				// safe_intent_repair as-is.
			} catch {
				// Repair agent not available — fall through to normal
				// handling.
			}
		}

		// End-of-tick auto-push: if the active stage branch's HEAD has
		// advanced past origin (whether from engine state writes or from
		// agent code commits between ticks), push it. Cheap rev-parse
		// comparison; no network when no remote is configured.
		// Best-effort — failures log and never block the tick.
		try {
			const intentDirPath = intentDir(slug)
			const intentMdPath = join(intentDirPath, "intent.md")
			if (existsSync(intentMdPath)) {
				const raw = readFileSync(intentMdPath, "utf8")
				const { data } = parseFrontmatter(raw)
				const studio = (data.studio as string) || ""
				if (studio) {
					const activeStage = firstUnmergedStage(slug, studio)
					if (activeStage) {
						const branch = `haiku/${slug}/${activeStage}`
						// pushStageBranch internally checks branchAheadOfOrigin
						// and returns { ok: true, skipped: true } when the
						// branch isn't ahead — no need to gate it here.
						const pushResult = pushStageBranch(slug, activeStage)
						if (!pushResult.ok && pushResult.error) {
							console.error(
								`[haiku] auto-push of ${branch} failed: ${pushResult.error}`,
							)
						}
					}
				}
			}
		} catch (err) {
			console.error(
				`[haiku] auto-push end-of-tick check threw: ${
					err instanceof Error ? err.message : String(err)
				}`,
			)
		}

		syncSessionMetadata(slug, args.state_file as string | undefined)
		const rendered = withInstructions(result)
		return text(pickupHint ? `${pickupHint}\n\n${rendered}` : rendered)
	},
})

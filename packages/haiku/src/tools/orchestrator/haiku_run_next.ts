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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { ensureOnStageBranch } from "../../git-worktree.js"
import { adaptInstructions } from "../../harness-instructions.js"
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
		message: `runWorkflowTick produced no action for intent '${slug}' (state: ${tick.state}). Indicates a derive-state output without a registered handler.`,
	}
}

import { reportError } from "../../sentry.js"
import { logSessionEvent } from "../../session-metadata.js"
import {
	findHaikuRoot,
	intentDir,
	intentFromCurrentBranch,
	listVisibleIntents,
	parseFrontmatter,
	readJson,
	stageStatePath,
	syncSessionMetadata,
	validateBranch,
	writeJson,
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
		},
	},
	async handle(args) {
		// Auto-resolve `intent` when omitted. Resolution order:
		//   1. Current git branch (`haiku/<slug>/main` or `haiku/<slug>/<stage>`)
		//      — the user's checkout already names the intent, so the skill
		//      surface can stay thin and doesn't need to prompt.
		//   2. Sole active intent on the filesystem — if there's exactly one,
		//      use it; zero-or-many yields an error with available slugs.
		let slug = (args.intent as string) || ""
		if (!slug) {
			const branchMatch = intentFromCurrentBranch()
			if (branchMatch) {
				slug = branchMatch.slug
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
								text: `Multiple active intents (${active.map((i) => i.slug).join(", ")}). Pass \`intent\` explicitly, or checkout an intent branch (\`git switch haiku/<slug>/main\`) so the workflow engine can auto-resolve.`,
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
				const activeStage = (im.active_stage as string) || ""
				const guard = ensureOnStageBranch(slug, activeStage || undefined)
				if (!guard.ok) {
					return buildGuardResponse(slug, activeStage, guard, "run_next entry")
				}
			}
		}

		// Gap 8: If external_review_url is passed and stage is blocked,
		// store it. Placed AFTER the stage-branch guard so this write
		// lands on the stage branch, not intent main.
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
			} catch {
				/* non-fatal */
			}
		}

		// Workflow-engine dispatch: read disk → derive state → run
		// per-state handler. The handler registry lives in
		// orchestrator/workflow/handlers/.
		const result = dispatchOrchestratorAction(slug)
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

		// External review: include instructions about recording the URL.
		if (result.action === "external_review_requested") {
			result.message = `${(result.message as string) || ""}\n\nIMPORTANT: Ask the user WHERE they submitted the work for review (PR URL, MR link, email, Slack channel, etc.). Record the URL by calling haiku_run_next { intent: "${slug}", external_review_url: "<url>" } so the workflow engine can track approval status.`
		}

		// Gate review — non-blocking prepare path.
		//
		// Previously this entire block synchronously opened the review
		// UI, blocked on `_openReviewAndWait` for up to 30 minutes, and
		// processed the user's decision inline. That worked when the
		// MCP host could auto-launch a browser, but silently hung any
		// remote / headless / SSH / web-client / mobile-chat setup
		// where the URL never reached the user. The decision dispatch
		// now lives in the new haiku_await_gate tool; here we just
		// create the session, surface the URL to the agent, and ask
		// the agent to post the URL → call haiku_await_gate.
		if (result.action === "gate_review") {
			const stage = result.stage as string
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

				// Persist session pointers on stage state so haiku_await_gate
				// can recover them without an explicit session_id arg. Also
				// gives the architecture map / tooling a stable place to
				// observe the open session.
				try {
					const ssPath = stageStatePath(slug, stage)
					const ssData = readJson(ssPath)
					ssData.gate_review_session_id = prepared.session_id
					ssData.gate_review_url = prepared.review_url
					ssData.gate_review_context = gateContext
					ssData.gate_review_next_stage = nextStage
					ssData.gate_review_next_phase = nextPhase
					writeJson(ssPath, ssData)
				} catch {
					/* non-fatal — agent can still pass session_id explicitly */
				}

				syncSessionMetadata(slug, args.state_file as string | undefined)

				// Browser-attached path: the user already has the SPA tab
				// open from a prior gate this session, so the agent can
				// skip "post URL to user" and just call haiku_await_gate.
				// New-session path: post the URL, then await.
				const tellUser = prepared.browser_attached
					? `Stage '${stage}' is ready for review. The page you're on (${prepared.review_url}) just refreshed to this gate.`
					: `Stage '${stage}' is ready for review. Open ${prepared.review_url} to approve or request changes.`
				const message = prepared.browser_attached
					? `Stage '${stage}' is ready for review. The user is already watching the SPA at ${prepared.review_url} (browser_attached=true), so do NOT re-post the URL — just call haiku_await_gate { intent: "${slug}" } to block on their decision.`
					: `Stage '${stage}' is ready for review at: ${prepared.review_url}\n\nNext: post the URL to the user (so they can open it on any device — headless host, remote control, mobile, web), then call haiku_await_gate { intent: "${slug}" } to block on their decision. Pass auto_open: false on the await call when the MCP host should NOT also try to launch a local browser.`

				const gateAction: Record<string, unknown> = {
					action: "gate_review",
					intent: slug,
					studio: intentStudio,
					stage,
					next_stage: nextStage,
					next_phase: nextPhase,
					gate_type: gateType,
					gate_context: gateContext,
					review_url: prepared.review_url,
					session_id: prepared.session_id,
					reused: prepared.reused,
					browser_attached: prepared.browser_attached,
					message,
					tell_user: tellUser,
					next_step: `Calling haiku_await_gate to wait for your decision.`,
				}
				return text(withInstructions(gateAction))
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

		syncSessionMetadata(slug, args.state_file as string | undefined)
		return text(withInstructions(result))
	},
})

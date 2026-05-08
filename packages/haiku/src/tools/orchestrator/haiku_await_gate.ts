// tools/orchestrator/haiku_await_gate.ts — Block on a pending gate
// review session and dispatch the user's decision.
//
// Pairs with haiku_run_next's gate_review action (set when the
// workflow engine reports a gate is ready). haiku_run_next no longer
// blocks on the review UI — it creates the session synchronously and
// returns the URL + session_id so the agent can post the URL to the
// user (essential for headless / SSH / web-client / mobile-chat
// setups, and any case where the MCP host can't auto-open the user's
// browser). haiku_await_gate then:
//
//   1. Reads gate_review_session_id from stage state (or accepts an
//      explicit session_id argument).
//   2. Calls the gate-review await callback (registered via
//      setGateReviewHandlers) — opens the browser best-effort if
//      auto_open is true, then blocks on waitForSession.
//   3. On decision: clears gate_review_session_id from stage state,
//      then dispatches based on (decision × gate_context). Mirrors
//      the prior haiku_run_next post-decision switch verbatim.
//   4. On infra failure: falls back to MCP elicitation when the host
//      supports it; otherwise returns an actionable error.

import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { ensureOnStageBranch } from "../../git-worktree.js"
import {
	buildApprovalRecord,
	buildReviewRecord,
} from "../../orchestrator/workflow/sign-slot.js"
import {
	buildGuardResponse,
	completeOrReviewIntent,
	findIncompleteStages,
	getAwaitGateReviewSession,
	isStagePreExecute,
	listUnits,
	workflowAdvancePhase,
	workflowAdvanceStage,
	workflowCompleteStage,
	workflowIntentComplete,
	writeReviewFeedbackFiles,
} from "../../orchestrator.js"

// v4: resetFixLoopBolts deleted with revisit.ts. Fix-loop bolts are
// derived from feedback iterations[].length; there's no counter to
// reset — terminal feedback-assessor advance closes the FB and the
// next bolt is just the next iteration entry.
const resetFixLoopBolts = (_slug: string, _stage: string): void => {
	/* no-op */
}

import { reportError } from "../../sentry.js"
import { logSessionEvent } from "../../session-metadata.js"
import {
	HAIKU_AWAIT_GATE_INPUT_SCHEMA,
	type HaikuAwaitGateInput,
	validateHaikuAwaitGateInputSchema,
} from "../../state/schemas/index.js"
import {
	jsonSchemaOf,
	validateToolInput,
} from "../../state/schemas/inputs/_validate.js"
import { sealIntentState } from "../../state-integrity.js"
import {
	deleteFrontmatterFields,
	gitCommitState,
	intentDir,
	isGitRepo,
	parseFrontmatter,
	readJson,
	setFrontmatterField,
	stageStatePath,
	syncSessionMetadata,
	writeJson,
} from "../../state-tools.js"
import { defineTool } from "../define.js"
import { withAnnouncement } from "./_announce.js"
import {
	buildAwaitTimeoutResponse,
	isAwaitWaitTimeoutError,
} from "./_await_gate_timeout.js"
import { text } from "./_text.js"
import { withInstructions as renderInstructions } from "./_with_instructions.js"

function readFrontmatter(filePath: string): Record<string, unknown> {
	if (!existsSync(filePath)) return {}
	const raw = readFileSync(filePath, "utf8")
	const { data } = parseFrontmatter(raw)
	return data
}

/**
 * v4 helper: stamp the appropriate approval/review record for a gate
 * approval. Replaces the v3 `workflowAdvancePhase/Stage/CompleteStage`
 * call chain — in v4 the cursor sees the new sig on the next tick and
 * routes forward (next role, merge_stage, intent_review, etc.)
 * automatically.
 *
 * Mapping by gateContext:
 *   - "intent_completion" → intent.approvals.user
 *   - "intent_review"     → intent.approvals.user (spec is filed
 *                           separately by review-agents)
 *   - "elaborate_to_execute" → reviews.user on every unit in stage
 *                              (pre-execute spec review)
 *   - "stage_gate"        → approvals.user on every unit in stage
 *                           (post-execute output approval)
 *
 * The next haiku_run_next tick walks the cursor and picks up where
 * the new approval routes us.
 */
function stampGateApproval(
	slug: string,
	gateContext: string,
	stage: string,
): void {
	const intentDirAbs = intentDir(slug)
	const intentMd = join(intentDirAbs, "intent.md")

	if (gateContext === "intent_completion" || gateContext === "intent_review") {
		const fm = readFrontmatter(intentMd)
		const approvals =
			fm.approvals && typeof fm.approvals === "object"
				? (fm.approvals as Record<string, unknown>)
				: {}
		// Intent-scope user approval witnesses the intent body.
		approvals.user = buildReviewRecord(intentMd)
		setFrontmatterField(intentMd, "approvals", approvals)
		return
	}

	// Stage-scoped gates: stamp every unit in the stage.
	const isPreExecute = gateContext === "elaborate_to_execute"
	const targetField = isPreExecute ? "reviews" : "approvals"
	const unitsDir = join(intentDirAbs, "stages", stage, "units")
	if (!existsSync(unitsDir)) return
	const entries = readdirSync(unitsDir)
	for (const entry of entries) {
		if (!entry.endsWith(".md")) continue
		const unitPath = join(unitsDir, entry)
		const fm = readFrontmatter(unitPath)
		const records =
			fm[targetField] && typeof fm[targetField] === "object"
				? (fm[targetField] as Record<string, unknown>)
				: {}
		// Reviews witness the unit body; approvals witness the
		// declared output paths.
		if (isPreExecute) {
			records.user = buildReviewRecord(unitPath)
		} else {
			const outputs = Array.isArray(fm.outputs) ? (fm.outputs as string[]) : []
			records.user = buildApprovalRecord(intentDirAbs, outputs)
		}
		setFrontmatterField(unitPath, targetField, records)
	}
}

export default defineTool({
	name: "haiku_await_gate",
	description:
		"Resume / recovery entry point for a pending gate-review session. " +
		"Under v4 the canonical flow blocks INSIDE haiku_run_next — the " +
		"engine prepares the session, opens the browser best-effort, awaits " +
		"the user's decision, and returns the post-decision action all in " +
		"one tool call. Use haiku_await_gate only when the original tick " +
		"timed out, the MCP host disconnected, or the agent restart lost " +
		"the in-memory blocking call; reads gate_review_session_id from " +
		"intent.md to reattach. Returns the same post-decision action " +
		"shape (advance_stage / advance_phase / changes_requested / " +
		"external_review_requested / intent_complete / etc.).",
	inputSchema: jsonSchemaOf(HAIKU_AWAIT_GATE_INPUT_SCHEMA),
	async handle(args, signal) {
		// AJV gate first — every MCP tool input gets a real schema check
		// per .claude/rules/schema-definitions.md. The validator emits a
		// stable named error (`haiku_await_gate_input_invalid`) on miss
		// so agents and tests can match on the code, not prose.
		const inputErr = validateToolInput(
			args,
			validateHaikuAwaitGateInputSchema,
			"haiku_await_gate",
		)
		if (inputErr) return inputErr
		const validated = args as HaikuAwaitGateInput
		const slug = validated.intent
		const stFile = validated.state_file

		const intentMd = join(intentDir(slug), "intent.md")
		const intentMeta = readFrontmatter(intentMd)
		const intentStudio = (intentMeta.studio as string) || ""
		const activeStage = (intentMeta.active_stage as string) || ""
		const intentPhase = (intentMeta.phase as string) || ""

		// Gate-pointer source: stage state.json for stage-scope gates,
		// intent.md frontmatter for intent-scope gates (intent_review
		// pre-stage, intent_completion post-final). Pre-stage
		// intent_review has no active_stage yet — pointers live on
		// intent.md only.
		const isIntentScopeGate =
			!activeStage ||
			intentPhase === "intent_review" ||
			intentPhase === "awaiting_completion_review" ||
			intentPhase === "intent_completion"

		const ssPath = activeStage ? stageStatePath(slug, activeStage) : ""
		const stageState: Record<string, unknown> = ssPath ? readJson(ssPath) : {}

		const stagePersistedSid =
			(stageState.gate_review_session_id as string | undefined) || ""
		const intentPersistedSid =
			(intentMeta.gate_review_session_id as string | undefined) || ""
		const persistedSid = isIntentScopeGate
			? intentPersistedSid || stagePersistedSid
			: stagePersistedSid

		if (!persistedSid && !validated.session_id && !activeStage) {
			return text(
				`No active stage on intent '${slug}' and no pending intent-scope gate — nothing to await. Call haiku_run_next first.`,
			)
		}
		const sessionId = validated.session_id || persistedSid
		if (!sessionId) {
			const where = activeStage ? `stage '${activeStage}'` : `intent scope`
			return text(
				`No pending gate-review session for intent '${slug}' (${where}). Call haiku_run_next to (re)open the gate.`,
			)
		}

		const stage = activeStage
		const nextStage = isIntentScopeGate
			? ((intentMeta.gate_review_next_stage as string | null | undefined) ??
				null)
			: ((stageState.gate_review_next_stage as string | null | undefined) ??
				null)
		const nextPhase = isIntentScopeGate
			? ((intentMeta.gate_review_next_phase as string | null | undefined) ??
				null)
			: ((stageState.gate_review_next_phase as string | null | undefined) ??
				null)
		const gateContext = isIntentScopeGate
			? (intentMeta.gate_review_context as string | undefined) ||
				(stageState.gate_review_context as string | undefined) ||
				"stage_gate"
			: (stageState.gate_review_context as string | undefined) || "stage_gate"
		const intentDirPath = `.haiku/intents/${slug}`

		const _awaitGateReviewSession = getAwaitGateReviewSession()
		if (!_awaitGateReviewSession) {
			return text(
				"Gate-review await handler not registered — server.ts wiring is broken. File a bug.",
			)
		}

		const reviewUrl = validated.review_url
		const autoOpen = validated.auto_open !== false

		if (stFile) {
			logSessionEvent(stFile, {
				event: "haiku_await_gate_entered",
				intent: slug,
				stage,
				session_id: sessionId,
				auto_open: autoOpen,
			})
		}

		const withInstructions = (resultObj: Record<string, unknown>): string =>
			renderInstructions(slug, intentStudio, resultObj)

		// Clear the persisted session pointers as soon as the await tool
		// owns the wait — even if the wait throws, we don't want stale
		// state to suggest an open session that's no longer in memory.
		// Stage-scope pointers live on stage state.json; intent-scope
		// pointers live on intent.md frontmatter.
		try {
			if (ssPath) {
				const ss = readJson(ssPath)
				delete ss.gate_review_session_id
				delete ss.gate_review_url
				delete ss.gate_review_context
				delete ss.gate_review_next_stage
				delete ss.gate_review_next_phase
				writeJson(ssPath, ss)
			}
			if (isIntentScopeGate) {
				deleteFrontmatterFields(intentMd, [
					"gate_review_session_id",
					"gate_review_url",
					"gate_review_context",
					"gate_review_next_stage",
					"gate_review_next_phase",
				])
			}
		} catch {
			/* non-fatal */
		}

		try {
			// Gate-review timeout (2026-05-06): bumped from 30min to 4h.
			// 30min was too short for real human reviews (lunch, meetings,
			// asking a colleague to look). The agent saw timeouts as errors
			// and surfaced them noisily ("Gate review timed out — what now?")
			// even though the human was still working. 4h covers the long
			// tail of legitimate review duration while still bounding the
			// MCP block in case of a stuck process. Session TTL in
			// sessions.ts is matched so the in-memory session survives a
			// full wait cycle.
			const reviewResult = await _awaitGateReviewSession(sessionId, {
				autoOpen,
				reviewUrl,
				timeoutMs: 4 * 60 * 60 * 1000,
				signal,
			})

			const postReviewGuard = ensureOnStageBranch(slug, stage)
			if (!postReviewGuard.ok) {
				return buildGuardResponse(
					slug,
					stage,
					postReviewGuard,
					"after review wait",
				)
			}

			if (stFile) {
				logSessionEvent(stFile, {
					event: "gate_decision",
					intent: slug,
					stage,
					decision: reviewResult.decision,
					feedback: reviewResult.feedback,
				})
			}

			if (reviewResult.decision === "approved") {
				if (gateContext === "intent_completion") {
					const studioForCompletion =
						(readFrontmatter(join(intentDir(slug), "intent.md"))
							.studio as string) || ""
					// Guard: all declared stages must be completed before sealing.
					// Belt-and-suspenders against state drift between gate-review
					// preparation and approval (the user can take up to 4h to
					// decide; pre-tick's check at prepare-time isn't enough).
					const incompleteStages = findIncompleteStages(
						slug,
						studioForCompletion,
					)
					if (incompleteStages.length > 0) {
						return text(
							withInstructions({
								action: "error",
								intent: slug,
								message: `Cannot complete intent '${slug}': the following stages have not completed: [${incompleteStages.join(", ")}]. Run those stages to completion before approving intent_completion.`,
								incomplete_stages: incompleteStages,
							}),
						)
					}
					stampGateApproval(slug, "intent_completion", stage)
					workflowIntentComplete(slug)
					syncSessionMetadata(slug, stFile)
					const gateResult = {
						action: "intent_complete",
						intent: slug,
						studio: studioForCompletion,
						message: withAnnouncement(
							`The user approved final review for "${slug}" — intent complete.`,
							"Report the completion summary to the user.",
						),
					}
					return text(withInstructions(gateResult))
				}
				if (gateContext === "intent_review") {
					stampGateApproval(slug, "intent_review", stage)
					const intentFilePath = join(process.cwd(), intentDirPath, "intent.md")
					setFrontmatterField(intentFilePath, "intent_reviewed", true)
					// Pre-stage intent_review (current shape): no active stage,
					// the engine sets phase: "intent_review" on intent.md when
					// it opens the gate. Approval clears that phase so the
					// next tick falls through to start_stage.
					// Legacy mid-stage intent_review (the elaborate→execute
					// gate on stage 0): an active stage exists, so the phase
					// advance still drives the stage forward.
					if (stage && nextPhase) {
						workflowAdvancePhase(slug, stage, nextPhase)
					} else {
						deleteFrontmatterFields(intentFilePath, ["phase"])
						sealIntentState(slug)
					}
					gitCommitState(`haiku: intent ${slug} approved by user`)
					syncSessionMetadata(slug, stFile)
					const gateResult = {
						action: "intent_approved",
						intent: slug,
						stage: stage || null,
						from_phase: "intent_review",
						to_phase: nextPhase || "execute",
						message: stage
							? withAnnouncement(
									`The user approved intent "${slug}" — advancing to ${nextPhase || "execute"}.`,
									`IMPORTANT: Call haiku_run_next { intent: "${slug}" } immediately. Do NOT ask the user a follow-up — the transition was already approved.`,
								)
							: withAnnouncement(
									`The user approved intent "${slug}" — beginning stage 0.`,
									`IMPORTANT: Call haiku_run_next { intent: "${slug}" } immediately. Do NOT ask the user a follow-up — the transition was already approved.`,
								),
					}
					return text(withInstructions(gateResult))
				}
				if (gateContext === "elaborate_to_execute" && nextPhase) {
					stampGateApproval(slug, "elaborate_to_execute", stage)
					workflowAdvancePhase(slug, stage, nextPhase)
					syncSessionMetadata(slug, stFile)
					const gateResult = {
						action: "advance_phase",
						intent: slug,
						stage,
						from_phase: "elaborate",
						to_phase: nextPhase,
						message: withAnnouncement(
							`The user approved the specs for stage "${stage}" — advancing to ${nextPhase}.`,
							`IMPORTANT: Call haiku_run_next { intent: "${slug}" } immediately. Do NOT ask the user a follow-up — the transition was already approved.`,
						),
					}
					return text(withInstructions(gateResult))
				}
				if (nextStage) {
					stampGateApproval(slug, "stage_gate", stage)
					workflowAdvanceStage(slug, stage, nextStage)
					syncSessionMetadata(slug, stFile)
					const gateResult = {
						action: "advance_stage",
						intent: slug,
						stage,
						next_stage: nextStage,
						gate_outcome: "advanced",
						message: withAnnouncement(
							`The user approved stage "${stage}" — advancing to "${nextStage}".`,
							`IMPORTANT: Call haiku_run_next { intent: "${slug}" } immediately. Do NOT summarize, do NOT say "want me to continue?" — the gate was already approved. Just call the tool.`,
						),
					}
					return text(withInstructions(gateResult))
				}
				stampGateApproval(slug, "stage_gate", stage)
				workflowCompleteStage(slug, stage, "advanced")
				syncSessionMetadata(slug, stFile)
				const approvedStudio =
					(readFrontmatter(join(intentDir(slug), "intent.md"))
						.studio as string) || ""
				const gateResult = completeOrReviewIntent(
					slug,
					approvedStudio,
					withAnnouncement(
						`The user approved the final stage "${stage}" — intent complete.`,
						"Report the completion summary to the user.",
					),
				)
				return text(withInstructions(gateResult))
			}

			if (reviewResult.decision === "external_review") {
				// Mark the stage truly complete on its branch BEFORE the
				// PR opens (status=completed, gate_outcome=advanced,
				// completed_at). The PR then carries the final per-stage
				// state to intent main on merge — no post-merge cleanup
				// commit is needed. The gate handler's reconciliation
				// block (gate.ts) only advances active_stage once the
				// branch is merged into intent main; the merge IS the
				// user's only remaining action for this stage. Using
				// "blocked" here would close the iteration as "rejected"
				// (per workflowCompleteStage's branching in
				// side-effects.ts) and skip drift-marker clearing —
				// both wrong for a successful external-review handoff.
				workflowCompleteStage(slug, stage, "advanced")
				syncSessionMetadata(slug, stFile)

				// Engine-side PR opening: push the stage branch and
				// invoke gh/glab with `--base haiku/<slug>/main` so the
				// MR lands on the intent main branch (NOT the repo
				// default). This was a real footgun — agents would run
				// `gh pr create` without --base and the PR would target
				// the repo default, breaking firstUnmergedStage detection
				// for downstream pickup. The engine now does it
				// programmatically; if both gh and glab fail, we surface
				// the provider-specific compare URL so the user can open
				// the MR in one click.
				let externalReviewMessage: string
				if (isGitRepo()) {
					const { openStagePullRequest } = await import("../../git-worktree.js")
					const opened = openStagePullRequest({ slug, stage })
					if (opened.createdUrl) {
						// Persist the URL on intent.md so the next tick
						// (and the discoverReviewUrl polling in
						// session-api) sees the PR without the agent
						// having to round-trip back with
						// external_review_url.
						try {
							const intentMd = join(intentDir(slug), "intent.md")
							setFrontmatterField(
								intentMd,
								"external_review_url",
								opened.createdUrl,
							)
						} catch {
							/* non-fatal — agent can still pass via run_next */
						}
						externalReviewMessage = withAnnouncement(
							`The user routed stage "${stage}" to external review. The engine opened the MR for you: ${opened.createdUrl}`,
							`Tell the user: "I opened the MR at ${opened.createdUrl} — review and merge it when you're ready. Run /haiku:pickup after the merge to continue." The MR was created against \`haiku/${slug}/main\` (NOT the repo default) so the workflow engine can detect the merge.`,
						)
					} else if (opened.compareUrl) {
						externalReviewMessage = withAnnouncement(
							`The user routed stage "${stage}" to external review. ${opened.message}`,
							`The engine couldn't open the MR programmatically (${opened.prError ?? opened.pushError ?? "no gh/glab on PATH"}). Tell the user to click ${opened.compareUrl} to open it manually — that link pre-fills base \`haiku/${slug}/main\` so the merge signal lands correctly. After they paste the resulting URL back to you, call haiku_run_next { intent: "${slug}", external_review_url: "<url>" }.`,
						)
					} else {
						externalReviewMessage = withAnnouncement(
							`The user routed stage "${stage}" to external review.`,
							`${opened.message} Open ONE merge request from branch \`haiku/${slug}/${stage}\` to \`haiku/${slug}/main\` (NOT the repo default — the engine detects the merge by intent main, not by the default branch). Record the review URL via haiku_run_next { intent: "${slug}", external_review_url: "<url>" }.`,
						)
					}
				} else {
					externalReviewMessage = withAnnouncement(
						`The user routed stage "${stage}" to external review.`,
						`Submit the work for review through your project's review process. Record the review URL via haiku_run_next { intent: "${slug}", external_review_url: "<url>" }. Run /haiku:pickup again after the PR is merged.`,
					)
				}

				const gateResult = {
					action: "external_review_requested",
					intent: slug,
					stage,
					feedback: reviewResult.feedback,
					message: externalReviewMessage,
				}
				return text(withInstructions(gateResult))
			}

			// Revisit-dispatch short-circuit (POST /api/revisit). The
			// HTTP endpoint queues a pending_decision with revisit_*
			// annotations on ReviewAnnotations; we read them straight
			// off the typed return now that ReviewAnnotations carries
			// these optional fields (sessions.ts).
			const revisitAnnotations = reviewResult.annotations
			const revisitAction =
				typeof revisitAnnotations?.revisit_action === "string"
					? revisitAnnotations.revisit_action
					: null
			if (revisitAction) {
				syncSessionMetadata(slug, stFile)
				return text(
					withInstructions({
						action: revisitAction,
						intent: slug,
						stage,
						message:
							revisitAnnotations?.revisit_message ||
							`Revisit dispatched on stage '${stage}'. Follow the instructions returned by the orchestrator.`,
					}),
				)
			}

			const intentDirPathAbs = join(process.cwd(), intentDirPath)
			// Pre-stage intent_review (no active stage) is by definition
			// pre-execute — there's no stage artifact to attach feedback to.
			// Mid-stage gates fall back to per-stage detection.
			const preExecute =
				gateContext === "intent_review" && !stage
					? true
					: gateContext === "elaborate_to_execute" ||
							gateContext === "intent_review"
						? isStagePreExecute(intentDirPathAbs, stage)
						: false

			const feedbackIds =
				preExecute || !stage
					? []
					: writeReviewFeedbackFiles(slug, stage, reviewResult)
			const feedbackSummary =
				feedbackIds.length > 0
					? ` Created ${feedbackIds.length} feedback file(s): ${feedbackIds.join(", ")}.`
					: ""

			if (gateContext === "intent_review") {
				syncSessionMetadata(slug, stFile)
				const gateResult = {
					action: "changes_requested",
					intent: slug,
					stage,
					feedback: reviewResult.feedback,
					annotations: reviewResult.annotations,
					feedback_ids: feedbackIds,
					message: withAnnouncement(
						`The user requested changes on intent "${slug}": ${reviewResult.feedback || "(see annotations)"}.`,
						`${feedbackSummary ? `${feedbackSummary.trim()} ` : ""}Revise the intent description, then call haiku_run_next { intent: "${slug}" } again.`,
					),
				}
				return text(withInstructions(gateResult))
			}

			if (gateContext === "intent_completion") {
				const intentFilePath = join(intentDir(slug), "intent.md")
				setFrontmatterField(intentFilePath, "phase", "active")
				setFrontmatterField(
					intentFilePath,
					"completion_review_dispatched",
					false,
				)
				setFrontmatterField(intentFilePath, "completion_review_skipped", false)
				resetFixLoopBolts(slug, "")
				sealIntentState(slug)
				gitCommitState(
					`haiku: intent ${slug} completion-review rejected, reopening for revisit`,
				)
				syncSessionMetadata(slug, stFile)
				const gateResult = {
					action: "changes_requested",
					intent: slug,
					stage: null,
					gate_context: "intent_completion",
					feedback: reviewResult.feedback,
					annotations: reviewResult.annotations,
					feedback_ids: feedbackIds,
					message: withAnnouncement(
						`The user requested changes at intent-completion review on "${slug}": ${reviewResult.feedback || "(see annotations)"}.`,
						`${feedbackSummary ? `${feedbackSummary.trim()} ` : ""}The intent is no longer in final review. Invoke the /haiku:revisit slash command (or log stage_revisit feedback at the target stage directly via \`haiku_feedback\` with \`resolution: "stage_revisit"\`) to re-open the relevant stage, then address the feedback and call \`haiku_run_next\` to drive back to final review.`,
					),
				}
				return text(withInstructions(gateResult))
			}

			if (gateContext === "elaborate_to_execute") {
				syncSessionMetadata(slug, stFile)
				const unstartedUnits = listUnits(intentDirPathAbs, stage)
					.filter((u) => u.status !== "completed")
					.map((u) => u.name)
				const gateResult = {
					action: "revise_unit_specs",
					intent: slug,
					stage,
					feedback: reviewResult.feedback,
					annotations: reviewResult.annotations,
					unstarted_units: unstartedUnits,
					units_dir: `.haiku/intents/${slug}/stages/${stage}/units/`,
					message: withAnnouncement(
						`The user requested changes on stage "${stage}" unit specs: ${reviewResult.feedback || "(see annotations)"}.`,
						`Nothing has been built yet — NO feedback files were created. Resolve by EDITING the unstarted unit.md files in \`.haiku/intents/${slug}/stages/${stage}/units/\` directly (or adding new unit files if the scope needs expansion). Do NOT draft a full new wave of units to "close feedback" — that's a post-execute flow. When the edits are done, call \`haiku_run_next { intent: "${slug}" }\` again to re-open the review gate.`,
					),
				}
				return text(withInstructions(gateResult))
			}

			syncSessionMetadata(slug, stFile)
			const gateResult = {
				action: "changes_requested",
				intent: slug,
				stage,
				feedback: reviewResult.feedback,
				annotations: reviewResult.annotations,
				feedback_ids: feedbackIds,
				message: withAnnouncement(
					`The user requested changes on stage "${stage}": ${reviewResult.feedback || "(see annotations)"}.`,
					`${feedbackSummary ? `${feedbackSummary.trim()} ` : ""}Address the feedback, then call haiku_run_next { intent: "${slug}" } again.`,
				),
			}
			return text(withInstructions(gateResult))
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err)
			const errorStack = err instanceof Error ? err.stack : ""

			console.error(`[haiku] gate_review failed: ${errorMsg}`)
			reportError(err, { intent: slug, stage })

			try {
				const logDir = join(process.cwd(), ".haiku", "logs")
				mkdirSync(logDir, { recursive: true })
				writeFileSync(
					join(logDir, "gate-review-error.log"),
					`${new Date().toISOString()}\nintent: ${slug}\nstage: ${stage}\nerror: ${errorMsg}\n${errorStack}\n---\n`,
					{ flag: "a" },
				)
			} catch {
				/* non-fatal */
			}

			// "session not found" / "wrong type" errors mean the in-memory
			// session is gone (MCP server restart, prior await consumed it).
			// Surface the actionable hint and let the agent re-enter
			// haiku_run_next, which will recreate the session.
			if (errorMsg.includes("not found") || errorMsg.includes("wrong type")) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Gate review session expired or unavailable: ${errorMsg}. Call haiku_run_next { intent: "${slug}" } to recreate it.`,
						},
					],
					isError: true,
				}
			}

			// Timeouts are NOT errors — they're "still waiting" signals.
			// (2026-05-06) Returning isError: true caused the agent to
			// surface the timeout to the user as a failure ("Review
			// timed out — what should we do?") and trigger noisy retry
			// loops, even though the human was just busy. The wait
			// timeout bound (4h, see _awaitGateReviewSession call above)
			// catches stuck processes; it's not a user-facing fault.
			// Calmer message + isError: false = the agent treats this as
			// a continuation cue and silently re-awaits. See
			// `isAwaitWaitTimeoutError` / `buildAwaitTimeoutResponse`
			// (top of file) for the testable helpers.
			if (isAwaitWaitTimeoutError(errorMsg)) {
				return buildAwaitTimeoutResponse(slug)
			}

			const agentFixable =
				errorMsg.includes("Could not parse intent") ||
				errorMsg.includes("No such file") ||
				errorMsg.includes("ENOENT") ||
				errorMsg.includes("frontmatter") ||
				errorMsg.includes("invalid identifier") ||
				errorMsg.includes("Circular dependency")

			if (agentFixable) {
				syncSessionMetadata(slug, stFile)
				return {
					content: [
						{
							type: "text" as const,
							text: `GATE BLOCKED: ${errorMsg}. This is a data issue the agent can fix — check that the intent directory and files are correctly structured, then call haiku_run_next again.`,
						},
					],
					isError: true,
				}
			}

			if (stFile) {
				logSessionEvent(stFile, {
					event: "gate_review_ui_failed",
					intent: slug,
					stage,
					error: errorMsg,
				})
			}

			// 2026-05-07: elicitation fallback removed. The SPA review
			// pane is the only review surface. If it fails, surface the
			// error so the user can investigate (port conflict, browser
			// blocked, etc.) rather than silently down-shifting to a
			// non-equivalent text confirm.
			syncSessionMetadata(slug, stFile)
			return {
				content: [
					{
						type: "text" as const,
						text: `GATE BLOCKED: Review UI failed to start. Error: ${errorMsg}. Logged to .haiku/logs/gate-review-error.log. Investigate the SPA server (port conflict? blocked browser launch?) then call haiku_run_next { intent: "${slug}" } to retry.`,
					},
				],
				isError: true,
			}
		}
	},
})

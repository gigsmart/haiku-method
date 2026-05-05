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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { ensureOnStageBranch } from "../../git-worktree.js"
import {
	buildGuardResponse,
	completeOrReviewIntent,
	findIncompleteStages,
	getAwaitGateReviewSession,
	getElicitInput,
	isStagePreExecute,
	listUnits,
	resetFixLoopBolts,
	workflowAdvancePhase,
	workflowAdvanceStage,
	workflowCompleteStage,
	workflowIntentComplete,
	writeReviewFeedbackFiles,
} from "../../orchestrator.js"
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
import { text } from "./_text.js"
import { withInstructions as renderInstructions } from "./_with_instructions.js"

function readFrontmatter(filePath: string): Record<string, unknown> {
	if (!existsSync(filePath)) return {}
	const raw = readFileSync(filePath, "utf8")
	const { data } = parseFrontmatter(raw)
	return data
}

export default defineTool({
	name: "haiku_await_gate",
	description:
		"Block on a pending gate-review session for an intent until the user " +
		"approves, requests changes, or the wait times out. Opens the review URL " +
		"in the default browser best-effort (set `auto_open: false` to skip — " +
		"useful for remote control, headless containers, or when the user is " +
		"reviewing on a different device). Returns the resulting orchestrator " +
		"action (advance_stage / changes_requested / external_review_requested / etc.).\n\n" +
		"Call this AFTER haiku_run_next returns a `gate_review` action — that " +
		"action carries the review_url and session_id, and the recommended flow is " +
		"(1) post the URL to the user in chat, (2) call this tool. The tool reads " +
		"the persisted session_id from stage state by default; pass `session_id` " +
		"explicitly to override.",
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
		if (!activeStage) {
			return text(
				`No active stage on intent '${slug}' — nothing to await. Call haiku_run_next first.`,
			)
		}

		const ssPath = stageStatePath(slug, activeStage)
		const stageState = readJson(ssPath)
		const persistedSid =
			(stageState.gate_review_session_id as string | undefined) || ""
		const sessionId = validated.session_id || persistedSid
		if (!sessionId) {
			return text(
				`No pending gate-review session for intent '${slug}' (stage '${activeStage}'). Call haiku_run_next to (re)open the gate.`,
			)
		}

		const stage = activeStage
		const nextStage =
			(stageState.gate_review_next_stage as string | null | undefined) ?? null
		const nextPhase =
			(stageState.gate_review_next_phase as string | null | undefined) ?? null
		const gateContext =
			(stageState.gate_review_context as string | undefined) || "stage_gate"
		const intentDirPath = `.haiku/intents/${slug}`

		const _awaitGateReviewSession = getAwaitGateReviewSession()
		const _elicitInput = getElicitInput()
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
		try {
			const ss = readJson(ssPath)
			delete ss.gate_review_session_id
			delete ss.gate_review_url
			delete ss.gate_review_context
			delete ss.gate_review_next_stage
			delete ss.gate_review_next_phase
			writeJson(ssPath, ss)
		} catch {
			/* non-fatal */
		}

		try {
			const reviewResult = await _awaitGateReviewSession(sessionId, {
				autoOpen,
				reviewUrl,
				timeoutMs: 30 * 60 * 1000,
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
					// preparation and approval (the user can take up to 30 minutes
					// to decide; pre-tick's check at prepare-time isn't enough).
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
					workflowIntentComplete(slug)
					syncSessionMetadata(slug, stFile)
					const gateResult = {
						action: "intent_complete",
						intent: slug,
						studio: studioForCompletion,
						message:
							"Final review approved — intent complete. Report the completion summary to the user.",
					}
					return text(withInstructions(gateResult))
				}
				if (gateContext === "intent_review") {
					const intentFilePath = join(process.cwd(), intentDirPath, "intent.md")
					setFrontmatterField(intentFilePath, "intent_reviewed", true)
					if (nextPhase) workflowAdvancePhase(slug, stage, nextPhase)
					gitCommitState(`haiku: intent ${slug} approved by user`)
					syncSessionMetadata(slug, stFile)
					const gateResult = {
						action: "intent_approved",
						intent: slug,
						stage,
						from_phase: "elaborate",
						to_phase: nextPhase,
						message: `Intent approved — advancing to ${nextPhase || "execute"}. IMPORTANT: Call haiku_run_next { intent: "${slug}" } immediately. Do NOT ask the user — the transition was already approved.`,
					}
					return text(withInstructions(gateResult))
				}
				if (gateContext === "elaborate_to_execute" && nextPhase) {
					workflowAdvancePhase(slug, stage, nextPhase)
					syncSessionMetadata(slug, stFile)
					const gateResult = {
						action: "advance_phase",
						intent: slug,
						stage,
						from_phase: "elaborate",
						to_phase: nextPhase,
						message: `Specs approved — advancing to ${nextPhase}. IMPORTANT: Call haiku_run_next { intent: "${slug}" } immediately. Do NOT ask the user — the transition was already approved.`,
					}
					return text(withInstructions(gateResult))
				}
				if (nextStage) {
					workflowAdvanceStage(slug, stage, nextStage)
					syncSessionMetadata(slug, stFile)
					const gateResult = {
						action: "advance_stage",
						intent: slug,
						stage,
						next_stage: nextStage,
						gate_outcome: "advanced",
						message: `Approved — advancing to '${nextStage}'. IMPORTANT: Call haiku_run_next { intent: "${slug}" } immediately. Do NOT ask the user, do NOT summarize, do NOT say "want me to continue?" — the gate was already approved. Just call the tool.`,
					}
					return text(withInstructions(gateResult))
				}
				workflowCompleteStage(slug, stage, "advanced")
				syncSessionMetadata(slug, stFile)
				const approvedStudio =
					(readFrontmatter(join(intentDir(slug), "intent.md"))
						.studio as string) || ""
				const gateResult = completeOrReviewIntent(
					slug,
					approvedStudio,
					`Stage '${stage}' approved — final stage complete.`,
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
				const gateResult = {
					action: "external_review_requested",
					intent: slug,
					stage,
					feedback: reviewResult.feedback,
					message: isGitRepo()
						? `External review requested. Open ONE merge request from branch 'haiku/${slug}/${stage}' to 'haiku/${slug}/main'. Do NOT open separate MRs for individual units — all unit work is already merged into the stage branch. Include the H·AI·K·U browse link in the description so reviewers can see the intent, units, and knowledge artifacts. Record the review URL via haiku_run_next { intent, external_review_url }. Run /haiku:pickup again after the PR is merged.`
						: `External review requested. Submit the work for review through your project's review process. Record the review URL via haiku_run_next { intent, external_review_url }. Run /haiku:pickup again after the PR is merged.`,
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
			const preExecute =
				gateContext === "elaborate_to_execute" ||
				gateContext === "intent_review"
					? isStagePreExecute(intentDirPathAbs, stage)
					: false

			const feedbackIds = preExecute
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
					message: `Changes requested on intent: ${reviewResult.feedback || "(see annotations)"}.${feedbackSummary} Revise the intent description, then call haiku_run_next { intent: "${slug}" } again.`,
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
					message: `Changes requested on intent completion: ${reviewResult.feedback || "(see annotations)"}.${feedbackSummary} The intent is no longer in final review. Invoke the /haiku:revisit slash command (or log stage_revisit feedback at the target stage directly via \`haiku_feedback\` with \`resolution: "stage_revisit"\`) to re-open the relevant stage, then address the feedback and call \`haiku_run_next\` to drive back to final review.`,
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
					message: `Changes requested on unit specs:\n\n${reviewResult.feedback || "(see annotations)"}\n\nNothing has been built yet — NO feedback files were created. Resolve by EDITING the unstarted unit.md files in \`.haiku/intents/${slug}/stages/${stage}/units/\` directly (or adding new unit files if the scope needs expansion). Do NOT draft a full new wave of units to "close feedback" — that's a post-execute flow. When the edits are done, call \`haiku_run_next { intent: "${slug}" }\` again to re-open the review gate.`,
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
				message: `Changes requested: ${reviewResult.feedback || "(see annotations)"}.${feedbackSummary} Address the feedback, then call haiku_run_next { intent: "${slug}" } again.`,
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

			// Timeouts: agent should retry the await tool to keep waiting.
			if (
				errorMsg.includes("Review timeout") ||
				errorMsg.includes("timeout") ||
				errorMsg.includes("Timeout")
			) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Gate review timed out after 30 minutes with no decision. Call haiku_await_gate { intent: "${slug}" } again to keep waiting, or haiku_run_next { intent: "${slug}" } to recreate the session.`,
						},
					],
					isError: true,
				}
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
					event: "gate_elicitation_fallback",
					intent: slug,
					stage,
					error: errorMsg,
				})
			}

			if (_elicitInput) {
				try {
					const elicitResult = await _elicitInput({
						message:
							gateContext === "intent_review"
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

					const postElicitGuard = ensureOnStageBranch(slug, stage)
					if (!postElicitGuard.ok) {
						return buildGuardResponse(
							slug,
							stage,
							postElicitGuard,
							"after elicitation",
						)
					}

					if (elicitResult.action === "accept" && elicitResult.content) {
						const decision = (elicitResult.content as Record<string, string>)
							.decision
						const feedback =
							(elicitResult.content as Record<string, string>).feedback || ""
						if (decision === "approve") {
							if (gateContext === "intent_review") {
								const intentFilePath = join(
									process.cwd(),
									intentDirPath,
									"intent.md",
								)
								setFrontmatterField(intentFilePath, "intent_reviewed", true)
								if (nextPhase) workflowAdvancePhase(slug, stage, nextPhase)
								gitCommitState(
									`haiku: intent ${slug} approved by user (elicitation)`,
								)
								syncSessionMetadata(slug, stFile)
								return text(
									withInstructions({
										action: "intent_approved",
										intent: slug,
										stage,
										from_phase: "elaborate",
										to_phase: nextPhase,
										message: `Intent approved — advancing to ${nextPhase || "execute"}. Call haiku_run_next immediately.`,
									}),
								)
							}
							if (gateContext === "elaborate_to_execute" && nextPhase) {
								workflowAdvancePhase(slug, stage, nextPhase)
								syncSessionMetadata(slug, stFile)
								return text(
									withInstructions({
										action: "advance_phase",
										intent: slug,
										stage,
										from_phase: "elaborate",
										to_phase: nextPhase,
										message:
											"Specs approved via elicitation — advancing to execute",
									}),
								)
							}
							if (nextStage) {
								workflowAdvanceStage(slug, stage, nextStage)
								syncSessionMetadata(slug, stFile)
								return text(
									withInstructions({
										action: "advance_stage",
										intent: slug,
										stage,
										next_stage: nextStage,
										gate_outcome: "advanced",
										message: "Approved via elicitation",
									}),
								)
							}
							workflowCompleteStage(slug, stage, "advanced")
							syncSessionMetadata(slug, stFile)
							const elicitStudio =
								(readFrontmatter(join(intentDir(slug), "intent.md"))
									.studio as string) || ""
							return text(
								withInstructions(
									completeOrReviewIntent(
										slug,
										elicitStudio,
										"Final stage approved via elicitation.",
									),
								),
							)
						}
						syncSessionMetadata(slug, stFile)
						const changeMsg =
							gateContext === "intent_review"
								? `Changes requested on intent: ${feedback}. Revise the intent description, then call haiku_run_next { intent: "${slug}" } again.`
								: `Changes requested: ${feedback}. Call haiku_run_next { intent: "${slug}" } again after fixing.`
						return text(
							withInstructions({
								action: "changes_requested",
								intent: slug,
								stage,
								feedback,
								message: changeMsg,
							}),
						)
					}
					syncSessionMetadata(slug, stFile)
					return text(
						withInstructions({
							action: "gate_blocked",
							intent: slug,
							stage,
							message:
								"Gate review cancelled. Call haiku_run_next again to retry.",
						}),
					)
				} catch {
					/* fall through */
				}
			}

			syncSessionMetadata(slug, stFile)
			return {
				content: [
					{
						type: "text" as const,
						text: `GATE BLOCKED: Review UI and elicitation both failed. Error: ${errorMsg}. Logged to .haiku/logs/gate-review-error.log. Call haiku_run_next { intent: "${slug}" } to recreate the review session and retry.`,
					},
				],
				isError: true,
			}
		}
	},
})

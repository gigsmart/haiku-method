// http/session-routes.ts — Session-scoped routes:
//
//   - SPA shell GETs (review/question/direction)
//   - Mutation POSTs (decide/answer/select)
//   - Session metadata + heartbeat + revisit
//
// All session-tied; each route resolves the session, validates type,
// and either serves the SPA HTML or persists a state transition. The
// revisit route is the heaviest — it bridges to the orchestrator
// tool dispatcher and rebroadcasts the result via session annotations
// so the parked gate_review waiter unblocks.

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { FastifyInstance } from "fastify"
import {
	DirectionSelectRequestSchema,
	type DirectionSelectResponse,
	QuestionAnswerRequestSchema,
	type QuestionAnswerResponse,
	ReviewDecisionRequestSchema,
	type ReviewDecisionResponse,
	RevisitRequestSchema,
	type RevisitResponse,
	SESSION_ANSWER_MAX_BYTES,
} from "haiku-api"
import { HAIKU_UI_HTML } from "../haiku-ui-html.js"
import { broadcastIntent } from "../intent-broadcaster.js"

// v4: feedback-triage-gate deleted. Replacement predicate: an FB is
// "open" when its frontmatter `closed_at` is null. (status / closed_by
// fields no longer exist post-migration.) Inlined here to avoid a
// circular import via state-tools.
const isFeedbackOpen = (fb: {
	closed_at?: string | null
	status?: string
	closed_by?: string | null
}): boolean => {
	if (typeof fb.closed_at === "string" && fb.closed_at.length > 0) return false
	// Migration shim: pre-v4 FBs that haven't been migrated yet still
	// carry status / closed_by. Treat the v3 closed/addressed/rejected
	// trio as not-open so the route doesn't 409 on legacy data.
	if (
		fb.status === "closed" ||
		fb.status === "addressed" ||
		fb.status === "rejected"
	) {
		return false
	}
	if (typeof fb.closed_by === "string" && fb.closed_by.length > 0) return false
	return true
}

import {
	type DirectionSelection,
	getSession,
	type QuestionAnnotations,
	type QuestionAnswer,
	type ReviewAnnotations,
	recordHeartbeat,
	updateDesignDirectionSession,
	updateQuestionSession,
	updateSession,
} from "../sessions.js"
import {
	gitCommitStateBackgroundPush,
	intentDir,
	parseFrontmatter,
	persistDesignDirectionSelection,
	persistDesignDirectionUploads,
	readFeedbackFiles,
	readJson,
	stageStatePath,
	timestamp,
	writeFeedbackFile,
	writeJson,
} from "../state-tools.js"
import { logFeedbackAction } from "./action-log.js"
import { requireTunnelAuth } from "./auth.js"
import { respondSessionApi } from "./session-api.js"
import { parseBodyWithSchema } from "./validation.js"

export function registerSessionRoutes(instance: FastifyInstance): void {
	// ── SPA shell routes (no auth; token lives in URL fragment) ────────
	instance.get<{ Params: { sessionId: string } }>(
		"/review/:sessionId",
		async (req, reply) => {
			const session = getSession(req.params.sessionId)
			if (!session || session.session_type !== "review") {
				reply.status(404).send("Session not found")
				return
			}
			reply.type("text/html; charset=utf-8").send(HAIKU_UI_HTML)
		},
	)

	instance.get<{ Params: { sessionId: string } }>(
		"/question/:sessionId",
		async (req, reply) => {
			const session = getSession(req.params.sessionId)
			if (!session || session.session_type !== "question") {
				reply.status(404).send("Session not found")
				return
			}
			reply.type("text/html; charset=utf-8").send(HAIKU_UI_HTML)
		},
	)

	instance.get<{ Params: { sessionId: string } }>(
		"/direction/:sessionId",
		async (req, reply) => {
			const session = getSession(req.params.sessionId)
			if (!session || session.session_type !== "design_direction") {
				reply.status(404).send("Session not found")
				return
			}
			reply.type("text/html; charset=utf-8").send(HAIKU_UI_HTML)
		},
	)

	// ── Review decide / question answer / direction select ─────────────
	instance.post<{
		Params: { sessionId: string }
	}>("/review/:sessionId/decide", async (req, reply) => {
		if (!requireTunnelAuth(req, reply, req.params.sessionId)) return
		const session = getSession(req.params.sessionId)
		if (!session || session.session_type !== "review") {
			reply.status(404).send("Session not found")
			return
		}
		const parsed = parseBodyWithSchema(
			reply,
			req.body,
			ReviewDecisionRequestSchema,
		)
		if (!parsed.ok) return
		const decision =
			parsed.data.decision === "approved" ? "approved" : "changes_requested"
		const feedback = parsed.data.feedback ?? ""
		const annotations = parsed.data.annotations as ReviewAnnotations | undefined
		// Live-session model: queue the decision into pending_decision
		// rather than terminally setting status="decided". This is what
		// awaitGateReviewSession drains on entry / on each wake. Mirrors
		// the WS `decide` handler in http/ws.ts so HTTP and WebSocket
		// clients converge on the same consumer path. Without this, the
		// SPA's submit (which goes through HTTP via client.submitDecision)
		// would never reach a blocked await and would time out at 30 min.
		updateSession(req.params.sessionId, {
			pending_decision: {
				decision,
				feedback,
				annotations,
				submitted_at: new Date().toISOString(),
			},
		})
		if (session.intent_slug) {
			broadcastIntent(session.intent_slug, {
				type: "pending_decision_changed",
				session_id: req.params.sessionId,
				queued: true,
			})
		}
		const payload: ReviewDecisionResponse = { ok: true, decision, feedback }
		reply.send(payload)
	})

	instance.post<{
		Params: { sessionId: string }
	}>(
		"/question/:sessionId/answer",
		// Body may carry up to 20 ArtifactAnnotator screenshot data URLs
		// (~1.5 MB each base64-encoded) plus text fields.
		{ bodyLimit: SESSION_ANSWER_MAX_BYTES },
		async (req, reply) => {
			if (!requireTunnelAuth(req, reply, req.params.sessionId)) return
			const session = getSession(req.params.sessionId)
			if (!session || session.session_type !== "question") {
				reply.status(404).send("Session not found")
				return
			}
			const parsed = parseBodyWithSchema(
				reply,
				req.body,
				QuestionAnswerRequestSchema,
			)
			if (!parsed.ok) return
			updateQuestionSession(req.params.sessionId, {
				status: "answered",
				answers: parsed.data.answers as QuestionAnswer[],
				feedback: parsed.data.feedback ?? "",
				annotations: parsed.data.annotations as QuestionAnnotations | undefined,
			})
			const payload: QuestionAnswerResponse = { ok: true }
			reply.send(payload)
		},
	)

	instance.post<{
		Params: { sessionId: string }
	}>(
		"/direction/:sessionId/select",
		// Body may carry up to 20 ArtifactAnnotator screenshot data URLs
		// (~1.5 MB each base64-encoded) plus text fields.
		{ bodyLimit: SESSION_ANSWER_MAX_BYTES },
		async (req, reply) => {
			if (!requireTunnelAuth(req, reply, req.params.sessionId)) return
			const session = getSession(req.params.sessionId)
			if (!session || session.session_type !== "design_direction") {
				reply.status(404).send({ error: "Session not found or expired" })
				return
			}
			if (session.status === "answered") {
				reply
					.status(409)
					.send({ error: "Direction already selected for this session" })
				return
			}
			const parsed = parseBodyWithSchema(
				reply,
				req.body,
				DirectionSelectRequestSchema,
			)
			if (!parsed.ok) return

			// Persist the selection to stage state.json BEFORE waking the
			// MCP tool. This is the durable layer: if the MCP client times
			// out and discards the tool result, the next haiku_run_next
			// still finds `design_direction_selected: true` on disk and
			// emits the `design_direction_complete` recovery action.
			//
			// Three write paths:
			//   1. select mode → persistDesignDirectionSelection — writes
			//      annotated PNG sidecars + state.json with screenshot paths,
			//      with a minimal state-only fallback when there are no
			//      screenshots OR the full persist throws (disk full,
			//      permission denied, etc).
			//   2. upload mode → persistDesignDirectionUploads — decodes
			//      designer-uploaded files onto disk under
			//      `<stage>/artifacts/design-direction/uploads/` and stamps
			//      `design_direction_selected: true` so the next
			//      haiku_run_next surfaces the upload paths.
			//   3. regenerate / generate modes → no persist. The selection
			//      stays in the in-memory session so the await handler can
			//      hand the agent back; the workflow's design_direction_
			//      selected flag remains false so elaborate keeps requiring
			//      the picker until the user picks select or upload.
			//
			// Without these, the elaborate handler would re-emit
			// design_direction_required and the agent would loop into a 409
			// on the closed session.
			// `selection` is the runtime in-memory form of the user's
			// response — paths-only for files, no embedded data URLs. It
			// matches the wire shape for select / regenerate / generate
			// modes and diverges for upload (data_url → path).
			let selection: DirectionSelection =
				parsed.data.mode === "upload"
					? // Placeholder — overwritten in the upload branch below
						// once persistDesignDirectionUploads returns the paths.
						{ mode: "upload", files: [] }
					: parsed.data
			if (parsed.data.mode === "select") {
				const ddSession = getSession(req.params.sessionId)
				const slug =
					ddSession?.session_type === "design_direction"
						? ddSession.intent_slug
						: ""
				const activeStage = slug ? readActiveStage(slug) : ""
				if (slug && activeStage) {
					const screenshots = parsed.data.annotations?.screenshots ?? []
					let persisted = false
					if (screenshots.length > 0) {
						try {
							persistDesignDirectionSelection({
								slug,
								stage: activeStage,
								archetype: parsed.data.archetype,
								...(parsed.data.comments
									? { comments: parsed.data.comments }
									: {}),
								screenshots,
							})
							persisted = true
							// Drop the multi-MB data URLs from the in-memory
							// session; authoritative storage is on disk now and
							// the workflow surfaces them by path on the next
							// haiku_run_next.
							const { annotations: _drop, ...rest } = parsed.data
							selection = parsed.data.annotations?.pins
								? {
										...rest,
										annotations: { pins: parsed.data.annotations.pins },
									}
								: rest
						} catch (err) {
							req.log.error(
								{ err },
								"persistDesignDirectionSelection failed — falling back to minimal state write",
							)
						}
					}
					if (!persisted) {
						// Minimal write covers (a) no-screenshot selects and
						// (b) the persist-throw fallback. Without screenshot
						// paths the recovery action just won't have visual
						// context — but the workflow advances.
						try {
							const ssPath = stageStatePath(slug, activeStage)
							const ssData = readJson(ssPath)
							ssData.design_direction_selected = true
							ssData.design_direction_selected_at = timestamp()
							ssData.design_direction = {
								archetype: parsed.data.archetype,
								...(parsed.data.comments
									? { comments: parsed.data.comments }
									: {}),
							}
							delete ssData.design_direction_surfaced
							writeJson(ssPath, ssData)
						} catch (err) {
							req.log.error(
								{ err },
								"minimal design-direction state write failed — agent may need to re-select",
							)
						}
					}
				}
			}

			if (parsed.data.mode === "upload") {
				const ddSession = getSession(req.params.sessionId)
				const slug =
					ddSession?.session_type === "design_direction"
						? ddSession.intent_slug
						: ""
				const activeStage = slug ? readActiveStage(slug) : ""
				if (slug && activeStage) {
					try {
						const { uploads } = persistDesignDirectionUploads({
							slug,
							stage: activeStage,
							files: parsed.data.files,
							...(parsed.data.comments
								? { comments: parsed.data.comments }
								: {}),
						})
						// Replace the heavy data URLs with paths-only metadata
						// for the in-memory session record. Authoritative
						// storage is on disk now and the workflow surfaces
						// uploads by path on the next haiku_run_next.
						selection = {
							mode: "upload",
							files: uploads,
							...(parsed.data.comments
								? { comments: parsed.data.comments }
								: {}),
						}
					} catch (err) {
						req.log.error(
							{ err },
							"persistDesignDirectionUploads failed — designer uploads not durable",
						)
						reply.status(500).send({
							error: "upload_persist_failed",
							detail: err instanceof Error ? err.message : String(err),
						})
						return
					}
				}
			}

			updateDesignDirectionSession(req.params.sessionId, {
				status: "answered",
				selection,
			})
			const payload: DirectionSelectResponse = { ok: true }
			reply.send(payload)
		},
	)

	// ── Picker: SPA shell + select ─────────────────────────────────────
	// Generic single-select picker (studio / mode / stage / confirm).
	// Replaces MCP elicitation. The blocking tool (e.g.
	// haiku_select_studio) waits on session.status === "answered".
	instance.get<{ Params: { sessionId: string } }>(
		"/picker/:sessionId",
		async (req, reply) => {
			const session = getSession(req.params.sessionId)
			if (!session || session.session_type !== "picker") {
				reply.status(404).send("Session not found")
				return
			}
			reply.type("text/html; charset=utf-8").send(HAIKU_UI_HTML)
		},
	)
	instance.post<{ Params: { sessionId: string } }>(
		"/picker/:sessionId/select",
		async (req, reply) => {
			if (!requireTunnelAuth(req, reply, req.params.sessionId)) return
			const session = getSession(req.params.sessionId)
			if (!session || session.session_type !== "picker") {
				reply.status(404).send({ error: "Session not found or expired" })
				return
			}
			if (session.status === "answered") {
				reply.status(409).send({ error: "Picker already submitted" })
				return
			}
			const body = (req.body ?? {}) as Record<string, unknown>
			const id = typeof body.id === "string" ? body.id : ""
			if (!id) {
				reply.status(400).send({ error: "Missing required field: id" })
				return
			}
			// url_input pickers carry a free-text URL in `id` instead of
			// a selection from a fixed set. Validate URL shape (http(s)://
			// or git+ssh-shaped) but skip the option-set check.
			if (session.kind === "url_input") {
				const trimmed = id.trim()
				if (trimmed.length < 4 || trimmed.length > 2048) {
					reply.status(400).send({
						error: "URL must be 4–2048 characters",
					})
					return
				}
				if (
					!/^https?:\/\//i.test(trimmed) &&
					!/^git@/i.test(trimmed) &&
					!/^ssh:\/\//i.test(trimmed)
				) {
					reply.status(400).send({
						error:
							"URL must start with http://, https://, ssh://, or git@ — paste the full URL",
					})
					return
				}
				const { updatePickerSession } = await import("../sessions.js")
				updatePickerSession(req.params.sessionId, {
					status: "answered",
					selection: { id: trimmed },
				})
				reply.send({ ok: true, id: trimmed })
				return
			}
			const validIds = new Set(session.options.map((o) => o.id))
			if (!validIds.has(id)) {
				reply.status(400).send({
					error: `id "${id}" is not in the option set: ${[...validIds].join(", ")}`,
				})
				return
			}
			const { updatePickerSession } = await import("../sessions.js")
			updatePickerSession(req.params.sessionId, {
				status: "answered",
				selection: { id },
			})
			reply.send({ ok: true, id })
		},
	)

	// ── API: session / heartbeat / revisit ─────────────────────────────
	instance.get<{ Params: { sessionId: string } }>(
		"/api/session/:sessionId",
		async (req, reply) => {
			if (!requireTunnelAuth(req, reply, req.params.sessionId)) return
			respondSessionApi(reply, req.params.sessionId)
		},
	)

	instance.head<{ Params: { sessionId: string } }>(
		"/api/session/:sessionId/heartbeat",
		async (req, reply) => {
			if (!requireTunnelAuth(req, reply, req.params.sessionId)) return
			const ok = recordHeartbeat(req.params.sessionId)
			reply.status(ok ? 200 : 404).send()
		},
	)

	instance.post<{ Params: { sessionId: string } }>(
		"/api/revisit/:sessionId",
		async (req, reply) => {
			if (!requireTunnelAuth(req, reply, req.params.sessionId)) return
			const session = getSession(req.params.sessionId)
			if (!session || session.session_type !== "review") {
				logFeedbackAction({
					reqId: req.id,
					action: "revisit",
					status: 404,
					detail: `session=${req.params.sessionId} not_found_or_wrong_type`,
				})
				reply.status(404).send("Session not found")
				return
			}
			if (!session.intent_slug) {
				logFeedbackAction({
					reqId: req.id,
					action: "revisit",
					status: 409,
					detail: `session=${req.params.sessionId} no_intent_context`,
				})
				reply.status(409).send({ error: "Session has no intent context" })
				return
			}
			const parsed = parseBodyWithSchema(reply, req.body, RevisitRequestSchema)
			if (!parsed.ok) return

			// Resolve target stage — explicit `stage` arg wins, else the
			// intent's active_stage. Without one we can't write the FBs at
			// the right location.
			const slug = session.intent_slug
			const targetStage = parsed.data.stage || readActiveStage(slug)
			if (!targetStage) {
				logFeedbackAction({
					reqId: req.id,
					action: "revisit",
					status: 409,
					intent: slug,
					detail: "no_active_stage",
				})
				reply.status(409).send({
					error: "no_active_stage",
					detail: "intent has no active stage",
				})
				return
			}

			// Two paths:
			//   1. reasons[] provided → write each as a stage_revisit FB.
			//      Origin "user-revisit" auto-stamps `triaged_at:` so the
			//      pre-tick gate routes the rewind on the next tick.
			//   2. no reasons + pending FBs already exist on the stage →
			//      relies on the pre-tick gate seeing those FBs and routing.
			//      No new FBs to write here.
			//
			// In neither case does the HTTP handler call `revisit()` directly
			// — the rewind is a property of the next `haiku_run_next` tick's
			// pre-tick gate, not a synchronous side effect of this endpoint.
			// Same routing path as agent-authored stage_revisit FBs.
			const reasons = parsed.data.reasons ?? []
			if (reasons.length === 0) {
				// Path 2: caller didn't author any new findings. Only meaningful
				// if there is at least one open FB the pre-tick gate can route
				// off — untriaged → `feedback_triage`, triaged on earlier stage
				// → `revisited`, triaged on current stage → `feedback_dispatch`.
				// Resolution doesn't matter; the gate routes regardless of
				// whether it's `stage_revisit`, `inline_fix`, `question`, or
				// `null`. Otherwise the click is a no-op — the user's
				// "Request Changes" intent would silently disappear.
				//
				// `isFeedbackOpen` is the same predicate the pre-tick triage
				// gate uses (closed_by + status !== closed/addressed/rejected).
				// They MUST stay in sync — a divergence here means the HTTP
				// handler reports "you have an open FB" while the gate finds
				// none, recreating the silent-no-op bug this 409 was added to
				// prevent.
				const hasOpenFeedback = readFeedbackFiles(slug, targetStage).some(
					isFeedbackOpen,
				)
				if (!hasOpenFeedback) {
					logFeedbackAction({
						reqId: req.id,
						action: "revisit",
						status: 409,
						intent: slug,
						stage: targetStage,
						detail: "nothing_to_revisit",
					})
					reply.status(409).send({
						error: "nothing_to_revisit",
						detail: `no reasons provided and no open feedback at ${targetStage}`,
					})
					return
				}
			}
			const feedbackCreated: string[] = []
			for (const reason of reasons) {
				try {
					const fb = writeFeedbackFile(slug, targetStage, {
						title: reason.title,
						body: reason.body,
						origin: "user-revisit",
						author: "user",
						resolution: "stage_revisit",
						// User clicked "Request Changes" — that IS the
						// triage decision. Stamp `triaged_at` explicitly so
						// the pre-tick gate routes the rewind on the next
						// tick instead of asking the agent to triage the
						// user's explicit request.
						triaged_at: timestamp(),
					})
					feedbackCreated.push(fb.feedback_id)
				} catch (err) {
					logFeedbackAction({
						reqId: req.id,
						action: "revisit",
						status: 500,
						intent: slug,
						stage: targetStage,
						detail: `feedback_write_failed: ${err instanceof Error ? err.message : String(err)}`,
					})
					reply.status(500).send({
						error: "feedback_write_failed",
						detail: err instanceof Error ? err.message : String(err),
					})
					return
				}
			}
			if (feedbackCreated.length > 0) {
				gitCommitStateBackgroundPush(
					`haiku: revisit feedback in ${targetStage} (${feedbackCreated.length} items)`,
				)
			}

			const message =
				feedbackCreated.length > 0
					? `Created ${feedbackCreated.length} stage_revisit feedback item(s) at \`${targetStage}\`. The next \`haiku_run_next\` tick will route the rewind via the pre-tick gate.`
					: `No new feedback items provided. The next \`haiku_run_next\` tick's pre-tick gate will route the rewind based on existing pending feedback at \`${targetStage}\` (if any).`

			// Wake the gate_review waiter parked inside the agent's
			// haiku_await_gate call. Without this, the agent stays parked
			// for the full timeout and the reviewer's click looks like a
			// no-op. On wake, awaitGateReviewSession drains
			// pending_decision and short-circuits to the revisit dispatch
			// (haiku_await_gate.ts checks annotations.revisit_action).
			//
			// Live-session model: the canonical decision channel is
			// pending_decision, NOT status="decided". The HTTP /decide
			// endpoint was migrated; this revisit endpoint must match or
			// awaitGateReviewSession's loop wakes, finds pending_decision
			// null, and re-blocks for the full 30-min timeout.
			updateSession(req.params.sessionId, {
				pending_decision: {
					decision: "changes_requested",
					feedback: "",
					annotations: {
						revisit_action: "revisit_pending",
						revisit_stage: targetStage,
						revisit_message: message,
					},
					submitted_at: new Date().toISOString(),
				},
			})
			if (session.intent_slug) {
				broadcastIntent(session.intent_slug, {
					type: "pending_decision_changed",
					session_id: req.params.sessionId,
					queued: true,
				})
			}

			const response: RevisitResponse = {
				ok: true,
				action: "revisit_pending",
				stage: targetStage,
				feedback_created: feedbackCreated,
				message,
			}
			logFeedbackAction({
				reqId: req.id,
				action: "revisit",
				status: 200,
				intent: slug,
				stage: targetStage,
				detail: `revisit_action=revisit_pending${
					feedbackCreated.length > 0
						? ` feedback_created=${feedbackCreated.join(",")}`
						: ""
				}`,
			})
			reply.send(response)
		},
	)
}

function readActiveStage(slug: string): string {
	const intentFile = join(intentDir(slug), "intent.md")
	if (!existsSync(intentFile)) return ""
	try {
		const { data } = parseFrontmatter(readFileSync(intentFile, "utf8"))
		return (data.active_stage as string) || ""
	} catch {
		return ""
	}
}

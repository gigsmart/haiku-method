// http/feedback-api.ts — Feedback CRUD + reply + intent-scope listing
// + attachment serving. All routes mounted under /api/feedback*.
//
// Splits the feedback domain out of http.ts so the main module
// stays focused on Fastify lifecycle + cross-cutting concerns. Each
// route enforces:
//   - tunnel auth (requireTunnelAuth)
//   - slug validity for path params
//   - intent + stage existence
//   - mutation auth (verifyFeedbackMutationAuth) on writes
//   - schema parse on bodies (parseBodyWithSchema)
//
// Routes:
//   GET    /api/feedback/:intent/:stage              → list stage feedback
//   GET    /api/feedback-intent/:intent              → list intent-scope feedback
//   GET    /api/feedback-attachment/:intent/:stage/:filename → serve PNG
//   POST   /api/feedback/:intent/:stage              → create
//   PUT    /api/feedback/:intent/:stage/:feedbackId  → update
//   DELETE /api/feedback/:intent/:stage/:feedbackId  → delete
//   POST   /api/feedback/:intent/:stage/:feedbackId/replies → reply

import { join } from "node:path"
import type { FastifyInstance } from "fastify"
import {
	FEEDBACK_BODY_MAX_BYTES,
	FEEDBACK_CREATE_MAX_BYTES,
	FeedbackCreateRequestSchema,
	type FeedbackCreateResponse,
	type FeedbackDeleteResponse,
	type FeedbackListResponse,
	FeedbackReplyCreateRequestSchema,
	type FeedbackReplyCreateResponse,
	FeedbackUpdateRequestSchema,
	type FeedbackUpdateResponse,
} from "haiku-api"
// V-10 (feedback-body XSS defence): every body that flows through this
// router is sanitized server-side via `sanitizeFeedbackBody` before it
// reaches `writeFeedbackFile` / `appendFeedbackReply` (which also call the
// sanitizer for defence-in-depth). Stripping at the route boundary means
// the on-disk artefact, the action-log entry, and any future audit-log
// consumer all see the post-sanitization text — no XSS payload can be
// reconstructed from the raw multipart body after this point.
import { sanitizeFeedbackBody } from "../state/sanitize-feedback.js"
import {
	appendFeedbackReply,
	deleteFeedbackFile,
	dismissFeedbackClosureReply,
	FEEDBACK_STATUSES,
	type FeedbackItem,
	gitCommitStateBackgroundPush,
	intentDir,
	readFeedbackFiles,
	updateFeedbackFile,
	writeFeedbackFile,
} from "../state-tools.js"
import { logFeedbackAction } from "./action-log.js"
import { requireTunnelAuth, verifyFeedbackMutationAuth } from "./auth.js"
import { serveUnderRoot } from "./path-safety.js"
import {
	isValidSlug,
	parseBodyWithSchema,
	validateIntent,
	validateStage,
} from "./validation.js"

export function registerFeedbackRoutes(instance: FastifyInstance): void {
	// ── List stage feedback ────────────────────────────────────────────
	instance.get<{
		Params: { intent: string; stage: string }
	}>("/api/feedback/:intent/:stage", async (req, reply) => {
		if (!requireTunnelAuth(req, reply, null)) return
		const { intent, stage } = req.params
		if (!(isValidSlug(intent) && isValidSlug(stage))) {
			reply.status(400).send({
				error:
					"Invalid slug — must not contain path separators or traversal sequences",
			})
			return
		}
		if (!validateIntent(intent)) {
			reply.status(404).send({ error: "Intent not found" })
			return
		}
		if (!validateStage(intent, stage)) {
			reply.status(404).send({ error: "Stage not found" })
			return
		}
		const statusFilter = (req.query as Record<string, string | undefined>)
			?.status
		if (
			statusFilter &&
			!(FEEDBACK_STATUSES as readonly string[]).includes(statusFilter)
		) {
			reply.status(400).send({
				error: `Invalid status filter. Must be one of: ${FEEDBACK_STATUSES.join(", ")}`,
			})
			return
		}
		let items: FeedbackItem[] = readFeedbackFiles(intent, stage)
		if (statusFilter) {
			items = items.filter((i) => i.status === statusFilter)
		}
		const payload: FeedbackListResponse = {
			intent,
			stage,
			count: items.length,
			items: items.map((i) => ({
				feedback_id: i.id,
				title: i.title,
				body: i.body,
				status: i.status as FeedbackListResponse["items"][number]["status"],
				origin: i.origin as FeedbackListResponse["items"][number]["origin"],
				author: i.author,
				author_type:
					i.author_type as FeedbackListResponse["items"][number]["author_type"],
				created_at: i.created_at,
				iteration: i.visit,
				visit: i.visit,
				source_ref: i.source_ref ?? null,
				closed_by: i.closed_by ?? null,
				resolution: i.resolution as
					| FeedbackListResponse["items"][number]["resolution"]
					| null,
				replies: i.replies.map((r) => ({
					author: r.author,
					author_type: r.author_type,
					body: r.body,
					created_at: r.created_at,
				})),
				inline_anchor: i.inline_anchor ?? null,
				closure_reply: i.closure_reply ?? undefined,
				closure_reply_unread: i.closure_reply_unread,
				scope: "stage" as const,
			})),
		}
		reply.send(payload)
	})

	// ── List intent-scope feedback ─────────────────────────────────────
	// Lives at `.haiku/intents/<slug>/feedback/` (no stage path
	// segment). Written by the studio-level completion review layer
	// and the intent-completion fix loop. The UI fetches this
	// separately from per-stage feedback and merges both into the
	// sidebar so cross-stage findings aren't hidden behind a stage tab.
	instance.get<{
		Params: { intent: string }
	}>("/api/feedback-intent/:intent", async (req, reply) => {
		if (!requireTunnelAuth(req, reply, null)) return
		const { intent } = req.params
		if (!isValidSlug(intent)) {
			reply.status(400).send({
				error:
					"Invalid slug — must not contain path separators or traversal sequences",
			})
			return
		}
		if (!validateIntent(intent)) {
			reply.status(404).send({ error: "Intent not found" })
			return
		}
		const statusFilter = (req.query as Record<string, string | undefined>)
			?.status
		if (
			statusFilter &&
			!(FEEDBACK_STATUSES as readonly string[]).includes(statusFilter)
		) {
			reply.status(400).send({
				error: `Invalid status filter. Must be one of: ${FEEDBACK_STATUSES.join(", ")}`,
			})
			return
		}
		let items: FeedbackItem[] = readFeedbackFiles(intent, "")
		if (statusFilter) {
			items = items.filter((i) => i.status === statusFilter)
		}
		const payload: FeedbackListResponse = {
			intent,
			stage: "",
			count: items.length,
			items: items.map((i) => ({
				feedback_id: i.id,
				title: i.title,
				body: i.body,
				status: i.status as FeedbackListResponse["items"][number]["status"],
				origin: i.origin as FeedbackListResponse["items"][number]["origin"],
				author: i.author,
				author_type:
					i.author_type as FeedbackListResponse["items"][number]["author_type"],
				created_at: i.created_at,
				iteration: i.visit,
				visit: i.visit,
				source_ref: i.source_ref ?? null,
				closed_by: i.closed_by ?? null,
				resolution: i.resolution as
					| FeedbackListResponse["items"][number]["resolution"]
					| null,
				replies: i.replies.map((r) => ({
					author: r.author,
					author_type: r.author_type,
					body: r.body,
					created_at: r.created_at,
				})),
				inline_anchor: i.inline_anchor ?? null,
				closure_reply: i.closure_reply ?? undefined,
				closure_reply_unread: i.closure_reply_unread,
				scope: "intent" as const,
			})),
		}
		reply.send(payload)
	})

	// ── Feedback attachment serve (annotated screenshots) ──────────────
	// `writeFeedbackFile` persists the PNG next to the feedback .md as
	// `FB-NN-<slug>.png` and links it inline via `![annotation](…)`.
	instance.get<{
		Params: { intent: string; stage: string; filename: string }
	}>(
		"/api/feedback-attachment/:intent/:stage/:filename",
		async (req, reply) => {
			if (!requireTunnelAuth(req, reply, null)) return
			const { intent, stage, filename } = req.params
			if (!(isValidSlug(intent) && isValidSlug(stage))) {
				reply.status(400).send({ error: "invalid_slug" })
				return
			}
			// Attachment basenames look like `FB-01-some-slug.png`.
			// Reject path separators or odd characters. SVG excluded —
			// legacy feedback dirs may have .svg files but serving them
			// (even with Content-Disposition) leaves the door open.
			if (!/^[A-Za-z0-9._-]+\.(png|jpg|jpeg|webp)$/.test(filename)) {
				reply.status(400).send({ error: "invalid_filename" })
				return
			}
			const feedbackRoot = join(intentDir(intent), "stages", stage, "feedback")
			await serveUnderRoot(reply, feedbackRoot, filename)
		},
	)

	// ── Create feedback ────────────────────────────────────────────────
	instance.post<{
		Params: { intent: string; stage: string }
	}>(
		"/api/feedback/:intent/:stage",
		// POST allows a larger body — annotated screenshot may ride
		// along as a base64 data URL.
		{ bodyLimit: FEEDBACK_CREATE_MAX_BYTES },
		async (req, reply) => {
			if (!requireTunnelAuth(req, reply, null)) return
			const { intent, stage } = req.params
			if (!(isValidSlug(intent) && isValidSlug(stage))) {
				reply.status(400).send({
					error:
						"Invalid slug — must not contain path separators or traversal sequences",
				})
				return
			}
			if (!validateIntent(intent)) {
				reply.status(404).send({ error: "Intent not found" })
				return
			}
			if (!verifyFeedbackMutationAuth(req, reply, intent)) return
			if (!validateStage(intent, stage)) {
				reply.status(404).send({ error: "Stage not found" })
				return
			}
			const parsed = parseBodyWithSchema(
				reply,
				req.body,
				FeedbackCreateRequestSchema,
			)
			if (!parsed.ok) return
			const inlineAnchorWire = parsed.data.inline_anchor
			// V-10: sanitize body at the route boundary so the on-disk
			// artefact and any audit consumers see post-strip text.
			// `writeFeedbackFile` ALSO calls the sanitizer (defence in
			// depth) — re-sanitizing identical text is idempotent.
			const sanitizedCreateBody = sanitizeFeedbackBody(parsed.data.body)
			const result = writeFeedbackFile(intent, stage, {
				title: parsed.data.title,
				body: sanitizedCreateBody,
				origin: parsed.data.origin,
				author: "user",
				source_ref: parsed.data.source_ref ?? null,
				resolution: parsed.data.resolution ?? null,
				attachmentDataUrl: parsed.data.attachment_data_url ?? null,
				inlineAnchor: inlineAnchorWire
					? {
							selectedText: inlineAnchorWire.selected_text,
							paragraph: inlineAnchorWire.paragraph,
							location: inlineAnchorWire.location,
							...(inlineAnchorWire.comment_id
								? { commentId: inlineAnchorWire.comment_id }
								: {}),
							...(inlineAnchorWire.file_path
								? { filePath: inlineAnchorWire.file_path }
								: {}),
							...(inlineAnchorWire.content_sha
								? { contentSha: inlineAnchorWire.content_sha }
								: {}),
						}
					: null,
			})
			gitCommitStateBackgroundPush(
				`feedback: create ${result.feedback_id} in ${stage}`,
			)
			const response: FeedbackCreateResponse = {
				feedback_id: result.feedback_id,
				file: result.file,
				status: "pending",
				message: `Feedback ${result.feedback_id} created.`,
			}
			logFeedbackAction({
				reqId: req.id,
				action: "feedback.create",
				status: 201,
				intent,
				stage,
				feedbackId: result.feedback_id,
			})
			reply.status(201).send(response)
		},
	)

	// ── Update feedback ────────────────────────────────────────────────
	instance.put<{
		Params: { intent: string; stage: string; feedbackId: string }
	}>(
		"/api/feedback/:intent/:stage/:feedbackId",
		{ bodyLimit: FEEDBACK_BODY_MAX_BYTES },
		async (req, reply) => {
			if (!requireTunnelAuth(req, reply, null)) return
			const { intent, stage, feedbackId } = req.params
			if (
				!(isValidSlug(intent) && isValidSlug(stage) && isValidSlug(feedbackId))
			) {
				reply.status(400).send({
					error:
						"Invalid slug — must not contain path separators or traversal sequences",
				})
				return
			}
			if (!validateIntent(intent)) {
				reply.status(404).send({ error: "Intent not found" })
				return
			}
			if (!verifyFeedbackMutationAuth(req, reply, intent)) return
			const parsed = parseBodyWithSchema(
				reply,
				req.body,
				FeedbackUpdateRequestSchema,
			)
			if (!parsed.ok) return
			if (!validateStage(intent, stage)) {
				reply.status(404).send({ error: "Stage not found" })
				return
			}
			const result = updateFeedbackFile(
				intent,
				stage,
				feedbackId,
				{
					status: parsed.data.status,
					closed_by: parsed.data.closed_by,
					resolution: parsed.data.resolution,
				},
				"human",
			)
			if (!result.ok) {
				if (result.error.includes("not found")) {
					logFeedbackAction({
						reqId: req.id,
						action: "feedback.update",
						status: 404,
						intent,
						stage,
						feedbackId,
						detail: "not_found",
					})
					reply.status(404).send({
						error: `Feedback '${feedbackId}' not found in stage '${stage}'`,
					})
					return
				}
				logFeedbackAction({
					reqId: req.id,
					action: "feedback.update",
					status: 400,
					intent,
					stage,
					feedbackId,
					detail: result.error,
				})
				reply.status(400).send({ error: result.error })
				return
			}
			gitCommitStateBackgroundPush(`feedback: update ${feedbackId} in ${stage}`)
			const response: FeedbackUpdateResponse = {
				feedback_id: feedbackId,
				updated_fields: result.updated_fields,
				message: `Feedback ${feedbackId} updated.`,
			}
			logFeedbackAction({
				reqId: req.id,
				action: "feedback.update",
				status: 200,
				intent,
				stage,
				feedbackId,
				detail: result.updated_fields.join(","),
			})
			reply.send(response)
		},
	)

	// ── Dismiss closure-reply (mark "read") ────────────────────────────
	// The terminal fix-hat advance stamps `closure_reply_unread: true`
	// on the FB. This route flips it to false when the reviewer
	// acknowledges the agent's reply card in the SPA.
	instance.post<{
		Params: { intent: string; stage: string; feedbackId: string }
	}>(
		"/api/feedback/:intent/:stage/:feedbackId/dismiss-reply",
		async (req, reply) => {
			if (!requireTunnelAuth(req, reply, null)) return
			const { intent, stage, feedbackId } = req.params
			if (
				!(isValidSlug(intent) && isValidSlug(stage) && isValidSlug(feedbackId))
			) {
				reply.status(400).send({
					error:
						"Invalid slug — must not contain path separators or traversal sequences",
				})
				return
			}
			if (!validateIntent(intent)) {
				reply.status(404).send({ error: "Intent not found" })
				return
			}
			if (!validateStage(intent, stage)) {
				reply.status(404).send({ error: "Stage not found" })
				return
			}
			if (!verifyFeedbackMutationAuth(req, reply, intent)) return
			const result = dismissFeedbackClosureReply(intent, stage, feedbackId)
			if (!result) {
				reply.status(404).send({
					error: stage
						? `Feedback '${feedbackId}' not found in stage '${stage}'`
						: `Feedback '${feedbackId}' not found (intent-scope)`,
				})
				return
			}
			gitCommitStateBackgroundPush(
				`feedback: dismiss reply ${feedbackId}${stage ? ` in ${stage}` : ""}`,
			)
			reply.send({
				feedback_id: feedbackId,
				dismissed: !result.already_dismissed,
				message: result.already_dismissed
					? `Feedback ${feedbackId} reply was already dismissed.`
					: `Feedback ${feedbackId} reply dismissed.`,
			})
		},
	)

	// ── Delete feedback ────────────────────────────────────────────────
	instance.delete<{
		Params: { intent: string; stage: string; feedbackId: string }
	}>("/api/feedback/:intent/:stage/:feedbackId", async (req, reply) => {
		if (!requireTunnelAuth(req, reply, null)) return
		const { intent, stage, feedbackId } = req.params
		if (
			!(isValidSlug(intent) && isValidSlug(stage) && isValidSlug(feedbackId))
		) {
			reply.status(400).send({
				error:
					"Invalid slug — must not contain path separators or traversal sequences",
			})
			return
		}
		if (!validateIntent(intent)) {
			reply.status(404).send({ error: "Intent not found" })
			return
		}
		if (!verifyFeedbackMutationAuth(req, reply, intent)) return
		if (!validateStage(intent, stage)) {
			reply.status(404).send({ error: "Stage not found" })
			return
		}
		const result = deleteFeedbackFile(intent, stage, feedbackId, "human")
		if (!result.ok) {
			if (result.error.includes("not found")) {
				logFeedbackAction({
					reqId: req.id,
					action: "feedback.delete",
					status: 404,
					intent,
					stage,
					feedbackId,
					detail: "not_found",
				})
				reply.status(404).send({
					error: `Feedback '${feedbackId}' not found in stage '${stage}'`,
				})
				return
			}
			if (result.error.includes("cannot delete")) {
				logFeedbackAction({
					reqId: req.id,
					action: "feedback.delete",
					status: 409,
					intent,
					stage,
					feedbackId,
					detail: "cannot_delete",
				})
				reply
					.status(409)
					.send({ error: result.error.replace(/^Error:\s*/, "") })
				return
			}
			logFeedbackAction({
				reqId: req.id,
				action: "feedback.delete",
				status: 400,
				intent,
				stage,
				feedbackId,
				detail: result.error,
			})
			reply.status(400).send({ error: result.error })
			return
		}
		gitCommitStateBackgroundPush(`feedback: delete ${feedbackId} from ${stage}`)
		const response: FeedbackDeleteResponse = {
			feedback_id: feedbackId,
			deleted: true,
			message: `Feedback ${feedbackId} deleted.`,
		}
		logFeedbackAction({
			reqId: req.id,
			action: "feedback.delete",
			status: 200,
			intent,
			stage,
			feedbackId,
		})
		reply.send(response)
	})

	// ── Feedback reply ─────────────────────────────────────────────────
	// Threaded replies let humans and agents answer questions or
	// document closure reasoning without creating a new feedback item.
	// `close_as_answered: true` flips the parent to `answered` in the
	// same write — used by the agent's `feedback_answer` action and
	// by the reviewer's "reply & close".
	instance.post<{
		Params: { intent: string; stage: string; feedbackId: string }
	}>(
		"/api/feedback/:intent/:stage/:feedbackId/replies",
		{ bodyLimit: FEEDBACK_BODY_MAX_BYTES },
		async (req, reply) => {
			if (!requireTunnelAuth(req, reply, null)) return
			const { intent, stage, feedbackId } = req.params
			if (
				!(isValidSlug(intent) && isValidSlug(stage) && isValidSlug(feedbackId))
			) {
				reply.status(400).send({
					error:
						"Invalid slug — must not contain path separators or traversal sequences",
				})
				return
			}
			if (!validateIntent(intent)) {
				reply.status(404).send({ error: "Intent not found" })
				return
			}
			if (!verifyFeedbackMutationAuth(req, reply, intent)) return
			if (!validateStage(intent, stage)) {
				reply.status(404).send({ error: "Stage not found" })
				return
			}
			const parsed = parseBodyWithSchema(
				reply,
				req.body,
				FeedbackReplyCreateRequestSchema,
			)
			if (!parsed.ok) return
			// V-10: sanitize reply body at the route boundary too.
			const sanitizedReplyBody = sanitizeFeedbackBody(parsed.data.body)
			const result = appendFeedbackReply(
				intent,
				stage,
				feedbackId,
				{
					// FB-01: caller-supplied `author` is ignored at the HTTP
					// trust boundary. Schema accepts the field (back-compat);
					// handler hardcodes it so no caller can claim to be a
					// specific agent/user by name.
					author: "user",
					author_type: "human",
					body: sanitizedReplyBody,
				},
				{ close_as_answered: parsed.data.close_as_answered === true },
			)
			if (!result.ok) {
				if (result.error.includes("not found")) {
					logFeedbackAction({
						reqId: req.id,
						action: "feedback.reply",
						status: 404,
						intent,
						stage,
						feedbackId,
						detail: "not_found",
					})
					reply.status(404).send({
						error: `Feedback '${feedbackId}' not found in stage '${stage}'`,
					})
					return
				}
				logFeedbackAction({
					reqId: req.id,
					action: "feedback.reply",
					status: 400,
					intent,
					stage,
					feedbackId,
					detail: result.error,
				})
				reply.status(400).send({ error: result.error })
				return
			}
			gitCommitStateBackgroundPush(
				`feedback: reply on ${feedbackId} in ${stage}`,
			)
			const response: FeedbackReplyCreateResponse = {
				feedback_id: feedbackId,
				reply_index: result.reply_index,
				status: result.status as FeedbackReplyCreateResponse["status"],
				message: `Reply added to ${feedbackId}.`,
			}
			logFeedbackAction({
				reqId: req.id,
				action: "feedback.reply",
				status: 201,
				intent,
				stage,
				feedbackId,
				detail: `reply_index=${result.reply_index}`,
			})
			reply.status(201).send(response)
		},
	)
}

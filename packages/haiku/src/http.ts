// http.ts — Review HTTP+WebSocket server backed by Fastify.
//
// Historical note: this module was previously ~2,300 lines of
// hand-rolled RFC 6455 frame encoding, CORS header stitching, and
// Web-API ↔ Node http adapter glue. The rewrite moves transport
// concerns (routing, CORS, body size caps, WebSocket upgrade) onto
// Fastify and keeps the domain handlers (session reads, feedback
// CRUD, revisit, review decide, file serving with path-traversal
// defence) intact. Anything surprising below is usually because
// Fastify + @fastify/cors + @fastify/websocket already handle the
// obvious case — we're only coding the project-specific bits.

import { randomUUID } from "node:crypto"
import { appendFileSync, existsSync } from "node:fs"
import { readFile, realpath } from "node:fs/promises"
import { dirname, extname, join, resolve } from "node:path"
import fastifyCors from "@fastify/cors"
import fastifyRateLimit from "@fastify/rate-limit"
import fastifyWebsocket from "@fastify/websocket"
import Fastify, {
	type FastifyInstance,
	type FastifyReply,
	type FastifyRequest,
} from "fastify"
import {
	DEFAULT_BODY_MAX_BYTES,
	DirectionSelectRequestSchema,
	type DirectionSelectResponse,
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
	FileServeParamsSchema,
	QuestionAnswerRequestSchema,
	type QuestionAnswerResponse,
	ReviewDecisionRequestSchema,
	type ReviewDecisionResponse,
	RevisitRequestSchema,
	type RevisitResponse,
	type ValidationError,
	WsClientMessageSchema,
	type WsServerMessage,
	type ZodIssueWire,
} from "haiku-api"
import type { WebSocket as WsWebSocket } from "ws"
import type { ZodTypeAny, z } from "zod"
import { review } from "./config.js"
import { HAIKU_UI_HTML } from "./haiku-ui-html.js"
import { handleOrchestratorTool } from "./orchestrator.js"
import type {
	QuestionAnnotations,
	QuestionAnswer,
	ReviewAnnotations,
} from "./sessions.js"
import {
	getSession,
	recordHeartbeat,
	updateDesignDirectionSession,
	updateQuestionSession,
	updateSession,
} from "./sessions.js"
import {
	appendFeedbackReply,
	deleteFeedbackFile,
	FEEDBACK_STATUSES,
	type FeedbackItem,
	gitCommitStateBackgroundPush,
	intentDir,
	readFeedbackFiles,
	updateFeedbackFile,
	writeFeedbackFile,
} from "./state-tools.js"
import {
	e2eEncrypt,
	isE2EActive,
	isRemoteReviewEnabled,
	verifyTunnelJWT,
} from "./tunnel.js"

// ── MIME and well-known constants ────────────────────────────────────────

const MIME_TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".js": "application/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".md": "text/markdown; charset=utf-8",
	".txt": "text/plain; charset=utf-8",
	".pdf": "application/pdf",
}

const SESSION_CANCEL_LOG_PATH = "/tmp/haiku-session-cancel.log"

function logClose(msg: string): void {
	try {
		appendFileSync(
			SESSION_CANCEL_LOG_PATH,
			`${new Date().toISOString()} ${msg}\n`,
		)
	} catch {
		/* */
	}
	process.stderr.write(`[haiku-mcp] ${msg}\n`)
}

// ── Structured action logging (feedback CRUD + revisit) ─────────────────
//
// Fastify runs with `logger: false`, so we emit a single JSON line per
// feedback mutation / revisit to stderr. Every log line includes the
// request's `reqId` (same value returned in the `X-Request-Id` response
// header) plus the domain keys that let a human correlate
// "why did FB-03 get created twice?" across the stream:
//
//   { ts, reqId, action, intent, stage, feedbackId?, status, detail? }
//
// `status` is the HTTP status code we're about to send. `detail` is an
// optional one-line hint (e.g. error message or created feedback id).
//
// This does NOT replace full request logging (FB-01 tracks that) — it's
// the minimum correlation surface the reviewer asked for in FB-02.
interface FeedbackActionLogFields {
	reqId: string
	action: string
	status: number
	intent?: string | null
	stage?: string | null
	feedbackId?: string | null
	detail?: string | null
}

function logFeedbackAction(fields: FeedbackActionLogFields): void {
	try {
		const line = {
			ts: new Date().toISOString(),
			reqId: fields.reqId,
			action: fields.action,
			status: fields.status,
			...(fields.intent ? { intent: fields.intent } : {}),
			...(fields.stage ? { stage: fields.stage } : {}),
			...(fields.feedbackId ? { feedbackId: fields.feedbackId } : {}),
			...(fields.detail ? { detail: fields.detail } : {}),
		}
		process.stderr.write(`[haiku-mcp][feedback] ${JSON.stringify(line)}\n`)
	} catch {
		/* never let logging break a request */
	}
}

// ── WebSocket registry ───────────────────────────────────────────────────
//
// @fastify/websocket hands us a `WsWebSocket` which wraps `ws`'s
// `WebSocket`. We track one per sessionId so tool handlers can push
// session-update frames via `sendToWebSocket` and force-close via
// `closeSessionConnection`.

const wsConnections = new Map<string, WsWebSocket>()

// Per-session rate-limit state — sliding-window message timestamps.
const wsRateState = new WeakMap<WsWebSocket, number[]>()
// Default WebSocket frame rate limit (frames per second per socket).
// HAIKU_WS_RATE_LIMIT is a TEST OVERRIDE only — not a production tunable. It
// accepts any integer and is clamped to a minimum of 1 so the rate limiter
// can NEVER be disabled through environment configuration. Values <= 0, NaN,
// or unparseable strings fall back to the default (20).
const WS_RATE_LIMIT_DEFAULT = 20
const WS_RATE_LIMIT_PER_SEC = ((): number => {
	const raw = process.env.HAIKU_WS_RATE_LIMIT
	if (raw === undefined) return WS_RATE_LIMIT_DEFAULT
	const parsed = Number.parseInt(raw, 10)
	if (!Number.isFinite(parsed) || parsed <= 0) return WS_RATE_LIMIT_DEFAULT
	// Hard floor of 1 — the rate limiter is ALWAYS on.
	return Math.max(parsed, 1)
})()

function allowWsFrame(socket: WsWebSocket): boolean {
	const now = Date.now()
	const windowStart = now - 1000
	const prior = wsRateState.get(socket) ?? []
	const recent = prior.filter((t) => t > windowStart)
	if (recent.length >= WS_RATE_LIMIT_PER_SEC) {
		wsRateState.set(socket, recent)
		return false
	}
	recent.push(now)
	wsRateState.set(socket, recent)
	return true
}

// ── Resource limits (connections, WS sessions) ────────────────────────────
//
// FB-08: the review HTTP server is a local developer service but nothing
// stops a misbehaving client (or a compromised tunnel) from opening an
// unbounded number of sockets / WebSocket sessions. Each feedback CRUD route
// does synchronous filesystem I/O, so an unbounded connection flood will
// saturate the Node event loop and exhaust file descriptors. We apply two
// caps:
//
//   • HAIKU_MAX_CONNECTIONS — applied to `app.server.maxConnections` after
//     listen completes. Node will refuse further sockets once the cap is hit.
//     Default 256 is well above any real review workflow (one SPA per
//     session) while remaining far below the default FD rlimit (~1024 on
//     macOS, 65536 on Linux).
//   • HAIKU_MAX_WS_SESSIONS — cap on the total number of concurrent
//     WebSocket sessions tracked in `wsConnections`. Excess sessions are
//     closed immediately with RFC 6455 code 1013 (try again later). Default
//     128 — again well above realistic concurrent review usage.
//
// Both env vars accept any integer and are clamped to a minimum of 1 so the
// limits can never be disabled through environment config. Non-numeric or
// non-positive values fall back to the default. For memory headroom, pair
// these with `NODE_OPTIONS=--max-old-space-size=<MB>` at the process
// manager level (documented in the operations runbook).

const MAX_CONNECTIONS_DEFAULT = 256
const MAX_CONNECTIONS = ((): number => {
	const raw = process.env.HAIKU_MAX_CONNECTIONS
	if (raw === undefined) return MAX_CONNECTIONS_DEFAULT
	const parsed = Number.parseInt(raw, 10)
	if (!Number.isFinite(parsed) || parsed <= 0) return MAX_CONNECTIONS_DEFAULT
	return Math.max(parsed, 1)
})()

const MAX_WS_SESSIONS_DEFAULT = 128
const MAX_WS_SESSIONS = ((): number => {
	const raw = process.env.HAIKU_MAX_WS_SESSIONS
	if (raw === undefined) return MAX_WS_SESSIONS_DEFAULT
	const parsed = Number.parseInt(raw, 10)
	if (!Number.isFinite(parsed) || parsed <= 0) return MAX_WS_SESSIONS_DEFAULT
	return Math.max(parsed, 1)
})()

/** Send a JSON text frame to the SPA for a given session. */
export function sendToWebSocket(sessionId: string, data: unknown): void {
	const socket = wsConnections.get(sessionId)
	if (!socket || socket.readyState !== socket.OPEN) return
	try {
		socket.send(JSON.stringify(data))
	} catch {
		/* send may throw if the socket is mid-close */
	}
}

/**
 * Server-initiated end of a session. Fires when the originating MCP
 * tool call is cancelled or the tool's `finally` block cleans up.
 * Sends a typed hint frame (so the SPA's overlay can pick the reason),
 * then closes with RFC 6455 code 4001 in the private-use range.
 */
export function closeSessionConnection(
	sessionId: string,
	reason?: string,
): void {
	logClose(
		`closeSessionConnection(${sessionId}) invoked [build:fastify] reason=${reason ?? "null"}`,
	)
	const socket = wsConnections.get(sessionId)
	if (!socket) {
		logClose(
			`closeSessionConnection(${sessionId}): NO socket registered — SPA has no active WS`,
		)
		return
	}
	try {
		socket.send(
			JSON.stringify({ type: "session-ended", reason: reason ?? null }),
		)
		logClose(`closeSessionConnection(${sessionId}): hint frame queued`)
	} catch (err) {
		logClose(
			`closeSessionConnection(${sessionId}): hint write threw ${err instanceof Error ? err.message : String(err)}`,
		)
	}
	try {
		socket.close(4001, reason ?? "session ended")
		logClose(`closeSessionConnection(${sessionId}): close frame sent`)
	} catch {
		/* */
	}
	wsConnections.delete(sessionId)
}

// ── Body validation helpers ──────────────────────────────────────────────

function validationErrorReply(
	reply: FastifyReply,
	issues: ZodIssueWire[],
	status = 400,
): FastifyReply {
	const payload: ValidationError = { error: "validation_failed", issues }
	return reply.status(status).send(payload)
}

function parseBodyWithSchema<S extends ZodTypeAny>(
	reply: FastifyReply,
	body: unknown,
	schema: S,
): { ok: true; data: z.infer<S> } | { ok: false } {
	const result = schema.safeParse(body)
	if (!result.success) {
		const issues: ZodIssueWire[] = result.error.issues.map((iss) => ({
			code: iss.code,
			message: iss.message,
			path: iss.path as (string | number)[],
		}))
		validationErrorReply(reply, issues)
		return { ok: false }
	}
	return { ok: true, data: result.data as z.infer<S> }
}

// ── Filesystem path-safe resolver (shared across asset serves) ──────────

async function resolvePathSafe(
	root: string,
	requested: string,
): Promise<{ ok: true; path: string } | { ok: false }> {
	const resolvedRoot = resolve(root)
	const resolved = resolve(resolvedRoot, requested)
	if (!resolved.startsWith(`${resolvedRoot}/`) && resolved !== resolvedRoot) {
		return { ok: false }
	}
	try {
		const realResolved = await realpath(resolved).catch(() => null)
		const realBase = await realpath(resolvedRoot).catch(() => resolvedRoot)
		if (
			!realResolved ||
			(!realResolved.startsWith(`${realBase}/`) && realResolved !== realBase)
		) {
			return { ok: false }
		}
		return { ok: true, path: realResolved }
	} catch {
		return { ok: false }
	}
}

/**
 * Schema-level path refinement. Rejects adversarial `..`, `%2e%2e`,
 * null-byte, and backslash fixtures before we even reach the filesystem.
 * Returns a reply on rejection, or null when the path is safe.
 */
function rejectUnsafePathParam(
	reply: FastifyReply,
	sessionId: string,
	filePath: string,
): boolean {
	const parsed = FileServeParamsSchema.safeParse({ sessionId, path: filePath })
	if (parsed.success) return false
	reply.status(403).send({ error: "forbidden_path_traversal" })
	return true
}

async function serveFile(reply: FastifyReply, realPath: string): Promise<void> {
	try {
		const data = await readFile(realPath)
		const ext = extname(realPath).toLowerCase()
		const contentType = MIME_TYPES[ext] ?? "application/octet-stream"
		reply.header("Content-Type", contentType)
		// SVG defense-in-depth: the feedback attachment schema already
		// rejects `svg+xml` on POST (see FeedbackCreateRequestSchema),
		// but a legacy intent directory could still contain `.svg`
		// files from before that rejection, and `/mockups/`,
		// `/wireframe/`, `/stage-artifacts/` also route through here
		// for arbitrary session files. Browsers execute `<script>` in
		// inline-rendered SVGs under the serving origin — in tunnel
		// mode that's the reviewer's privileged tab. Force the
		// browser to download instead of render, so a malicious SVG
		// can't run JavaScript against the tunnel origin.
		if (ext === ".svg") {
			reply.header("Content-Disposition", "attachment")
		}
		reply.send(data)
	} catch {
		reply.status(404).send("Not found")
	}
}

async function serveUnderRoot(
	reply: FastifyReply,
	rootDir: string,
	filePath: string,
): Promise<void> {
	const safe = await resolvePathSafe(rootDir, filePath)
	if (!safe.ok) {
		reply.status(403).send({ error: "forbidden_path_traversal" })
		return
	}
	return serveFile(reply, safe.path)
}

// ── Tunnel-auth extraction and enforcement ──────────────────────────────

function extractTunnelToken(req: FastifyRequest): string | null {
	const authz = req.headers.authorization
	if (authz) {
		const m = authz.match(/^Bearer\s+(.+)$/i)
		if (m) {
			const raw = m[1].trim()
			if (raw) return raw
		}
	}
	const t = (req.query as Record<string, string | undefined>)?.t
	return t?.trim() || null
}

function requireTunnelAuth(
	req: FastifyRequest,
	reply: FastifyReply,
	expectedSid: string | null,
): boolean {
	if (!isRemoteReviewEnabled()) return true
	const token = extractTunnelToken(req)
	if (!token) {
		reply.status(401).send({ error: "unauthorized", reason: "missing_token" })
		return false
	}
	const result = verifyTunnelJWT(token, expectedSid)
	if (!result.ok) {
		reply.status(401).send({ error: "unauthorized", reason: result.reason })
		return false
	}
	return true
}

function verifyFeedbackMutationAuth(
	req: FastifyRequest,
	reply: FastifyReply,
	intent: string,
): boolean {
	// Local (non-tunneled) mode binds loopback-only. Any caller reaching
	// us already has localhost access, so no extra gate is needed.
	if (!isRemoteReviewEnabled()) return true

	// Tunnel mode: `requireTunnelAuth` has already validated the bearer
	// JWT before we get here. Extract the session id from the JWT claims
	// — that's the session this request is bound to, full stop. No
	// separate `X-Haiku-Session-Id` header required; the JWT is the only
	// source of truth.
	const token = extractTunnelToken(req)
	if (!token) {
		reply.status(401).send({ error: "unauthorized", reason: "missing_token" })
		return false
	}
	const verified = verifyTunnelJWT(token, null)
	if (!verified.ok) {
		reply.status(401).send({ error: "unauthorized", reason: verified.reason })
		return false
	}
	const sessionId = verified.payload.sid
	const session = getSession(sessionId)
	if (!session) {
		reply
			.status(403)
			.send({ error: "forbidden_cross_session", reason: "unknown_session" })
		return false
	}
	const sessionIntent =
		session.session_type === "review" ? session.intent_slug : undefined
	if (sessionIntent !== intent) {
		reply
			.status(403)
			.send({ error: "forbidden_cross_session", reason: "intent_mismatch" })
		return false
	}
	return true
}

// ── E2E encryption wrapper (Fastify onSend hook) ────────────────────────

async function e2eOnSend(
	req: FastifyRequest,
	reply: FastifyReply,
	payload: unknown,
): Promise<unknown> {
	if (reply.statusCode >= 400) return payload
	if (
		reply.statusCode === 204 ||
		reply.statusCode === 205 ||
		reply.statusCode === 304
	) {
		return payload
	}
	const sessionId = extractSessionIdFromPath(req.url.split("?")[0])
	if (!sessionId || !isE2EActive(sessionId)) return payload
	const contentType =
		(reply.getHeader("content-type") as string | undefined) ??
		"application/octet-stream"
	let bodyBuffer: Buffer
	if (typeof payload === "string") {
		bodyBuffer = Buffer.from(payload, "utf8")
	} else if (Buffer.isBuffer(payload)) {
		bodyBuffer = payload
	} else if (payload instanceof Uint8Array) {
		bodyBuffer = Buffer.from(payload)
	} else if (payload && typeof payload === "object") {
		bodyBuffer = Buffer.from(JSON.stringify(payload), "utf8")
	} else {
		return payload
	}
	const encrypted = e2eEncrypt(sessionId, bodyBuffer)
	if (!encrypted) return payload
	reply.header("Content-Type", "application/octet-stream")
	reply.header("X-Original-Content-Type", contentType)
	reply.header("X-E2E-Encrypted", "1")
	return encrypted
}

function extractSessionIdFromPath(path: string): string | null {
	const match = path.match(
		/\/(?:api\/session|review|question|direction|files|mockups|wireframe|stage-artifacts|question-image)\/([^/]+)/,
	)
	return match?.[1] ?? null
}

// ── Session API domain handlers (shape preserved from prior revision) ──

function respondSessionApi(reply: FastifyReply, sessionId: string): void {
	const session = getSession(sessionId)
	if (!session) {
		reply.status(404).send({ error: "Session not found" })
		return
	}
	const data: Record<string, unknown> = {
		session_id: session.session_id,
		session_type: session.session_type,
		status: session.status,
	}
	if (session.session_type === "review") {
		data.intent_slug = session.intent_slug
		data.review_type = session.review_type
		data.gate_type = session.gate_type || "ask"
		data.target = session.target
		data.decision = session.decision
		data.feedback = session.feedback
		if (session.annotations) data.annotations = session.annotations
		if (session.parsedIntent) data.intent = session.parsedIntent
		if (session.parsedUnits) data.units = session.parsedUnits
		if (session.parsedCriteria) data.criteria = session.parsedCriteria
		if (session.parsedMermaid) data.mermaid = session.parsedMermaid
		if (session.intentMockups) data.intent_mockups = session.intentMockups
		if (session.unitMockups) {
			const obj: Record<string, unknown> = {}
			if (session.unitMockups instanceof Map) {
				for (const [k, v] of session.unitMockups) obj[k] = v
			} else {
				Object.assign(obj, session.unitMockups)
			}
			data.unit_mockups = obj
		}
		if (session.stageStates) data.stage_states = session.stageStates
		if (session.knowledgeFiles) data.knowledge_files = session.knowledgeFiles
		if (session.stageArtifacts) data.stage_artifacts = session.stageArtifacts
		if (session.outputArtifacts) data.output_artifacts = session.outputArtifacts
		if (session.previousReview) data.previous_review = session.previousReview
		if (session.ad_hoc) data.ad_hoc = true
		if (session.stage) data.stage = session.stage
	}
	if (session.session_type === "question") {
		data.title = session.title
		data.context = session.context
		data.questions = session.questions
		data.answers = session.answers
		const imagePaths = session.imagePaths ?? []
		data.image_urls = imagePaths.map(
			(_: string, i: number) => `/question-image/${session.session_id}/${i}`,
		)
	}
	if (session.session_type === "design_direction") {
		data.title = "Design Direction"
		data.intent_slug = session.intent_slug
		data.archetypes = session.archetypes
		data.parameters = session.parameters
		data.selection = session.selection
	}
	reply.send(data)
}

// ── Slug sanitisation + feedback validators ─────────────────────────────

function isValidSlug(value: string): boolean {
	let decoded: string
	try {
		decoded = decodeURIComponent(value)
	} catch {
		return false
	}
	if (decoded.includes("\x00")) return false
	return !/[/\\]|\.\./.test(decoded)
}

function validateIntent(slug: string): boolean {
	try {
		const intentRoot = intentDir(slug)
		return existsSync(join(intentRoot, "intent.md"))
	} catch {
		return false
	}
}

function validateStage(slug: string, stage: string): boolean {
	try {
		const root = intentDir(slug)
		return existsSync(join(root, "stages", stage))
	} catch {
		return false
	}
}

// ── WebSocket message dispatch ──────────────────────────────────────────

function handleWebSocketMessage(sessionId: string, raw: string): void {
	let parsed: unknown
	try {
		parsed = JSON.parse(raw)
	} catch {
		sendToWebSocket(sessionId, {
			type: "error",
			error: "invalid_json",
		} satisfies WsServerMessage)
		return
	}
	const schemaResult = WsClientMessageSchema.safeParse(parsed)
	if (!schemaResult.success) {
		sendToWebSocket(sessionId, {
			type: "error",
			error: "invalid_ws_frame",
		} satisfies WsServerMessage)
		return
	}
	const msg = schemaResult.data
	const session = getSession(sessionId)
	if (!session) return

	if (session.session_type === "review" && msg.type === "decide") {
		const decision =
			msg.decision === "approved" ? "approved" : "changes_requested"
		const feedback = msg.feedback ?? ""
		const annotations = msg.annotations as ReviewAnnotations | undefined
		updateSession(sessionId, {
			status: "decided" as never,
			decision,
			feedback,
			annotations,
		})
		sendToWebSocket(sessionId, {
			type: "ack",
			ok: true,
			decision,
			feedback,
		} satisfies WsServerMessage)
	} else if (session.session_type === "question" && msg.type === "answer") {
		const annotations = msg.annotations as QuestionAnnotations | undefined
		updateQuestionSession(sessionId, {
			status: "answered",
			answers: msg.answers as QuestionAnswer[],
			feedback: msg.feedback ?? "",
			annotations,
		})
		sendToWebSocket(sessionId, {
			type: "ack",
			ok: true,
		} satisfies WsServerMessage)
	} else if (
		session.session_type === "design_direction" &&
		msg.type === "select"
	) {
		if (session.status === "answered") {
			sendToWebSocket(sessionId, {
				type: "error",
				error: "Direction already selected",
			} satisfies WsServerMessage)
			return
		}
		const annotations = msg.annotations as
			| {
					screenshot?: string
					pins?: Array<{ x: number; y: number; text: string }>
			  }
			| undefined
		updateDesignDirectionSession(sessionId, {
			status: "answered",
			selection: {
				archetype: msg.archetype,
				parameters: msg.parameters,
				comments: msg.comments,
				annotations,
			},
		})
		sendToWebSocket(sessionId, {
			type: "ack",
			ok: true,
		} satisfies WsServerMessage)
	}
}

// ── Fastify app construction ────────────────────────────────────────────

let app: FastifyInstance | null = null
let actualPort: number | null = null
// Readiness flag — flipped to `true` only after buildApp() and post-listen
// initialization complete inside startHttpServer(). The `/health` route uses
// this to split liveness (process is up) from readiness (process can serve
// traffic). Tunnel probes and load balancers should gate on HTTP 200 vs 503.
let ready = false

export function getActualPort(): number | null {
	return actualPort
}

export function isReady(): boolean {
	return ready
}

// Test hook — reset readiness state so in-process tests that rebuild the
// app can exercise the 503-then-200 transition without spawning a new
// process. Not exported from the package entry point.
export function _resetReadyForTests(): void {
	ready = false
}

function resolveAllowedCorsOrigin(origin: string | undefined): string | null {
	if (!origin) return null
	const configured = review.allowedOrigins.filter((o) => o && o !== "*")
	const allowList = configured.length > 0 ? configured : [review.siteUrl]
	return allowList.includes(origin) ? origin : null
}

async function buildApp(): Promise<FastifyInstance> {
	const instance = Fastify({
		logger: false,
		// Conservative default cap — per-route overrides live on routes.
		bodyLimit: DEFAULT_BODY_MAX_BYTES,
		// Fastify will reject unknown content types by default; keep it
		// permissive so our existing handlers can deal with raw buffers
		// when needed (e.g. E2E-encrypted payloads on ingress, if ever).
		disableRequestLogging: true,
		// Correlation ID per request. Honour an inbound X-Request-Id when
		// the caller (reverse proxy, browser, tunnel) already minted one
		// so a single ID spans the whole hop chain; otherwise generate a
		// fresh UUID. This gives feedback CRUD + revisit handlers a stable
		// reqId to tag log lines with (see logFeedbackAction below).
		genReqId: (req) => {
			const incoming = req.headers["x-request-id"]
			if (
				typeof incoming === "string" &&
				incoming.length > 0 &&
				incoming.length <= 128
			) {
				return incoming
			}
			if (Array.isArray(incoming) && incoming[0]) {
				const first = incoming[0]
				if (first.length > 0 && first.length <= 128) return first
			}
			return randomUUID()
		},
		requestIdHeader: "x-request-id",
	})

	// Expose the request ID back to the client via X-Request-Id response
	// header so reviewers can grep logs for a specific click. We set it
	// in `onRequest` — before any handler runs and before headers are
	// flushed — so streaming responses (file serves) don't trigger
	// ERR_HTTP_HEADERS_SENT on a late `reply.header()`. We also stamp
	// req.startTime here so `onResponse` can emit a latency figure.
	instance.addHook("onRequest", async (req, reply) => {
		if (!reply.getHeader("x-request-id")) {
			reply.header("x-request-id", req.id)
		}
		;(req as unknown as { startTime: bigint }).startTime =
			process.hrtime.bigint()
	})

	// Structured per-request logging (FB-01 + FB-04). Fastify runs
	// `logger: false`, so without this hook every request would be
	// completely invisible to operators. We emit one JSON line per
	// response with `reqId`, `method`, `url`, `statusCode`, and
	// `responseTimeMs` — covering the latency + traffic + errors golden
	// signals for every feedback CRUD, revisit, review, WS, and static-
	// asset route. Level varies by status: info for 2xx/3xx, warn for
	// 4xx, error for 5xx. Logging must never throw — we swallow
	// JSON.stringify failures defensively.
	instance.addHook("onResponse", async (req, reply) => {
		const statusCode = reply.statusCode
		const start =
			(req as unknown as { startTime?: bigint }).startTime ?? undefined
		const responseTimeMs =
			start !== undefined
				? Number(process.hrtime.bigint() - start) / 1_000_000
				: undefined
		const level =
			statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info"
		try {
			console.error(
				JSON.stringify({
					level,
					event: "http_response",
					reqId: req.id,
					method: req.method,
					url: req.url,
					statusCode,
					...(responseTimeMs !== undefined
						? { responseTimeMs: Math.round(responseTimeMs * 100) / 100 }
						: {}),
				}),
			)
		} catch {
			// Logging must never throw.
		}
	})

	// CORS — only emit headers when remote review is enabled.
	if (isRemoteReviewEnabled()) {
		await instance.register(fastifyCors, {
			origin: (origin, cb) => {
				// `origin` is undefined on same-origin/no-origin requests.
				cb(null, resolveAllowedCorsOrigin(origin) ?? false)
			},
			credentials: false,
			methods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"],
			allowedHeaders: [
				"Authorization",
				"Content-Type",
				"bypass-tunnel-reminder",
			],
			exposedHeaders: ["X-E2E-Encrypted", "X-Original-Content-Type"],
			// Preflight from a DISALLOWED origin still gets 204 with NO
			// ACAO/ACAM/ACAH/ACEH headers — matches the previous hand-
			// rolled behaviour and the test contract. The browser sees
			// no CORS grant and blocks the real request; 404 instead
			// would leak route existence differently.
			strictPreflight: false,
			preflightContinue: false,
		})
	}

	// FB-06: register @fastify/rate-limit in remote mode. The dependency
	// was declared in package.json but never wired up — public-tunnel
	// HTTP routes had no request-rate cap, leaving the single-authenticated-
	// session JWT window open to flood attacks. 60 req/min per IP is a
	// generous operator ceiling; a single reviewer clicking rapidly hits
	// maybe 5-10 req/min. Env overrides: `HAIKU_HTTP_RATE_MAX` (int, >=1)
	// and `HAIKU_HTTP_RATE_WINDOW_MS` (int, >=1000).
	if (isRemoteReviewEnabled()) {
		const rateMax = (() => {
			const raw = process.env.HAIKU_HTTP_RATE_MAX
			const n = raw ? Number.parseInt(raw, 10) : NaN
			return Number.isFinite(n) && n >= 1 ? n : 60
		})()
		const rateWindow = (() => {
			const raw = process.env.HAIKU_HTTP_RATE_WINDOW_MS
			const n = raw ? Number.parseInt(raw, 10) : NaN
			return Number.isFinite(n) && n >= 1000 ? n : 60_000
		})()
		await instance.register(fastifyRateLimit, {
			max: rateMax,
			timeWindow: rateWindow,
		})
	}

	await instance.register(fastifyWebsocket, {
		options: {
			// Max payload per frame. The schema-level cap in haiku-api
			// informs the number; keeping both aligned avoids drift
			// between "frame too big" at the transport vs the validator.
			maxPayload: 64 * 1024,
		},
	})

	// E2E encryption hook — wraps all JSON/text/buffer bodies when the
	// session is in E2E mode. `onSend` is the documented place for
	// mutating both headers and payload; it runs after serialization so
	// the payload is a Buffer/string by the time we see it. Short-
	// circuits when no session match or E2E isn't active.
	instance.addHook("onSend", async (req, reply, payload) => {
		const sessionId = extractSessionIdFromPath((req.url ?? "/").split("?")[0])
		if (!sessionId || !isE2EActive(sessionId)) return payload
		if (reply.statusCode >= 400) return payload
		try {
			return await e2eOnSend(req, reply, payload)
		} catch {
			return payload
		}
	})

	// ── SPA shell routes (no auth; token lives in URL fragment) ─────────

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

	// ── Review decide / question answer / direction select (mutations) ──

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
		updateSession(req.params.sessionId, {
			status: "decided",
			decision,
			feedback,
			annotations,
		})
		const payload: ReviewDecisionResponse = { ok: true, decision, feedback }
		reply.send(payload)
	})

	instance.post<{
		Params: { sessionId: string }
	}>("/question/:sessionId/answer", async (req, reply) => {
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
	})

	instance.post<{
		Params: { sessionId: string }
	}>("/direction/:sessionId/select", async (req, reply) => {
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
		updateDesignDirectionSession(req.params.sessionId, {
			status: "answered",
			selection: {
				archetype: parsed.data.archetype,
				parameters: parsed.data.parameters,
			},
		})
		const payload: DirectionSelectResponse = { ok: true }
		reply.send(payload)
	})

	// ── Asset serves (path-traversal hardened) ──────────────────────────

	instance.get<{ Params: { sessionId: string; "*": string } }>(
		"/files/:sessionId/*",
		async (req, reply) => {
			const { sessionId } = req.params
			const filePath = (req.params as Record<string, string>)["*"]
			if (!requireTunnelAuth(req, reply, sessionId)) return
			if (rejectUnsafePathParam(reply, sessionId, filePath)) return
			const session = getSession(sessionId)
			if (!session) {
				reply.status(404).send("Session not found")
				return
			}
			const intentDirPath =
				session.session_type === "review" ? session.intent_dir : null
			const haikuKnowledgeDir = intentDirPath
				? resolve(dirname(dirname(intentDirPath)), "knowledge")
				: null
			const allowedBases = [intentDirPath, haikuKnowledgeDir].filter(
				(d): d is string => d !== null,
			)
			if (allowedBases.length === 0) {
				reply.status(404).send("Not found")
				return
			}
			let escaped = false
			for (const baseDir of allowedBases) {
				const safe = await resolvePathSafe(baseDir, filePath)
				if (!safe.ok) {
					escaped = true
					continue
				}
				return serveFile(reply, safe.path)
			}
			if (escaped) {
				reply.status(403).send({ error: "forbidden_path_traversal" })
				return
			}
			reply.status(404).send("Not found")
		},
	)

	instance.get<{ Params: { sessionId: string; "*": string } }>(
		"/mockups/:sessionId/*",
		async (req, reply) => {
			const { sessionId } = req.params
			const filePath = (req.params as Record<string, string>)["*"]
			if (!requireTunnelAuth(req, reply, sessionId)) return
			if (rejectUnsafePathParam(reply, sessionId, filePath)) return
			const session = getSession(sessionId)
			if (!session || session.session_type !== "review") {
				reply.status(404).send("Session not found")
				return
			}
			return serveUnderRoot(
				reply,
				join(session.intent_dir, "mockups"),
				filePath,
			)
		},
	)

	instance.get<{ Params: { sessionId: string; "*": string } }>(
		"/wireframe/:sessionId/*",
		async (req, reply) => {
			const { sessionId } = req.params
			const filePath = (req.params as Record<string, string>)["*"]
			if (!requireTunnelAuth(req, reply, sessionId)) return
			if (rejectUnsafePathParam(reply, sessionId, filePath)) return
			const session = getSession(sessionId)
			if (!session || session.session_type !== "review") {
				reply.status(404).send("Session not found")
				return
			}
			return serveUnderRoot(reply, session.intent_dir, filePath)
		},
	)

	instance.get<{ Params: { sessionId: string; "*": string } }>(
		"/stage-artifacts/:sessionId/*",
		async (req, reply) => {
			const { sessionId } = req.params
			const filePath = (req.params as Record<string, string>)["*"]
			if (!requireTunnelAuth(req, reply, sessionId)) return
			if (rejectUnsafePathParam(reply, sessionId, filePath)) return
			const session = getSession(sessionId)
			if (!session || session.session_type !== "review") {
				reply.status(404).send("Session not found")
				return
			}
			return serveUnderRoot(reply, session.intent_dir, filePath)
		},
	)

	instance.get<{ Params: { sessionId: string; index: string } }>(
		"/question-image/:sessionId/:index",
		async (req, reply) => {
			const { sessionId } = req.params
			const index = Number.parseInt(req.params.index, 10)
			if (!requireTunnelAuth(req, reply, sessionId)) return
			const session = getSession(sessionId)
			if (!session || session.session_type !== "question") {
				reply.status(404).send("Session not found")
				return
			}
			const imagePaths = session.imagePaths ?? []
			if (index < 0 || index >= imagePaths.length) {
				reply.status(404).send("Image index out of range")
				return
			}
			const imagePath = imagePaths[index]
			if (!imagePath.startsWith("/")) {
				reply.status(403).send("Forbidden")
				return
			}
			const allowedBaseDir = session.imageBaseDirs?.[index]
			if (allowedBaseDir) {
				try {
					const realResolved = await realpath(imagePath).catch(() => null)
					const realBase = await realpath(allowedBaseDir).catch(() =>
						resolve(allowedBaseDir),
					)
					if (
						!realResolved ||
						(!realResolved.startsWith(`${realBase}/`) &&
							realResolved !== realBase)
					) {
						reply.status(403).send("Forbidden")
						return
					}
				} catch {
					reply.status(403).send("Forbidden")
					return
				}
			}
			return serveFile(reply, imagePath)
		},
	)

	// ── API: session / heartbeat / review-current / revisit ─────────────

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
			const args: {
				intent: string
				stage?: string
				reasons?: Array<{ title: string; body: string }>
			} = { intent: session.intent_slug }
			if (parsed.data.stage) args.stage = parsed.data.stage
			if (parsed.data.reasons) args.reasons = parsed.data.reasons
			const toolResult = await handleOrchestratorTool("haiku_revisit", args)
			const text = toolResult.content
				.filter((c) => c.type === "text")
				.map((c) => (c as { text: string }).text)
				.join("\n")
			if (toolResult.isError) {
				logFeedbackAction({
					reqId: req.id,
					action: "revisit",
					status: 409,
					intent: session.intent_slug,
					stage: parsed.data.stage ?? null,
					detail: `revisit_failed: ${text.slice(0, 200)}`,
				})
				reply.status(409).send({ error: "revisit_failed", detail: text })
				return
			}
			let action = "revisit"
			let stage: string | undefined
			let feedbackCreated: string[] | undefined
			let message = text
			try {
				const parsedAction = JSON.parse(text) as Record<string, unknown>
				action =
					typeof parsedAction.action === "string" ? parsedAction.action : action
				if (typeof parsedAction.stage === "string") stage = parsedAction.stage
				if (Array.isArray(parsedAction.feedback_created)) {
					feedbackCreated = parsedAction.feedback_created.filter(
						(v): v is string => typeof v === "string",
					)
				}
				if (typeof parsedAction.message === "string") {
					message = parsedAction.message
				}
			} catch {
				/* */
			}
			// Wake the gate_review waiter blocked inside the MCP tool call.
			// Without this, `waitForSession()` stays parked for the full
			// 30-minute timeout and the reviewer's click looks like a no-op
			// — the HTTP response returns 200 to the browser but the agent
			// never sees the decision.
			//
			// IMPORTANT: we carry the revisit's action + message in
			// `annotations.revisit_action` / `annotations.revisit_message`
			// and keep `feedback` EMPTY. Stuffing the dispatch message
			// into `feedback` would make the gate_review handler treat it
			// as reviewer-typed prose and write a brand-new feedback file
			// from the instruction text itself — an ouroboros bug that
			// mirrored the dispatch message back as a new finding on the
			// next run. The handler now reads `revisit_action` on wake
			// and short-circuits to the dispatch result verbatim.
			updateSession(req.params.sessionId, {
				status: "decided",
				decision: "changes_requested",
				feedback: "",
				annotations: {
					...(action ? { revisit_action: action } : {}),
					...(stage ? { revisit_stage: stage } : {}),
					...(message ? { revisit_message: message } : {}),
				} as unknown as Parameters<typeof updateSession>[1]["annotations"],
			})
			const response: RevisitResponse = {
				ok: true,
				action,
				stage,
				feedback_created: feedbackCreated,
				message,
			}
			logFeedbackAction({
				reqId: req.id,
				action: "revisit",
				status: 200,
				intent: session.intent_slug,
				stage: stage ?? null,
				detail: `revisit_action=${action}${
					feedbackCreated && feedbackCreated.length > 0
						? ` feedback_created=${feedbackCreated.join(",")}`
						: ""
				}`,
			})
			reply.send(response)
		},
	)

	// ── Feedback CRUD ──────────────────────────────────────────────────

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
				scope: "stage" as const,
			})),
		}
		reply.send(payload)
	})

	// Intent-scope feedback — lives at `.haiku/intents/<slug>/feedback/`
	// (no stage path segment). Written by the studio-level completion
	// review layer and the intent-completion fix loop. The UI fetches
	// this separately from per-stage feedback and merges both into the
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
				scope: "intent" as const,
			})),
		}
		reply.send(payload)
	})

	// ── Feedback attachment serve (annotated screenshots) ──────────────
	//
	// `writeFeedbackFile` persists the PNG next to the feedback .md as
	// `FB-NN-<slug>.png` and links it inline via `![annotation](…)`. The
	// markdown body URL points here so the browser can load the image
	// without a separate fetch + blob URL dance.
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
			// Attachment basenames we generate look like `FB-01-some-slug.png`.
			// Reject anything with path separators or odd characters.
			// SVG is deliberately excluded — legacy feedback dirs may
			// contain .svg files from before the schema rejected them,
			// but serving them (even with Content-Disposition) leaves
			// door open. Anyone who needs a legacy SVG can fetch it via
			// git.
			if (!/^[A-Za-z0-9._-]+\.(png|jpg|jpeg|webp)$/.test(filename)) {
				reply.status(400).send({ error: "invalid_filename" })
				return
			}
			const feedbackRoot = join(intentDir(intent), "stages", stage, "feedback")
			await serveUnderRoot(reply, feedbackRoot, filename)
		},
	)

	instance.post<{
		Params: { intent: string; stage: string }
	}>(
		"/api/feedback/:intent/:stage",
		// POST allows a larger body because an annotated screenshot may
		// ride along as a base64 data URL.
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
			const result = writeFeedbackFile(intent, stage, {
				title: parsed.data.title,
				body: parsed.data.body,
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
	//
	// Threaded replies let humans and agents answer questions or
	// document closure reasoning without creating a new feedback item.
	// `close_as_answered: true` in the payload flips the parent to
	// `answered` in the same write — used by the agent's
	// `feedback_answer` action and by the reviewer's "reply & close".
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
			const result = appendFeedbackReply(
				intent,
				stage,
				feedbackId,
				{
					// FB-01: caller-supplied `author` is ignored at the HTTP
					// trust boundary, same as the create path at line 1522.
					// The schema still accepts the field (back-compat); the
					// handler hardcodes it so no caller can claim to be a
					// specific agent/user by name.
					author: "user",
					author_type: "human",
					body: parsed.data.body,
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

	// ── Health + SPA catch-all ─────────────────────────────────────────

	// Split liveness from readiness. Until startHttpServer() finishes
	// listen() AND post-listen initialization, `ready === false` and the
	// endpoint returns HTTP 503 `"starting"`. Once ready, it returns 200
	// `"ok"`. The tunnel integration and any load balancer in front of
	// this process treat non-200 as "don't route traffic yet", which
	// matches the standard readiness-vs-liveness split.
	instance.get("/health", async (_req, reply) => {
		if (!ready) {
			reply.status(503)
			return "starting"
		}
		return "ok"
	})

	// NOTE on OPTIONS routing: @fastify/cors (registered above) owns
	// the global `OPTIONS *` route. For allowed origins it attaches
	// ACAO/ACAM/ACAH/ACEH and responds 204; for disallowed origins it
	// responds 204 WITHOUT those headers so the browser blocks the
	// real request. We do NOT add our own `instance.options("/*")` —
	// that would collide with cors's registration and throw
	// `Method 'OPTIONS' already declared for route '/*'` at buildApp
	// time. See node_modules/@fastify/cors/index.js:79.

	instance.get("/", async (_req, reply) => {
		reply.type("text/html; charset=utf-8").send(HAIKU_UI_HTML)
	})

	// SPA deep-link catch-all. Scoped to the three page prefixes so
	// file-serving handlers' 403/404 still surface correctly for
	// path-traversal probes.
	instance.setNotFoundHandler((req, reply) => {
		if (
			req.method === "GET" &&
			(req.url === "/" ||
				req.url.startsWith("/review/") ||
				req.url.startsWith("/question/") ||
				req.url.startsWith("/direction/"))
		) {
			reply.type("text/html; charset=utf-8").send(HAIKU_UI_HTML)
			return
		}
		// OPTIONS preflight from a disallowed origin: @fastify/cors
		// declines to handle it (calls callNotFound at index.js:82) so
		// it lands here. Return 204 with NO ACAO/ACAM/ACAH/ACEH headers
		// — same shape as an allowed-origin preflight, but without the
		// grant so the browser blocks the real request. The bare 204
		// doesn't leak route existence differently from the 404 path.
		if (req.method === "OPTIONS") {
			reply.status(204).send()
			return
		}
		reply.status(404).send("Not Found")
	})

	// Translate Fastify's built-in parser errors into the envelopes the
	// existing test suite and SPA client expect:
	//   - FST_ERR_CTP_INVALID_JSON   → {error:"validation_failed", issues:[{code:"invalid_json", ...}]}
	//   - FST_ERR_CTP_BODY_TOO_LARGE → {error:"payload_too_large", max_bytes}
	// Every other error falls back to a generic 500 envelope so nothing
	// leaks a stack trace.
	instance.setErrorHandler((err, req, reply) => {
		const errCode = (err as { code?: string }).code
		const status = (err as { statusCode?: number }).statusCode ?? 500
		const errMessage =
			err instanceof Error ? err.message : typeof err === "string" ? err : ""

		// FB-04: log the underlying error detail at the point we know it.
		// The `onResponse` hook also logs the eventual 4xx/5xx line, but
		// that hook only sees the status — not the exception class or
		// message. Emit a separate event here so operators can trace 500s
		// back to the original throw without needing a stack trace.
		try {
			console.error(
				JSON.stringify({
					level: status >= 500 ? "error" : "warn",
					event: "http_error_thrown",
					reqId: req.id,
					method: req.method,
					url: req.url,
					statusCode: status,
					error: errMessage,
					code: errCode,
				}),
			)
		} catch {
			// Logging must never throw.
		}

		// Fastify's built-in JSON parser throws a SyntaxError (wrapped
		// with statusCode 400) when the request body is malformed JSON.
		// Depending on version it may surface with code
		// FST_ERR_CTP_INVALID_JSON, or as a plain SyntaxError. Treat all
		// those as `validation_failed` with an `invalid_json` issue so
		// the SPA's fetch error path has stable shape.
		const looksLikeJsonParseError =
			errCode === "FST_ERR_CTP_INVALID_JSON" ||
			err instanceof SyntaxError ||
			(status === 400 && /JSON|json|Unexpected token/i.test(errMessage))

		if (looksLikeJsonParseError) {
			const issues: ZodIssueWire[] = [
				{
					code: "invalid_json",
					message: errMessage || "Request body is not valid JSON",
					path: [],
				},
			]
			const payload: ValidationError = { error: "validation_failed", issues }
			reply.status(400).send(payload)
			return
		}

		if (status === 413) {
			const path = (req.url ?? "/").split("?")[0]
			const cap =
				req.method === "POST" && /^\/api\/feedback\/[^/]+\/[^/]+\/?$/.test(path)
					? FEEDBACK_CREATE_MAX_BYTES
					: DEFAULT_BODY_MAX_BYTES
			reply.status(413).send({ error: "payload_too_large", max_bytes: cap })
			return
		}

		reply.status(status).send({
			error: "internal_error",
			message: errMessage,
		})
	})

	// ── WebSocket upgrade ──────────────────────────────────────────────

	instance.register(async (ws) => {
		ws.get<{ Params: { sessionId: string }; Querystring: { t?: string } }>(
			"/ws/session/:sessionId",
			{
				websocket: true,
				// Reject before the HTTP upgrade completes so tunnel-auth
				// clients see HTTP/1.1 401 on the upgrade response — not
				// a 101 Switching Protocols immediately followed by a
				// close(4401). The socket-close path is still there as a
				// defense-in-depth inside the handler.
				preValidation: async (req, reply) => {
					if (!isRemoteReviewEnabled()) return
					const { sessionId } = req.params as { sessionId: string }
					const token = (req.query as { t?: string })?.t
					if (!token) {
						reply
							.status(401)
							.send({ error: "unauthorized", reason: "missing_token" })
						return
					}
					const verified = verifyTunnelJWT(token, sessionId)
					if (!verified.ok) {
						reply
							.status(401)
							.send({ error: "unauthorized", reason: verified.reason })
						return
					}
				},
			},
			(socket, req) => {
				const { sessionId } = req.params
				if (isRemoteReviewEnabled()) {
					const token = (req.query as Record<string, string | undefined>)?.t
					if (!token) {
						socket.close(4401, "unauthorized")
						return
					}
					const verified = verifyTunnelJWT(token, sessionId)
					if (!verified.ok) {
						socket.close(4401, "unauthorized")
						return
					}
				}
				const session = getSession(sessionId)
				if (!session) {
					socket.close(4404, "session not found")
					return
				}
				// FB-08: cap concurrent WS sessions. If we're re-registering
				// the same sessionId (reconnect) don't count it against the
				// cap — the existing entry is overwritten atomically below.
				if (
					!wsConnections.has(sessionId) &&
					wsConnections.size >= MAX_WS_SESSIONS
				) {
					logClose(
						`upgrade REJECT session=${sessionId} reason=ws_session_cap size=${wsConnections.size} cap=${MAX_WS_SESSIONS}`,
					)
					// RFC 6455 code 1013 — "Try Again Later": the server is
					// temporarily unable to accept the connection. Clients
					// should back off.
					socket.close(1013, "session cap reached")
					return
				}
				wsConnections.set(sessionId, socket)
				logClose(`upgrade ACCEPT session=${sessionId}`)
				socket.on("message", (raw: Buffer | ArrayBuffer | Buffer[]) => {
					if (!allowWsFrame(socket)) {
						socket.close(1008, "rate limit")
						return
					}
					const text = Array.isArray(raw)
						? Buffer.concat(raw as Buffer[]).toString("utf8")
						: typeof raw === "string"
							? raw
							: Buffer.from(raw as ArrayBuffer).toString("utf8")
					handleWebSocketMessage(sessionId, text)
				})
				socket.on("close", () => {
					if (wsConnections.get(sessionId) === socket) {
						wsConnections.delete(sessionId)
					}
				})
				socket.on("error", () => {
					if (wsConnections.get(sessionId) === socket) {
						wsConnections.delete(sessionId)
					}
				})
			},
		)
	})

	return instance
}

// ── Lifecycle ──────────────────────────────────────────────────────────

/**
 * Enforces the v1 transport invariant that the review HTTP server binds only
 * to loopback. If the bind target is non-loopback, the process exits(1).
 *
 * `HAIKU_TRANSPORT_ASSERT=0` is a **test-only escape hatch** for exercising
 * bind failure paths from unit tests. It is ONLY honored when `NODE_ENV=test`
 * — in production, CI, or any other context, setting it has NO effect and the
 * fatal exit still fires. This closes the attacker-influenced-env vector
 * described in FB-12 (ops): even if an attacker can inject env vars, they
 * cannot silently disable the loopback invariant unless they also set
 * `NODE_ENV=test`, which is not a production configuration.
 *
 * `HAIKU_FORCE_BIND_ADDR` is similarly a **test/dev-only** knob for exercising
 * the non-loopback path. When it is set to anything other than the default, a
 * prominent warning is logged (see startHttpServer) so operators can spot
 * accidental or malicious overrides in their logs immediately.
 */
function assertLoopbackBind(address: string): void {
	if (
		process.env.HAIKU_TRANSPORT_ASSERT === "0" &&
		process.env.NODE_ENV === "test"
	) {
		console.error(
			"WARNING: HAIKU_TRANSPORT_ASSERT=0 bypass active (NODE_ENV=test). " +
				"This is a test-only escape hatch; ignored outside NODE_ENV=test.",
		)
		return
	}
	const loopback = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"])
	if (!loopback.has(address)) {
		console.error(
			`FATAL: Review HTTP server bound to non-loopback address '${address}'. ` +
				"v1 transport invariant requires loopback-only; terminating.",
		)
		process.exit(1)
	}
}

export async function startHttpServer(): Promise<number> {
	if (app && actualPort !== null) return actualPort

	// FB-12: when remote review is enabled AND no origins are allow-listed,
	// every cross-origin request is rejected silently by @fastify/cors. A
	// reviewer landing on the SPA sees no error and no CORS headers — hard
	// to diagnose. Emit a prominent startup warning so operators notice
	// the misconfiguration before users hit it. (The actual enforcement
	// still happens; this is observability only.)
	if (isRemoteReviewEnabled()) {
		const allowed = review.allowedOrigins.filter((o) => o && o !== "*")
		if (allowed.length === 0) {
			console.error(
				"WARNING: HAIKU_REMOTE_REVIEW=1 but no allowed origins configured. " +
					"Every cross-origin request from the SPA will be rejected by CORS. " +
					"Set `HAIKU_REVIEW_ALLOWED_ORIGINS` (comma-separated) or " +
					"`HAIKU_REVIEW_SITE_URL` before starting.",
			)
		}
	}

	app = await buildApp()
	// `HAIKU_FORCE_BIND_ADDR` is a test/dev-only override used to exercise the
	// non-loopback failure path. If set to anything other than the default
	// loopback, log a prominent warning so accidental or malicious overrides
	// surface in operator logs immediately. The assertLoopbackBind() call
	// below will still enforce loopback-only unless NODE_ENV=test permits an
	// explicit bypass (see FB-12).
	const forcedBindAddr = process.env.HAIKU_FORCE_BIND_ADDR
	if (forcedBindAddr && forcedBindAddr !== "127.0.0.1") {
		console.error(
			`WARNING: HAIKU_FORCE_BIND_ADDR='${forcedBindAddr}' overrides the ` +
				"default loopback bind. This is a test/dev-only knob; in production " +
				"it will trigger the transport-invariant FATAL exit.",
		)
	}
	const bindAddr = forcedBindAddr || "127.0.0.1"
	const address = await app.listen({ host: bindAddr, port: 0 })
	// FB-08: cap concurrent TCP connections on the underlying http.Server.
	// Node enforces this at the listener — the (MAX_CONNECTIONS + 1)th
	// socket is closed without reaching Fastify. Combined with the WS
	// session cap and per-socket WS rate limit, this bounds the resource
	// footprint of the review HTTP server.
	app.server.maxConnections = MAX_CONNECTIONS
	// Parse the returned listen URL to extract port / address.
	const urlMatch = address.match(/^https?:\/\/(\[?[^\]]*\]?|[^:]+):(\d+)/)
	if (urlMatch) {
		actualPort = Number.parseInt(urlMatch[2], 10)
		assertLoopbackBind(urlMatch[1].replace(/^\[|\]$/g, ""))
	}
	if (actualPort === null) {
		const addrInfo = app.server.address()
		if (addrInfo && typeof addrInfo === "object") {
			actualPort = addrInfo.port
			assertLoopbackBind(addrInfo.address)
		}
	}
	console.error(
		`Review HTTP server listening on http://127.0.0.1:${actualPort} ` +
			`(maxConnections=${MAX_CONNECTIONS}, maxWsSessions=${MAX_WS_SESSIONS})`,
	)
	// Post-listen initialization has completed. Flip the readiness flag
	// so `/health` transitions from 503 `"starting"` to 200 `"ok"`. Any
	// probe arriving between listen() and this line (or while buildApp()
	// was running) gets 503, which is the correct signal.
	ready = true
	return actualPort as number
}

// Graceful shutdown for the Fastify HTTP+WebSocket server. Drains
// in-flight requests, sends a clean close frame to any open WebSocket
// clients (via `closeSessionConnection`), then closes the underlying
// `http.Server`. Safe to call when the server was never started — this
// is a no-op in that case. Idempotent.
export async function stopHttpServer(): Promise<void> {
	if (!app) return
	try {
		// Proactively close any still-open WS sessions with a clean frame
		// so clients see `1001 Going Away` instead of a TCP RST. Fastify's
		// `close()` would otherwise rip the underlying sockets out from
		// under them.
		for (const sessionId of Array.from(wsConnections.keys())) {
			try {
				closeSessionConnection(sessionId, "shutdown")
			} catch {
				// Best-effort — keep shutting down regardless.
			}
		}
		await app.close()
	} finally {
		app = null
		actualPort = null
		// Server is no longer accepting traffic — clear the readiness
		// flag so a subsequent start sees 503 until it finishes listening.
		ready = false
	}
}

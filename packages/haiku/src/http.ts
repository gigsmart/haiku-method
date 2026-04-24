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

import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs"
import { readFile, realpath } from "node:fs/promises"
import { dirname, extname, join, resolve } from "node:path"
import Fastify, {
	type FastifyInstance,
	type FastifyReply,
	type FastifyRequest,
} from "fastify"
import fastifyCors from "@fastify/cors"
import fastifyWebsocket from "@fastify/websocket"
import type { WebSocket as WsWebSocket } from "ws"
import { z, type ZodTypeAny } from "zod"
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
	type ReviewCurrentPayload,
	ReviewDecisionRequestSchema,
	type ReviewDecisionResponse,
	RevisitRequestSchema,
	type RevisitResponse,
	type ValidationError,
	WsClientMessageSchema,
	type WsServerMessage,
	type ZodIssueWire,
} from "haiku-api"
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
	FEEDBACK_ORIGINS,
	FEEDBACK_STATUSES,
	type FeedbackItem,
	findHaikuRoot,
	gitCommitState,
	gitCommitStateBackgroundPush,
	intentDir,
	parseFrontmatter,
	readFeedbackFiles,
	readJson,
	stageStatePath,
	updateFeedbackFile,
	writeFeedbackFile,
} from "./state-tools.js"
import { e2eEncrypt, isE2EActive, isRemoteReviewEnabled } from "./tunnel.js"
import { verifyTunnelJWT } from "./tunnel.js"

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
		appendFileSync(SESSION_CANCEL_LOG_PATH, `${new Date().toISOString()} ${msg}\n`)
	} catch {
		/* */
	}
	process.stderr.write(`[haiku-mcp] ${msg}\n`)
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
const WS_RATE_LIMIT_PER_SEC = Number.parseInt(
	process.env.HAIKU_WS_RATE_LIMIT ?? "20",
	10,
)

function allowWsFrame(socket: WsWebSocket): boolean {
	if (!Number.isFinite(WS_RATE_LIMIT_PER_SEC) || WS_RATE_LIMIT_PER_SEC <= 0) {
		return true
	}
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
		reply.header("Content-Type", contentType).send(data)
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
	if (reply.statusCode === 204 || reply.statusCode === 205 || reply.statusCode === 304) {
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

// ── Review-current aggregate ────────────────────────────────────────────

function respondReviewCurrent(reply: FastifyReply): void {
	let root: string
	try {
		root = findHaikuRoot()
	} catch {
		reply.status(404).send({ error: "No .haiku directory found" })
		return
	}

	const intentsPath = join(root, "intents")
	if (!existsSync(intentsPath)) {
		reply.status(404).send({ error: "No intents found" })
		return
	}

	const dirs = readdirSync(intentsPath, { withFileTypes: true }).filter((d) =>
		d.isDirectory(),
	)

	let activeIntent: string | null = null
	let intentData: Record<string, unknown> = {}

	for (const d of dirs) {
		const intentMdPath = join(intentsPath, d.name, "intent.md")
		if (!existsSync(intentMdPath)) continue
		const raw = readFileSync(intentMdPath, "utf8")
		const { data } = parseFrontmatter(raw)
		if (data.status === "active") {
			activeIntent = d.name
			intentData = data
			break
		}
	}

	if (!activeIntent) {
		reply.status(404).send({ error: "No active intent found" })
		return
	}

	const activeStage = (intentData.active_stage as string) || null
	const stagesList = (intentData.stages as string[]) || []
	const stages: Array<{
		name: string
		status: string
		phase?: string
		iteration?: number
		iterations?: unknown[]
		visits?: number
	}> = []
	for (const stageName of stagesList) {
		try {
			const stateFile = stageStatePath(activeIntent, stageName)
			const stageState = readJson(stateFile)
			const iters = Array.isArray(stageState.iterations)
				? (stageState.iterations as unknown[])
				: undefined
			const iteration = iters?.length ?? ((stageState.visits as number) || 0)
			stages.push({
				name: stageName,
				status: (stageState.status as string) || "pending",
				phase: (stageState.phase as string) || undefined,
				iteration,
				iterations: iters,
				visits: iteration,
			})
		} catch {
			stages.push({ name: stageName, status: "pending" })
		}
	}

	let currentPhase: string | undefined
	if (activeStage) {
		try {
			const stateFile = stageStatePath(activeIntent, activeStage)
			const stageState = readJson(stateFile)
			currentPhase = (stageState.phase as string) || undefined
		} catch {
			/* */
		}
	}

	const feedbackSummary = { pending: 0, addressed: 0, closed: 0, rejected: 0 }
	if (activeStage) {
		const items = readFeedbackFiles(activeIntent, activeStage)
		for (const item of items) {
			const s = item.status as keyof typeof feedbackSummary
			if (s in feedbackSummary) feedbackSummary[s]++
		}
	}

	const units: Array<{ slug: string; title: string; status: string }> = []
	if (activeStage) {
		try {
			const unitsDir = join(
				intentDir(activeIntent),
				"stages",
				activeStage,
				"units",
			)
			if (existsSync(unitsDir)) {
				const unitFiles = readdirSync(unitsDir)
					.filter((f) => f.endsWith(".md"))
					.sort()
				for (const f of unitFiles) {
					const raw = readFileSync(join(unitsDir, f), "utf8")
					const { data } = parseFrontmatter(raw)
					units.push({
						slug: f.replace(/\.md$/, ""),
						title: (data.title as string) || f.replace(/\.md$/, ""),
						status: (data.status as string) || "pending",
					})
				}
			}
		} catch {
			/* */
		}
	}

	const payload: ReviewCurrentPayload = {
		intent: activeIntent,
		stage: activeStage,
		phase: currentPhase,
		units,
		feedback_summary: feedbackSummary,
		stages,
	}
	reply.send(payload)
}

// ── Slug sanitisation + feedback validators ─────────────────────────────

function isValidSlug(value: string): boolean {
	let decoded: string
	try {
		decoded = decodeURIComponent(value)
	} catch {
		return false
	}
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

export function getActualPort(): number | null {
	return actualPort
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
		const sessionId = extractSessionIdFromPath(
			(req.url ?? "/").split("?")[0],
		)
		if (!sessionId || !isE2EActive(sessionId)) return payload
		if (reply.statusCode >= 400) return payload
		try {
			return await e2eOnSend(req, reply, payload)
		} catch {
			return payload
		}
	})

	// ── SPA shell routes (no auth; token lives in URL fragment) ─────────

	instance.get("/review/current", async (_req, reply) => {
		reply.type("text/html; charset=utf-8").send(HAIKU_UI_HTML)
	})

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
		const parsed = parseBodyWithSchema(reply, req.body, ReviewDecisionRequestSchema)
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
		const parsed = parseBodyWithSchema(reply, req.body, QuestionAnswerRequestSchema)
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
		const parsed = parseBodyWithSchema(reply, req.body, DirectionSelectRequestSchema)
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
			return serveUnderRoot(reply, join(session.intent_dir, "mockups"), filePath)
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

	instance.get("/api/review/current", async (req, reply) => {
		if (!requireTunnelAuth(req, reply, null)) return
		respondReviewCurrent(reply)
	})

	instance.post<{ Params: { sessionId: string } }>(
		"/api/revisit/:sessionId",
		async (req, reply) => {
			if (!requireTunnelAuth(req, reply, req.params.sessionId)) return
			const session = getSession(req.params.sessionId)
			if (!session || session.session_type !== "review") {
				reply.status(404).send("Session not found")
				return
			}
			if (!session.intent_slug) {
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
			reply
				.status(400)
				.send({
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
				origin:
					i.origin as FeedbackListResponse["items"][number]["origin"],
				author: i.author,
				author_type:
					i.author_type as FeedbackListResponse["items"][number]["author_type"],
				created_at: i.created_at,
				iteration: i.visit,
				visit: i.visit,
				source_ref: i.source_ref ?? null,
				closed_by: i.closed_by ?? null,
				resolution:
					i.resolution as
						| FeedbackListResponse["items"][number]["resolution"]
						| null,
				replies: i.replies.map((r) => ({
					author: r.author,
					author_type: r.author_type,
					body: r.body,
					created_at: r.created_at,
				})),
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
			if (!/^[A-Za-z0-9._-]+\.(png|jpg|jpeg|webp|svg)$/.test(filename)) {
				reply.status(400).send({ error: "invalid_filename" })
				return
			}
			const feedbackRoot = join(
				intentDir(intent),
				"stages",
				stage,
				"feedback",
			)
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
			const result = writeFeedbackFile(intent, stage, {
				title: parsed.data.title,
				body: parsed.data.body,
				origin: parsed.data.origin,
				author: "user",
				source_ref: parsed.data.source_ref ?? null,
				resolution: parsed.data.resolution ?? null,
				attachmentDataUrl: parsed.data.attachment_data_url ?? null,
			})
			gitCommitStateBackgroundPush(`feedback: create ${result.feedback_id} in ${stage}`)
			const response: FeedbackCreateResponse = {
				feedback_id: result.feedback_id,
				file: result.file,
				status: "pending",
				message: `Feedback ${result.feedback_id} created.`,
			}
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
				!(
					isValidSlug(intent) &&
					isValidSlug(stage) &&
					isValidSlug(feedbackId)
				)
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
					reply
						.status(404)
						.send({
							error: `Feedback '${feedbackId}' not found in stage '${stage}'`,
						})
					return
				}
				reply.status(400).send({ error: result.error })
				return
			}
			gitCommitStateBackgroundPush(`feedback: update ${feedbackId} in ${stage}`)
			const response: FeedbackUpdateResponse = {
				feedback_id: feedbackId,
				updated_fields: result.updated_fields,
				message: `Feedback ${feedbackId} updated.`,
			}
			reply.send(response)
		},
	)

	instance.delete<{
		Params: { intent: string; stage: string; feedbackId: string }
	}>("/api/feedback/:intent/:stage/:feedbackId", async (req, reply) => {
		if (!requireTunnelAuth(req, reply, null)) return
		const { intent, stage, feedbackId } = req.params
		if (
			!(
				isValidSlug(intent) &&
				isValidSlug(stage) &&
				isValidSlug(feedbackId)
			)
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
				reply
					.status(404)
					.send({
						error: `Feedback '${feedbackId}' not found in stage '${stage}'`,
					})
				return
			}
			if (result.error.includes("cannot delete")) {
				reply
					.status(409)
					.send({ error: result.error.replace(/^Error:\s*/, "") })
				return
			}
			reply.status(400).send({ error: result.error })
			return
		}
		gitCommitStateBackgroundPush(`feedback: delete ${feedbackId} from ${stage}`)
		const response: FeedbackDeleteResponse = {
			feedback_id: feedbackId,
			deleted: true,
			message: `Feedback ${feedbackId} deleted.`,
		}
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
				!(
					isValidSlug(intent) &&
					isValidSlug(stage) &&
					isValidSlug(feedbackId)
				)
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
					author: parsed.data.author ?? "user",
					author_type: "human",
					body: parsed.data.body,
				},
				{ close_as_answered: parsed.data.close_as_answered === true },
			)
			if (!result.ok) {
				if (result.error.includes("not found")) {
					reply.status(404).send({
						error: `Feedback '${feedbackId}' not found in stage '${stage}'`,
					})
					return
				}
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
			reply.status(201).send(response)
		},
	)

	// ── Health + SPA catch-all ─────────────────────────────────────────

	instance.get("/health", async (_req, reply) => {
		reply.send("ok")
	})

	// CORS preflight catch-all (only when remote review is enabled).
	// When @fastify/cors rejects the origin it falls through to normal
	// routing, which 404s for OPTIONS on paths with no explicit OPTIONS
	// handler. The prior hand-rolled server answered every OPTIONS with
	// 204; the browser then reads CORS headers (or their absence) to
	// decide. Restore that shape.
	if (isRemoteReviewEnabled()) {
		instance.options("/*", async (_req, reply) => {
			reply.status(204).send()
		})
	}

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
			err instanceof Error
				? err.message
				: typeof err === "string"
					? err
					: ""

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
				req.method === "POST" &&
				/^\/api\/feedback\/[^/]+\/[^/]+\/?$/.test(path)
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
		ws.get<{ Params: { sessionId: string } }>(
			"/ws/session/:sessionId",
			{ websocket: true },
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

function assertLoopbackBind(address: string): void {
	if (process.env.HAIKU_TRANSPORT_ASSERT === "0") return
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

	app = await buildApp()
	const bindAddr = process.env.HAIKU_FORCE_BIND_ADDR || "127.0.0.1"
	const address = await app.listen({ host: bindAddr, port: 0 })
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
		`Review HTTP server listening on http://127.0.0.1:${actualPort}`,
	)
	return actualPort as number
}

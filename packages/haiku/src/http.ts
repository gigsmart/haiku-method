import { createHash } from "node:crypto"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { readFile, realpath } from "node:fs/promises"
import {
	createServer,
	type Server as HttpServer,
	type IncomingMessage,
} from "node:http"
import { dirname, extname, join, resolve } from "node:path"
import type { Duplex } from "node:stream"
import {
	DEFAULT_BODY_MAX_BYTES,
	DirectionSelectRequestSchema,
	type DirectionSelectResponse,
	FEEDBACK_BODY_MAX_BYTES,
	FeedbackCreateRequestSchema,
	type FeedbackCreateResponse,
	type FeedbackDeleteResponse,
	type FeedbackListResponse,
	FeedbackUpdateRequestSchema,
	type FeedbackUpdateResponse,
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
import type { ZodTypeAny, z } from "zod"
import { ensureOnStageBranch } from "./git-worktree.js"
import { handleOrchestratorTool } from "./orchestrator.js"
import { HAIKU_UI_HTML } from "./haiku-ui-html.js"
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
	deleteFeedbackFile,
	FEEDBACK_STATUSES,
	type FeedbackItem,
	findHaikuRoot,
	gitCommitState,
	intentDir,
	parseFrontmatter,
	readFeedbackFiles,
	readJson,
	stageStatePath,
	updateFeedbackFile,
	writeFeedbackFile,
} from "./state-tools.js"
import { e2eEncrypt, isE2EActive, isRemoteReviewEnabled } from "./tunnel.js"

// ─── Validation helpers ────────────────────────────────────────────────────
//
// Uniform plumbing for JSON request parsing:
//   - size cap (413 before parse)
//   - malformed JSON → 400 with a synthetic `invalid_json` issue
//   - schema mismatch → 400 with ZodIssue[] under the `validation_failed` envelope
// All mutating handlers call parseJsonBody() and respond via
// validationErrorResponse() on failure.

/** Build a 400 Response with the canonical validation-failed envelope. */
function validationErrorResponse(
	issues: ZodIssueWire[],
	status = 400,
): Response {
	const payload: ValidationError = {
		error: "validation_failed",
		issues,
	}
	return Response.json(payload, { status })
}

/** Build a 413 Response when the incoming body exceeds the configured cap. */
function payloadTooLargeResponse(maxBytes: number): Response {
	return Response.json(
		{
			error: "payload_too_large",
			max_bytes: maxBytes,
		},
		{ status: 413 },
	)
}

/**
 * Parse + validate a JSON request body against a Zod schema with an explicit
 * size cap. Returns a discriminated union so callers short-circuit on
 * failure with a canonical 400/413 response.
 */
async function parseJsonBody<S extends ZodTypeAny>(
	req: Request,
	schema: S,
	opts: { maxBytes?: number } = {},
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: Response }> {
	const maxBytes = opts.maxBytes ?? DEFAULT_BODY_MAX_BYTES
	let raw: string
	try {
		// Request.text() reads the whole body; the server-level bridge also caps
		// at DEFAULT_BODY_MAX_BYTES so this byte-length check is the finer cap
		// for per-route overrides (e.g. feedback at 128 KiB).
		const buffer = await req.arrayBuffer()
		if (buffer.byteLength > maxBytes) {
			return { ok: false, response: payloadTooLargeResponse(maxBytes) }
		}
		raw = new TextDecoder("utf-8").decode(buffer)
	} catch {
		return {
			ok: false,
			response: validationErrorResponse([
				{
					code: "invalid_body",
					message: "Failed to read request body",
					path: [],
				},
			]),
		}
	}

	let parsed: unknown
	try {
		parsed = JSON.parse(raw)
	} catch (err) {
		return {
			ok: false,
			response: validationErrorResponse([
				{
					code: "invalid_json",
					message:
						err instanceof Error
							? err.message
							: "Request body is not valid JSON",
					path: [],
				},
			]),
		}
	}

	const result = schema.safeParse(parsed)
	if (!result.success) {
		const issues: ZodIssueWire[] = result.error.issues.map((iss) => ({
			code: iss.code,
			message: iss.message,
			path: iss.path as (string | number)[],
		}))
		return { ok: false, response: validationErrorResponse(issues) }
	}
	return { ok: true, data: result.data as z.infer<S> }
}

/**
 * Resolve `requested` relative to `root`, returning the real resolved path if
 * and only if it stays within `root` after symlink resolution. Mirrors the
 * inline guards previously duplicated across file / mockup / wireframe /
 * stage-artifact handlers. Paths are allowed to equal root (dir itself).
 */
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

let httpServer: HttpServer | null = null
let actualPort: number | null = null

export function getActualPort(): number | null {
	return actualPort
}

/** Serve the React SPA for any page route — the SPA reads the session ID from the URL */
function serveSpa(): Response {
	return new Response(HAIKU_UI_HTML, {
		headers: { "Content-Type": "text/html; charset=utf-8" },
	})
}

/** API endpoint: return session data as JSON for the SPA to render */
function handleSessionApi(sessionId: string): Response {
	const session = getSession(sessionId)
	if (!session) {
		return Response.json({ error: "Session not found" }, { status: 404 })
	}

	// Build a JSON-serializable response with all data the SPA needs
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

		// Include parsed intent/unit data if available
		if (session.parsedIntent) data.intent = session.parsedIntent
		if (session.parsedUnits) data.units = session.parsedUnits
		if (session.parsedCriteria) data.criteria = session.parsedCriteria
		if (session.parsedMermaid) data.mermaid = session.parsedMermaid
		if (session.intentMockups) data.intent_mockups = session.intentMockups
		if (session.unitMockups) {
			// Convert Map to plain object for JSON serialization
			const obj: Record<string, unknown> = {}
			if (session.unitMockups instanceof Map) {
				for (const [k, v] of session.unitMockups) {
					obj[k] = v
				}
			} else {
				Object.assign(obj, session.unitMockups)
			}
			data.unit_mockups = obj
		}
		// Stage states, knowledge files, and stage artifacts
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
		// Build image URLs
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

	return Response.json(data)
}

function handleReviewGet(sessionId: string): Response {
	const session = getSession(sessionId)
	if (!session || session.session_type !== "review") {
		return new Response("Session not found", { status: 404 })
	}
	// Serve the SPA — it will fetch session data via /api/session/:id
	return serveSpa()
}

async function handleDecidePost(
	sessionId: string,
	req: Request,
): Promise<Response> {
	const session = getSession(sessionId)
	if (!session || session.session_type !== "review") {
		return new Response("Session not found", { status: 404 })
	}

	const parsed = await parseJsonBody(req, ReviewDecisionRequestSchema)
	if (!parsed.ok) return parsed.response

	const decision =
		parsed.data.decision === "approved" ? "approved" : "changes_requested"
	const feedback = parsed.data.feedback ?? ""
	const annotations = parsed.data.annotations as ReviewAnnotations | undefined

	updateSession(sessionId, {
		status: "decided",
		decision,
		feedback,
		annotations,
	})

	const payload: ReviewDecisionResponse = { ok: true, decision, feedback }
	return Response.json(payload)
}

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

/** Add CORS headers when remote review is enabled */
function withCors(response: Response): Response {
	if (!isRemoteReviewEnabled()) return response
	const headers = new Headers(response.headers)
	headers.set("Access-Control-Allow-Origin", "*")
	headers.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS")
	// `bypass-tunnel-reminder` is the custom header the SPA sends to skip
	// loca.lt's interstitial reminder page. `X-Haiku-Session-Id` is the
	// cross-session auth header required on mutating feedback calls when the
	// tunnel is live (see `verifyFeedbackMutationAuth`). Custom headers
	// trigger a CORS preflight and must be explicitly allowed.
	headers.set(
		"Access-Control-Allow-Headers",
		"Content-Type, bypass-tunnel-reminder, X-Haiku-Session-Id",
	)
	// `X-E2E-Encrypted` / `X-Original-Content-Type` are read by the SPA's
	// e2eFetch helper to decide whether to decrypt. Custom response headers
	// are only visible to cross-origin JS when exposed here.
	headers.set(
		"Access-Control-Expose-Headers",
		"X-E2E-Encrypted, X-Original-Content-Type",
	)
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	})
}

/** Extract session ID from any request URL path */
function extractSessionId(path: string): string | null {
	const match = path.match(
		/\/(?:api\/session|review|question|direction|files|mockups|wireframe|stage-artifacts|question-image)\/([^/]+)/,
	)
	return match?.[1] ?? null
}

/**
 * Wrap a response with E2E encryption if active for this session.
 * Preserves the original Content-Type in X-Original-Content-Type header
 * so the client knows how to handle the decrypted data.
 */
async function withE2E(
	response: Response,
	sessionId: string | null,
): Promise<Response> {
	if (!(sessionId && isE2EActive(sessionId)) || response.status >= 400)
		return response
	// Null-body responses (HEAD endpoints, 204/205/304) have no payload to
	// encrypt, and constructing `new Response(body, { status: 204 })` throws
	// "Invalid response status code 204" in modern Node. Skip encryption
	// and the associated crypto + allocation cost on every call.
	if (response.body === null) return response
	if (
		response.status === 204 ||
		response.status === 205 ||
		response.status === 304
	)
		return response

	const originalContentType =
		response.headers.get("Content-Type") ?? "application/octet-stream"
	const body = await response.arrayBuffer()
	const encrypted = e2eEncrypt(sessionId, Buffer.from(body))

	if (!encrypted) return response

	const headers = new Headers(response.headers)
	headers.set("Content-Type", "application/octet-stream")
	headers.set("X-Original-Content-Type", originalContentType)
	headers.set("X-E2E-Encrypted", "1")

	return new Response(encrypted, {
		status: response.status,
		statusText: response.statusText,
		headers,
	})
}

/** Build a Response for a resolved real filesystem path with MIME detection. */
async function respondWithFile(realPath: string): Promise<Response> {
	try {
		const data = await readFile(realPath)
		const ext = extname(realPath).toLowerCase()
		const contentType = MIME_TYPES[ext] ?? "application/octet-stream"
		return new Response(data, {
			headers: { "Content-Type": contentType },
		})
	} catch {
		return new Response("Not found", { status: 404 })
	}
}

/** Consolidated file serving: GET /files/:sessionId/*path */
async function handleFileGet(
	sessionId: string,
	filePath: string,
): Promise<Response> {
	const session = getSession(sessionId)
	if (!session) {
		return new Response("Session not found", { status: 404 })
	}

	const intentDir =
		session.session_type === "review" ? session.intent_dir : null
	const haikuKnowledgeDir = intentDir
		? resolve(dirname(dirname(intentDir)), "knowledge")
		: null
	const allowedBases = [intentDir, haikuKnowledgeDir].filter(
		(d): d is string => d !== null,
	)

	if (allowedBases.length === 0) {
		return new Response("Not found", { status: 404 })
	}

	let escaped = false
	for (const baseDir of allowedBases) {
		const safe = await resolvePathSafe(baseDir, filePath)
		if (!safe.ok) {
			escaped = true
			continue
		}
		return respondWithFile(safe.path)
	}

	// Every allowed base rejected the path. If every rejection was a traversal
	// escape (resolved outside root), return 403 to match the rest of the
	// stream-handler contract — the unit spec requires path-traversal fixtures
	// to return 403 on every file-serve route. Missing-file (not traversal)
	// behaviour is handled earlier in respondWithFile's readFile fallback.
	if (escaped) {
		return Response.json({ error: "forbidden_path_traversal" }, { status: 403 })
	}
	return new Response("Not found", { status: 404 })
}

/**
 * Shared helper: validate a path param against a base dir, reject escapes
 * with 403, serve the real file otherwise. Used by the stream aliases
 * (/mockups, /wireframe, /stage-artifacts) whose contract is stricter
 * than /files (403 on escape, not 404).
 */
async function serveUnderRoot(
	rootDir: string,
	filePath: string,
): Promise<Response> {
	const safe = await resolvePathSafe(rootDir, filePath)
	if (!safe.ok) {
		return Response.json({ error: "forbidden_path_traversal" }, { status: 403 })
	}
	return respondWithFile(safe.path)
}

async function handleMockupGet(
	sessionId: string,
	filePath: string,
): Promise<Response> {
	const session = getSession(sessionId)
	if (!session || session.session_type !== "review") {
		return new Response("Session not found", { status: 404 })
	}
	return serveUnderRoot(join(session.intent_dir, "mockups"), filePath)
}

async function handleWireframeGet(
	sessionId: string,
	filePath: string,
): Promise<Response> {
	const session = getSession(sessionId)
	if (!session || session.session_type !== "review") {
		return new Response("Session not found", { status: 404 })
	}
	return serveUnderRoot(session.intent_dir, filePath)
}

async function handleStageArtifactGet(
	sessionId: string,
	filePath: string,
): Promise<Response> {
	const session = getSession(sessionId)
	if (!session || session.session_type !== "review") {
		return new Response("Session not found", { status: 404 })
	}
	return serveUnderRoot(session.intent_dir, filePath)
}

async function handleQuestionImageGet(
	sessionId: string,
	index: number,
): Promise<Response> {
	const session = getSession(sessionId)
	if (!session || session.session_type !== "question") {
		return new Response("Session not found", { status: 404 })
	}

	const imagePaths = session.imagePaths ?? []
	if (index < 0 || index >= imagePaths.length) {
		return new Response("Image index out of range", { status: 404 })
	}

	const imagePath = imagePaths[index]
	// Validate the path is absolute to prevent path traversal
	if (!imagePath.startsWith("/")) {
		return new Response("Forbidden", { status: 403 })
	}

	// Defense-in-depth: if a base directory was recorded for this index at session creation,
	// ensure the resolved real path stays within it (mirrors handleMockupGet pattern)
	const allowedBaseDir = session.imageBaseDirs?.[index]
	if (allowedBaseDir) {
		try {
			const realResolved = await realpath(imagePath).catch(() => null)
			const realBase = await realpath(allowedBaseDir).catch(() =>
				resolve(allowedBaseDir),
			)
			if (
				!realResolved ||
				(!realResolved.startsWith(`${realBase}/`) && realResolved !== realBase)
			) {
				return new Response("Forbidden", { status: 403 })
			}
		} catch {
			return new Response("Forbidden", { status: 403 })
		}
	}

	try {
		const data = await readFile(imagePath)
		const ext = extname(imagePath).toLowerCase()
		const contentType = MIME_TYPES[ext] ?? "application/octet-stream"
		return new Response(data, {
			headers: { "Content-Type": contentType },
		})
	} catch {
		return new Response("Not found", { status: 404 })
	}
}

function handleQuestionGet(sessionId: string): Response {
	const session = getSession(sessionId)
	if (!session || session.session_type !== "question") {
		return new Response("Session not found", { status: 404 })
	}
	// Serve the SPA
	return serveSpa()
}

async function handleQuestionAnswerPost(
	sessionId: string,
	req: Request,
): Promise<Response> {
	const session = getSession(sessionId)
	if (!session || session.session_type !== "question") {
		return new Response("Session not found", { status: 404 })
	}

	const parsed = await parseJsonBody(req, QuestionAnswerRequestSchema)
	if (!parsed.ok) return parsed.response

	updateQuestionSession(sessionId, {
		status: "answered",
		answers: parsed.data.answers as QuestionAnswer[],
		feedback: parsed.data.feedback ?? "",
		annotations: parsed.data.annotations as QuestionAnnotations | undefined,
	})

	const payload: QuestionAnswerResponse = { ok: true }
	return Response.json(payload)
}

function handleDirectionGet(sessionId: string): Response {
	const session = getSession(sessionId)
	if (!session || session.session_type !== "design_direction") {
		return new Response("Session not found", { status: 404 })
	}
	// Serve the SPA
	return serveSpa()
}

async function handleDirectionSelectPost(
	sessionId: string,
	req: Request,
): Promise<Response> {
	const session = getSession(sessionId)
	if (!session || session.session_type !== "design_direction") {
		return Response.json(
			{ error: "Session not found or expired" },
			{ status: 404 },
		)
	}

	if (session.status === "answered") {
		return Response.json(
			{ error: "Direction already selected for this session" },
			{ status: 409 },
		)
	}

	const parsed = await parseJsonBody(req, DirectionSelectRequestSchema)
	if (!parsed.ok) return parsed.response

	updateDesignDirectionSession(sessionId, {
		status: "answered",
		selection: {
			archetype: parsed.data.archetype,
			parameters: parsed.data.parameters,
		},
	})

	const payload: DirectionSelectResponse = { ok: true }
	return Response.json(payload)
}

// ─── WebSocket support ───────────────────────────────────────────────
// Minimal RFC 6455 implementation using Node built-ins (no dependencies).
// The browser opens ws://…/ws/session/:id and can send JSON messages that
// are routed to the same update functions as the HTTP POST endpoints.
// This lets tool handlers use event-based waitForSession() instead of polling.

const WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB5DC85B11"

/** Per-frame cap. Frames over this get closed with code 1009 (Message Too Big). */
const WS_MAX_FRAME_BYTES = 64 * 1024

/** Per-connection frame rate cap (messages/second). Configurable via env. */
const WS_RATE_LIMIT_PER_SEC = Number.parseInt(
	process.env.HAIKU_WS_RATE_LIMIT ?? "20",
	10,
)

/** WebSocket close codes (RFC 6455 §7.4). */
const WS_CLOSE_POLICY_VIOLATION = 1008
const WS_CLOSE_MESSAGE_TOO_BIG = 1009

/** Active WebSocket connections keyed by session ID */
const wsConnections = new Map<string, Duplex>()

/** Per-connection rate-limit state — sliding-window message timestamps. */
const wsRateState = new WeakMap<Duplex, number[]>()

/** Send a close frame with the given code, then destroy the socket. */
function sendCloseFrame(socket: Duplex, code: number): void {
	const frame = Buffer.alloc(4)
	frame[0] = 0x88 // FIN + close opcode
	frame[1] = 0x02 // payload length
	frame.writeUInt16BE(code, 2)
	try {
		socket.write(frame)
	} catch {
		// socket already destroyed
	}
	socket.destroy()
}

/**
 * Check the per-connection rate limit. Returns true if the frame should be
 * allowed, false if the connection must be closed for rate abuse.
 */
function allowWsFrame(socket: Duplex): boolean {
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

function trackWebSocket(sessionId: string, socket: Duplex): void {
	wsConnections.set(sessionId, socket)
}

function untrackWebSocket(sessionId: string): void {
	wsConnections.delete(sessionId)
}

/**
 * Send a text frame to the WebSocket client for a given session (if connected).
 * Used for server-initiated notifications (e.g. confirming receipt).
 */
export function sendToWebSocket(sessionId: string, data: unknown): void {
	const socket = wsConnections.get(sessionId)
	if (!socket || socket.destroyed) return
	const payload = Buffer.from(JSON.stringify(data), "utf8")
	const frame = encodeWebSocketFrame(payload)
	socket.write(frame)
}

/** Encode a payload into an unmasked WebSocket text frame (server → client) */
function encodeWebSocketFrame(payload: Buffer): Buffer {
	const len = payload.length
	let header: Buffer
	if (len < 126) {
		header = Buffer.alloc(2)
		header[0] = 0x81 // FIN + text opcode
		header[1] = len
	} else if (len < 65536) {
		header = Buffer.alloc(4)
		header[0] = 0x81
		header[1] = 126
		header.writeUInt16BE(len, 2)
	} else {
		header = Buffer.alloc(10)
		header[0] = 0x81
		header[1] = 127
		// Write as two 32-bit values since writeBigUInt64BE may not be available
		header.writeUInt32BE(0, 2)
		header.writeUInt32BE(len, 6)
	}
	return Buffer.concat([header, payload])
}

/**
 * Decode a single WebSocket frame from a client (masked).
 * Returns:
 *  - `null` if more bytes are needed (buffer too short),
 *  - `{ tooLarge: true, consumed }` if the advertised payload length exceeds
 *    WS_MAX_FRAME_BYTES — the caller MUST close with code 1009 and destroy
 *    the socket (no attempt is made to read the oversize payload),
 *  - `{ payload, opcode, consumed }` on success; payload is `null` for
 *    non-text frames (close, binary, continuation).
 */
function decodeWebSocketFrame(
	buf: Buffer,
):
	| { payload: string | null; opcode: number; consumed: number }
	| { tooLarge: true; consumed: number }
	| null {
	if (buf.length < 2) return null

	const opcode = buf[0] & 0x0f
	const isMasked = (buf[1] & 0x80) !== 0
	let payloadLen = buf[1] & 0x7f
	let offset = 2

	if (payloadLen === 126) {
		if (buf.length < 4) return null
		payloadLen = buf.readUInt16BE(2)
		offset = 4
	} else if (payloadLen === 127) {
		if (buf.length < 10) return null
		// Read lower 32 bits (messages > 4GB are not expected)
		payloadLen = buf.readUInt32BE(6)
		offset = 10
	}

	// Size-cap check happens BEFORE we try to read the full payload.
	if (payloadLen > WS_MAX_FRAME_BYTES) {
		// Consume the header so the caller can close cleanly.
		return { tooLarge: true, consumed: offset + (isMasked ? 4 : 0) }
	}

	let mask: Buffer | null = null
	if (isMasked) {
		if (buf.length < offset + 4) return null
		mask = buf.subarray(offset, offset + 4)
		offset += 4
	}

	if (buf.length < offset + payloadLen) return null

	const payloadBuf = buf.subarray(offset, offset + payloadLen)
	if (mask) {
		for (let i = 0; i < payloadBuf.length; i++) {
			payloadBuf[i] ^= mask[i % 4]
		}
	}

	const consumed = offset + payloadLen

	// Handle close and ping frames — return consumed so buffer advances
	if (opcode === 0x08) return { payload: null, opcode, consumed }
	// Ping — caller should send pong (RFC 6455 §5.5.3)
	if (opcode === 0x09)
		return { payload: payloadBuf.toString("utf8"), opcode, consumed }
	// Only process text frames
	if (opcode !== 0x01) return { payload: null, opcode, consumed }

	return { payload: payloadBuf.toString("utf8"), opcode, consumed }
}

/** Handle an incoming WebSocket message: parse and route to the appropriate update function */
function handleWebSocketMessage(sessionId: string, raw: string): void {
	let parsed: unknown
	try {
		parsed = JSON.parse(raw)
	} catch {
		const err: WsServerMessage = { type: "error", error: "invalid_json" }
		sendToWebSocket(sessionId, err)
		return
	}

	const schemaResult = WsClientMessageSchema.safeParse(parsed)
	if (!schemaResult.success) {
		const err: WsServerMessage = {
			type: "error",
			error: "invalid_ws_frame",
		}
		sendToWebSocket(sessionId, err)
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
		const ack: WsServerMessage = {
			type: "ack",
			ok: true,
			decision,
			feedback,
		}
		sendToWebSocket(sessionId, ack)
	} else if (session.session_type === "question" && msg.type === "answer") {
		const annotations = msg.annotations as QuestionAnnotations | undefined
		updateQuestionSession(sessionId, {
			status: "answered",
			answers: msg.answers as QuestionAnswer[],
			feedback: msg.feedback ?? "",
			annotations,
		})
		const ack: WsServerMessage = { type: "ack", ok: true }
		sendToWebSocket(sessionId, ack)
	} else if (
		session.session_type === "design_direction" &&
		msg.type === "select"
	) {
		if (session.status === "answered") {
			const err: WsServerMessage = {
				type: "error",
				error: "Direction already selected",
			}
			sendToWebSocket(sessionId, err)
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
		const ack: WsServerMessage = { type: "ack", ok: true }
		sendToWebSocket(sessionId, ack)
	}
}

/**
 * Handle HTTP upgrade requests for WebSocket connections.
 * Path: /ws/session/:sessionId
 */
function handleUpgrade(
	req: IncomingMessage,
	socket: Duplex,
	head: Buffer,
): void {
	const url = new URL(
		req.url ?? "/",
		`http://${req.headers.host ?? "127.0.0.1"}`,
	)
	const match = url.pathname.match(/^\/ws\/session\/([^/]+)$/)

	if (!match) {
		socket.write("HTTP/1.1 404 Not Found\r\n\r\n")
		socket.destroy()
		return
	}

	const sessionId = match[1]
	const session = getSession(sessionId)
	if (!session) {
		socket.write("HTTP/1.1 404 Not Found\r\n\r\n")
		socket.destroy()
		return
	}

	const key = req.headers["sec-websocket-key"]
	if (!key) {
		socket.write("HTTP/1.1 400 Bad Request\r\n\r\n")
		socket.destroy()
		return
	}

	// Compute Sec-WebSocket-Accept per RFC 6455
	const accept = createHash("sha1")
		.update(key + WS_MAGIC)
		.digest("base64")

	socket.write(
		`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
	)

	// Track this connection
	trackWebSocket(sessionId, socket)

	// Buffer for fragmented reads — seed with leftover bytes from the HTTP
	// parser (the `head` argument from the upgrade event). Without this,
	// any data the client sends in the same TCP segment as the upgrade
	// request is silently dropped, which can cause the first WS frame to
	// be lost and the connection to appear broken.
	let frameBuffer = head.length > 0 ? Buffer.from(head) : Buffer.alloc(0)

	socket.on("data", (chunk: Buffer) => {
		frameBuffer = Buffer.concat([frameBuffer, chunk])

		// Consume all complete frames; return null means more data needed.
		while (frameBuffer.length > 0) {
			const result = decodeWebSocketFrame(frameBuffer)
			if (result === null) break // need more data
			frameBuffer = frameBuffer.subarray(result.consumed)
			if ("tooLarge" in result) {
				// Frame exceeded WS_MAX_FRAME_BYTES — close 1009 and bail.
				sendCloseFrame(socket, WS_CLOSE_MESSAGE_TOO_BIG)
				frameBuffer = Buffer.alloc(0)
				break
			}
			if (result.opcode === 0x08) {
				// Close frame — send close back and tear down (RFC 6455 §5.5.1)
				const closeFrame = Buffer.alloc(2)
				closeFrame[0] = 0x88 // FIN + close opcode
				closeFrame[1] = 0
				socket.write(closeFrame)
				socket.destroy()
				break
			}
			if (result.opcode === 0x09) {
				// Respond to ping with pong (RFC 6455 §5.5.3)
				const pongHeader = Buffer.alloc(2)
				pongHeader[0] = 0x8a // FIN + pong opcode
				pongHeader[1] = 0 // no payload
				socket.write(pongHeader)
			} else if (result.payload !== null) {
				// Rate-limit BEFORE dispatch so abusive clients never touch session state.
				if (!allowWsFrame(socket)) {
					sendCloseFrame(socket, WS_CLOSE_POLICY_VIOLATION)
					frameBuffer = Buffer.alloc(0)
					return
				}
				handleWebSocketMessage(sessionId, result.payload)
			}
		}
		// Reset buffer if it's grown too large (malformed client)
		if (frameBuffer.length > 1024 * 1024) {
			frameBuffer = Buffer.alloc(0)
		}
	})

	socket.on("close", () => {
		untrackWebSocket(sessionId)
	})

	socket.on("error", () => {
		untrackWebSocket(sessionId)
	})
}

// ─── Slug sanitisation ──────────────────────────────────────────────────

/**
 * Reject URL path parameters that contain path traversal (`..`) or path
 * separators (`/`, `\`). Decodes percent-encoding first so that `%2F`, `%5C`,
 * and `%2E%2E` are caught. Returns `true` when the value is safe to use as a
 * filesystem slug, `false` otherwise.
 */
function isValidSlug(value: string): boolean {
	let decoded: string
	try {
		decoded = decodeURIComponent(value)
	} catch {
		// Malformed percent-encoding — reject
		return false
	}
	return !/[/\\]|\.\./.test(decoded)
}

// ─── Feedback CRUD endpoints ────────────────────────────────────────────

/** Validate intent slug exists on disk. Returns the slug or null. */
function validateIntent(slug: string): boolean {
	try {
		return existsSync(join(intentDir(slug), "intent.md"))
	} catch {
		return false
	}
}

/** Validate stage exists under intent. */
function validateStage(slug: string, stage: string): boolean {
	try {
		const stagesDir = join(intentDir(slug), "stages", stage)
		return existsSync(stagesDir)
	} catch {
		return false
	}
}

function handleFeedbackGet(intent: string, stage: string, url: URL): Response {
	if (!(isValidSlug(intent) && isValidSlug(stage))) {
		return Response.json(
			{
				error:
					"Invalid slug — must not contain path separators or traversal sequences",
			},
			{ status: 400 },
		)
	}
	if (!validateIntent(intent)) {
		return Response.json({ error: "Intent not found" }, { status: 404 })
	}
	// Align branch BEFORE validateStage and readFeedbackFiles — if main has
	// drifted, the stage dir may only exist on the stage branch and reads
	// would return stale/empty. The SPA needs a consistent view.
	const getBranchGuard = ensureOnStageBranch(intent, stage)
	if (!getBranchGuard.ok) {
		return Response.json(
			{
				error: `Stage-branch enforcement failed: ${getBranchGuard.message}`,
			},
			{ status: 409 },
		)
	}
	if (!validateStage(intent, stage)) {
		return Response.json({ error: "Stage not found" }, { status: 404 })
	}

	const statusFilter = url.searchParams.get("status")
	if (
		statusFilter &&
		!(FEEDBACK_STATUSES as readonly string[]).includes(statusFilter)
	) {
		return Response.json(
			{
				error: `Invalid status filter. Must be one of: ${FEEDBACK_STATUSES.join(", ")}`,
			},
			{ status: 400 },
		)
	}

	let items: FeedbackItem[] = readFeedbackFiles(intent, stage)
	if (statusFilter) {
		items = items.filter((i) => i.status === statusFilter)
	}

	// state-tools.FeedbackItem exposes status/origin/author_type as `string`;
	// haiku-api's FeedbackItemSchema narrows them to enum literals. The values
	// written on disk are always valid (writeFeedbackFile enforces the set),
	// so a cast through the list-response mapper is sound.
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
			visit: i.visit,
			source_ref: i.source_ref,
			closed_by: i.closed_by,
		})),
	}
	return Response.json(payload)
}

async function handleFeedbackPost(
	intent: string,
	stage: string,
	req: Request,
): Promise<Response> {
	if (!(isValidSlug(intent) && isValidSlug(stage))) {
		return Response.json(
			{
				error:
					"Invalid slug — must not contain path separators or traversal sequences",
			},
			{ status: 400 },
		)
	}
	if (!validateIntent(intent)) {
		return Response.json({ error: "Intent not found" }, { status: 404 })
	}

	// Cross-session mutation guard (soft for POST in v1 — logged-only if the
	// header is absent; hard 403 on mismatch).
	const authResult = verifyFeedbackMutationAuth(req, intent)
	if (!authResult.ok) return authResult.response

	// Parse the body FIRST so the guard and the write run contiguously with
	// no awaits between them. This closes a concurrency race where two
	// concurrent HTTP handlers could interleave guard → await → write and
	// end up writing on each other's branch.
	const parsed = await parseJsonBody(req, FeedbackCreateRequestSchema, {
		maxBytes: FEEDBACK_BODY_MAX_BYTES,
	})
	if (!parsed.ok) return parsed.response

	// Align the checkout with the stage branch. No awaits between here and
	// the write, so Node's single-threaded event loop ensures atomicity
	// within this handler's tail.
	const branchGuard = ensureOnStageBranch(intent, stage)
	if (!branchGuard.ok) {
		return Response.json(
			{
				error: `Stage-branch enforcement failed: ${branchGuard.message}`,
			},
			{ status: 409 },
		)
	}

	if (!validateStage(intent, stage)) {
		return Response.json({ error: "Stage not found" }, { status: 404 })
	}

	const result = writeFeedbackFile(intent, stage, {
		title: parsed.data.title,
		body: parsed.data.body,
		origin: parsed.data.origin,
		author: "user",
		source_ref: parsed.data.source_ref ?? null,
	})

	gitCommitState(`feedback: create ${result.feedback_id} in ${stage}`)

	const response: FeedbackCreateResponse = {
		feedback_id: result.feedback_id,
		file: result.file,
		status: "pending",
		message: `Feedback ${result.feedback_id} created.`,
	}
	return Response.json(response, { status: 201 })
}

async function handleFeedbackPut(
	intent: string,
	stage: string,
	feedbackId: string,
	req: Request,
): Promise<Response> {
	if (!(isValidSlug(intent) && isValidSlug(stage) && isValidSlug(feedbackId))) {
		return Response.json(
			{
				error:
					"Invalid slug — must not contain path separators or traversal sequences",
			},
			{ status: 400 },
		)
	}
	if (!validateIntent(intent)) {
		return Response.json({ error: "Intent not found" }, { status: 404 })
	}

	// Cross-session mutation guard — hard 403 on session mismatch.
	const authResult = verifyFeedbackMutationAuth(req, intent)
	if (!authResult.ok) return authResult.response

	// Parse body FIRST so the guard and write run contiguously (no awaits
	// between them). Prevents interleaving when two concurrent handlers
	// would otherwise switch branches on each other.
	const parsed = await parseJsonBody(req, FeedbackUpdateRequestSchema, {
		maxBytes: FEEDBACK_BODY_MAX_BYTES,
	})
	if (!parsed.ok) return parsed.response

	// Align checkout with the stage branch before validateStage or any read.
	const updateBranchGuard = ensureOnStageBranch(intent, stage)
	if (!updateBranchGuard.ok) {
		return Response.json(
			{
				error: `Stage-branch enforcement failed: ${updateBranchGuard.message}`,
			},
			{ status: 409 },
		)
	}

	if (!validateStage(intent, stage)) {
		return Response.json({ error: "Stage not found" }, { status: 404 })
	}

	// HTTP endpoint is human context — no author-type restrictions
	const result = updateFeedbackFile(
		intent,
		stage,
		feedbackId,
		{ status: parsed.data.status, closed_by: parsed.data.closed_by },
		"human",
	)

	if (!result.ok) {
		// Determine status code from error
		if (result.error.includes("not found")) {
			return Response.json(
				{ error: `Feedback '${feedbackId}' not found in stage '${stage}'` },
				{ status: 404 },
			)
		}
		return Response.json({ error: result.error }, { status: 400 })
	}

	gitCommitState(`feedback: update ${feedbackId} in ${stage}`)

	const response: FeedbackUpdateResponse = {
		feedback_id: feedbackId,
		updated_fields: result.updated_fields,
		message: `Feedback ${feedbackId} updated.`,
	}
	return Response.json(response)
}

async function handleFeedbackDelete(
	intent: string,
	stage: string,
	feedbackId: string,
	req: Request,
): Promise<Response> {
	if (!(isValidSlug(intent) && isValidSlug(stage) && isValidSlug(feedbackId))) {
		return Response.json(
			{
				error:
					"Invalid slug — must not contain path separators or traversal sequences",
			},
			{ status: 400 },
		)
	}
	if (!validateIntent(intent)) {
		return Response.json({ error: "Intent not found" }, { status: 404 })
	}

	// Cross-session mutation guard — hard 403 on session mismatch.
	const authResult = verifyFeedbackMutationAuth(req, intent)
	if (!authResult.ok) return authResult.response

	// Align checkout with the stage branch before validateStage or any read.
	const deleteBranchGuard = ensureOnStageBranch(intent, stage)
	if (!deleteBranchGuard.ok) {
		return Response.json(
			{
				error: `Stage-branch enforcement failed: ${deleteBranchGuard.message}`,
			},
			{ status: 409 },
		)
	}

	if (!validateStage(intent, stage)) {
		return Response.json({ error: "Stage not found" }, { status: 404 })
	}

	// HTTP endpoint is human context — no author-type restrictions
	const result = deleteFeedbackFile(intent, stage, feedbackId, "human")

	if (!result.ok) {
		if (result.error.includes("not found")) {
			return Response.json(
				{ error: `Feedback '${feedbackId}' not found in stage '${stage}'` },
				{ status: 404 },
			)
		}
		// Lifecycle conflict: open item ("pending" or "fixing") can't be
		// deleted mid-flight. Both statuses surface as 409 (Conflict) so
		// UI clients can distinguish a lifecycle block from a bad request.
		if (result.error.includes("cannot delete")) {
			return Response.json(
				{
					error: result.error.replace(/^Error:\s*/, ""),
				},
				{ status: 409 },
			)
		}
		return Response.json({ error: result.error }, { status: 400 })
	}

	gitCommitState(`feedback: delete ${feedbackId} from ${stage}`)

	const response: FeedbackDeleteResponse = {
		feedback_id: feedbackId,
		deleted: true,
		message: `Feedback ${feedbackId} deleted.`,
	}
	return Response.json(response)
}

// ─── Cross-session feedback mutation guard ──────────────────────────────────
//
// The review UI advertises its session via the `X-Haiku-Session-Id` header
// on mutating feedback calls (POST/PUT/DELETE). The session MUST belong to
// the same intent as the URL path — otherwise we 403.
//
// When remote review is enabled (`isRemoteReviewEnabled()` — i.e. a public
// `*.loca.lt` tunnel is live with permissive CORS), absence of the header is
// a HARD 401. Before this flip the gate was fail-open: any unauthenticated
// cross-origin caller could POST/PUT/DELETE feedback simply by omitting the
// header, letting attackers poison review state and mass-close findings to
// silently unblock gate advancement (see FB-20).
//
// In local-only mode (no tunnel) the header remains optional — same-origin
// review UI plus CLI-dispatched MCP tools are the only callers, and requiring
// the header there would break the local happy path.

function verifyFeedbackMutationAuth(
	req: Request,
	intent: string,
): { ok: true } | { ok: false; response: Response } {
	const sessionHeader = req.headers.get("x-haiku-session-id")
	if (!sessionHeader) {
		if (isRemoteReviewEnabled()) {
			// Strict gate — public tunnel is live. An unauthenticated mutation
			// attempt is a 401 with no ambiguity. Log intent (no body content).
			console.error(
				"[feedback-auth] 401 mutation without X-Haiku-Session-Id (intent=%s, tunnel=true)",
				intent,
			)
			return {
				ok: false,
				response: Response.json(
					{ error: "unauthorized", reason: "missing_session_header" },
					{ status: 401 },
				),
			}
		}
		// Local-only mode — log and allow, but we still want visibility.
		console.error(
			"[feedback-auth] mutation without X-Haiku-Session-Id (intent=%s, tunnel=false)",
			intent,
		)
		return { ok: true }
	}
	const session = getSession(sessionHeader)
	if (!session) {
		return {
			ok: false,
			response: Response.json(
				{ error: "forbidden_cross_session", reason: "unknown_session" },
				{ status: 403 },
			),
		}
	}
	const sessionIntent =
		session.session_type === "review" ? session.intent_slug : undefined
	if (sessionIntent !== intent) {
		return {
			ok: false,
			response: Response.json(
				{ error: "forbidden_cross_session", reason: "intent_mismatch" },
				{ status: 403 },
			),
		}
	}
	return { ok: true }
}

// ─── Review current state endpoint ──────────────────────────────────────

function handleReviewCurrent(): Response {
	let root: string
	try {
		root = findHaikuRoot()
	} catch {
		return Response.json(
			{ error: "No .haiku directory found" },
			{ status: 404 },
		)
	}

	const intentsPath = join(root, "intents")
	if (!existsSync(intentsPath)) {
		return Response.json({ error: "No intents found" }, { status: 404 })
	}

	// Find the active intent
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
		return Response.json({ error: "No active intent found" }, { status: 404 })
	}

	const activeStage = (intentData.active_stage as string) || null
	const stagesList = (intentData.stages as string[]) || []

	// Build stage status info
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
				visits: iteration, // legacy alias
			})
		} catch {
			stages.push({ name: stageName, status: "pending" })
		}
	}

	// Current phase
	let currentPhase: string | undefined
	if (activeStage) {
		try {
			const stateFile = stageStatePath(activeIntent, activeStage)
			const stageState = readJson(stateFile)
			currentPhase = (stageState.phase as string) || undefined
		} catch {
			/* no state file */
		}
	}

	// Build feedback summary
	const feedbackSummary = { pending: 0, addressed: 0, closed: 0, rejected: 0 }
	if (activeStage) {
		const items = readFeedbackFiles(activeIntent, activeStage)
		for (const item of items) {
			const s = item.status as keyof typeof feedbackSummary
			if (s in feedbackSummary) feedbackSummary[s]++
		}
	}

	// List units for the active stage
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
			/* no units */
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
	return Response.json(payload)
}

// ─── Revisit endpoint ───────────────────────────────────────────────────
//
// POST /api/revisit/:sessionId — the review UI asks the FSM to roll back to
// an earlier stage. Body carries optional `stage` (explicit target) and
// optional `reasons` (each becomes a feedback file before the rollback).
//
// Bridges straight to the orchestrator's `haiku_revisit` handler so the MCP
// tool path and the HTTP path share identical semantics.

async function handleRevisitPost(
	sessionId: string,
	req: Request,
): Promise<Response> {
	const session = getSession(sessionId)
	if (!session || session.session_type !== "review") {
		return new Response("Session not found", { status: 404 })
	}
	if (!session.intent_slug) {
		return Response.json(
			{ error: "Session has no intent context" },
			{ status: 409 },
		)
	}

	const parsed = await parseJsonBody(req, RevisitRequestSchema)
	if (!parsed.ok) return parsed.response

	const args: {
		intent: string
		stage?: string
		reasons?: Array<{ title: string; body: string }>
	} = { intent: session.intent_slug }
	if (parsed.data.stage) args.stage = parsed.data.stage
	if (parsed.data.reasons) args.reasons = parsed.data.reasons

	const toolResult = await handleOrchestratorTool("haiku_revisit", args)

	// handleOrchestratorTool returns `{ content: [{ type: "text", text }], isError? }`.
	// The text is either JSON-encoded action payload or an "Error: …" string.
	const text = toolResult.content
		.filter((c) => c.type === "text")
		.map((c) => (c as { text: string }).text)
		.join("\n")

	if (toolResult.isError) {
		return Response.json(
			{ error: "revisit_failed", detail: text },
			{ status: 409 },
		)
	}

	// Best-effort decode: the orchestrator's haiku_revisit handler returns a
	// JSON blob on success. If parsing fails, surface the raw text so the
	// client can still read it.
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
		// non-JSON → keep defaults; `message` already carries the text
	}

	const response: RevisitResponse = {
		ok: true,
		action,
		stage,
		feedback_created: feedbackCreated,
		message,
	}
	return Response.json(response)
}

function handleRequest(req: Request): Response | Promise<Response> {
	const url = new URL(req.url)
	const path = url.pathname

	// CORS preflight (handled before E2E — preflight is plaintext).
	// The network-layer middleware (see `listenOnPort`) already applies
	// `withCors` to every response, so returning a bare 204 here is enough.
	if (req.method === "OPTIONS" && isRemoteReviewEnabled()) {
		return new Response(null, { status: 204 })
	}

	// GET /files/:sessionId/*path — consolidated file serving
	const filesMatch = path.match(/^\/files\/([^/]+)\/(.+)$/)
	if (filesMatch && req.method === "GET") {
		return handleFileGet(filesMatch[1], filesMatch[2])
	}

	// GET /api/session/:sessionId — JSON API for the SPA
	const apiSessionMatch = path.match(/^\/api\/session\/([^/]+)$/)
	if (apiSessionMatch && req.method === "GET") {
		return handleSessionApi(apiSessionMatch[1])
	}

	// HEAD /api/session/:sessionId/heartbeat — client presence ping
	const heartbeatMatch = path.match(/^\/api\/session\/([^/]+)\/heartbeat$/)
	if (heartbeatMatch && req.method === "HEAD") {
		const ok = recordHeartbeat(heartbeatMatch[1])
		return new Response(null, { status: ok ? 200 : 404 })
	}

	// GET /review/current — always-available review pane (must be before /:sessionId)
	if (path === "/review/current" && req.method === "GET") {
		return serveSpa()
	}

	// GET /review/:sessionId
	const reviewMatch = path.match(/^\/review\/([^/]+)$/)
	if (reviewMatch && req.method === "GET") {
		return handleReviewGet(reviewMatch[1])
	}

	// POST /review/:sessionId/decide
	const decideMatch = path.match(/^\/review\/([^/]+)\/decide$/)
	if (decideMatch && req.method === "POST") {
		return handleDecidePost(decideMatch[1], req)
	}

	// GET /mockups/:sessionId/:path
	const mockupMatch = path.match(/^\/mockups\/([^/]+)\/(.+)$/)
	if (mockupMatch && req.method === "GET") {
		return handleMockupGet(mockupMatch[1], mockupMatch[2])
	}

	// GET /wireframe/:sessionId/:path
	const wireframeMatch = path.match(/^\/wireframe\/([^/]+)\/(.+)$/)
	if (wireframeMatch && req.method === "GET") {
		return handleWireframeGet(wireframeMatch[1], wireframeMatch[2])
	}

	// GET /stage-artifacts/:sessionId/:path
	const stageArtifactMatch = path.match(/^\/stage-artifacts\/([^/]+)\/(.+)$/)
	if (stageArtifactMatch && req.method === "GET") {
		return handleStageArtifactGet(stageArtifactMatch[1], stageArtifactMatch[2])
	}

	// GET /direction/:sessionId
	const directionMatch = path.match(/^\/direction\/([^/]+)$/)
	if (directionMatch && req.method === "GET") {
		return handleDirectionGet(directionMatch[1])
	}

	// POST /direction/:sessionId/select
	const directionSelectMatch = path.match(/^\/direction\/([^/]+)\/select$/)
	if (directionSelectMatch && req.method === "POST") {
		return handleDirectionSelectPost(directionSelectMatch[1], req)
	}

	// GET /question-image/:sessionId/:index
	const questionImageMatch = path.match(/^\/question-image\/([^/]+)\/(\d+)$/)
	if (questionImageMatch && req.method === "GET") {
		return handleQuestionImageGet(
			questionImageMatch[1],
			Number.parseInt(questionImageMatch[2], 10),
		)
	}

	// GET /question/:sessionId
	const questionMatch = path.match(/^\/question\/([^/]+)$/)
	if (questionMatch && req.method === "GET") {
		return handleQuestionGet(questionMatch[1])
	}

	// POST /question/:sessionId/answer
	const questionAnswerMatch = path.match(/^\/question\/([^/]+)\/answer$/)
	if (questionAnswerMatch && req.method === "POST") {
		return handleQuestionAnswerPost(questionAnswerMatch[1], req)
	}

	// ─── Review pane (always-available) ────────────────────────────────
	// GET /api/review/current — return current active intent state
	if (path === "/api/review/current" && req.method === "GET") {
		return handleReviewCurrent()
	}

	// POST /api/revisit/:sessionId — review UI → FSM rollback
	const revisitMatch = path.match(/^\/api\/revisit\/([^/]+)$/)
	if (revisitMatch && req.method === "POST") {
		return handleRevisitPost(revisitMatch[1], req)
	}

	// ─── Feedback CRUD ─────────────────────────────────────────────────

	// GET /api/feedback/:intent/:stage
	const feedbackGetMatch = path.match(/^\/api\/feedback\/([^/]+)\/([^/]+)$/)
	if (feedbackGetMatch && req.method === "GET") {
		return handleFeedbackGet(feedbackGetMatch[1], feedbackGetMatch[2], url)
	}

	// POST /api/feedback/:intent/:stage
	if (feedbackGetMatch && req.method === "POST") {
		return handleFeedbackPost(feedbackGetMatch[1], feedbackGetMatch[2], req)
	}

	// PUT /api/feedback/:intent/:stage/:id
	const feedbackItemMatch = path.match(
		/^\/api\/feedback\/([^/]+)\/([^/]+)\/([^/]+)$/,
	)
	if (feedbackItemMatch && req.method === "PUT") {
		return handleFeedbackPut(
			feedbackItemMatch[1],
			feedbackItemMatch[2],
			feedbackItemMatch[3],
			req,
		)
	}

	// DELETE /api/feedback/:intent/:stage/:id
	if (feedbackItemMatch && req.method === "DELETE") {
		return handleFeedbackDelete(
			feedbackItemMatch[1],
			feedbackItemMatch[2],
			feedbackItemMatch[3],
			req,
		)
	}

	// GET /health — tunnel keepalive check
	if (path === "/health" && req.method === "GET") {
		return new Response("ok", { status: 200 })
	}

	return new Response("Not Found", { status: 404 })
}

/**
 * Loopback address assertion — v1 transport invariant.
 *
 * Every route in haiku-api/routes.ts declares `transport: 'loopback'`.
 * The listening socket MUST bind to 127.0.0.1 or ::1. A non-loopback bind
 * is treated as a security incident: the process exits non-zero so the
 * operator sees the failure rather than silently exposing the review UI
 * on a public interface.
 *
 * The assertion is gated by `HAIKU_TRANSPORT_ASSERT` (default on). Tests
 * that want to exercise the failure path spawn a child process and can
 * force a non-loopback bind via `HAIKU_FORCE_BIND_ADDR`.
 */
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
	if (httpServer && actualPort !== null) {
		return actualPort
	}

	// Use port 0 to let the OS pick a random available port
	const requestedPort = 0
	const maxAttempts = 1

	for (let i = 0; i < maxAttempts; i++) {
		const port = requestedPort + i
		try {
			await listenOnPort(port)
			// For port 0, the OS assigns the actual port — read it from the server
			const addr = httpServer?.address()
			if (addr && typeof addr === "object") {
				actualPort = addr.port
				assertLoopbackBind(addr.address)
			} else {
				actualPort = port === 0 ? port : port
			}
			console.error(
				`Review HTTP server listening on http://127.0.0.1:${actualPort}`,
			)
			return actualPort as number
		} catch (err: unknown) {
			if (
				err instanceof Error &&
				"code" in err &&
				(err as NodeJS.ErrnoException).code === "EADDRINUSE"
			) {
				continue
			}
			throw err
		}
	}

	throw new Error(
		`Could not find available port (tried ${requestedPort}-${requestedPort + maxAttempts - 1})`,
	)
}

function listenOnPort(port: number): Promise<void> {
	return new Promise((resolve, reject) => {
		const server = createServer(async (req, res) => {
			// Build a Web API Request from the incoming Node request.
			// Use the Host header so the URL has the actual port even when
			// the requested port was 0 (OS-assigned).
			const host = req.headers.host ?? `127.0.0.1:${port}`
			const url = `http://${host}${req.url ?? "/"}`
			const headers = new Headers()
			for (const [key, value] of Object.entries(req.headers)) {
				if (value) {
					if (Array.isArray(value)) {
						for (const v of value) headers.append(key, v)
					} else {
						headers.set(key, value)
					}
				}
			}

			let body: ArrayBuffer | null = null
			let tooLarge = false
			if (req.method !== "GET" && req.method !== "HEAD") {
				// Stream-count bytes so oversize bodies get rejected with 413 before
				// we allocate the full buffer. The per-route cap (e.g. feedback
				// 128 KiB) is tighter and enforced inside parseJsonBody.
				const chunks: Buffer[] = []
				let total = 0
				for await (const chunk of req) {
					const buf =
						typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer)
					total += buf.length
					if (total > DEFAULT_BODY_MAX_BYTES) {
						tooLarge = true
						// Drain remaining chunks so the client connection stays healthy,
						// then stop accumulating.
						break
					}
					chunks.push(buf)
				}
				if (tooLarge) {
					res.writeHead(413, { "Content-Type": "application/json" })
					res.end(
						JSON.stringify({
							error: "payload_too_large",
							max_bytes: DEFAULT_BODY_MAX_BYTES,
						}),
					)
					return
				}
				const buf = Buffer.concat(chunks)
				body = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
			}

			const webRequest = new Request(url, {
				method: req.method ?? "GET",
				headers,
				body,
			})

			try {
				let webResponse = await handleRequest(webRequest)
				// Network-layer: apply CORS + E2E encryption to all responses
				const sessionId = extractSessionId(new URL(webRequest.url).pathname)
				webResponse = await withE2E(withCors(webResponse), sessionId)
				res.writeHead(
					webResponse.status,
					Object.fromEntries(webResponse.headers.entries()),
				)
				const responseBody = await webResponse.arrayBuffer()
				res.end(Buffer.from(responseBody))
			} catch (err) {
				// No body content is logged by default — only the error message
				// and the request path. Both are in the allow-list below. Any
				// addition here must be reviewed for leak potential.
				console.error(
					"[http] handler error method=%s path=%s err=%s",
					req.method,
					req.url,
					err instanceof Error ? err.message : String(err),
				)
				res.writeHead(500)
				res.end("Internal Server Error")
			}
		})

		// Handle WebSocket upgrade requests
		server.on("upgrade", (req, socket, head) => {
			handleUpgrade(req, socket, head)
		})

		server.once("error", (err) => {
			reject(err)
		})

		// Bind address: default loopback. Test harnesses may override via
		// HAIKU_FORCE_BIND_ADDR to exercise the transport-invariant exit path.
		const bindAddr = process.env.HAIKU_FORCE_BIND_ADDR || "127.0.0.1"
		server.listen(port, bindAddr, () => {
			httpServer = server
			resolve()
		})
	})
}

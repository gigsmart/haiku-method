import { createServer, type Server as HttpServer, type IncomingMessage } from "node:http"
import { createHash } from "node:crypto"
import { readFile, realpath } from "node:fs/promises"
import { extname, join, resolve } from "node:path"
import type { Duplex } from "node:stream"
import { z } from "zod"
import { getSession, updateDesignDirectionSession, updateQuestionSession, updateSession } from "./sessions.js"
import type { QuestionAnswer, QuestionAnnotations, ReviewAnnotations } from "./sessions.js"
import { REVIEW_APP_HTML } from "./review-app-html.js"

let httpServer: HttpServer | null = null
let actualPort: number | null = null

export function getActualPort(): number | null {
	return actualPort
}

/** Serve the React SPA for any page route — the SPA reads the session ID from the URL */
function serveSpa(): Response {
	return new Response(REVIEW_APP_HTML, {
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

	let body: { decision: string; feedback?: string; annotations?: ReviewAnnotations }
	try {
		const DecideSchema = z.object({
			decision: z.string(),
			feedback: z.string().optional(),
			annotations: z
				.object({
					screenshot: z.string().optional(),
					pins: z
						.array(
							z.object({
								x: z.number(),
								y: z.number(),
								text: z.string(),
							}),
						)
						.optional(),
					comments: z
						.array(
							z.object({
								selectedText: z.string(),
								comment: z.string(),
								paragraph: z.number(),
							}),
						)
						.optional(),
				})
				.optional(),
		})
		body = DecideSchema.parse(await req.json())
	} catch {
		return new Response("Invalid request body", { status: 400 })
	}

	const decision =
		body.decision === "approved" ? "approved" : "changes_requested"
	const feedback = body.feedback ?? ""
	const annotations = body.annotations

	updateSession(sessionId, {
		status: "decided",
		decision,
		feedback,
		annotations,
	})


	return Response.json({ ok: true, decision, feedback })
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
}

async function handleMockupGet(
	sessionId: string,
	filePath: string,
): Promise<Response> {
	const session = getSession(sessionId)
	if (!session || session.session_type !== "review") {
		return new Response("Session not found", { status: 404 })
	}

	// Resolve and validate path stays within intent dir (realpath follows symlinks)
	const mockupsDir = join(session.intent_dir, "mockups")
	const resolved = resolve(mockupsDir, filePath)
	// Pre-check with resolve() before attempting realpath
	if (!resolved.startsWith(resolve(mockupsDir))) {
		return new Response("Forbidden", { status: 403 })
	}

	try {
		// Symlink-safe check: ensure resolved real path stays within base dir
		const realResolved = await realpath(resolved).catch(() => null)
		const realBase = await realpath(mockupsDir).catch(() => resolve(mockupsDir))
		if (!realResolved || !realResolved.startsWith(realBase)) {
			return new Response("Forbidden", { status: 403 })
		}
		const data = await readFile(resolved)
		const ext = extname(resolved).toLowerCase()
		const contentType = MIME_TYPES[ext] ?? "application/octet-stream"
		return new Response(data, {
			headers: { "Content-Type": contentType },
		})
	} catch {
		return new Response("Not found", { status: 404 })
	}
}

async function handleWireframeGet(
	sessionId: string,
	filePath: string,
): Promise<Response> {
	const session = getSession(sessionId)
	if (!session || session.session_type !== "review") {
		return new Response("Session not found", { status: 404 })
	}

	// Wireframe paths are relative to the intent dir
	const resolved = resolve(session.intent_dir, filePath)
	// Pre-check with resolve() before attempting realpath
	if (!resolved.startsWith(resolve(session.intent_dir))) {
		return new Response("Forbidden", { status: 403 })
	}

	try {
		// Symlink-safe check: ensure resolved real path stays within base dir
		const realResolved = await realpath(resolved).catch(() => null)
		const realBase = await realpath(session.intent_dir).catch(() =>
			resolve(session.intent_dir),
		)
		if (!realResolved || !realResolved.startsWith(realBase)) {
			return new Response("Forbidden", { status: 403 })
		}
		const data = await readFile(resolved)
		const ext = extname(resolved).toLowerCase()
		const contentType = MIME_TYPES[ext] ?? "application/octet-stream"
		return new Response(data, {
			headers: { "Content-Type": contentType },
		})
	} catch {
		return new Response("Not found", { status: 404 })
	}
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
			const realBase = await realpath(allowedBaseDir).catch(() => resolve(allowedBaseDir))
			if (!realResolved || !realResolved.startsWith(realBase + "/") && realResolved !== realBase) {
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

	let body: { answers: QuestionAnswer[]; feedback?: string; annotations?: QuestionAnnotations }
	try {
		const QuestionAnswerSchema = z.object({
			answers: z.array(
				z.object({
					question: z.string(),
					selectedOptions: z.array(z.string()),
					otherText: z.string().optional(),
				}),
			),
			feedback: z.string().optional(),
			annotations: z
				.object({
					comments: z
						.array(
							z.object({
								selectedText: z.string(),
								comment: z.string(),
								paragraph: z.number(),
							}),
						)
						.optional(),
				})
				.optional(),
		})
		body = QuestionAnswerSchema.parse(await req.json())
	} catch {
		return new Response("Invalid request body", { status: 400 })
	}

	updateQuestionSession(sessionId, {
		status: "answered",
		answers: body.answers,
		feedback: body.feedback ?? "",
		annotations: body.annotations,
	})


	return Response.json({ ok: true })
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

	let body: { archetype: string; parameters: Record<string, number> }
	try {
		const DirectionSelectSchema = z.object({
			archetype: z.string(),
			parameters: z.record(z.number()),
		})
		body = DirectionSelectSchema.parse(await req.json())
	} catch {
		return Response.json({ error: "Invalid request body" }, { status: 400 })
	}

	updateDesignDirectionSession(sessionId, {
		status: "answered",
		selection: { archetype: body.archetype, parameters: body.parameters },
	})


	return Response.json({ ok: true })
}

// ─── WebSocket support ───────────────────────────────────────────────
// Minimal RFC 6455 implementation using Node built-ins (no dependencies).
// The browser opens ws://…/ws/session/:id and can send JSON messages that
// are routed to the same update functions as the HTTP POST endpoints.
// This lets tool handlers use event-based waitForSession() instead of polling.

const WS_MAGIC = "258EAFA5-E914-47DA-95CA-5AB5DC85B14"

/** Active WebSocket connections keyed by session ID */
const wsConnections = new Map<string, Duplex>()

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
 * Returns the UTF-8 payload string, or null if the frame is a close/ping/pong
 * or cannot be decoded.
 */
function decodeWebSocketFrame(buf: Buffer): string | null {
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

	let mask: Buffer | null = null
	if (isMasked) {
		if (buf.length < offset + 4) return null
		mask = buf.subarray(offset, offset + 4)
		offset += 4
	}

	if (buf.length < offset + payloadLen) return null

	const payload = buf.subarray(offset, offset + payloadLen)
	if (mask) {
		for (let i = 0; i < payload.length; i++) {
			payload[i] ^= mask[i % 4]
		}
	}

	// Handle close frame
	if (opcode === 0x08) return null
	// Handle ping — respond with pong
	if (opcode === 0x09) return null
	// Only process text frames
	if (opcode !== 0x01) return null

	return payload.toString("utf8")
}

/** Handle an incoming WebSocket message: parse and route to the appropriate update function */
function handleWebSocketMessage(sessionId: string, raw: string): void {
	let msg: Record<string, unknown>
	try {
		msg = JSON.parse(raw)
	} catch {
		return
	}

	const session = getSession(sessionId)
	if (!session) return

	const type = msg.type as string | undefined

	if (session.session_type === "review" && type === "decide") {
		const decision = msg.decision === "approved" ? "approved" : "changes_requested"
		const feedback = (msg.feedback as string) ?? ""
		const annotations = msg.annotations as ReviewAnnotations | undefined
		updateSession(sessionId, { status: "decided" as never, decision, feedback, annotations })
		sendToWebSocket(sessionId, { ok: true, decision, feedback })
	} else if (session.session_type === "question" && type === "answer") {
		const answers = msg.answers as QuestionAnswer[] | undefined
		if (answers) {
			const feedback = (msg.feedback as string) ?? ""
			const annotations = msg.annotations as QuestionAnnotations | undefined
			updateQuestionSession(sessionId, { status: "answered", answers, feedback, annotations })
			sendToWebSocket(sessionId, { ok: true })
		}
	} else if (session.session_type === "design_direction" && type === "select") {
		if (session.status === "answered") {
			sendToWebSocket(sessionId, { error: "Direction already selected" })
			return
		}
		const archetype = msg.archetype as string
		const parameters = msg.parameters as Record<string, number>
		if (archetype && parameters) {
			updateDesignDirectionSession(sessionId, {
				status: "answered",
				selection: { archetype, parameters },
			})
			sendToWebSocket(sessionId, { ok: true })
		}
	}
}

/**
 * Handle HTTP upgrade requests for WebSocket connections.
 * Path: /ws/session/:sessionId
 */
function handleUpgrade(req: IncomingMessage, socket: Duplex, _head: Buffer): void {
	const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`)
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
		"HTTP/1.1 101 Switching Protocols\r\n" +
		"Upgrade: websocket\r\n" +
		"Connection: Upgrade\r\n" +
		`Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
	)

	// Track this connection
	trackWebSocket(sessionId, socket)

	// Buffer for fragmented reads
	let frameBuffer = Buffer.alloc(0)

	socket.on("data", (chunk: Buffer) => {
		frameBuffer = Buffer.concat([frameBuffer, chunk])

		// Try to decode — may need more data
		const payload = decodeWebSocketFrame(frameBuffer)
		if (payload !== null) {
			frameBuffer = Buffer.alloc(0)
			handleWebSocketMessage(sessionId, payload)
		}
		// If frame couldn't be decoded yet, wait for more data.
		// Also reset buffer if it's grown too large (malformed client).
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

function handleRequest(req: Request): Response | Promise<Response> {
	const url = new URL(req.url)
	const path = url.pathname

	// GET /api/session/:sessionId — JSON API for the SPA
	const apiSessionMatch = path.match(/^\/api\/session\/([^/]+)$/)
	if (apiSessionMatch && req.method === "GET") {
		return handleSessionApi(apiSessionMatch[1])
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

	// GET /mockups/:sessionId/:path — serve files from intent mockups/ dir
	const mockupMatch = path.match(/^\/mockups\/([^/]+)\/(.+)$/)
	if (mockupMatch && req.method === "GET") {
		return handleMockupGet(mockupMatch[1], mockupMatch[2])
	}

	// GET /wireframe/:sessionId/:path — serve wireframe files from intent dir
	const wireframeMatch = path.match(/^\/wireframe\/([^/]+)\/(.+)$/)
	if (wireframeMatch && req.method === "GET") {
		return handleWireframeGet(wireframeMatch[1], wireframeMatch[2])
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

	// GET /question-image/:sessionId/:index — serve images for question sessions
	const questionImageMatch = path.match(
		/^\/question-image\/([^/]+)\/(\d+)$/,
	)
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

	return new Response("Not Found", { status: 404 })
}

export async function startHttpServer(): Promise<number> {
	if (httpServer && actualPort !== null) {
		return actualPort
	}

	// Use port 0 to let the OS pick a random available port
	const requestedPort = process.env.AI_DLC_REVIEW_PORT ? Number.parseInt(process.env.AI_DLC_REVIEW_PORT, 10) : 0
	const maxAttempts = requestedPort === 0 ? 1 : 10

	for (let i = 0; i < maxAttempts; i++) {
		const port = requestedPort + i
		try {
			await listenOnPort(port)
			// For port 0, the OS assigns the actual port — read it from the server
			actualPort = port === 0 ? (httpServer?.address() as { port: number })?.port ?? port : port
			console.error(`Review HTTP server listening on http://127.0.0.1:${actualPort}`)
			return actualPort
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
			// Build a Web API Request from the incoming Node request
			const url = `http://127.0.0.1:${port}${req.url ?? "/"}`
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
			if (req.method !== "GET" && req.method !== "HEAD") {
				const chunks: Buffer[] = []
				for await (const chunk of req) {
					chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
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
				const webResponse = await handleRequest(webRequest)
				res.writeHead(
					webResponse.status,
					Object.fromEntries(webResponse.headers.entries()),
				)
				const responseBody = await webResponse.arrayBuffer()
				res.end(Buffer.from(responseBody))
			} catch (err) {
				console.error("HTTP handler error:", err)
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

		server.listen(port, "127.0.0.1", () => {
			httpServer = server
			resolve()
		})
	})
}

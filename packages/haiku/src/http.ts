import { createServer, type Server as HttpServer } from "node:http"
import { readFile, realpath } from "node:fs/promises"
import { extname, join, resolve } from "node:path"
import type { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { z } from "zod"
import { getSession, updateDesignDirectionSession, updateQuestionSession, updateSession } from "./sessions.js"
import type { QuestionAnswer, ReviewAnnotations } from "./sessions.js"
import { REVIEW_APP_HTML } from "./review-app-html.js"

let httpServer: HttpServer | null = null
let actualPort: number | null = null

/** Dependency-injected MCP server reference */
let mcpServer: Server | null = null

export function setMcpServer(server: Server): void {
	mcpServer = server
}

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
		status: decision,
		decision,
		feedback,
		annotations,
	})

	// Push channel notification to Claude Code
	if (mcpServer) {
		try {
			// Build notification content: feedback text + structured annotation summary
			let notificationContent = feedback
			if (annotations?.pins?.length) {
				notificationContent +=
					"\n\n--- Annotation Pins ---\n" +
					annotations.pins
						.map(
							(p, i) =>
								`[${i + 1}] (${p.x.toFixed(1)}%, ${p.y.toFixed(1)}%) ${p.text}`,
						)
						.join("\n")
			}
			if (annotations?.comments?.length) {
				notificationContent +=
					"\n\n--- Inline Comments ---\n" +
					annotations.comments
						.map(
							(c, i) =>
								`[${i + 1}] "${c.selectedText}" -> ${c.comment} (paragraph ${c.paragraph})`,
						)
						.join("\n")
			}

			const meta: Record<string, unknown> = {
				decision,
				review_type: session.review_type,
				target: session.target || "",
				session_id: sessionId,
			}
			if (annotations) {
				meta.has_annotations = true
				if (annotations.screenshot) {
					meta.has_screenshot = true
				}
				if (annotations.pins?.length) {
					meta.pin_count = annotations.pins.length
				}
				if (annotations.comments?.length) {
					meta.comment_count = annotations.comments.length
				}
			}

			await mcpServer.notification({
				// biome-ignore lint/suspicious/noExplicitAny: Claude channel API not typed
				method: "notifications/claude/channel" as any,
				params: {
					content: notificationContent,
					meta,
				},
				// biome-ignore lint/suspicious/noExplicitAny: Claude channel API not typed
			} as any)
		} catch (err) {
			console.error("Failed to push channel notification:", err)
		}
	}

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

	let body: { answers: QuestionAnswer[] }
	try {
		const QuestionAnswerSchema = z.object({
			answers: z.array(
				z.object({
					question: z.string(),
					selectedOptions: z.array(z.string()),
					otherText: z.string().optional(),
				}),
			),
		})
		body = QuestionAnswerSchema.parse(await req.json())
	} catch {
		return new Response("Invalid request body", { status: 400 })
	}

	updateQuestionSession(sessionId, {
		status: "answered",
		answers: body.answers,
	})

	// Push channel notification to Claude Code
	if (mcpServer) {
		try {
			await mcpServer.notification({
				// biome-ignore lint/suspicious/noExplicitAny: Claude channel API not typed
				method: "notifications/claude/channel" as any,
				params: {
					content: JSON.stringify(body.answers),
					meta: {
						response_type: "question_answers",
						session_id: sessionId,
						question_count: body.answers.length,
					},
				},
				// biome-ignore lint/suspicious/noExplicitAny: Claude channel API not typed
			} as any)
		} catch (err) {
			console.error("Failed to push channel notification:", err)
		}
	}

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

	// Push channel notification to Claude Code
	if (mcpServer) {
		try {
			await mcpServer.notification({
				// biome-ignore lint/suspicious/noExplicitAny: Claude channel API not typed
				method: "notifications/claude/channel" as any,
				params: {
					content: JSON.stringify({
						archetype: body.archetype,
						parameters: body.parameters,
					}),
					meta: {
						response_type: "design_direction_selection",
						session_id: sessionId,
						intent_slug: session.intent_slug,
						archetype: body.archetype,
					},
				},
				// biome-ignore lint/suspicious/noExplicitAny: Claude channel API not typed
			} as any)
		} catch (err) {
			console.error("Failed to push channel notification:", err)
		}
	}

	return Response.json({ ok: true })
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

		server.once("error", (err) => {
			reject(err)
		})

		server.listen(port, "127.0.0.1", () => {
			httpServer = server
			resolve()
		})
	})
}

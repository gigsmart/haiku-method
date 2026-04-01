import { createServer, type Server as HttpServer } from "node:http"
import { readFile, realpath } from "node:fs/promises"
import { extname, join, resolve } from "node:path"
import type { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { z } from "zod"
import { getSession, updateQuestionSession, updateSession } from "./sessions.js"
import type { QuestionAnswer } from "./sessions.js"

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

function handleReviewGet(sessionId: string): Response {
	const session = getSession(sessionId)
	if (!session || session.session_type !== "review") {
		return new Response("Session not found", { status: 404 })
	}
	return new Response(session.html, {
		headers: { "Content-Type": "text/html; charset=utf-8" },
	})
}

async function handleDecidePost(
	sessionId: string,
	req: Request,
): Promise<Response> {
	const session = getSession(sessionId)
	if (!session || session.session_type !== "review") {
		return new Response("Session not found", { status: 404 })
	}

	let body: { decision: string; feedback?: string }
	try {
		const DecideSchema = z.object({
			decision: z.string(),
			feedback: z.string().optional(),
		})
		body = DecideSchema.parse(await req.json())
	} catch {
		return new Response("Invalid request body", { status: 400 })
	}

	const decision =
		body.decision === "approved" ? "approved" : "changes_requested"
	const feedback = body.feedback ?? ""

	updateSession(sessionId, {
		status: decision,
		decision,
		feedback,
	})

	// Push channel notification to Claude Code
	if (mcpServer) {
		try {
			await mcpServer.notification({
				// biome-ignore lint/suspicious/noExplicitAny: Claude channel API not typed
				method: "notifications/claude/channel" as any,
				params: {
					content: feedback,
					meta: {
						decision,
						review_type: session.review_type,
						target: session.target || "",
						session_id: sessionId,
					},
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

function handleQuestionGet(sessionId: string): Response {
	const session = getSession(sessionId)
	if (!session || session.session_type !== "question") {
		return new Response("Session not found", { status: 404 })
	}
	return new Response(session.html, {
		headers: { "Content-Type": "text/html; charset=utf-8" },
	})
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

function handleRequest(req: Request): Response | Promise<Response> {
	const url = new URL(req.url)
	const path = url.pathname

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

	const basePort = Number.parseInt(process.env.AI_DLC_REVIEW_PORT ?? "8789", 10)
	const maxAttempts = 10

	for (let i = 0; i < maxAttempts; i++) {
		const port = basePort + i
		try {
			await listenOnPort(port)
			actualPort = port
			console.error(`Review HTTP server listening on http://127.0.0.1:${port}`)
			return port
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
		`Could not find available port (tried ${basePort}-${basePort + maxAttempts - 1})`,
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

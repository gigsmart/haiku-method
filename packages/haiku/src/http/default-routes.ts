// http/default-routes.ts — Health, SPA shell, 404 catch-all, error
// envelope. The "fallback" surface for everything not handled by a
// concrete API route.
//
//   - GET /health      → liveness/readiness split
//   - GET /            → SPA shell HTML
//   - notFoundHandler  → SPA deep-link catch-all (scoped to /review/,
//                        /question/, /direction/) + bare 204 for
//                        disallowed-origin OPTIONS preflights
//   - errorHandler     → translate parser errors into the envelopes
//                        the SPA + tests expect (validation_failed
//                        for invalid JSON, payload_too_large for 413,
//                        internal_error for everything else)

import type { FastifyInstance } from "fastify"
import {
	DEFAULT_BODY_MAX_BYTES,
	FEEDBACK_CREATE_MAX_BYTES,
	type ValidationError,
	type ZodIssueWire,
} from "haiku-api"
import { HAIKU_UI_HTML } from "../haiku-ui-html.js"
import { getPluginVersion, MCP_VERSION } from "../version.js"

const PLUGIN_VERSION = getPluginVersion()

export function registerDefaultRoutes(
	instance: FastifyInstance,
	isReady: () => boolean,
): void {
	// Split liveness from readiness. Until startHttpServer() finishes
	// listen() AND post-listen initialization, isReady() returns false
	// and the endpoint returns HTTP 503 `"starting"`. Once ready, 200
	// `"ok"`. The tunnel integration and any load balancer in front of
	// this process treat non-200 as "don't route traffic yet", which
	// matches the standard readiness-vs-liveness split.
	instance.get("/health", async (_req, reply) => {
		if (!isReady()) {
			reply.status(503)
			return "starting"
		}
		return "ok"
	})

	// Version endpoint surfaced to the SPA so reviewers can see which
	// MCP binary + plugin version is running when the review pane opens.
	// Useful when a fix has merged but the running plugin hasn't yet
	// updated, or when comparing observed behavior to what's documented
	// in CHANGELOG.md. No auth — version is non-sensitive metadata.
	instance.get("/api/version", async (_req, reply) => {
		reply.header("Cache-Control", "no-store")
		return { mcp_version: MCP_VERSION, plugin_version: PLUGIN_VERSION }
	})

	// NOTE on OPTIONS routing: @fastify/cors (registered above) owns
	// the global `OPTIONS *` route. For allowed origins it attaches
	// ACAO/ACAM/ACAH/ACEH and responds 204; for disallowed origins
	// it responds 204 WITHOUT those headers so the browser blocks the
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

	// Translate Fastify's built-in parser errors into the envelopes
	// the existing test suite and SPA client expect:
	//   - FST_ERR_CTP_INVALID_JSON   → {error:"validation_failed", issues:[{code:"invalid_json", ...}]}
	//   - FST_ERR_CTP_BODY_TOO_LARGE → {error:"payload_too_large", max_bytes}
	// Every other error falls back to a generic 500 envelope so
	// nothing leaks a stack trace.
	instance.setErrorHandler((err, req, reply) => {
		const errCode = (err as { code?: string }).code
		const status = (err as { statusCode?: number }).statusCode ?? 500
		const errMessage =
			err instanceof Error ? err.message : typeof err === "string" ? err : ""

		// FB-04: log the underlying error detail at the point we know
		// it. The `onResponse` hook also logs the eventual 4xx/5xx line
		// but only sees the status — not the exception class or
		// message. Emit a separate event here so operators can trace
		// 500s back to the original throw without needing a stack trace.
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
		// with statusCode 400) when the request body is malformed
		// JSON. Depending on version it may surface with code
		// FST_ERR_CTP_INVALID_JSON, or as a plain SyntaxError. Treat
		// all those as `validation_failed` with an `invalid_json`
		// issue so the SPA's fetch error path has stable shape.
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
}

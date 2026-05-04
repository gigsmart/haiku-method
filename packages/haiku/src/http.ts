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
import fastifyCors from "@fastify/cors"
import fastifyRateLimit from "@fastify/rate-limit"
import fastifyWebsocket from "@fastify/websocket"
import Fastify, { type FastifyInstance } from "fastify"
import { DEFAULT_BODY_MAX_BYTES } from "haiku-api"
import { review } from "./config.js"
import { registerAssessmentsRoutes } from "./http/assessments-routes.js"
import { registerBaselineContentRoutes } from "./http/baseline-content-routes.js"
import { registerCsrfRoutes } from "./http/csrf.js"
import { registerDefaultRoutes } from "./http/default-routes.js"
import { e2eOnSend, extractSessionIdFromPath } from "./http/e2e.js"
import { registerFeedbackRoutes } from "./http/feedback-api.js"
import { registerFileServeRoutes } from "./http/file-serve.js"
import { registerSessionRoutes } from "./http/session-routes.js"
import { registerUploadRoutes } from "./http/upload-routes.js"
import {
	closeSessionConnection,
	MAX_WS_SESSIONS,
	sendToWebSocket,
	wsConnections,
} from "./http/ws.js"
import { registerWsUpgrade } from "./http/ws-upgrade.js"
import { isE2EActive, isRemoteReviewEnabled } from "./tunnel.js"

// Re-export the WebSocket helpers external callers (orchestrator,
// review-server bridge, server.ts) still pull from this module.
export { closeSessionConnection, sendToWebSocket }

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
				// V-08 Layer 3 CSRF nonce header. Listed in CORS allowedHeaders
				// so the browser's preflight succeeds for legitimate same-app
				// requests; cross-origin attackers still can't satisfy
				// preflight without server CORS approval, which is the design.
				"X-Haiku-CSRF",
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

	// ── Health, SPA shell, 404 catch-all, error envelope ──────────────
	// IMPORTANT: registerDefaultRoutes calls instance.setErrorHandler().
	// In Fastify 5.x, the error handler is captured into route contexts
	// at the point each route's after() callback fires. Async plugins
	// (like the @fastify/multipart scope in registerUploadRoutes) can
	// shift when those after() callbacks fire relative to setErrorHandler.
	// Registering the error handler FIRST guarantees all subsequent route
	// contexts inherit the correct custom error handler, regardless of
	// whether async plugin wrappers affect callback ordering.
	registerDefaultRoutes(instance, isReady)

	// ── V-08 CSRF defence-in-depth (global preHandler + nonce-mint route) ─
	// Registered BEFORE the route registrations below so the global
	// preHandler is in scope for every route Fastify learns about. In
	// tunnel mode this enforces:
	//   Layer 1 — Reject `?t=<jwt>` on POST/PUT/PATCH/DELETE.
	//   Layer 2 — Origin allowlist (HAIKU_ALLOWED_ORIGINS env).
	//   Layer 3 — Per-session CSRF nonce (X-Haiku-CSRF header), opt-in.
	// Local mode is exempt entirely (loopback gates auth on its own).
	registerCsrfRoutes(instance)

	// ── Session-scoped routes (SPA shells, mutations, session API,
	//      revisit, asset serves) ───────────────────────────────────────
	registerSessionRoutes(instance)
	registerFileServeRoutes(instance)

	// ── Feedback CRUD + reply + intent-scope + attachments ────────────
	registerFeedbackRoutes(instance)

	// ── SPA upload endpoints (stage-output + knowledge) ───────────────
	await registerUploadRoutes(instance)

	// ── Drift-assessment read endpoints ───────────────────────────────
	registerAssessmentsRoutes(instance)
	registerBaselineContentRoutes(instance)

	// ── WebSocket upgrade ──────────────────────────────────────────────
	registerWsUpgrade(instance)

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

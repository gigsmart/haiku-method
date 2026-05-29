/**
 * CLI device-flow handlers (Phase 2), free of any GCP-runtime import so they can
 * be unit-tested with plain fake (req, res) objects. index.ts wires the routes
 * (`/cli/start`, `/cli/complete`, `/cli/poll`, `/cli/refresh`) into the existing
 * authProxy entry alongside the Phase-1 browse-site `/github/token` +
 * `/gitlab/token` handlers.
 *
 * Flow:
 *   1. CLI POSTs /cli/start → we mint a session + state, store PENDING in
 *      Firestore, and return a verification_url pointing at the browse site's
 *      CLI authorize entry carrying the state.
 *   2. The human approves; the browse site's existing /{provider}/callback
 *      exchanges code→token, then POSTs the bundle to /cli/complete keyed by
 *      state → the session flips to ready.
 *   3. CLI polls /cli/poll → the token is released ONCE, then consumed.
 *   4. /cli/refresh re-runs the provider exchange with grant_type=refresh_token.
 *
 * The provider exchange + refresh live in ./providers and are shared with the
 * browse-site endpoints — no duplication.
 */

import { randomBytes } from "node:crypto"
import {
	authorizeEndpoint,
	isProvider,
	normalizeHost,
	type Provider,
	ProviderError,
	refreshToken,
	type TokenBundle,
} from "./providers.js"
import {
	buildSession,
	FirestoreSessionStore,
	type SessionStore,
} from "./sessions.js"

/** Minimal Express-shaped request/response (functions-framework compatible). */
export interface HttpRequest {
	method?: string
	path?: string
	body?: unknown
}
export interface HttpResponse {
	status(code: number): unknown
	json(body: unknown): unknown
}

/** The browse-site origin that hosts the OAuth authorize entry + callback. */
function browseOrigin(): string {
	// Reuse the Phase-1 ALLOWED_ORIGIN allowlist's first entry as the canonical
	// browse origin the verification_url points at.
	const allowed = (process.env.ALLOWED_ORIGIN || "https://haikumethod.ai")
		.split(",")
		.map((o) => o.trim())
		.filter(Boolean)
	return process.env.BROWSE_ORIGIN || allowed[0] || "https://haikumethod.ai"
}

let store: SessionStore | null = null
function sessions(): SessionStore {
	if (!store) store = new FirestoreSessionStore()
	return store
}
/** Test seam — inject an in-memory store. */
export function setSessionStore(s: SessionStore | null): void {
	store = s
}

/** Test seam — inject a fake fetch for the provider exchange. */
let fetchImpl: typeof fetch | undefined
export function setFetchImpl(f: typeof fetch | undefined): void {
	fetchImpl = f
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function readBody(req: HttpRequest): Record<string, unknown> {
	const b = req.body
	if (b && typeof b === "object") return b as Record<string, unknown>
	if (typeof b === "string" && b.length) {
		try {
			return JSON.parse(b) as Record<string, unknown>
		} catch {
			return {}
		}
	}
	return {}
}

function str(v: unknown): string | undefined {
	return typeof v === "string" && v.length ? v : undefined
}

function genId(bytes = 24): string {
	return randomBytes(bytes).toString("base64url")
}

function fail(
	res: HttpResponse,
	status: number,
	code: string,
	message: string,
): void {
	res.status(status)
	res.json({ error: code, error_description: message })
}

function resolveProviderArg(res: HttpResponse, raw: unknown): Provider | null {
	if (!isProvider(raw)) {
		fail(res, 400, "invalid_provider", "provider must be 'github' or 'gitlab'")
		return null
	}
	return raw
}

// ---------------------------------------------------------------------------
// handlers
// ---------------------------------------------------------------------------

async function start(req: HttpRequest, res: HttpResponse): Promise<void> {
	const body = readBody(req)
	const provider = resolveProviderArg(res, body.provider)
	if (!provider) return
	const host = normalizeHost(provider, str(body.host))

	const sessionId = genId(24)
	const state = genId(24)
	await sessions().create(buildSession({ sessionId, state, provider, host }))

	// The browse site owns the CLI authorize-entry route; it reads
	// provider/host/state off the query string, sends the human through the
	// provider authorize page, and after callback POSTs the captured token to
	// /cli/complete keyed by this state. `authorize_via` documents the real
	// provider authorize target for the website client.
	const url = new URL("/oauth/cli/authorize", browseOrigin())
	url.searchParams.set("provider", provider)
	url.searchParams.set("host", host)
	url.searchParams.set("state", state)
	url.searchParams.set("authorize_via", authorizeEndpoint(provider, host))

	res.status(200)
	res.json({
		session_id: sessionId,
		verification_url: url.toString(),
		expires_in: 600,
	})
}

async function complete(req: HttpRequest, res: HttpResponse): Promise<void> {
	const body = readBody(req)
	const state = str(body.state)
	if (!state) {
		fail(res, 400, "missing_state", "state is required")
		return
	}
	const accessToken = str(body.access_token)
	if (!accessToken) {
		fail(res, 400, "missing_access_token", "access_token is required")
		return
	}
	const session = await sessions().getByState(state)
	if (!session) {
		fail(
			res,
			404,
			"unknown_state",
			"no pending session for that state (expired or invalid)",
		)
		return
	}
	if (session.status !== "pending") {
		fail(res, 409, "already_completed", "session already completed or consumed")
		return
	}

	const token: TokenBundle = { access_token: accessToken }
	if (str(body.refresh_token)) token.refresh_token = str(body.refresh_token)
	if (typeof body.expires_at === "number") token.expires_at = body.expires_at
	if (Array.isArray(body.scopes)) {
		token.scopes = (body.scopes as unknown[]).filter(
			(s): s is string => typeof s === "string",
		)
	} else if (str(body.scopes)) {
		token.scopes = (str(body.scopes) as string).split(/[\s,]+/).filter(Boolean)
	}

	const patch: Partial<typeof session> = { status: "ready", token }
	if (str(body.account)) patch.account = str(body.account)
	if (str(body.host)) patch.host = normalizeHost(session.provider, str(body.host))

	await sessions().update(session.session_id, patch)
	res.status(200)
	res.json({ status: "ready" })
}

async function poll(req: HttpRequest, res: HttpResponse): Promise<void> {
	const body = readBody(req)
	const sessionId = str(body.session_id)
	if (!sessionId) {
		fail(res, 400, "missing_session_id", "session_id is required")
		return
	}
	const session = await sessions().getById(sessionId)
	if (!session) {
		// reaped-on-read for expired, or never existed
		res.status(200)
		res.json({ status: "expired" })
		return
	}
	if (session.status === "pending") {
		res.status(200)
		res.json({ status: "pending" })
		return
	}
	if (session.status === "consumed") {
		res.status(200)
		res.json({ status: "consumed" })
		return
	}
	// ready → release once, then delete so it can never be replayed.
	const token = session.token
	await sessions().update(session.session_id, {
		status: "consumed",
		token: undefined,
	})
	await sessions()
		.delete(session.session_id)
		.catch(() => {})
	res.status(200)
	res.json({
		status: "ready",
		provider: session.provider,
		host: session.host,
		account: session.account,
		...token,
	})
}

async function refresh(req: HttpRequest, res: HttpResponse): Promise<void> {
	const body = readBody(req)
	const provider = resolveProviderArg(res, body.provider)
	if (!provider) return
	const rt = str(body.refresh_token)
	if (!rt) {
		fail(res, 400, "missing_refresh_token", "refresh_token is required")
		return
	}
	const host = normalizeHost(provider, str(body.host))
	const bundle = await refreshToken({
		provider,
		host,
		refreshToken: rt,
		fetchImpl,
	})
	res.status(200)
	res.json(bundle)
}

/**
 * Route a /cli/* request. Returns true if the path was a CLI route (handled),
 * false otherwise so the caller can fall through to its own routing.
 */
export async function handleCliRoute(
	req: HttpRequest,
	res: HttpResponse,
): Promise<boolean> {
	const path = (req.path || "/").replace(/\/+$/, "").toLowerCase() || "/"
	if (!path.startsWith("/cli/")) return false

	try {
		switch (path) {
			case "/cli/start":
				await start(req, res)
				return true
			case "/cli/complete":
				await complete(req, res)
				return true
			case "/cli/poll":
				await poll(req, res)
				return true
			case "/cli/refresh":
				await refresh(req, res)
				return true
			default:
				fail(res, 404, "not_found", `no route for ${path}`)
				return true
		}
	} catch (err) {
		if (err instanceof ProviderError) {
			fail(res, err.status, err.code, err.message)
			return true
		}
		const message = err instanceof Error ? err.message : "internal error"
		fail(res, 500, "server_error", message)
		return true
	}
}

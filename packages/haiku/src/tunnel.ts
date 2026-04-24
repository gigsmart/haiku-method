import {
	createCipheriv,
	createHmac,
	randomBytes,
	timingSafeEqual,
} from "node:crypto"
import localtunnel from "localtunnel"
import { features, review } from "./config.js"

// Ephemeral secret — generated once per MCP server lifetime
const EPHEMERAL_SECRET = randomBytes(32)

// Per-session E2E encryption keys — keyed by session ID
const e2eKeys = new Map<string, Buffer>()

type LocaltunnelInstance = Awaited<ReturnType<typeof localtunnel>>

let activeTunnel: LocaltunnelInstance | null = null
let tunnelPort: number | null = null
let reconnecting = false
let intentionallyClosed = false
let healthCheckTimer: ReturnType<typeof setInterval> | null = null

const HEALTH_CHECK_INTERVAL = 30_000 // 30s

async function healthCheck(): Promise<void> {
	if (!activeTunnel || intentionallyClosed || reconnecting) return
	try {
		const res = await fetch(`${activeTunnel.url}/health`, {
			headers: { "bypass-tunnel-reminder": "1" },
			signal: AbortSignal.timeout(10_000),
		})
		if (!res.ok) throw new Error(`HTTP ${res.status}`)
	} catch {
		console.error("[haiku] Tunnel health check failed — reconnecting")
		activeTunnel?.close()
		activeTunnel = null
		reconnectTunnel()
	}
}

function startHealthCheck(): void {
	stopHealthCheck()
	healthCheckTimer = setInterval(healthCheck, HEALTH_CHECK_INTERVAL)
	healthCheckTimer.unref()
}

function stopHealthCheck(): void {
	if (healthCheckTimer) {
		clearInterval(healthCheckTimer)
		healthCheckTimer = null
	}
}

function base64url(data: string | Buffer): string {
	const b64 =
		typeof data === "string"
			? Buffer.from(data).toString("base64")
			: data.toString("base64")
	return b64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")
}

export function signJWT(payload: {
	tun: string
	sid: string
	typ: string
	key: string
	iat: number
	exp: number
}): string {
	const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))
	const body = base64url(JSON.stringify(payload))
	const signature = createHmac("sha256", EPHEMERAL_SECRET)
		.update(`${header}.${body}`)
		.digest("base64url")
	return `${header}.${body}.${signature}`
}

export type TunnelJWTPayload = {
	tun: string
	sid: string
	typ: string
	key: string
	iat: number
	exp: number
}

export type TunnelVerifyReason =
	| "malformed"
	| "bad_signature"
	| "bad_alg"
	| "bad_typ"
	| "expired"
	| "tunnel_mismatch"
	| "sid_mismatch"

export type TunnelVerifyResult =
	| { ok: true; payload: TunnelJWTPayload }
	| { ok: false; reason: TunnelVerifyReason }

/**
 * Verify a tunnel-auth JWT against the current MCP process's EPHEMERAL_SECRET.
 *
 * - Constant-time HMAC-SHA256 signature compare (`timingSafeEqual`).
 * - Rejects tokens whose `exp` is in the past.
 * - Binds to the currently active tunnel URL: a token minted for a prior
 *   tunnel session (or an alternate localtunnel URL) is rejected with
 *   `tunnel_mismatch`. A null active tunnel (not yet opened or torn down)
 *   also rejects.
 * - When `expectedSid` is a string, the token's `sid` claim must equal it
 *   (prevents replay of session A's token against session B's URL).
 * - Pass `expectedSid = null` for the intent-scoped `/api/review/current`
 *   route — it has no `:sid` in the path but the token must still be valid.
 *
 * This function is the authentication layer. It does NOT validate any
 * downstream authorization (e.g. cross-session / cross-intent checks —
 * those live in `verifyFeedbackMutationAuth` and elsewhere).
 */
export function verifyTunnelJWT(
	token: string,
	expectedSid: string | null,
): TunnelVerifyResult {
	const parts = token.split(".")
	if (parts.length !== 3) return { ok: false, reason: "malformed" }
	const [header, body, sig] = parts
	if (!header || !body || !sig) return { ok: false, reason: "malformed" }

	// FB-18: explicit header `alg` + `typ` validation as defense-in-depth
	// against `alg: none` / algorithm-confusion attempts. The HMAC path
	// below is the primary enforcement — it always uses SHA-256 with the
	// ephemeral secret, so a forged `alg: none` header won't produce a
	// signature the verify step accepts. But rejecting the bad header up
	// front surfaces the attack in logs and guards against any future
	// refactor that might start trusting the declared algorithm.
	try {
		const headerJson = Buffer.from(header, "base64url").toString("utf-8")
		const parsed = JSON.parse(headerJson) as {
			alg?: unknown
			typ?: unknown
		}
		if (parsed.alg !== "HS256") {
			return { ok: false, reason: "bad_alg" }
		}
		if (parsed.typ !== undefined && parsed.typ !== "JWT") {
			return { ok: false, reason: "bad_typ" }
		}
	} catch {
		return { ok: false, reason: "malformed" }
	}

	const expected = createHmac("sha256", EPHEMERAL_SECRET)
		.update(`${header}.${body}`)
		.digest("base64url")

	let sigBuf: Buffer
	let expBuf: Buffer
	try {
		sigBuf = Buffer.from(sig, "base64url")
		expBuf = Buffer.from(expected, "base64url")
	} catch {
		return { ok: false, reason: "malformed" }
	}
	if (sigBuf.length === 0 || sigBuf.length !== expBuf.length) {
		return { ok: false, reason: "bad_signature" }
	}
	if (!timingSafeEqual(sigBuf, expBuf)) {
		return { ok: false, reason: "bad_signature" }
	}

	let payload: TunnelJWTPayload
	try {
		const json = Buffer.from(body, "base64url").toString("utf-8")
		payload = JSON.parse(json) as TunnelJWTPayload
	} catch {
		return { ok: false, reason: "malformed" }
	}

	const now = Math.floor(Date.now() / 1000)
	if (typeof payload.exp !== "number" || payload.exp <= now) {
		return { ok: false, reason: "expired" }
	}

	// Bind to the currently-active tunnel URL. If the tunnel has rotated
	// (auto-reconnect assigned a new localtunnel URL) or is closed, the
	// token is stale — reject rather than accept something that was minted
	// against a different public origin.
	const currentTunnel = getTunnelUrl()
	if (!currentTunnel || payload.tun !== currentTunnel) {
		return { ok: false, reason: "tunnel_mismatch" }
	}

	if (expectedSid !== null && payload.sid !== expectedSid) {
		return { ok: false, reason: "sid_mismatch" }
	}

	return { ok: true, payload }
}

async function reconnectTunnel(): Promise<void> {
	if (reconnecting || intentionallyClosed || !tunnelPort) return
	reconnecting = true
	const maxRetries = 5
	for (let attempt = 0; attempt < maxRetries; attempt++) {
		if (intentionallyClosed) break
		const delay = attempt === 0 ? 0 : Math.min(1000 * 2 ** (attempt - 1), 30000)
		console.error(
			`[haiku] Tunnel reconnect attempt ${attempt + 1}/${maxRetries}${delay ? ` in ${delay}ms` : ""}`,
		)
		if (delay) await new Promise((r) => setTimeout(r, delay))
		try {
			const tunnel = await localtunnel({ port: tunnelPort })
			activeTunnel = tunnel
			attachTunnelListeners(tunnel)
			console.error(`[haiku] Tunnel reconnected: ${tunnel.url}`)
			startHealthCheck()
			reconnecting = false
			return
		} catch (err) {
			console.error(
				"[haiku] Tunnel reconnect failed:",
				err instanceof Error ? err.message : err,
			)
		}
	}
	reconnecting = false
	console.error(
		`[haiku] Tunnel reconnect exhausted — giving up after ${maxRetries} attempts`,
	)
}

function attachTunnelListeners(tunnel: LocaltunnelInstance): void {
	tunnel.on("close", () => {
		if (activeTunnel === tunnel) {
			activeTunnel = null
			stopHealthCheck()
			console.error("[haiku] Tunnel closed unexpectedly")
			if (!intentionallyClosed) reconnectTunnel()
		}
	})

	tunnel.on("error", (err: Error) => {
		console.error("[haiku] Tunnel error:", err.message)
		if (activeTunnel === tunnel) {
			activeTunnel = null
			stopHealthCheck()
			if (!intentionallyClosed) reconnectTunnel()
		}
	})
}

export async function openTunnel(port: number): Promise<string> {
	if (activeTunnel) return activeTunnel.url

	if (reconnecting) {
		await new Promise<void>((resolve) => {
			const check = setInterval(() => {
				if (!reconnecting) {
					clearInterval(check)
					resolve()
				}
			}, 100)
		})
		if (activeTunnel) return (activeTunnel as LocaltunnelInstance).url
	}

	tunnelPort = port
	intentionallyClosed = false

	const maxRetries = 3
	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			const tunnel = await localtunnel({ port })
			activeTunnel = tunnel
			attachTunnelListeners(tunnel)
			console.error(`[haiku] Tunnel opened: ${tunnel.url}`)
			startHealthCheck()
			return tunnel.url
		} catch (err) {
			console.error(
				`[haiku] Tunnel open failed (attempt ${attempt + 1}/${maxRetries}):`,
				err instanceof Error ? err.message : err,
			)
			if (attempt < maxRetries - 1) {
				await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
			}
		}
	}

	throw new Error("Failed to open localtunnel after 3 attempts")
}

export function closeTunnel(): void {
	intentionallyClosed = true
	stopHealthCheck()
	if (activeTunnel) {
		activeTunnel.close()
		activeTunnel = null
		console.error("[haiku] Tunnel closed")
	}
}

export function getTunnelUrl(): string | null {
	return activeTunnel?.url ?? null
}

export function isTunnelOpen(): boolean {
	return activeTunnel !== null
}

export function isRemoteReviewEnabled(): boolean {
	return features.remoteReview
}

const REVIEW_SITE_URL = review.siteUrl

export function buildReviewUrl(
	sessionId: string,
	tunnelUrl: string,
	sessionType: string,
): string {
	// Generate a fresh E2E encryption key for this session
	const key = randomBytes(32)
	e2eKeys.set(sessionId, key)
	const now = Math.floor(Date.now() / 1000)
	const token = signJWT({
		tun: tunnelUrl,
		sid: sessionId,
		typ: sessionType,
		key: key.toString("base64url"),
		iat: now,
		exp: now + 3600, // 1 hour TTL
	})
	return `${REVIEW_SITE_URL}/review/#${token}`
}

/**
 * Encrypt data with AES-256-GCM using the session's E2E key.
 * Returns base64url-encoded string: iv(12 bytes) + authTag(16 bytes) + ciphertext
 * Returns null if no E2E key exists for this session (local mode).
 */
export function e2eEncrypt(
	sessionId: string,
	data: string | Buffer,
): string | null {
	const key = e2eKeys.get(sessionId)
	if (!key) return null

	const iv = randomBytes(12)
	const cipher = createCipheriv("aes-256-gcm", key, iv)

	const input = typeof data === "string" ? Buffer.from(data, "utf-8") : data
	const encrypted = Buffer.concat([cipher.update(input), cipher.final()])
	const authTag = cipher.getAuthTag()

	// Pack: iv(12) + authTag(16) + ciphertext
	const packed = Buffer.concat([iv, authTag, encrypted])
	return packed.toString("base64url")
}

/**
 * Check if E2E encryption is active for a given session.
 */
export function isE2EActive(sessionId?: string): boolean {
	if (!sessionId) return e2eKeys.size > 0
	return e2eKeys.has(sessionId)
}

/**
 * Clear the E2E key for a session (called when session closes).
 */
export function clearE2EKey(sessionId: string): void {
	e2eKeys.delete(sessionId)
}

/**
 * Test-only: stub the active-tunnel URL so tests can exercise
 * `verifyTunnelJWT` without spinning up a real localtunnel. Pass a URL to
 * impersonate an active tunnel; pass null to clear. Production code must
 * not call this — the `__` prefix and name signal intent.
 */
export function __setActiveTunnelForTesting(url: string | null): void {
	if (url) {
		activeTunnel = {
			url,
			close: () => {
				activeTunnel = null
			},
			on: () => {
				// no-op listener sink for the tunnel interface
			},
		} as unknown as LocaltunnelInstance
	} else {
		activeTunnel = null
	}
}

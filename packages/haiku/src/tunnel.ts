import { randomBytes, createHmac, createCipheriv } from "node:crypto"
import localtunnel from "localtunnel"

// Ephemeral secret — generated once per MCP server lifetime
const EPHEMERAL_SECRET = randomBytes(32)

// Per-session E2E encryption keys — keyed by session ID
const e2eKeys = new Map<string, Buffer>()

let activeTunnel: Awaited<ReturnType<typeof localtunnel>> | null = null
let tunnelPort: number | null = null
let reconnecting = false
let intentionallyClosed = false

function base64url(data: string | Buffer): string {
	const b64 = typeof data === "string" ? Buffer.from(data).toString("base64") : data.toString("base64")
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

async function reconnectTunnel(): Promise<void> {
	if (reconnecting || intentionallyClosed || !tunnelPort) return
	reconnecting = true
	const maxRetries = 5
	for (let attempt = 0; attempt < maxRetries; attempt++) {
		if (intentionallyClosed) break
		const delay = Math.min(1000 * Math.pow(2, attempt), 30000)
		console.error(`[haiku] Tunnel reconnect attempt ${attempt + 1}/${maxRetries} in ${delay}ms`)
		await new Promise((r) => setTimeout(r, delay))
		try {
			const tunnel = await localtunnel({ port: tunnelPort })
			activeTunnel = tunnel
			attachTunnelListeners(tunnel)
			console.error(`[haiku] Tunnel reconnected: ${tunnel.url}`)
			reconnecting = false
			return
		} catch (err) {
			console.error(`[haiku] Tunnel reconnect failed:`, err instanceof Error ? err.message : err)
		}
	}
	reconnecting = false
	console.error(`[haiku] Tunnel reconnect exhausted — giving up after ${maxRetries} attempts`)
}

function attachTunnelListeners(tunnel: Awaited<ReturnType<typeof localtunnel>>): void {
	tunnel.on("close", () => {
		if (activeTunnel === tunnel) {
			activeTunnel = null
			console.error("[haiku] Tunnel closed unexpectedly")
			reconnectTunnel()
		}
	})

	tunnel.on("error", (err: Error) => {
		console.error("[haiku] Tunnel error:", err.message)
		if (activeTunnel === tunnel) {
			activeTunnel = null
			reconnectTunnel()
		}
	})
}

export async function openTunnel(port: number): Promise<string> {
	if (activeTunnel) {
		return activeTunnel.url
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
			return tunnel.url
		} catch (err) {
			console.error(`[haiku] Tunnel open failed (attempt ${attempt + 1}/${maxRetries}):`, err instanceof Error ? err.message : err)
			if (attempt < maxRetries - 1) {
				await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
			}
		}
	}

	throw new Error("Failed to open localtunnel after 3 attempts")
}

export function closeTunnel(): void {
	intentionallyClosed = true
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
	return process.env.HAIKU_REMOTE_REVIEW === "1"
}

const REVIEW_SITE_URL = process.env.HAIKU_REVIEW_SITE_URL ?? "https://haikumethod.ai"

export function buildReviewUrl(sessionId: string, tunnelUrl: string, sessionType: string): string {
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
export function e2eEncrypt(sessionId: string, data: string | Buffer): string | null {
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

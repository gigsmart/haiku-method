import type { ReviewTransport } from "../transport"
import type {
	QuestionAnswer,
	ReviewAnnotations,
	ReviewDecision,
	SessionData,
} from "../types"

export interface HttpTransportOptions {
	/** Base URL like https://abc.trycloudflare.com (no trailing slash). Use "" for same-origin. */
	baseUrl?: string
	sessionId: string
	/** Optional AES-256-GCM key (base64url) for decrypting E2E responses. */
	e2eKey?: string | null
	/** When true, use a HEAD /api/session/:id/heartbeat probe for connection health. */
	heartbeat?: boolean
}

/**
 * HTTP transport suitable for both:
 * - the website review app (over a tunneled https base URL + optional E2E),
 * - the CLI SPA when WebSockets are unavailable (same-origin, baseUrl = "").
 */
export function createHttpTransport(
	opts: HttpTransportOptions,
): ReviewTransport {
	const { sessionId, e2eKey = null, heartbeat = false } = opts
	const base = opts.baseUrl ?? ""

	const url = (path: string) => `${base}${path}`

	const transport: ReviewTransport = {
		sessionId,

		async fetchSession() {
			const res = await e2eFetch(url(`/api/session/${sessionId}`), e2eKey)
			if (!res.ok) {
				if (res.status === 404)
					throw new Error("Session not found. It may have expired.")
				throw new Error(`Connection failed (HTTP ${res.status})`)
			}
			return (await res.json()) as SessionData
		},

		async submitDecision(
			decision: ReviewDecision,
			feedback: string,
			annotations?: ReviewAnnotations,
		) {
			const payload: Record<string, unknown> = { decision, feedback }
			if (annotations) payload.annotations = annotations
			const res = await fetch(url(`/review/${sessionId}/decide`), {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"bypass-tunnel-reminder": "1",
				},
				body: JSON.stringify(payload),
				keepalive: true,
			})
			if (!res.ok) throw new Error(`HTTP ${res.status}`)
		},

		async submitAnswers(
			answers: QuestionAnswer[],
			feedback?: string,
			annotations?: {
				comments?: Array<{
					selectedText: string
					comment: string
					paragraph: number
				}>
			},
		) {
			const payload: Record<string, unknown> = { answers }
			if (feedback) payload.feedback = feedback
			if (annotations) payload.annotations = annotations
			const res = await fetch(url(`/question/${sessionId}/answer`), {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"bypass-tunnel-reminder": "1",
				},
				body: JSON.stringify(payload),
				keepalive: true,
			})
			if (!res.ok) throw new Error(`HTTP ${res.status}`)
		},

		async submitDirection(
			archetype: string,
			parameters: Record<string, number>,
		) {
			const res = await fetch(url(`/direction/${sessionId}/select`), {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"bypass-tunnel-reminder": "1",
				},
				body: JSON.stringify({ archetype, parameters }),
				keepalive: true,
			})
			if (!res.ok) {
				const body = await res.json().catch(() => ({}))
				throw new Error(body.error || `HTTP ${res.status}`)
			}
		},
	}

	if (heartbeat) {
		transport.heartbeat = async () => {
			try {
				const res = await fetch(url(`/api/session/${sessionId}/heartbeat`), {
					method: "HEAD",
					headers: { "bypass-tunnel-reminder": "1" },
					signal: AbortSignal.timeout(8_000),
				})
				return res.ok
			} catch {
				return false
			}
		}
	}

	return transport
}

// --- E2E (AES-256-GCM) decryption helpers ---------------------------------

async function e2eFetch(
	urlStr: string,
	e2eKey: string | null,
	init?: RequestInit,
): Promise<Response> {
	const headers = new Headers(init?.headers)
	headers.set("bypass-tunnel-reminder", "1")
	const res = await fetch(urlStr, {
		...init,
		headers,
		signal: init?.signal ?? AbortSignal.timeout(10_000),
	})
	if (!e2eKey || !res.headers.get("X-E2E-Encrypted")) return res

	const originalContentType =
		res.headers.get("X-Original-Content-Type") ?? "application/octet-stream"
	const encryptedText = await res.text()
	const decrypted = await e2eDecrypt(encryptedText, e2eKey)

	return new Response(decrypted, {
		status: res.status,
		statusText: res.statusText,
		headers: new Headers({ "Content-Type": originalContentType }),
	})
}

async function e2eDecrypt(
	encryptedBase64url: string,
	keyBase64url: string,
): Promise<ArrayBuffer> {
	const keyBytes = base64urlToBytes(keyBase64url)
	const keyBuffer = new ArrayBuffer(keyBytes.length)
	new Uint8Array(keyBuffer).set(keyBytes)
	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		keyBuffer,
		{ name: "AES-GCM" },
		false,
		["decrypt"],
	)

	const packed = base64urlToBytes(encryptedBase64url)
	const iv = new ArrayBuffer(12)
	new Uint8Array(iv).set(packed.slice(0, 12))
	const authTag = packed.slice(12, 28)
	const ciphertext = packed.slice(28)

	const combined = new ArrayBuffer(ciphertext.length + authTag.length)
	const combinedView = new Uint8Array(combined)
	combinedView.set(ciphertext)
	combinedView.set(authTag, ciphertext.length)

	return crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, combined)
}

function base64urlToBytes(b64url: string): Uint8Array {
	const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/")
	const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4)
	const binary = atob(padded)
	const bytes = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i)
	}
	return bytes
}

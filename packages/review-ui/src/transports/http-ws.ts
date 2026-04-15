import type { ReviewTransport } from "../transport"
import type {
	QuestionAnswer,
	ReviewAnnotations,
	ReviewDecision,
	SessionData,
} from "../types"
import { createHttpTransport } from "./http"

export interface HttpWsTransportOptions {
	sessionId: string
	/** Defaults to "" (same-origin). */
	baseUrl?: string
}

/**
 * HTTP + same-origin WebSocket transport used by the CLI review SPA.
 *
 * WebSocket carries submit messages whenever it's open; if it's closed
 * or errored, the transport falls back to HTTP. `subscribe()` exposes
 * server-pushed session updates to the UI.
 */
export function createHttpWsTransport(
	opts: HttpWsTransportOptions,
): ReviewTransport {
	const http = createHttpTransport({
		sessionId: opts.sessionId,
		baseUrl: opts.baseUrl ?? "",
	})
	const base = opts.baseUrl ?? ""

	let ws: WebSocket | null = null
	const updateListeners = new Set<(update: Partial<SessionData>) => void>()

	if (typeof window !== "undefined" && typeof WebSocket !== "undefined") {
		try {
			const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
			const host = base
				? base.replace(/^https?:\/\//, "")
				: window.location.host
			ws = new WebSocket(`${protocol}//${host}/ws/session/${opts.sessionId}`)
			ws.onclose = () => {
				ws = null
			}
			ws.onerror = () => {
				ws = null
			}
			ws.onmessage = (ev) => {
				try {
					const msg = JSON.parse(ev.data)
					if (msg && typeof msg === "object") {
						for (const fn of updateListeners) fn(msg as Partial<SessionData>)
					}
				} catch {
					// ignore malformed frames
				}
			}
		} catch {
			ws = null
		}
	}

	const sendWs = (data: unknown): boolean => {
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(data))
			return true
		}
		return false
	}

	return {
		sessionId: opts.sessionId,
		fetchSession: () => http.fetchSession(),

		async submitDecision(
			decision: ReviewDecision,
			feedback: string,
			annotations?: ReviewAnnotations,
		) {
			if (sendWs({ type: "decide", decision, feedback, annotations })) return
			return http.submitDecision(decision, feedback, annotations)
		},

		async submitAnswers(answers: QuestionAnswer[], feedback?, annotations?) {
			if (sendWs({ type: "answer", answers, feedback, annotations })) return
			return http.submitAnswers(answers, feedback, annotations)
		},

		async submitDirection(
			archetype: string,
			parameters: Record<string, number>,
		) {
			if (sendWs({ type: "select", archetype, parameters })) return
			return http.submitDirection(archetype, parameters)
		},

		subscribe(handler) {
			updateListeners.add(handler)
			return () => {
				updateListeners.delete(handler)
			}
		},
	}
}

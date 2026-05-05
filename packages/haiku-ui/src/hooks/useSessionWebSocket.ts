/**
 * useSessionWebSocket — maintains a WS connection to /ws/session/:id and
 * batches `session-update` frames via requestAnimationFrame so that bursty
 * traffic (100s of frames per second) collapses to one React commit per
 * animation frame.
 *
 * Algorithm:
 *   - Every `session-update` frame writes its payload to a useRef.
 *   - If a rAF is already scheduled, the handler returns (coalescing).
 *   - Otherwise it schedules a rAF; the callback reads the latest payload,
 *     clears the ref, and calls `onUpdate` exactly once.
 *   - Unmount cancels any pending rAF.
 *
 * Messages are validated against `WsServerMessageSchema` from `haiku-api`.
 */

import {
	type WsIntentEventMessage,
	type WsServerMessage,
	WsServerMessageSchema,
	type WsSessionUpdateMessage,
} from "haiku-api"
import { useEffect, useRef } from "react"
import { useApiClient } from "../api/context"

export interface UseSessionWebSocketOptions {
	onUpdate?: (msg: WsSessionUpdateMessage) => void
	/** Fires for every per-intent live-state event the server fans out
	 *  on this session's channel. The intent broadcaster emits these
	 *  on every workflow tick, gate prep, await-state flip, and
	 *  pending-decision change. Consumers typically refetch the
	 *  session snapshot from `/api/session/:id` so the UI reflects
	 *  fresh state without hand-reducing each event variant. */
	onIntentEvent?: (msg: WsIntentEventMessage) => void
	/** Fires once the session is detected as ended — either because the
	 *  server closed our active WebSocket or because a polling-fallback
	 *  probe of `/api/session/:id` came back 404. Consumers use it to
	 *  transition into a "session ended" terminal state (e.g. a
	 *  dismiss-and-close overlay). The WS is the primary signal; poll is
	 *  the safety net for environments where WS fails to upgrade or the
	 *  close frame is lost on the wire. */
	onServerClose?: () => void
	/** Session-status polling interval (ms). Defaults to 5s. Pass 0 to
	 *  disable the polling fallback (not recommended outside tests). */
	pollIntervalMs?: number
}

export function useSessionWebSocket(
	sessionId: string,
	options: UseSessionWebSocketOptions = {},
) {
	const wsRef = useRef<WebSocket | null>(null)
	const pendingRef = useRef<WsSessionUpdateMessage | null>(null)
	const rafRef = useRef<number | null>(null)
	const onUpdateRef = useRef(options.onUpdate)
	const onIntentEventRef = useRef(options.onIntentEvent)
	const onServerCloseRef = useRef(options.onServerClose)
	const client = useApiClient()

	// Keep the latest callbacks in refs so the effect doesn't re-open
	// the WS when the callback identities change.
	useEffect(() => {
		onUpdateRef.current = options.onUpdate
	}, [options.onUpdate])
	useEffect(() => {
		onIntentEventRef.current = options.onIntentEvent
	}, [options.onIntentEvent])
	useEffect(() => {
		onServerCloseRef.current = options.onServerClose
	}, [options.onServerClose])

	useEffect(() => {
		// Terminal-detection strategy: WS-primary, poll-fallback.
		//
		// - WS opens + receives the server's `session-ended` hint frame or
		//   a close frame → `onServerClose` fires immediately.
		// - WS never connects (403/404/CSP/CORS/etc.) → poll /api/session/:id
		//   every `pollIntervalMs`; a 404 triggers `onServerClose`.
		// - WS connects then drops without a clean close (network blip) →
		//   the poll confirms via 404.
		//
		// `serverCloseFired` guards against double-firing when both channels
		// race to detect the same end-of-session.
		let closedByCleanup = false
		let hadOpen = false
		let serverCloseFired = false
		const fireServerClose = () => {
			if (serverCloseFired) return
			serverCloseFired = true
			onServerCloseRef.current?.()
		}

		// Poll fallback — runs regardless of WS state; low-rate so it's
		// cheap. Disabled when `pollIntervalMs` is 0.
		const pollInterval = options.pollIntervalMs ?? 5000
		let pollTimer: ReturnType<typeof setTimeout> | null = null
		const scheduleNextPoll = () => {
			if (closedByCleanup || serverCloseFired || pollInterval <= 0) return
			pollTimer = setTimeout(runPoll, pollInterval)
		}
		const runPoll = async () => {
			if (closedByCleanup || serverCloseFired) return
			try {
				const res = await fetch(`/api/session/${encodeURIComponent(sessionId)}`)
				if (closedByCleanup || serverCloseFired) return
				if (res.status === 404) {
					fireServerClose()
					return
				}
			} catch {
				// Network error — retry next cycle. Don't fire session-end
				// on transient fetch failures; we'd rather under-trigger
				// than spuriously close a working session.
			}
			scheduleNextPoll()
		}
		scheduleNextPoll()

		const ws = client.openWebSocket(sessionId)
		if (!ws) {
			// No WS at all — poll is the only signal. Return the same
			// cleanup shape so the poll-fallback shuts down on unmount.
			return () => {
				closedByCleanup = true
				if (pollTimer !== null) clearTimeout(pollTimer)
			}
		}

		ws.onopen = () => {
			hadOpen = true
		}

		ws.onclose = () => {
			if (wsRef.current === ws) wsRef.current = null
			// A former-open that closed = server drop. Connection failure
			// (never opened) won't trigger here; poll catches that case.
			if (!closedByCleanup && hadOpen) fireServerClose()
		}

		ws.onerror = () => {
			if (wsRef.current === ws) wsRef.current = null
		}

		ws.onmessage = (ev: MessageEvent) => {
			let parsed: unknown
			try {
				parsed = JSON.parse(String(ev.data))
			} catch {
				return
			}
			const result = WsServerMessageSchema.safeParse(parsed)
			if (!result.success) return
			const msg: WsServerMessage = result.data

			// Per-intent live-state events forward synchronously — they
			// drive small UI state changes (Approve button gating,
			// pending-decision banner) and consumers typically respond
			// by refetching the session snapshot. No rAF coalescing
			// here: events are infrequent (human-paced workflow ticks)
			// and each one carries distinct meaning.
			if (msg.type === "intent-event") {
				onIntentEventRef.current?.(msg)
				return
			}

			if (msg.type !== "session-update") return

			// rAF coalescing — only the most recent session-update per frame wins.
			pendingRef.current = msg
			if (rafRef.current !== null) return
			rafRef.current = requestAnimationFrame(() => {
				rafRef.current = null
				const payload = pendingRef.current
				pendingRef.current = null
				if (payload && onUpdateRef.current) {
					onUpdateRef.current(payload)
				}
			})
		}

		wsRef.current = ws

		return () => {
			closedByCleanup = true
			if (pollTimer !== null) clearTimeout(pollTimer)
			if (rafRef.current !== null) {
				cancelAnimationFrame(rafRef.current)
				rafRef.current = null
			}
			pendingRef.current = null
			ws.close()
			if (wsRef.current === ws) wsRef.current = null
		}
	}, [sessionId, client, options.pollIntervalMs])

	return wsRef
}

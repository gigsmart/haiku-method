// http/ws-upgrade.ts — WebSocket upgrade route + per-frame
// rate-limit handler.
//
// The actual frame-handling logic + connection map lives in
// http/ws.ts. This module owns the route registration: validate the
// tunnel JWT BEFORE the HTTP upgrade so unauthorized clients see
// HTTP/1.1 401, not a 101 Switching Protocols immediately followed
// by a close(4401). The socket-close path inside the handler is
// defense-in-depth for the (rare) case where preValidation didn't
// reject.

import type { FastifyInstance } from "fastify"
import { subscribeIntent } from "../intent-broadcaster.js"
import { getSession } from "../sessions.js"
import { isRemoteReviewEnabled, verifyTunnelJWT } from "../tunnel.js"
import {
	allowWsFrame,
	handleWebSocketMessage,
	logClose,
	MAX_WS_SESSIONS,
	sendToWebSocket,
	wsConnections,
} from "./ws.js"

export function registerWsUpgrade(instance: FastifyInstance): void {
	instance.register(async (ws) => {
		ws.get<{ Params: { sessionId: string }; Querystring: { t?: string } }>(
			"/ws/session/:sessionId",
			{
				websocket: true,
				// Reject before the HTTP upgrade completes so tunnel-auth
				// clients see HTTP/1.1 401 on the upgrade response — not
				// 101 Switching Protocols immediately followed by a
				// close(4401). The socket-close path in the handler is
				// defense-in-depth.
				preValidation: async (req, reply) => {
					if (!isRemoteReviewEnabled()) return
					const { sessionId } = req.params as { sessionId: string }
					const token = (req.query as { t?: string })?.t
					if (!token) {
						reply
							.status(401)
							.send({ error: "unauthorized", reason: "missing_token" })
						return
					}
					const verified = verifyTunnelJWT(token, sessionId)
					if (!verified.ok) {
						reply
							.status(401)
							.send({ error: "unauthorized", reason: verified.reason })
						return
					}
				},
			},
			(socket, req) => {
				const { sessionId } = req.params
				if (isRemoteReviewEnabled()) {
					const token = (req.query as Record<string, string | undefined>)?.t
					if (!token) {
						socket.close(4401, "unauthorized")
						return
					}
					const verified = verifyTunnelJWT(token, sessionId)
					if (!verified.ok) {
						socket.close(4401, "unauthorized")
						return
					}
				}
				const session = getSession(sessionId)
				if (!session) {
					socket.close(4404, "session not found")
					return
				}
				// FB-08: cap concurrent WS sessions. Re-registering the same
				// sessionId (reconnect) doesn't count against the cap — the
				// existing entry is overwritten atomically below.
				if (
					!wsConnections.has(sessionId) &&
					wsConnections.size >= MAX_WS_SESSIONS
				) {
					logClose(
						`upgrade REJECT session=${sessionId} reason=ws_session_cap size=${wsConnections.size} cap=${MAX_WS_SESSIONS}`,
					)
					// RFC 6455 code 1013 — "Try Again Later": the server is
					// temporarily unable to accept the connection. Clients
					// should back off.
					socket.close(1013, "session cap reached")
					return
				}
				wsConnections.set(sessionId, socket)
				logClose(`upgrade ACCEPT session=${sessionId}`)

				// Subscribe to per-intent live-state events. The
				// broadcaster fans out tick/state changes to every SPA
				// tab watching this intent. Forward events as
				// `intent-event` WS frames; SPA reduces them onto the
				// cached session snapshot. Only review sessions get the
				// subscription — question + design_direction are
				// short-lived and don't need live state.
				let unsubscribeIntent: (() => void) | null = null
				const reviewSession = session.session_type === "review" ? session : null
				if (reviewSession?.intent_slug) {
					unsubscribeIntent = subscribeIntent(
						reviewSession.intent_slug,
						(event) => {
							sendToWebSocket(sessionId, {
								type: "intent-event",
								session_id: sessionId,
								event,
							})
						},
					)
				}

				socket.on("message", (raw: Buffer | ArrayBuffer | Buffer[]) => {
					if (!allowWsFrame(socket)) {
						socket.close(1008, "rate limit")
						return
					}
					const text = Array.isArray(raw)
						? Buffer.concat(raw as Buffer[]).toString("utf8")
						: typeof raw === "string"
							? raw
							: Buffer.from(raw as ArrayBuffer).toString("utf8")
					handleWebSocketMessage(sessionId, text)
				})
				socket.on("close", () => {
					if (wsConnections.get(sessionId) === socket) {
						wsConnections.delete(sessionId)
					}
					if (unsubscribeIntent) {
						unsubscribeIntent()
						unsubscribeIntent = null
					}
				})
				socket.on("error", () => {
					if (wsConnections.get(sessionId) === socket) {
						wsConnections.delete(sessionId)
					}
					if (unsubscribeIntent) {
						unsubscribeIntent()
						unsubscribeIntent = null
					}
				})
			},
		)
	})
}

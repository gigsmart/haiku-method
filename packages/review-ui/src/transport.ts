import type {
	QuestionAnswer,
	ReviewAnnotations,
	ReviewDecision,
	SessionData,
} from "./types"

/**
 * ReviewTransport is the consumer-provided adapter that decouples the
 * review UI from how it talks to the server. Each consumer (CLI SPA,
 * Next.js website) supplies a transport tailored to its environment:
 *
 * - CLI serves the SPA same-origin with a WebSocket channel → http-ws transport.
 * - Website receives a tunneled HTTPS URL via a JWT and polls via heartbeat → http transport.
 */
export interface ReviewTransport {
	/** The session id this transport is bound to. */
	readonly sessionId: string
	/** Load the session payload. */
	fetchSession(): Promise<SessionData>
	/** Submit a review decision. */
	submitDecision(
		decision: ReviewDecision,
		feedback: string,
		annotations?: ReviewAnnotations,
	): Promise<void>
	/** Submit question answers. */
	submitAnswers(
		answers: QuestionAnswer[],
		feedback?: string,
		annotations?: {
			comments?: Array<{
				selectedText: string
				comment: string
				paragraph: number
			}>
		},
	): Promise<void>
	/** Submit a design direction selection. */
	submitDirection(
		archetype: string,
		parameters: Record<string, number>,
	): Promise<void>
	/**
	 * Optional connection-health probe. Called periodically by useSession
	 * when provided; consumers that don't care about reconnection state
	 * can omit it. Returns true when the backend is reachable.
	 */
	heartbeat?(): Promise<boolean>
	/**
	 * Optional push channel (e.g. WebSocket). When provided, useSession
	 * may subscribe to receive server-pushed session updates.
	 */
	subscribe?(handler: (update: Partial<SessionData>) => void): () => void
}

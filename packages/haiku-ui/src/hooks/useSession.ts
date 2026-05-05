import { useCallback, useEffect, useRef, useState } from "react"
import { ApiError } from "../api/client"
import { useApiClient } from "../api/context"
import type { SessionData } from "../types"

// Re-export from the extracted module so existing `import { useSessionWebSocket }
// from "./useSession"` paths continue to work during migration.
export { useSessionWebSocket } from "./useSessionWebSocket"

export function useSession(sessionId: string) {
	const [session, setSession] = useState<SessionData | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	/** True when the initial fetch returned 404 — the session does not
	 *  exist on the server. Distinct from `error` so reviewers who reload
	 *  a stale tab can be shown the terminal "session ended" overlay
	 *  rather than a generic error. */
	const [notFound, setNotFound] = useState(false)
	const client = useApiClient()
	const cancelledRef = useRef(false)

	const fetchSession = useCallback(async () => {
		try {
			const data = await client.fetchSession(sessionId)
			if (!cancelledRef.current) {
				setSession(data)
				setLoading(false)
			}
		} catch (err) {
			if (!cancelledRef.current) {
				if (err instanceof ApiError && err.status === 404) {
					setNotFound(true)
				}
				setError(err instanceof Error ? err.message : "Failed to load session")
				setLoading(false)
			}
		}
	}, [sessionId, client])

	useEffect(() => {
		cancelledRef.current = false
		fetchSession()
		return () => {
			cancelledRef.current = true
		}
	}, [fetchSession])

	/** Re-fetch the session snapshot. Used by the WS layer when an
	 *  intent-event arrives — the snapshot is the canonical view, so
	 *  rather than reduce events into the existing object we just
	 *  pull a fresh copy from /api/session/:id. Cheap; the API
	 *  response is already projected from the in-memory session record
	 *  and disk-fresh state.json. */
	const refetch = useCallback(() => {
		void fetchSession()
	}, [fetchSession])

	return { session, loading, error, notFound, refetch }
}

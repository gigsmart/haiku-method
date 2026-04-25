import { useEffect, useState } from "react"
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

	useEffect(() => {
		let cancelled = false

		async function fetchSession() {
			try {
				const data = await client.fetchSession(sessionId)
				if (!cancelled) {
					setSession(data)
					setLoading(false)
				}
			} catch (err) {
				if (!cancelled) {
					if (err instanceof ApiError && err.status === 404) {
						setNotFound(true)
					}
					setError(
						err instanceof Error ? err.message : "Failed to load session",
					)
					setLoading(false)
				}
			}
		}

		fetchSession()

		return () => {
			cancelled = true
		}
	}, [sessionId, client])

	return { session, loading, error, notFound }
}

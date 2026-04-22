import { useEffect, useState } from "react"
import { useApiClient } from "../api/context"
import type { SessionData } from "../types"

// Re-export from the extracted module so existing `import { useSessionWebSocket }
// from "./useSession"` paths continue to work during migration.
export { useSessionWebSocket } from "./useSessionWebSocket"

export function useSession(sessionId: string) {
	const [session, setSession] = useState<SessionData | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
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

	return { session, loading, error }
}

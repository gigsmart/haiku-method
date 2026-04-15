import { useEffect, useState } from "react"
import type { ReviewTransport } from "../transport"
import type { SessionData } from "../types"

const HEARTBEAT_INTERVAL_MS = 10_000

export interface UseSessionResult {
	session: SessionData | null
	loading: boolean
	error: string | null
	/**
	 * null = heartbeat not yet probed (suppresses reconnecting banner on first paint)
	 * true = last probe succeeded; false = last probe failed
	 * If the transport has no heartbeat(), stays null forever and consumers
	 * can treat that as "connection unknown / always online".
	 */
	isConnected: boolean | null
}

export function useSession(transport: ReviewTransport): UseSessionResult {
	const [session, setSession] = useState<SessionData | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [isConnected, setIsConnected] = useState<boolean | null>(null)

	useEffect(() => {
		let cancelled = false

		transport
			.fetchSession()
			.then((data) => {
				if (cancelled) return
				setSession(data)
				setLoading(false)
			})
			.catch((err) => {
				if (cancelled) return
				setError(err instanceof Error ? err.message : "Failed to load session")
				setLoading(false)
			})

		const unsubscribe = transport.subscribe?.((update) => {
			if (cancelled) return
			setSession((prev) => (prev ? { ...prev, ...update } : prev))
		})

		return () => {
			cancelled = true
			unsubscribe?.()
		}
	}, [transport])

	useEffect(() => {
		if (!transport.heartbeat) return
		let cancelled = false

		const hb = transport.heartbeat
		const beat = async () => {
			try {
				const ok = await hb()
				if (!cancelled) setIsConnected(ok)
			} catch {
				if (!cancelled) setIsConnected(false)
			}
		}

		beat()
		const timer = setInterval(beat, HEARTBEAT_INTERVAL_MS)
		return () => {
			cancelled = true
			clearInterval(timer)
		}
	}, [transport])

	return { session, loading, error, isConnected }
}

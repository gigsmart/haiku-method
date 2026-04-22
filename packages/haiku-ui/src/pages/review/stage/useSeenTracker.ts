/**
 * useSeenTracker — per-session localStorage-backed seen/unseen state for
 * stage artifacts (units, knowledge, outputs).
 *
 * Canonical mockup contract (`review-ui-mockup.html` §seen-tracking):
 *   - Key schema: `${kind}::${stageId}::${name}` → sha-hash of artifact body
 *   - State: 'seen' | 'unseen' | 'changed'
 *   - Session scope: one bucket per session id so re-review from scratch
 *     starts cold.
 *
 * Storage key: `haiku-seen-<sessionId>`.
 */

import { useCallback, useEffect, useState } from "react"

export type SeenState = "seen" | "unseen" | "changed"
export type ArtifactKind = "unit" | "knowledge" | "output"

function hashString(str: string): string {
	let h = 0
	for (let i = 0; i < str.length; i++) {
		h = ((h << 5) - h) + str.charCodeAt(i)
		h |= 0
	}
	return Math.abs(h).toString(16).padStart(6, "0")
}

export function shaOf(payload: unknown): string {
	return "sha-" + hashString(JSON.stringify(payload ?? ""))
}

export function artifactKey(
	kind: ArtifactKind,
	stageId: string,
	name: string,
): string {
	return `${kind}::${stageId}::${name}`
}

function storageKey(sessionId: string): string {
	return `haiku-seen-${sessionId}`
}

function loadMap(sessionId: string): Record<string, string> {
	try {
		const raw = localStorage.getItem(storageKey(sessionId))
		if (!raw) return {}
		const parsed = JSON.parse(raw)
		if (parsed && typeof parsed === "object") {
			return parsed as Record<string, string>
		}
	} catch {
		// ignore — storage may be disabled / quota exceeded
	}
	return {}
}

function saveMap(sessionId: string, map: Record<string, string>): void {
	try {
		localStorage.setItem(storageKey(sessionId), JSON.stringify(map))
	} catch {
		// ignore
	}
}

export interface SeenTracker {
	state: (kind: ArtifactKind, stageId: string, name: string, sha: string) => SeenState
	markSeen: (kind: ArtifactKind, stageId: string, name: string, sha: string) => void
	reset: () => void
}

export function useSeenTracker(sessionId: string | null): SeenTracker {
	const [map, setMap] = useState<Record<string, string>>({})

	useEffect(() => {
		if (!sessionId) return
		setMap(loadMap(sessionId))
	}, [sessionId])

	const state = useCallback(
		(kind: ArtifactKind, stageId: string, name: string, sha: string): SeenState => {
			const key = artifactKey(kind, stageId, name)
			const prev = map[key]
			if (!prev) return "unseen"
			if (prev !== sha) return "changed"
			return "seen"
		},
		[map],
	)

	const markSeen = useCallback(
		(kind: ArtifactKind, stageId: string, name: string, sha: string): void => {
			if (!sessionId) return
			setMap((prev) => {
				const next = { ...prev, [artifactKey(kind, stageId, name)]: sha }
				saveMap(sessionId, next)
				return next
			})
		},
		[sessionId],
	)

	const reset = useCallback((): void => {
		if (!sessionId) return
		try {
			localStorage.removeItem(storageKey(sessionId))
		} catch {
			// ignore
		}
		setMap({})
	}, [sessionId])

	return { state, markSeen, reset }
}

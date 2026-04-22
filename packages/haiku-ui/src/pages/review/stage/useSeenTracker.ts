/**
 * useSeenTracker — per-intent localStorage-backed seen/unseen state for
 * stage artifacts (units, knowledge, outputs).
 *
 * Key schema: `${kind}::${stageId}::${name}` → sha-hash of artifact body.
 * State: 'seen' | 'unseen' | 'changed'.
 *
 * Scope bump (2026-04-22): the mockup's per-session scope proved wrong in
 * practice — every MCP restart spawns a fresh session id, so reviewers
 * lost all their seen state across runs. We key the bucket on the intent
 * slug instead so progress persists across restarts. The SHA hash of the
 * artifact body still detects genuine content changes and flips 'seen' →
 * 'changed' so the reviewer is re-prompted when something was rewritten.
 *
 * Storage key: `haiku-seen-<scopeId>` where `scopeId` is typically the
 * intent slug. Callers that want per-session scope can pass the session
 * id instead.
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

function storageKey(scopeId: string): string {
	return `haiku-seen-${scopeId}`
}

function loadMap(scopeId: string): Record<string, string> {
	try {
		const raw = localStorage.getItem(storageKey(scopeId))
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

function saveMap(scopeId: string, map: Record<string, string>): void {
	try {
		localStorage.setItem(storageKey(scopeId), JSON.stringify(map))
	} catch {
		// ignore
	}
}

export interface SeenTracker {
	state: (kind: ArtifactKind, stageId: string, name: string, sha: string) => SeenState
	markSeen: (kind: ArtifactKind, stageId: string, name: string, sha: string) => void
	reset: () => void
}

/**
 * Track seen/unseen state keyed on a stable scope id. Pass the intent
 * slug for cross-session persistence (recommended), or a session id for
 * per-run isolation.
 */
export function useSeenTracker(scopeId: string | null): SeenTracker {
	const [map, setMap] = useState<Record<string, string>>({})

	useEffect(() => {
		if (!scopeId) return
		setMap(loadMap(scopeId))
	}, [scopeId])

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
			if (!scopeId) return
			setMap((prev) => {
				const next = { ...prev, [artifactKey(kind, stageId, name)]: sha }
				saveMap(scopeId, next)
				return next
			})
		},
		[scopeId],
	)

	const reset = useCallback((): void => {
		if (!scopeId) return
		try {
			localStorage.removeItem(storageKey(scopeId))
		} catch {
			// ignore
		}
		setMap({})
	}, [scopeId])

	return { state, markSeen, reset }
}

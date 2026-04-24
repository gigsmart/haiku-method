/**
 * useSeenTracker — intent-scoped, CONTENT-sha-keyed seen state for
 * artifacts (units, knowledge, outputs) rendered in the review UI.
 *
 * Semantics
 * ---------
 * "Seen" means the reviewer has looked at THIS content (by
 * content-sha), not just THIS artifact by name. When an artifact's
 * prose changes, the new sha isn't in the seen set → the reviewer
 * sees a NEW badge again. When content reverts to a version the
 * reviewer has previously seen, the badge disappears. Simple
 * membership, no separate "changed" bucket.
 *
 * The content sha is computed over the artifact's prose only —
 * frontmatter timestamps (started_at, bolt, hat_started_at,
 * completed_at) are stripped before hashing so WS updates that only
 * bump metadata don't re-flag every artifact as unseen. See
 * `shaOf` below.
 *
 * Storage
 * -------
 * localStorage key: `haiku-seen-<intent-slug>`
 * localStorage value: `string[]` of content shas.
 *
 * Keyed on the intent slug so progress persists across MCP
 * restarts / session re-opens. Previous-session entries that were
 * stored in the legacy `{key: sha}` object are migrated to the
 * flat-array format on first load.
 */

import { useCallback, useEffect, useState } from "react"

export type SeenState = "seen" | "unseen"
export type ArtifactKind = "unit" | "knowledge" | "output"

function hashString(str: string): string {
	let h = 0
	for (let i = 0; i < str.length; i++) {
		h = (h << 5) - h + str.charCodeAt(i)
		h |= 0
	}
	return Math.abs(h).toString(16).padStart(6, "0")
}

/** Content-sha for an artifact. Hashes the prose body only (frontmatter
 *  stripped) so WS updates to metadata timestamps don't flip every
 *  item to unseen. For string payloads, hashes directly. For objects,
 *  prefers `rawContent` (units) → `body` (stage artifacts) → `content`
 *  (output artifacts) → JSON.stringify as a last resort. */
export function shaOf(payload: unknown): string {
	return `sha-${hashString(canonicalContent(payload))}`
}

function canonicalContent(payload: unknown): string {
	if (payload == null) return ""
	if (typeof payload === "string") return stripFrontmatter(payload)
	if (typeof payload !== "object") return String(payload)
	const p = payload as Record<string, unknown>
	if (typeof p.rawContent === "string") {
		const title = typeof p.title === "string" ? p.title : ""
		return `${title}\n\n${stripFrontmatter(p.rawContent as string)}`
	}
	if (typeof p.body === "string") return p.body as string
	if (typeof p.content === "string") return p.content as string
	return JSON.stringify(payload)
}

function stripFrontmatter(raw: string): string {
	// Strip a YAML frontmatter block at the top of the content. The
	// review-surface rawContent always has frontmatter delimited by
	// `---\n...\n---`; anything else falls through unchanged.
	return raw.replace(/^---[\r\n]+[\s\S]*?\n---[\r\n]+/, "")
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

function loadShaSet(scopeId: string): Set<string> {
	try {
		const raw = localStorage.getItem(storageKey(scopeId))
		if (!raw) return new Set()
		const parsed = JSON.parse(raw)
		// New-format: array of shas.
		if (Array.isArray(parsed)) {
			return new Set(parsed.filter((v) => typeof v === "string"))
		}
		// Legacy: object of {key: sha}. Migrate by taking the values.
		if (parsed && typeof parsed === "object") {
			const vals = Object.values(parsed as Record<string, unknown>).filter(
				(v): v is string => typeof v === "string",
			)
			return new Set(vals)
		}
	} catch {
		// ignore — storage may be disabled / quota exceeded / malformed
	}
	return new Set()
}

function saveShaSet(scopeId: string, shas: Set<string>): void {
	try {
		localStorage.setItem(storageKey(scopeId), JSON.stringify([...shas]))
	} catch {
		// ignore
	}
}

export interface SeenTracker {
	state: (
		kind: ArtifactKind,
		stageId: string,
		name: string,
		sha: string,
	) => SeenState
	markSeen: (
		kind: ArtifactKind,
		stageId: string,
		name: string,
		sha: string,
	) => void
	reset: () => void
}

export function useSeenTracker(scopeId: string | null): SeenTracker {
	// Lazy-init from localStorage on the FIRST render — if we wait for a
	// useEffect-load, every newly-mounted detail view flashes NEW badges
	// for one tick before state catches up. Since TanStack Router
	// remounts the tree on every navigation, that one tick is exactly
	// when the reviewer is looking at it.
	const [shas, setShas] = useState<Set<string>>(() => {
		if (!scopeId) return new Set()
		const initial = loadShaSet(scopeId)
		console.log(
			`[useSeenTracker] scope=${scopeId} init loaded ${initial.size} content-shas from localStorage key "${storageKey(scopeId)}"`,
		)
		return initial
	})

	// Cross-tab sync + scope-id change handling.
	useEffect(() => {
		if (!scopeId) {
			console.warn(
				"[useSeenTracker] scopeId is null/empty — seen state will not persist. Check that intent_slug is flowing through to StageReview.",
			)
			return
		}
		const scoped = scopeId
		setShas(loadShaSet(scoped))
		function handleStorage(e: StorageEvent) {
			if (e.key === storageKey(scoped)) setShas(loadShaSet(scoped))
		}
		window.addEventListener("storage", handleStorage)
		return () => window.removeEventListener("storage", handleStorage)
	}, [scopeId])

	const state = useCallback(
		(
			_kind: ArtifactKind,
			_stageId: string,
			_name: string,
			sha: string,
		): SeenState => (shas.has(sha) ? "seen" : "unseen"),
		[shas],
	)

	const markSeen = useCallback(
		(
			_kind: ArtifactKind,
			_stageId: string,
			_name: string,
			sha: string,
		): void => {
			if (!scopeId) return
			// Merge into live localStorage contents rather than React
			// state — multiple mounts firing markSeen on the same tick
			// (walkthrough stepping, WS refresh mid-navigation) would
			// otherwise race against each other and stomp writes. Disk
			// is the single source of truth; React state is just for
			// re-render.
			const live = loadShaSet(scopeId)
			if (live.has(sha)) return
			live.add(sha)
			saveShaSet(scopeId, live)
			setShas(new Set(live))
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
		setShas(new Set())
	}, [scopeId])

	return { state, markSeen, reset }
}

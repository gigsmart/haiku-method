import { useCallback, useEffect, useMemo, useState } from "react"

/**
 * useReviewDraft — persists per-session review draft state to
 * localStorage so an accidental reload or tab switch does not lose
 * work-in-progress before the user hits Approve / Request Changes.
 *
 * Draft shape is whatever the calling page wants to survive a reload
 * (textareas, radio selections, annotation captions, etc). Persistence
 * is keyed on `sessionId` so drafts never cross-contaminate between
 * concurrent review sessions.
 *
 * Hoisted from the legacy `components/ReviewPage.tsx` monolith as
 * part of the FB-22 split. The hook currently has no live consumer —
 * the `pages/review/ReviewPage` composition does not yet wire
 * persistence back in — but the contract is worth locking down now
 * so the next consumer (planned post-FB-22) inherits a tested
 * implementation instead of re-hand-rolling localStorage writes.
 */

export interface ReviewDraft {
	decision?: "approve" | "request-changes" | null
	feedback?: string
	annotations?: unknown
}

const DRAFT_STORAGE_PREFIX = "haiku:review-draft:"

export function draftStorageKey(sessionId: string): string {
	return `${DRAFT_STORAGE_PREFIX}${sessionId}`
}

export function loadDraft(sessionId: string): ReviewDraft {
	if (typeof window === "undefined") return {}
	try {
		const raw = window.localStorage.getItem(draftStorageKey(sessionId))
		if (!raw) return {}
		const parsed = JSON.parse(raw) as unknown
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as ReviewDraft
		}
		return {}
	} catch {
		// Corrupted JSON or localStorage access rejected (private-mode,
		// quota exceeded, etc). Treat as empty draft rather than crashing
		// the review page.
		return {}
	}
}

export function saveDraft(sessionId: string, draft: ReviewDraft): void {
	if (typeof window === "undefined") return
	try {
		window.localStorage.setItem(
			draftStorageKey(sessionId),
			JSON.stringify(draft),
		)
	} catch {
		// Quota exceeded or storage disabled — silently drop. The draft
		// still lives in in-memory state for the current session; we
		// just can't survive a reload.
	}
}

export function clearDraftStorage(sessionId: string): void {
	if (typeof window === "undefined") return
	try {
		window.localStorage.removeItem(draftStorageKey(sessionId))
	} catch {
		// Same swallow rationale as saveDraft — storage disabled.
	}
}

export interface UseReviewDraftResult {
	draft: ReviewDraft
	setDraft: (next: ReviewDraft) => void
	clearDraft: () => void
}

/**
 * Hook wrapper. Loads once on mount, writes on change, exposes a
 * `clearDraft` terminator for the submit path.
 */
function isEmptyDraft(draft: ReviewDraft): boolean {
	return Object.keys(draft).length === 0
}

export function useReviewDraft(sessionId: string): UseReviewDraftResult {
	const initial = useMemo(() => loadDraft(sessionId), [sessionId])
	const [draft, setDraftState] = useState<ReviewDraft>(initial)

	useEffect(() => {
		// Empty draft = nothing worth persisting; also avoids resurrecting
		// a storage entry immediately after `clearDraft` runs.
		if (isEmptyDraft(draft)) {
			clearDraftStorage(sessionId)
			return
		}
		saveDraft(sessionId, draft)
	}, [sessionId, draft])

	const setDraft = useCallback((next: ReviewDraft) => {
		setDraftState(next)
	}, [])

	const clearDraft = useCallback(() => {
		clearDraftStorage(sessionId)
		setDraftState({})
	}, [sessionId])

	return { draft, setDraft, clearDraft }
}

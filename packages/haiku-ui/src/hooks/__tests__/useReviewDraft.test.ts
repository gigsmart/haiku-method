/**
 * useReviewDraft — unit tests covering the localStorage persistence
 * contract hoisted out of the legacy ReviewPage monolith.
 *
 * Scenarios:
 *  - `loadDraft` on a missing key returns the empty draft.
 *  - `loadDraft` on a corrupted JSON blob returns the empty draft
 *    (does not crash the review page).
 *  - `loadDraft` on a valid blob returns the hydrated draft verbatim.
 *  - `saveDraft` then `loadDraft` round-trips.
 *  - `clearDraftStorage` removes the key.
 *  - Hook calls load on mount, persists on change, clears on request.
 */

import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
	clearDraftStorage,
	draftStorageKey,
	loadDraft,
	saveDraft,
	useReviewDraft,
} from "../useReviewDraft"

describe("useReviewDraft — persistence helpers", () => {
	const sessionId = "sess_abc123"
	const key = draftStorageKey(sessionId)

	beforeEach(() => {
		window.localStorage.clear()
	})

	afterEach(() => {
		window.localStorage.clear()
	})

	it("loadDraft returns empty object when no key is set", () => {
		expect(loadDraft(sessionId)).toEqual({})
	})

	it("loadDraft tolerates corrupted JSON and returns empty object", () => {
		window.localStorage.setItem(key, "{not json")
		expect(loadDraft(sessionId)).toEqual({})
	})

	it("loadDraft ignores non-object JSON payloads", () => {
		window.localStorage.setItem(key, JSON.stringify(["an", "array"]))
		expect(loadDraft(sessionId)).toEqual({})
	})

	it("saveDraft + loadDraft round-trips a populated draft", () => {
		const draft = {
			decision: "request-changes" as const,
			feedback: "please re-check the headings",
		}
		saveDraft(sessionId, draft)
		expect(loadDraft(sessionId)).toEqual(draft)
	})

	it("clearDraftStorage removes the persisted draft", () => {
		saveDraft(sessionId, { feedback: "gone in a moment" })
		clearDraftStorage(sessionId)
		expect(window.localStorage.getItem(key)).toBeNull()
		expect(loadDraft(sessionId)).toEqual({})
	})
})

describe("useReviewDraft — hook", () => {
	const sessionId = "sess_hook"
	const key = draftStorageKey(sessionId)

	beforeEach(() => {
		window.localStorage.clear()
	})

	afterEach(() => {
		window.localStorage.clear()
	})

	it("loads pre-existing draft on mount", () => {
		const existing = { feedback: "pre-hydrated" }
		window.localStorage.setItem(key, JSON.stringify(existing))
		const { result } = renderHook(() => useReviewDraft(sessionId))
		expect(result.current.draft).toEqual(existing)
	})

	it("persists updates to localStorage", () => {
		const { result } = renderHook(() => useReviewDraft(sessionId))
		act(() => {
			result.current.setDraft({
				decision: "approve",
				feedback: "LGTM",
			})
		})
		const stored = window.localStorage.getItem(key)
		expect(stored).not.toBeNull()
		expect(JSON.parse(stored as string)).toEqual({
			decision: "approve",
			feedback: "LGTM",
		})
	})

	it("clearDraft empties the in-memory draft and removes the storage entry", () => {
		window.localStorage.setItem(
			key,
			JSON.stringify({ feedback: "to be cleared" }),
		)
		const { result } = renderHook(() => useReviewDraft(sessionId))
		expect(result.current.draft).toEqual({ feedback: "to be cleared" })
		act(() => {
			result.current.clearDraft()
		})
		expect(result.current.draft).toEqual({})
		expect(window.localStorage.getItem(key)).toBeNull()
	})
})

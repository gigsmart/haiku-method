/**
 * useFeedback — regression tests for FB-47.
 *
 * The previous implementation called `await fetchFeedback()` after every
 * create / update / delete, forcing a full-list GET that server-side ran a
 * synchronous dir-scan. The fix for FB-47 is client-side optimistic
 * splicing for update and delete (the two high-frequency mutations in the
 * triage scenario). Create still refetches for v1 — the POST response does
 * not yet project the full FeedbackItem.
 *
 * Scenarios:
 *  1. updateFeedback splices the status locally and does NOT refetch.
 *  2. deleteFeedback filters the item locally and does NOT refetch.
 *  3. createFeedback still refetches (intentional v1 carve-out).
 *  4. A failed updateFeedback (non-2xx) does NOT mutate items.
 */

import { act, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ApiClient } from "../../api/client"
import { ApiClientProvider } from "../../api/context"
import type { FeedbackItemData } from "../../types"
import { useFeedback } from "../useFeedback"

const INTENT = "demo-intent"
const STAGE = "development"

function makeItem(overrides: Partial<FeedbackItemData> = {}): FeedbackItemData {
	return {
		feedback_id: "FB-1",
		title: "Example finding",
		body: "Example body",
		status: "pending",
		origin: "adversarial-review",
		author: "reviewer",
		author_type: "agent",
		created_at: "2026-04-21T00:00:00Z",
		visit: 0,
		source_ref: null,
		closed_by: null,
		...overrides,
	}
}

function jsonResponse(
	body: unknown,
	init: { ok?: boolean; status?: number } = {},
): Response {
	const ok = init.ok ?? true
	const status = init.status ?? (ok ? 200 : 500)
	return {
		ok,
		status,
		json: async () => body,
	} as unknown as Response
}

function stubClient(): ApiClient {
	// The hook now routes PUT / DELETE / POST through the typed client
	// rather than reaching for `fetch` directly. These forwarders preserve
	// the existing test contract (fetch call counts + URL shapes) while
	// letting the test suite continue to stub a single global fetch.
	async function forward(
		method: string,
		url: string,
		body?: unknown,
	): Promise<unknown> {
		const init: RequestInit = {
			method,
			headers: body !== undefined ? { "Content-Type": "application/json" } : {},
		}
		if (body !== undefined) init.body = JSON.stringify(body)
		const res = await fetch(url, init)
		if (!res.ok) {
			const err = await res.json().catch(() => ({}))
			throw new Error((err as { error?: string }).error || `HTTP ${res.status}`)
		}
		return res.json()
	}
	return {
		getSessionId: () => null,
		setSessionId: () => {},
		openWebSocket: () => null,
		feedback: {
			async create(
				intent: string,
				stage: string,
				body: Record<string, unknown>,
			) {
				return forward(
					"POST",
					`/api/feedback/${encodeURIComponent(intent)}/${encodeURIComponent(stage)}`,
					body,
				)
			},
			async update(
				intent: string,
				stage: string,
				id: string,
				fields: Record<string, unknown>,
			) {
				return forward(
					"PUT",
					`/api/feedback/${encodeURIComponent(intent)}/${encodeURIComponent(stage)}/${encodeURIComponent(id)}`,
					fields,
				)
			},
			async delete(intent: string, stage: string, id: string) {
				return forward(
					"DELETE",
					`/api/feedback/${encodeURIComponent(intent)}/${encodeURIComponent(stage)}/${encodeURIComponent(id)}`,
				)
			},
		},
	} as unknown as ApiClient
}

function wrapper({ children }: { children: ReactNode }) {
	return <ApiClientProvider client={stubClient()}>{children}</ApiClientProvider>
}

type FetchCall = {
	url: string
	method: string
}

function recordCalls(
	impl: (url: string, init: RequestInit) => Promise<Response>,
) {
	const calls: FetchCall[] = []
	const fn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
		const u = typeof url === "string" ? url : url.toString()
		const method = (init?.method ?? "GET").toUpperCase()
		calls.push({ url: u, method })
		return impl(u, init ?? {})
	})
	return { fn, calls }
}

describe("useFeedback — FB-47 optimistic mutation splicing", () => {
	beforeEach(() => {
		vi.restoreAllMocks()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("updateFeedback splices status locally without refetching", async () => {
		const initial = [
			makeItem({ feedback_id: "FB-1", status: "pending" }),
			makeItem({ feedback_id: "FB-2", status: "pending", title: "Other" }),
		]
		const { fn, calls } = recordCalls(async (url, init) => {
			const method = (init.method ?? "GET").toUpperCase()
			if (method === "GET") {
				return jsonResponse({
					intent: INTENT,
					stage: STAGE,
					count: initial.length,
					items: initial,
				})
			}
			if (method === "PUT") {
				return jsonResponse({
					feedback_id: "FB-1",
					updated_fields: ["status"],
				})
			}
			throw new Error(`unexpected request ${method} ${url}`)
		})
		vi.stubGlobal("fetch", fn)

		const { result } = renderHook(() => useFeedback(INTENT, STAGE), { wrapper })
		await waitFor(() => {
			expect(result.current.items).toHaveLength(2)
		})
		const getsBefore = calls.filter((c) => c.method === "GET").length
		expect(getsBefore).toBe(1)

		await act(async () => {
			await result.current.updateFeedback("FB-1", { status: "closed" })
		})

		const getsAfter = calls.filter((c) => c.method === "GET").length
		const putsAfter = calls.filter((c) => c.method === "PUT").length
		expect(getsAfter).toBe(1) // no follow-up GET
		expect(putsAfter).toBe(1)
		expect(
			result.current.items.find((i) => i.feedback_id === "FB-1")?.status,
		).toBe("closed")
		expect(
			result.current.items.find((i) => i.feedback_id === "FB-2")?.status,
		).toBe("pending")
	})

	it("deleteFeedback filters the item locally without refetching", async () => {
		const initial = [
			makeItem({ feedback_id: "FB-1" }),
			makeItem({ feedback_id: "FB-2", title: "Other" }),
		]
		const { fn, calls } = recordCalls(async (url, init) => {
			const method = (init.method ?? "GET").toUpperCase()
			if (method === "GET") {
				return jsonResponse({
					intent: INTENT,
					stage: STAGE,
					count: initial.length,
					items: initial,
				})
			}
			if (method === "DELETE") {
				return jsonResponse({ ok: true })
			}
			throw new Error(`unexpected request ${method} ${url}`)
		})
		vi.stubGlobal("fetch", fn)

		const { result } = renderHook(() => useFeedback(INTENT, STAGE), { wrapper })
		await waitFor(() => {
			expect(result.current.items).toHaveLength(2)
		})

		await act(async () => {
			await result.current.deleteFeedback("FB-1")
		})

		const getsAfter = calls.filter((c) => c.method === "GET").length
		const deletesAfter = calls.filter((c) => c.method === "DELETE").length
		expect(getsAfter).toBe(1) // no follow-up GET
		expect(deletesAfter).toBe(1)
		expect(result.current.items.map((i) => i.feedback_id)).toEqual(["FB-2"])
	})

	it("createFeedback still refetches (v1 — response lacks projected item)", async () => {
		const initial = [makeItem({ feedback_id: "FB-1" })]
		const postCreate = [
			makeItem({ feedback_id: "FB-1" }),
			makeItem({ feedback_id: "FB-2", title: "Newly created" }),
		]
		let getCount = 0
		const { fn, calls } = recordCalls(async (url, init) => {
			const method = (init.method ?? "GET").toUpperCase()
			if (method === "GET") {
				getCount += 1
				const items = getCount === 1 ? initial : postCreate
				return jsonResponse({
					intent: INTENT,
					stage: STAGE,
					count: items.length,
					items,
				})
			}
			if (method === "POST") {
				return jsonResponse({
					feedback_id: "FB-2",
					file: "02-newly-created.md",
					status: "pending",
					message: "created",
				})
			}
			throw new Error(`unexpected request ${method} ${url}`)
		})
		vi.stubGlobal("fetch", fn)

		const { result } = renderHook(() => useFeedback(INTENT, STAGE), { wrapper })
		await waitFor(() => {
			expect(result.current.items).toHaveLength(1)
		})

		await act(async () => {
			await result.current.createFeedback("Newly created", "body")
		})

		const getsAfter = calls.filter((c) => c.method === "GET").length
		const postsAfter = calls.filter((c) => c.method === "POST").length
		// Initial mount GET + post-create refetch GET + create POST.
		expect(getsAfter).toBe(2)
		expect(postsAfter).toBe(1)
		expect(result.current.items.map((i) => i.feedback_id)).toEqual([
			"FB-1",
			"FB-2",
		])
	})

	it("failed updateFeedback (non-2xx) leaves items untouched", async () => {
		const initial = [makeItem({ feedback_id: "FB-1", status: "pending" })]
		const { fn } = recordCalls(async (url, init) => {
			const method = (init.method ?? "GET").toUpperCase()
			if (method === "GET") {
				return jsonResponse({
					intent: INTENT,
					stage: STAGE,
					count: initial.length,
					items: initial,
				})
			}
			if (method === "PUT") {
				return jsonResponse({ error: "conflict" }, { ok: false, status: 409 })
			}
			throw new Error(`unexpected request ${method} ${url}`)
		})
		vi.stubGlobal("fetch", fn)

		const { result } = renderHook(() => useFeedback(INTENT, STAGE), { wrapper })
		await waitFor(() => {
			expect(result.current.items).toHaveLength(1)
		})

		await expect(
			act(async () => {
				await result.current.updateFeedback("FB-1", { status: "closed" })
			}),
		).rejects.toThrow()

		expect(
			result.current.items.find((i) => i.feedback_id === "FB-1")?.status,
		).toBe("pending")
	})
})

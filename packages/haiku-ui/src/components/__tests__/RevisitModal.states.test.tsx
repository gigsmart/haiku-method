/**
 * State-matrix behavioral coverage for the redesigned RevisitModal
 * confirm dialog. The earlier per-reason form has been retired (pending
 * feedback items on disk ARE the reasons), so this suite covers the
 * confirm + dispatch + session/stage plumbing surface that remains.
 */

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react"
import type { RevisitRequest, RevisitResponse } from "haiku-api"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ApiClient } from "../../api/client"
import type { FeedbackItemData } from "../../types"
import { RevisitModal } from "../RevisitModal"

afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
})

function makeStubClient(
	submitRevisit?: (
		sessionId: string,
		body: RevisitRequest,
	) => Promise<RevisitResponse>,
): ApiClient {
	return {
		fetchSession: vi.fn(),
		fetchReviewCurrent: vi.fn(),
		submitDecision: vi.fn(),
		submitAnswer: vi.fn(),
		submitDirection: vi.fn(),
		submitRevisit:
			submitRevisit ??
			vi.fn(
				async (_s: string, _b: RevisitRequest): Promise<RevisitResponse> => ({
					ok: true as const,
					action: "revisit",
					message: "Revisit accepted",
				}),
			),
		feedback: {
			list: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
		},
		setSessionId: vi.fn(),
		getSessionId: () => null,
		openWebSocket: () => null,
	}
}

function makeItem(overrides: Partial<FeedbackItemData> = {}): FeedbackItemData {
	return {
		feedback_id: "FB-01",
		title: "Pending item",
		body: "body",
		status: "pending",
		origin: "user-chat",
		author: "user",
		author_type: "human",
		created_at: "2026-04-23T00:00:00Z",
		visit: 0,
		source_ref: null,
		closed_by: null,
		...overrides,
	}
}

describe("RevisitModal — state matrix (behavioral)", () => {
	it("closed (open=false): renders nothing into the DOM", () => {
		const { container } = render(
			<RevisitModal
				sessionId="s1"
				open={false}
				onClose={() => {}}
				apiClient={makeStubClient()}
			/>,
		)
		expect(container.innerHTML).toBe("")
	})

	it("open-default: exposes role=dialog + aria-modal=true + labelled heading", () => {
		render(
			<RevisitModal
				sessionId="s1"
				open
				onClose={() => {}}
				apiClient={makeStubClient()}
				pendingItems={[makeItem()]}
			/>,
		)
		const dialog = screen.getByRole("dialog")
		expect(dialog.getAttribute("aria-modal")).toBe("true")
		const labelId = dialog.getAttribute("aria-labelledby")
		expect(labelId).toBeTruthy()
		const labelEl = labelId ? document.getElementById(labelId) : null
		expect(labelEl?.textContent).toMatch(/send feedback/i)
	})

	it('open-with-target-stage=product: submit dispatches stage="product" in the body', async () => {
		const submitRevisit = vi.fn(
			async (_s: string, _b: RevisitRequest): Promise<RevisitResponse> => ({
				ok: true,
				action: "revisit",
				stage: "product",
				message: "ok",
			}),
		)
		render(
			<RevisitModal
				sessionId="s1"
				open
				onClose={() => {}}
				targetStage="product"
				apiClient={makeStubClient(submitRevisit)}
				pendingItems={[makeItem()]}
			/>,
		)
		fireEvent.click(screen.getByRole("button", { name: /Send/ }))
		await waitFor(() => expect(submitRevisit).toHaveBeenCalledTimes(1))
		expect(submitRevisit.mock.calls[0][1]).toEqual({ stage: "product" })
	})

	it('open-target-development: submit dispatches stage="development"', async () => {
		const submitRevisit = vi.fn(
			async (_s: string, _b: RevisitRequest): Promise<RevisitResponse> => ({
				ok: true,
				action: "revisit",
				stage: "development",
				message: "ok",
			}),
		)
		render(
			<RevisitModal
				sessionId="s1"
				open
				onClose={() => {}}
				targetStage="development"
				apiClient={makeStubClient(submitRevisit)}
				pendingItems={[makeItem()]}
			/>,
		)
		fireEvent.click(screen.getByRole("button", { name: /Send/ }))
		await waitFor(() => expect(submitRevisit).toHaveBeenCalledTimes(1))
		expect(submitRevisit.mock.calls[0][1].stage).toBe("development")
	})

	it("open-with-success-cb: onSuccess fires before onClose on valid submit", async () => {
		const order: string[] = []
		const submitRevisit = vi.fn(
			async (_s: string, _b: RevisitRequest): Promise<RevisitResponse> => ({
				ok: true,
				action: "revisit",
				message: "Revisit accepted",
			}),
		)
		const onSuccess = vi.fn((_r: RevisitResponse) => {
			order.push("onSuccess")
		})
		const onClose = vi.fn(() => {
			order.push("onClose")
		})
		render(
			<RevisitModal
				sessionId="s1"
				open
				onClose={onClose}
				onSuccess={onSuccess}
				apiClient={makeStubClient(submitRevisit)}
				pendingItems={[makeItem()]}
			/>,
		)
		fireEvent.click(screen.getByRole("button", { name: /Send/ }))
		await waitFor(() => expect(submitRevisit).toHaveBeenCalledTimes(1))
		await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
		expect(order).toEqual(["onSuccess", "onClose"])
	})

	it("open-alt-session: submit path receives the alternate sessionId verbatim", async () => {
		const submitRevisit = vi.fn(
			async (_s: string, _b: RevisitRequest): Promise<RevisitResponse> => ({
				ok: true,
				action: "revisit",
				message: "ok",
			}),
		)
		render(
			<RevisitModal
				sessionId="s2-alt"
				open
				onClose={() => {}}
				apiClient={makeStubClient(submitRevisit)}
				pendingItems={[makeItem()]}
			/>,
		)
		fireEvent.click(screen.getByRole("button", { name: /Send/ }))
		await waitFor(() => expect(submitRevisit).toHaveBeenCalledTimes(1))
		expect(submitRevisit.mock.calls[0][0]).toBe("s2-alt")
	})

	it("open-default without targetStage: submit body omits the stage field entirely", async () => {
		const submitRevisit = vi.fn(
			async (_s: string, _b: RevisitRequest): Promise<RevisitResponse> => ({
				ok: true,
				action: "revisit",
				message: "ok",
			}),
		)
		render(
			<RevisitModal
				sessionId="s1"
				open
				onClose={() => {}}
				apiClient={makeStubClient(submitRevisit)}
				pendingItems={[makeItem()]}
			/>,
		)
		fireEvent.click(screen.getByRole("button", { name: /Send/ }))
		await waitFor(() => expect(submitRevisit).toHaveBeenCalledTimes(1))
		const body = submitRevisit.mock.calls[0][1] as Record<string, unknown>
		expect("stage" in body).toBe(false)
	})
})

/**
 * RevisitModal tests — covers the confirm-dialog surface after the
 * handoff-to-agent redesign. The earlier form-based tests (per-reason
 * title + body validation, reason count caps, submit with reasons array)
 * are gone along with the form; the pending feedback items on disk ARE
 * the reasons now, so the modal's job is just to summarise + confirm.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { RevisitRequest, RevisitResponse } from "haiku-api"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ApiClient } from "../../api/client"
import type { FeedbackItemData } from "../../types"
import { RevisitModal } from "../RevisitModal"

afterEach(() => {
	cleanup()
})

function makeStubClient(overrides: Partial<ApiClient> = {}): ApiClient {
	return {
		fetchSession: vi.fn(),
		fetchReviewCurrent: vi.fn(),
		submitDecision: vi.fn(),
		submitAnswer: vi.fn(),
		submitDirection: vi.fn(),
		submitPicker: vi.fn(),
		submitRevisit: vi.fn(
			async (
				_sessionId: string,
				_body: RevisitRequest,
			): Promise<RevisitResponse> => ({
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
		...overrides,
	}
}

function makeItem(overrides: Partial<FeedbackItemData> = {}): FeedbackItemData {
	return {
		feedback_id: "FB-01",
		title: "A pending item",
		body: "Body text",
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

describe("RevisitModal — confirm shell", () => {
	it("does not render when open=false", () => {
		const client = makeStubClient()
		render(
			<RevisitModal
				sessionId="s1"
				open={false}
				onClose={() => {}}
				apiClient={client}
				pendingItems={[]}
			/>,
		)
		expect(screen.queryByRole("dialog")).toBeNull()
	})

	it("renders with dialog role, labelled header, and pending summary", () => {
		const items: FeedbackItemData[] = [
			makeItem({ feedback_id: "FB-01", title: "First comment" }),
			makeItem({
				feedback_id: "FB-02",
				title: "A question",
				origin: "user-question",
				resolution: "question",
			}),
		]
		const client = makeStubClient()
		render(
			<RevisitModal
				sessionId="s1"
				open
				onClose={() => {}}
				apiClient={client}
				pendingItems={items}
			/>,
		)
		const dialog = screen.getByRole("dialog")
		expect(dialog.getAttribute("aria-modal")).toBe("true")
		expect(dialog.getAttribute("aria-labelledby")).toBeTruthy()
		expect(screen.getByText("Send feedback to agent")).toBeTruthy()
		expect(screen.getByText("FB-01")).toBeTruthy()
		expect(screen.getByText("First comment")).toBeTruthy()
		expect(screen.getByText("FB-02")).toBeTruthy()
		// Explicit resolution shows its label; nullable resolution shows "Agent will triage"
		expect(screen.getByText(/Question . wants a reply/)).toBeTruthy()
		expect(screen.getByText(/Agent will triage/)).toBeTruthy()
	})

	it("disables submit when no pending items", () => {
		const client = makeStubClient()
		render(
			<RevisitModal
				sessionId="s1"
				open
				onClose={() => {}}
				apiClient={client}
				pendingItems={[]}
			/>,
		)
		const submit = screen.getByRole("button", { name: /Send/ })
		expect((submit as HTMLButtonElement).disabled).toBe(true)
	})

	it("submit POSTs revisit with empty reasons and calls onSuccess + onClose", async () => {
		const onClose = vi.fn()
		const onSuccess = vi.fn()
		const client = makeStubClient()
		const items = [makeItem({ feedback_id: "FB-01" })]
		render(
			<RevisitModal
				sessionId="s1"
				open
				onClose={onClose}
				onSuccess={onSuccess}
				apiClient={client}
				targetStage="development"
				pendingItems={items}
			/>,
		)
		const submit = screen.getByRole("button", { name: /Send 1 item/ })
		fireEvent.click(submit)
		await new Promise((r) => setTimeout(r, 0))
		expect(client.submitRevisit).toHaveBeenCalledWith("s1", {
			stage: "development",
		})
		expect(onSuccess).toHaveBeenCalledTimes(1)
		expect(onClose).toHaveBeenCalledTimes(1)
	})

	it("surfaces submit errors via role=alert and keeps modal open", async () => {
		const onClose = vi.fn()
		const client = makeStubClient({
			submitRevisit: vi.fn(async () => {
				throw new Error("Server exploded")
			}) as unknown as ApiClient["submitRevisit"],
		})
		const items = [makeItem()]
		render(
			<RevisitModal
				sessionId="s1"
				open
				onClose={onClose}
				apiClient={client}
				pendingItems={items}
			/>,
		)
		fireEvent.click(screen.getByRole("button", { name: /Send/ }))
		await new Promise((r) => setTimeout(r, 0))
		expect(screen.getByRole("alert").textContent).toMatch(/Server exploded/)
		expect(onClose).not.toHaveBeenCalled()
	})

	it("dismisses via Escape and Cancel", () => {
		const onClose = vi.fn()
		const client = makeStubClient()
		render(
			<RevisitModal
				sessionId="s1"
				open
				onClose={onClose}
				apiClient={client}
				pendingItems={[makeItem()]}
			/>,
		)
		fireEvent.keyDown(document, { key: "Escape" })
		expect(onClose).toHaveBeenCalledTimes(1)
		fireEvent.click(screen.getByRole("button", { name: /Cancel/ }))
		expect(onClose).toHaveBeenCalledTimes(2)
	})
})

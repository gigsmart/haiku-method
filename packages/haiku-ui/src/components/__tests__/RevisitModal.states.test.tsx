/**
 * State-matrix behavioral coverage for RevisitModal (state-coverage-grid.md §7.12, §4).
 *
 * Per FB-64: snapshots alone are implementation-detail lock-ins. Each state
 * cell in this matrix gets one *behavioral* assertion that verifies an
 * invariant — not a class name. The snapshot remains as a secondary proof of
 * stable HTML, but behavior is the primary gate.
 *
 * Cells covered (one test each):
 *   1. closed (open=false) → component renders nothing into the DOM.
 *   2. open-default → role=dialog + aria-modal=true + labelled heading is live.
 *   3. open-with-target-stage=product → submit dispatches with stage="product".
 *   4. open-with-success-cb → success callback fires on valid submit, before onClose.
 *   5. open-alt-session → submit path encodes the alternate sessionId verbatim.
 *   6. open-target-development → submit dispatches with stage="development".
 *
 * The modal is a div-based dialog (not native <dialog>), so jsdom renders
 * everything mounted — the matrix enumerates documented prop combinations.
 */

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react"
import type { RevisitRequest, RevisitResponse } from "haiku-api"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ApiClient } from "../../api/client"
import { RevisitModal } from "../RevisitModal"

beforeEach(() => {
	// Stabilize UUIDs so any residual snapshot reference stays reproducible.
	let counter = 0
	vi.spyOn(crypto, "randomUUID").mockImplementation(
		() => `11111111-2222-3333-4444-${String(counter++).padStart(12, "0")}`,
	)
})

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
			vi.fn(async (_s: string, _b: RevisitRequest) => ({
				ok: true as const,
				action: "revisit",
				feedback_created: ["FB-01"],
				message: "Revisit accepted",
			})),
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
		// Invariant: open=false must mount no markup. A regression that renders
		// the modal while aria-hidden is still a leaked a11y tree — must be ""
		// (null return short-circuits any wrapper emission).
		expect(container.innerHTML).toBe("")
	})

	it("open-default: exposes role=dialog + aria-modal=true + live labelled heading", () => {
		render(
			<RevisitModal
				sessionId="s1"
				open={true}
				onClose={() => {}}
				apiClient={makeStubClient()}
			/>,
		)
		const dialog = screen.getByRole("dialog")
		expect(dialog.getAttribute("aria-modal")).toBe("true")
		const labelId = dialog.getAttribute("aria-labelledby")
		expect(labelId).toBeTruthy()
		// The labelling node must exist AND say "Confirm revisit" — swapping the
		// copy or removing the id would break the a11y contract.
		const labelEl = labelId ? document.getElementById(labelId) : null
		expect(labelEl?.textContent).toMatch(/confirm revisit/i)
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
				open={true}
				onClose={() => {}}
				targetStage="product"
				apiClient={makeStubClient(submitRevisit)}
			/>,
		)
		const titleInput = screen.getAllByLabelText(/title/i)[0] as HTMLInputElement
		const bodyInput = screen.getAllByLabelText(
			/body/i,
		)[0] as HTMLTextAreaElement
		fireEvent.change(titleInput, { target: { value: "spec drift" } })
		fireEvent.change(bodyInput, { target: { value: "found in elaboration" } })
		fireEvent.click(screen.getByRole("button", { name: /confirm revisit/i }))
		await waitFor(() => expect(submitRevisit).toHaveBeenCalledTimes(1))
		// Invariant: the targetStage prop is forwarded verbatim — swapping two
		// stage labels in the component (product ↔ development) would break this.
		expect(submitRevisit.mock.calls[0][1]).toEqual({
			stage: "product",
			reasons: [{ title: "spec drift", body: "found in elaboration" }],
		})
	})

	it('open-target-development: submit dispatches stage="development" (distinguishes from product)', async () => {
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
				open={true}
				onClose={() => {}}
				targetStage="development"
				apiClient={makeStubClient(submitRevisit)}
			/>,
		)
		const titleInput = screen.getAllByLabelText(/title/i)[0] as HTMLInputElement
		const bodyInput = screen.getAllByLabelText(
			/body/i,
		)[0] as HTMLTextAreaElement
		fireEvent.change(titleInput, { target: { value: "t" } })
		fireEvent.change(bodyInput, { target: { value: "b" } })
		fireEvent.click(screen.getByRole("button", { name: /confirm revisit/i }))
		await waitFor(() => expect(submitRevisit).toHaveBeenCalledTimes(1))
		// Invariant: development != product — catches silent label swaps.
		expect(submitRevisit.mock.calls[0][1].stage).toBe("development")
	})

	it("open-with-success-cb: onSuccess fires before onClose on valid submit", async () => {
		const order: string[] = []
		const submitRevisit = vi.fn(
			async (_s: string, _b: RevisitRequest): Promise<RevisitResponse> => ({
				ok: true,
				action: "revisit",
				feedback_created: ["FB-42"],
				message: "Revisit accepted",
			}),
		)
		const onSuccess = vi.fn((_response: RevisitResponse) => {
			order.push("onSuccess")
		})
		const onClose = vi.fn(() => {
			order.push("onClose")
		})
		render(
			<RevisitModal
				sessionId="s1"
				open={true}
				onClose={onClose}
				onSuccess={onSuccess}
				apiClient={makeStubClient(submitRevisit)}
			/>,
		)
		const titleInput = screen.getAllByLabelText(/title/i)[0] as HTMLInputElement
		const bodyInput = screen.getAllByLabelText(
			/body/i,
		)[0] as HTMLTextAreaElement
		fireEvent.change(titleInput, { target: { value: "t" } })
		fireEvent.change(bodyInput, { target: { value: "b" } })
		fireEvent.click(screen.getByRole("button", { name: /confirm revisit/i }))
		await waitFor(() => expect(submitRevisit).toHaveBeenCalledTimes(1))
		await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
		// Invariant: onSuccess runs first (the handler's defined order) — a
		// refactor that reverses them would silently hide the response from
		// callers who close side-effects in onClose.
		expect(order).toEqual(["onSuccess", "onClose"])
		// Response shape reaches onSuccess as-received, not transformed.
		expect(onSuccess.mock.calls[0][0]).toEqual({
			ok: true,
			action: "revisit",
			feedback_created: ["FB-42"],
			message: "Revisit accepted",
		})
	})

	it("open-alt-session: submit path receives the alternate sessionId verbatim", async () => {
		const submitRevisit = vi.fn(
			async (_s: string, _b: RevisitRequest): Promise<RevisitResponse> => ({
				ok: true,
				action: "revisit",
				feedback_created: ["FB-01"],
				message: "ok",
			}),
		)
		render(
			<RevisitModal
				sessionId="s2-alt"
				open={true}
				onClose={() => {}}
				apiClient={makeStubClient(submitRevisit)}
			/>,
		)
		const titleInput = screen.getAllByLabelText(/title/i)[0] as HTMLInputElement
		const bodyInput = screen.getAllByLabelText(
			/body/i,
		)[0] as HTMLTextAreaElement
		fireEvent.change(titleInput, { target: { value: "t" } })
		fireEvent.change(bodyInput, { target: { value: "b" } })
		fireEvent.click(screen.getByRole("button", { name: /confirm revisit/i }))
		await waitFor(() => expect(submitRevisit).toHaveBeenCalledTimes(1))
		// Invariant: the sessionId becomes the first positional arg to
		// submitRevisit (which is the :sessionId path parameter on the server).
		// A URL-building bug that hardcoded a session or dropped the arg would
		// fail here.
		expect(submitRevisit.mock.calls[0][0]).toBe("s2-alt")
	})

	it("open-default without targetStage: submit body omits the stage field entirely", async () => {
		const submitRevisit = vi.fn(
			async (_s: string, _b: RevisitRequest): Promise<RevisitResponse> => ({
				ok: true,
				action: "revisit",
				feedback_created: ["FB-01"],
				message: "ok",
			}),
		)
		render(
			<RevisitModal
				sessionId="s1"
				open={true}
				onClose={() => {}}
				apiClient={makeStubClient(submitRevisit)}
			/>,
		)
		const titleInput = screen.getAllByLabelText(/title/i)[0] as HTMLInputElement
		const bodyInput = screen.getAllByLabelText(
			/body/i,
		)[0] as HTMLTextAreaElement
		fireEvent.change(titleInput, { target: { value: "t" } })
		fireEvent.change(bodyInput, { target: { value: "b" } })
		fireEvent.click(screen.getByRole("button", { name: /confirm revisit/i }))
		await waitFor(() => expect(submitRevisit).toHaveBeenCalledTimes(1))
		const body = submitRevisit.mock.calls[0][1] as Record<string, unknown>
		// Invariant: when targetStage is not provided, the field must be
		// absent (not emitted as undefined/null) — the server uses field
		// presence to decide whether to override the stage.
		expect("stage" in body).toBe(false)
		expect(body.reasons).toEqual([{ title: "t", body: "b" }])
	})
})

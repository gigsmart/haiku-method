/**
 * RevisitModal tests (unit-11).
 *
 * Covers every completion criterion on unit-11:
 *   - Opens with focus on the first reason-input field.
 *   - Closes via Escape; backdrop click; Cancel. Focus returns to the trigger.
 *   - Validation: empty reasons array, empty title, empty body, over-length
 *     title (> UI cap), over-length body (> UI cap), > UI_REASONS_MAX reasons.
 *   - Valid submit POSTs via the injected ApiClient and closes the modal.
 *   - Submit failure surfaces role="alert" and keeps the modal open.
 *   - Dialog a11y: role="dialog" + aria-modal="true" + aria-labelledby present.
 */

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { RevisitRequest, RevisitResponse } from "haiku-api"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ApiClient } from "../../api/client"
import {
	RevisitModal,
	UI_BODY_MAX,
	UI_REASONS_MAX,
	UI_TITLE_MAX,
} from "../RevisitModal"

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
		submitRevisit: vi.fn(async (_sessionId: string, _body: RevisitRequest) => ({
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
		openWebSocket: () => null,
		...overrides,
	}
}

// Pump requestAnimationFrame + any pending microtasks so useEffect + rAF
// callbacks (focus-first-input override) have flushed.
async function flushFocusEffect(): Promise<void> {
	await act(async () => {
		await Promise.resolve()
	})
}

describe("RevisitModal — a11y shell", () => {
	it("renders role=dialog + aria-modal=true + aria-labelledby", async () => {
		render(
			<RevisitModal
				sessionId="s1"
				open
				onClose={() => {}}
				apiClient={makeStubClient()}
			/>,
		)
		await flushFocusEffect()
		const dialog = screen.getByRole("dialog")
		expect(dialog.getAttribute("aria-modal")).toBe("true")
		const labelId = dialog.getAttribute("aria-labelledby")
		expect(labelId).toBeTruthy()
		if (labelId) {
			expect(document.getElementById(labelId)?.textContent).toMatch(
				/confirm revisit/i,
			)
		}
	})

	it("returns null when open=false (does not render into the tree)", () => {
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
})

describe("RevisitModal — focus management", () => {
	it("opens with focus on the first reason title input", async () => {
		render(
			<RevisitModal
				sessionId="s1"
				open
				onClose={() => {}}
				apiClient={makeStubClient()}
			/>,
		)
		// Wait for rAF-deferred focus override to land.
		await waitFor(() => {
			const input = screen.getAllByLabelText(/title/i)[0] as HTMLInputElement
			expect(document.activeElement).toBe(input)
		})
	})

	it("closes via Escape and invokes onClose", async () => {
		const onClose = vi.fn()
		render(
			<RevisitModal
				sessionId="s1"
				open
				onClose={onClose}
				apiClient={makeStubClient()}
			/>,
		)
		await flushFocusEffect()
		fireEvent.keyDown(document, { key: "Escape" })
		expect(onClose).toHaveBeenCalledTimes(1)
	})

	it("closes via Cancel button", async () => {
		const onClose = vi.fn()
		render(
			<RevisitModal
				sessionId="s1"
				open
				onClose={onClose}
				apiClient={makeStubClient()}
			/>,
		)
		await flushFocusEffect()
		const cancel = screen.getByRole("button", { name: /cancel/i })
		fireEvent.click(cancel)
		expect(onClose).toHaveBeenCalledTimes(1)
	})

	it("closes via backdrop click (mousedown on backdrop root)", async () => {
		const onClose = vi.fn()
		render(
			<RevisitModal
				sessionId="s1"
				open
				onClose={onClose}
				apiClient={makeStubClient()}
			/>,
		)
		await flushFocusEffect()
		const backdrop = screen.getByTestId("revisit-modal-backdrop")
		// Dispatch mousedown with target === currentTarget — the backdrop itself.
		fireEvent.mouseDown(backdrop)
		expect(onClose).toHaveBeenCalledTimes(1)
	})

	it("inside-dialog mousedown does NOT dismiss (stopPropagation guard)", async () => {
		const onClose = vi.fn()
		render(
			<RevisitModal
				sessionId="s1"
				open
				onClose={onClose}
				apiClient={makeStubClient()}
			/>,
		)
		await flushFocusEffect()
		const dialog = screen.getByRole("dialog")
		fireEvent.mouseDown(dialog)
		expect(onClose).not.toHaveBeenCalled()
	})

	it("returns focus to the trigger when the modal closes", async () => {
		// Harness: a parent wrapper that renders a trigger button + the modal.
		function Harness() {
			const [open, setOpen] = React.useState(false)
			return (
				<>
					<button
						type="button"
						data-testid="trigger"
						onClick={() => setOpen(true)}
					>
						open revisit
					</button>
					<RevisitModal
						sessionId="s1"
						open={open}
						onClose={() => setOpen(false)}
						apiClient={makeStubClient()}
					/>
				</>
			)
		}
		const React = await import("react")
		render(<Harness />)
		const trigger = screen.getByTestId("trigger") as HTMLButtonElement
		trigger.focus()
		expect(document.activeElement).toBe(trigger)
		fireEvent.click(trigger)
		// Modal opens — wait for focus to land on the first input.
		await waitFor(() => {
			const input = screen.getAllByLabelText(/title/i)[0] as HTMLInputElement
			expect(document.activeElement).toBe(input)
		})
		// Close via Escape.
		fireEvent.keyDown(document, { key: "Escape" })
		await waitFor(() => {
			expect(document.activeElement).toBe(trigger)
		})
	})
})

describe("RevisitModal — validation", () => {
	it("submit is disabled initially (empty title + body)", async () => {
		render(
			<RevisitModal
				sessionId="s1"
				open
				onClose={() => {}}
				apiClient={makeStubClient()}
			/>,
		)
		await flushFocusEffect()
		const submit = screen.getByRole("button", {
			name: /confirm revisit/i,
		}) as HTMLButtonElement
		expect(submit.disabled).toBe(true)
		expect(submit.getAttribute("aria-disabled")).toBe("true")
	})

	it("shows 'Title required' when title is empty and body is filled", async () => {
		render(
			<RevisitModal
				sessionId="s1"
				open
				onClose={() => {}}
				apiClient={makeStubClient()}
			/>,
		)
		await flushFocusEffect()
		const user = userEvent.setup()
		const bodyInput = screen.getAllByLabelText(/body/i)[0] as HTMLTextAreaElement
		await user.type(bodyInput, "some body text")
		expect(screen.getByText(/title required/i)).toBeTruthy()
		const submit = screen.getByRole("button", {
			name: /confirm revisit/i,
		}) as HTMLButtonElement
		expect(submit.disabled).toBe(true)
	})

	it("shows 'Body required' when body is empty and title is filled", async () => {
		render(
			<RevisitModal
				sessionId="s1"
				open
				onClose={() => {}}
				apiClient={makeStubClient()}
			/>,
		)
		await flushFocusEffect()
		const user = userEvent.setup()
		const titleInput = screen.getAllByLabelText(/title/i)[0] as HTMLInputElement
		await user.type(titleInput, "some title")
		expect(screen.getByText(/body required/i)).toBeTruthy()
		expect(
			(
				screen.getByRole("button", {
					name: /confirm revisit/i,
				}) as HTMLButtonElement
			).disabled,
		).toBe(true)
	})

	it("shows over-length title error when title exceeds UI_TITLE_MAX", async () => {
		render(
			<RevisitModal
				sessionId="s1"
				open
				onClose={() => {}}
				apiClient={makeStubClient()}
			/>,
		)
		await flushFocusEffect()
		const titleInput = screen.getAllByLabelText(/title/i)[0] as HTMLInputElement
		const bodyInput = screen.getAllByLabelText(/body/i)[0] as HTMLTextAreaElement
		// Bypass userEvent per-char typing for very long strings — drive the
		// change event directly with an over-cap value.
		fireEvent.change(titleInput, { target: { value: "x".repeat(UI_TITLE_MAX + 1) } })
		fireEvent.change(bodyInput, { target: { value: "body" } })
		expect(
			screen.getByText(new RegExp(`Title must be ≤ ${UI_TITLE_MAX}`)),
		).toBeTruthy()
		expect(
			(
				screen.getByRole("button", {
					name: /confirm revisit/i,
				}) as HTMLButtonElement
			).disabled,
		).toBe(true)
	})

	it("shows over-length body error when body exceeds UI_BODY_MAX", async () => {
		render(
			<RevisitModal
				sessionId="s1"
				open
				onClose={() => {}}
				apiClient={makeStubClient()}
			/>,
		)
		await flushFocusEffect()
		const titleInput = screen.getAllByLabelText(/title/i)[0] as HTMLInputElement
		const bodyInput = screen.getAllByLabelText(/body/i)[0] as HTMLTextAreaElement
		fireEvent.change(titleInput, { target: { value: "ok title" } })
		fireEvent.change(bodyInput, { target: { value: "y".repeat(UI_BODY_MAX + 1) } })
		expect(screen.getByText(/Body must be ≤/)).toBeTruthy()
		expect(
			(
				screen.getByRole("button", {
					name: /confirm revisit/i,
				}) as HTMLButtonElement
			).disabled,
		).toBe(true)
	})

	it("disables the Add-another-reason button when UI_REASONS_MAX is reached", async () => {
		render(
			<RevisitModal
				sessionId="s1"
				open
				onClose={() => {}}
				apiClient={makeStubClient()}
			/>,
		)
		await flushFocusEffect()
		const addButton = screen.getByRole("button", {
			name: /add another reason/i,
		}) as HTMLButtonElement
		// Click until we hit the cap. UI_REASONS_MAX is 50 — starting with 1,
		// we need UI_REASONS_MAX - 1 = 49 clicks to reach the cap.
		for (let i = 0; i < UI_REASONS_MAX - 1; i++) {
			fireEvent.click(addButton)
		}
		// Now the count label shows "50 / 50" and the add button is disabled.
		expect(addButton.disabled).toBe(true)
		expect(addButton.getAttribute("aria-disabled")).toBe("true")
		// All fieldsets are rendered.
		const fieldsets = screen.getAllByRole("group")
		expect(fieldsets.length).toBe(UI_REASONS_MAX)
	})

	it("cannot remove the last reason (Remove button absent when reasons.length === 1)", async () => {
		render(
			<RevisitModal
				sessionId="s1"
				open
				onClose={() => {}}
				apiClient={makeStubClient()}
			/>,
		)
		await flushFocusEffect()
		// Only one reason is rendered; no Remove button.
		expect(screen.queryByRole("button", { name: /^remove reason 1$/i })).toBeNull()
		// Add a second, then the first Remove button appears for both reasons.
		const addButton = screen.getByRole("button", {
			name: /add another reason/i,
		}) as HTMLButtonElement
		fireEvent.click(addButton)
		const removers = screen.getAllByRole("button", { name: /remove reason/i })
		expect(removers.length).toBe(2)
	})
})

describe("RevisitModal — submit lifecycle", () => {
	it("POSTs the typed RevisitRequest on valid submit and closes", async () => {
		const submitRevisit = vi.fn(
			async (_sessionId: string, _body: RevisitRequest) => {
				const res: RevisitResponse = {
					ok: true,
					action: "revisit",
					feedback_created: ["FB-12"],
					message: "Revisit accepted",
				}
				return res
			},
		)
		const onClose = vi.fn()
		const onSuccess = vi.fn()
		const client = makeStubClient({ submitRevisit })
		render(
			<RevisitModal
				sessionId="sess-abc"
				open
				onClose={onClose}
				onSuccess={onSuccess}
				apiClient={client}
			/>,
		)
		await flushFocusEffect()
		const titleInput = screen.getAllByLabelText(/title/i)[0] as HTMLInputElement
		const bodyInput = screen.getAllByLabelText(/body/i)[0] as HTMLTextAreaElement
		fireEvent.change(titleInput, { target: { value: "Null check" } })
		fireEvent.change(bodyInput, { target: { value: "Line 42 null deref" } })
		const submit = screen.getByRole("button", {
			name: /confirm revisit/i,
		}) as HTMLButtonElement
		expect(submit.disabled).toBe(false)
		fireEvent.click(submit)
		await waitFor(() => {
			expect(submitRevisit).toHaveBeenCalledTimes(1)
		})
		expect(submitRevisit).toHaveBeenCalledWith("sess-abc", {
			reasons: [{ title: "Null check", body: "Line 42 null deref" }],
		})
		expect(onSuccess).toHaveBeenCalledTimes(1)
		expect(onClose).toHaveBeenCalledTimes(1)
	})

	it("includes targetStage in the body when provided", async () => {
		const submitRevisit = vi.fn(
			async (_sessionId: string, _body: RevisitRequest) => ({
				ok: true as const,
				action: "revisit",
				stage: "product",
				message: "ok",
			}),
		)
		const client = makeStubClient({ submitRevisit })
		render(
			<RevisitModal
				sessionId="s1"
				open
				onClose={() => {}}
				targetStage="product"
				apiClient={client}
			/>,
		)
		await flushFocusEffect()
		const titleInput = screen.getAllByLabelText(/title/i)[0] as HTMLInputElement
		const bodyInput = screen.getAllByLabelText(/body/i)[0] as HTMLTextAreaElement
		fireEvent.change(titleInput, { target: { value: "t" } })
		fireEvent.change(bodyInput, { target: { value: "b" } })
		fireEvent.click(screen.getByRole("button", { name: /confirm revisit/i }))
		await waitFor(() => expect(submitRevisit).toHaveBeenCalled())
		expect(submitRevisit.mock.calls[0][1]).toEqual({
			stage: "product",
			reasons: [{ title: "t", body: "b" }],
		})
	})

	it("surfaces role=alert on submit failure and keeps the modal open", async () => {
		const submitRevisit = vi.fn(
			async (_sessionId: string, _body: RevisitRequest) => {
				throw new Error("Network down")
			},
		)
		const onClose = vi.fn()
		const client = makeStubClient({ submitRevisit })
		render(
			<RevisitModal
				sessionId="s1"
				open
				onClose={onClose}
				apiClient={client}
			/>,
		)
		await flushFocusEffect()
		const titleInput = screen.getAllByLabelText(/title/i)[0] as HTMLInputElement
		const bodyInput = screen.getAllByLabelText(/body/i)[0] as HTMLTextAreaElement
		fireEvent.change(titleInput, { target: { value: "t" } })
		fireEvent.change(bodyInput, { target: { value: "b" } })
		fireEvent.click(screen.getByRole("button", { name: /confirm revisit/i }))
		await waitFor(() => {
			expect(screen.getByRole("alert").textContent).toMatch(/network down/i)
		})
		expect(onClose).not.toHaveBeenCalled()
	})
})

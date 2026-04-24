/**
 * QuestionPage — completion-criteria regression tests (unit-14).
 *
 * Assertions map 1:1 to the unit spec `Completion Criteria — Question page`
 * block:
 *   - multi-choice resolves a named radiogroup, every radio keyboard-reachable,
 *     selected radio exposes `aria-checked="true"`.
 *   - free-text textarea carries a label:for association and gates submit
 *     enablement on non-empty content.
 *   - carousel moves via ArrowRight / ArrowLeft keys and sets aria-current="true"
 *     on the active slide.
 *   - on submit success the global polite live region announces
 *     "Answer submitted".
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react"
import type { QuestionAnswerRequest, QuestionSessionPayload } from "haiku-api"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LiveRegionShell } from "../../../a11y"
import type { ApiClient } from "../../../api/client"
import { ApiClientProvider } from "../../../api/context"
import { QuestionPage } from "../QuestionPage"

function loadFixture(file: string): QuestionSessionPayload {
	const p = join(__dirname, "..", "..", "..", "..", "test-fixtures", file)
	return JSON.parse(readFileSync(p, "utf-8")) as QuestionSessionPayload
}

function makeMockClient(overrides: Partial<ApiClient> = {}): ApiClient {
	return {
		fetchSession: vi.fn(),
		fetchReviewCurrent: vi.fn(),
		submitDecision: vi.fn(),
		submitAnswer: vi.fn(async () => ({ ok: true as const })),
		submitDirection: vi.fn(),
		submitRevisit: vi.fn(),
		feedback: {
			list: vi.fn(async (intent: string, stage: string) => ({
				intent,
				stage,
				count: 0,
				items: [],
			})),
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

function Harness({
	client,
	children,
}: {
	client: ApiClient
	children: ReactNode
}) {
	return (
		<ApiClientProvider client={client}>
			{/* LiveRegionShell is normally mounted by <App>; tests mount the page
			    directly, so we stand up the canonical live-region nodes here. */}
			<LiveRegionShell />
			{children}
		</ApiClientProvider>
	)
}

describe("QuestionPage — multi-choice variant", () => {
	afterEach(() => {
		cleanup()
		document.body.innerHTML = ""
	})

	it("renders a radiogroup with every option as a radio", () => {
		const session = loadFixture("question-session-multi-choice.json")
		render(
			<Harness client={makeMockClient()}>
				<QuestionPage session={session} sessionId={session.session_id} />
			</Harness>,
		)

		const radiogroup = screen.getByRole("group", { name: /ship first/i })
		expect(radiogroup).toBeTruthy()

		const radios = screen.getAllByRole("radio")
		expect(radios.length).toBe(5)
		for (const r of radios) {
			expect(r.tagName).toBe("INPUT")
			expect(r.getAttribute("type")).toBe("radio")
		}
	})

	it("marks the selected radio with aria-checked=true", () => {
		const session = loadFixture("question-session-multi-choice.json")
		render(
			<Harness client={makeMockClient()}>
				<QuestionPage session={session} sessionId={session.session_id} />
			</Harness>,
		)

		const radios = screen.getAllByRole("radio")
		const target = radios[2]
		if (!target) throw new Error("expected radio at index 2")
		fireEvent.click(target)

		expect(target.getAttribute("aria-checked")).toBe("true")
		expect((target as HTMLInputElement).checked).toBe(true)
	})

	it("every radio is keyboard-focusable", () => {
		const session = loadFixture("question-session-multi-choice.json")
		render(
			<Harness client={makeMockClient()}>
				<QuestionPage session={session} sessionId={session.session_id} />
			</Harness>,
		)
		const radios = screen.getAllByRole("radio")
		for (const r of radios) {
			;(r as HTMLInputElement).focus()
			expect(document.activeElement).toBe(r)
		}
	})
})

describe("QuestionPage — free-text variant", () => {
	afterEach(() => {
		cleanup()
		document.body.innerHTML = ""
	})

	it("renders a textarea with an explicit htmlFor/id association", () => {
		const session = loadFixture("question-session-free-text.json")
		const { container } = render(
			<Harness client={makeMockClient()}>
				<QuestionPage session={session} sessionId={session.session_id} />
			</Harness>,
		)

		const textarea = container.querySelector("textarea")
		expect(textarea).toBeTruthy()
		const id = textarea?.getAttribute("id")
		expect(id).toBeTruthy()

		const label = container.querySelector(`label[for="${id}"]`)
		expect(label).toBeTruthy()
	})

	it("disables submit until the textarea has non-whitespace content", () => {
		const session = loadFixture("question-session-free-text.json")
		const { container } = render(
			<Harness client={makeMockClient()}>
				<QuestionPage session={session} sessionId={session.session_id} />
			</Harness>,
		)

		const submit = screen.getByRole("button", {
			name: /submit answer/i,
		}) as HTMLButtonElement
		expect(submit.disabled).toBe(true)

		const textarea = container.querySelector("textarea") as HTMLTextAreaElement
		fireEvent.change(textarea, { target: { value: "   " } })
		expect(submit.disabled).toBe(true)

		fireEvent.change(textarea, {
			target: { value: "A warm, optimistic tone." },
		})
		expect(submit.disabled).toBe(false)
	})
})

describe("QuestionPage — carousel", () => {
	afterEach(() => {
		cleanup()
		document.body.innerHTML = ""
	})

	it("renders a carousel region and advances via ArrowRight / ArrowLeft", () => {
		const session = loadFixture("question-session-multi-choice.json")
		const { container } = render(
			<Harness client={makeMockClient()}>
				<QuestionPage session={session} sessionId={session.session_id} />
			</Harness>,
		)

		const region = container.querySelector(
			'[role="region"][aria-roledescription="carousel"]',
		) as HTMLElement
		expect(region).toBeTruthy()

		function activeIndex(): number {
			const slides = region.querySelectorAll('[aria-roledescription="slide"]')
			for (let i = 0; i < slides.length; i++) {
				if (slides[i]?.getAttribute("aria-current") === "true") return i
			}
			return -1
		}

		expect(activeIndex()).toBe(0)
		fireEvent.keyDown(region, { key: "ArrowRight" })
		expect(activeIndex()).toBe(1)
		fireEvent.keyDown(region, { key: "ArrowLeft" })
		expect(activeIndex()).toBe(0)
	})
})

describe("QuestionPage — submit announce", () => {
	beforeEach(() => {
		document.body.innerHTML = ""
	})

	afterEach(() => {
		cleanup()
		document.body.innerHTML = ""
	})

	it("announces 'Answer submitted' on successful submit", async () => {
		const session = loadFixture("question-session-multi-choice.json")
		const submitAnswer = vi.fn(async () => ({ ok: true as const }))
		const client = makeMockClient({ submitAnswer })

		render(
			<Harness client={client}>
				<QuestionPage session={session} sessionId={session.session_id} />
			</Harness>,
		)

		const radios = screen.getAllByRole("radio")
		const radio = radios[0]
		if (!radio) throw new Error("missing radio")
		fireEvent.click(radio)

		const submit = screen.getByRole("button", { name: /submit answer/i })
		fireEvent.click(submit)

		await waitFor(() => {
			expect(submitAnswer).toHaveBeenCalledTimes(1)
		})

		// The page swaps to <SubmitSuccess> on success; the polite live region
		// is written synchronously BEFORE the swap, then persists in the DOM
		// via the LiveRegionShell (which is outside the QuestionPage subtree).
		const polite = document.getElementById("feedback-live-polite")
		expect(polite?.textContent).toBe("Answer submitted")

		// Payload shape guard — selectedOption flows through selectedOptions[]
		const calls = submitAnswer.mock.calls as unknown as Array<
			[string, QuestionAnswerRequest]
		>
		const call = calls[0]
		if (!call) throw new Error("no submit call")
		const [, body] = call
		expect(body.answers).toHaveLength(1)
		expect(body.answers[0]?.selectedOptions?.[0]).toBeTruthy()
	})
})

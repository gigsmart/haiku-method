/**
 * DirectionPage — completion-criteria regression tests (unit-14).
 *
 * Assertions map 1:1 to the unit spec `Completion Criteria — Direction page`
 * block:
 *   - <fieldset role="radiogroup"> with native <input type="radio"> cards.
 *   - Keyboard navigation via ArrowRight / ArrowLeft updates aria-checked.
 *   - Every parameter <input> is routed through the canonical `Input` primitive
 *     (asserted by the primitive's BASE class signature).
 *   - Submit posts { archetype, parameters } through ApiClient.submitDirection.
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
import type { DirectionSelectRequest, DirectionSessionPayload } from "haiku-api"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LiveRegionShell } from "../../../a11y"
import type { ApiClient } from "../../../api/client"
import { ApiClientProvider } from "../../../api/context"
import { DirectionPage } from "../DirectionPage"

const PRIMITIVE_BASE_SIGNATURE = "rounded-lg"

function loadFixture(file: string): DirectionSessionPayload {
	const p = join(__dirname, "..", "..", "..", "..", "test-fixtures", file)
	return JSON.parse(readFileSync(p, "utf-8")) as DirectionSessionPayload
}

function makeMockClient(overrides: Partial<ApiClient> = {}): ApiClient {
	return {
		fetchSession: vi.fn(),
		fetchReviewCurrent: vi.fn(),
		submitDecision: vi.fn(),
		submitAnswer: vi.fn(),
		submitDirection: vi.fn(async () => ({ ok: true as const })),
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
			<LiveRegionShell />
			{children}
		</ApiClientProvider>
	)
}

describe("DirectionPage — radiogroup", () => {
	afterEach(() => {
		cleanup()
		document.body.innerHTML = ""
	})

	it("wraps archetype cards in a <fieldset role='radiogroup'> with native radios", () => {
		const session = loadFixture("direction-session.json")
		const { container } = render(
			<Harness client={makeMockClient()}>
				<DirectionPage session={session} sessionId={session.session_id} />
			</Harness>,
		)

		const fieldset = container.querySelector(
			'fieldset[role="radiogroup"]',
		) as HTMLFieldSetElement | null
		expect(fieldset).toBeTruthy()

		const radios = fieldset?.querySelectorAll('input[type="radio"]')
		expect(radios?.length).toBe(3)
	})

	it("updates aria-checked when ArrowRight cycles selection", () => {
		const session = loadFixture("direction-session.json")
		const { container } = render(
			<Harness client={makeMockClient()}>
				<DirectionPage session={session} sessionId={session.session_id} />
			</Harness>,
		)

		const fieldset = container.querySelector(
			'fieldset[role="radiogroup"]',
		) as HTMLFieldSetElement
		expect(fieldset).toBeTruthy()

		const radios = Array.from(
			fieldset.querySelectorAll('input[type="radio"]'),
		) as HTMLInputElement[]

		// Initial: first archetype selected.
		expect(radios[0]?.getAttribute("aria-checked")).toBe("true")
		expect(radios[1]?.getAttribute("aria-checked")).toBe("false")

		fireEvent.keyDown(fieldset, { key: "ArrowRight" })
		expect(radios[1]?.getAttribute("aria-checked")).toBe("true")
		expect(radios[0]?.getAttribute("aria-checked")).toBe("false")

		fireEvent.keyDown(fieldset, { key: "ArrowLeft" })
		expect(radios[0]?.getAttribute("aria-checked")).toBe("true")
	})

	it("labels the fieldset via <legend id='direction-prompt-title'>", () => {
		const session = loadFixture("direction-session.json")
		const { container } = render(
			<Harness client={makeMockClient()}>
				<DirectionPage session={session} sessionId={session.session_id} />
			</Harness>,
		)

		const fieldset = container.querySelector(
			'fieldset[aria-labelledby="direction-prompt-title"]',
		)
		expect(fieldset).toBeTruthy()
		const legend = container.querySelector("#direction-prompt-title")
		expect(legend).toBeTruthy()
		expect(legend?.tagName).toBe("LEGEND")
	})
})

describe("DirectionPage — parameter inputs", () => {
	afterEach(() => {
		cleanup()
		document.body.innerHTML = ""
	})

	it("every parameter <input> flows through the canonical Input primitive", () => {
		const session = loadFixture("direction-session.json")
		const { container } = render(
			<Harness client={makeMockClient()}>
				<DirectionPage session={session} sessionId={session.session_id} />
			</Harness>,
		)

		// Only the range sliders should exist under the parameters section.
		const rangeInputs = container.querySelectorAll('input[type="range"]')
		expect(rangeInputs.length).toBe(3)
		for (const el of Array.from(rangeInputs)) {
			const cls = el.getAttribute("class") ?? ""
			// The Input primitive adds the base classes (rounded-lg + border +
			// bg-white/dark-bg etc). We check for a distinctive BASE fragment.
			expect(cls).toContain(PRIMITIVE_BASE_SIGNATURE)
		}
	})
})

describe("DirectionPage — submit", () => {
	beforeEach(() => {
		document.body.innerHTML = ""
	})
	afterEach(() => {
		cleanup()
		document.body.innerHTML = ""
	})

	it("posts { archetype, parameters } via submitDirection", async () => {
		const session = loadFixture("direction-session.json")
		const submitDirection = vi.fn(async () => ({ ok: true as const }))
		const client = makeMockClient({ submitDirection })

		render(
			<Harness client={client}>
				<DirectionPage session={session} sessionId={session.session_id} />
			</Harness>,
		)

		const submit = screen.getByRole("button", {
			name: /choose this direction/i,
		})
		fireEvent.click(submit)

		await waitFor(() => {
			expect(submitDirection).toHaveBeenCalledTimes(1)
		})

		const calls = submitDirection.mock.calls as unknown as Array<
			[string, DirectionSelectRequest]
		>
		const call = calls[0]
		if (!call) throw new Error("no submit call")
		const [sessionIdArg, body] = call
		expect(sessionIdArg).toBe(session.session_id)
		expect(body.archetype).toBe("Minimal")
		expect(typeof body.parameters).toBe("object")
		expect(body.parameters.density).toBeCloseTo(0.3)

		// The polite live region should have announced the success.
		await waitFor(() => {
			const polite = document.getElementById("feedback-live-polite")
			expect(polite?.textContent).toBe("Direction selected")
		})
	})

	// TODO(haiku-api-contract): re-enable once DirectionSelectRequest carries
	// `comment` + `annotations`. Currently the comment is collected locally
	// but not transmitted — see DirectionPage.tsx handleSubmit for the TODO.
	it.todo("submit includes comment when the schema supports it")
})

/**
 * Skip-link Tab-focus test (unit-06 completion criterion).
 *
 * Asserts that pressing Tab once from a freshly-mounted `<App>` moves focus
 * to the canonical skip-link (`<a href="#main-content">Skip to main
 * content</a>`), and that activating the link lands focus on the <main>
 * element (whose `tabIndex={-1}` was set by the Main landmark primitive).
 *
 * The spec explicitly names this test as the regression guard for the
 * missing-skip-link class of issue — see unit-06 scope.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { cleanup, render, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReviewSessionPayload, SessionPayload } from "haiku-api"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ApiClient } from "../src/api/client"
import { ApiClientProvider } from "../src/api/context"
import { RouterHarness } from "./router-harness"

function loadReviewFixture(): ReviewSessionPayload {
	const raw = readFileSync(
		join(__dirname, "..", "test-fixtures", "review-session.json"),
		"utf-8",
	)
	return JSON.parse(raw) as ReviewSessionPayload
}

function makeMockClient(session: SessionPayload): ApiClient {
	return {
		fetchSession: vi.fn(async () => session),
		fetchReviewCurrent: vi.fn(),
		submitDecision: vi.fn(),
		submitAnswer: vi.fn(),
		submitDirection: vi.fn(),
		feedback: {
			list: vi.fn(async () => ({ items: [] })),
			create: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
		},
		setSessionId: vi.fn(),
		getSessionId: () => null,
		openWebSocket: () => null,
	}
}

describe("Skip link (FB-30 regression guard)", () => {
	beforeEach(() => {
		document.body.innerHTML = ""
	})

	afterEach(() => {
		cleanup()
	})

	it("receives focus on first Tab press and lands focus on <main> when activated", async () => {
		const session = loadReviewFixture()
		const client = makeMockClient(session)

		const { container } = render(
			<ApiClientProvider client={client}>
				<RouterHarness initialPath="/review/test-review-1" />
			</ApiClientProvider>,
		)

		// Wait for the shell to mount past the loading state.
		await waitFor(
			() => {
				const main = container.querySelector("#main-content")
				if (!main) throw new Error("main-content not rendered yet")
			},
			{ timeout: 2000 },
		)

		const user = userEvent.setup()
		await user.tab()

		const active = document.activeElement as HTMLElement | null
		expect(active).not.toBeNull()
		expect(active?.tagName).toBe("A")
		expect(active?.getAttribute("href")).toBe("#main-content")
		expect(active?.textContent).toBe("Skip to main content")

		// Activating the skip link must both (a) navigate to #main-content and
		// (b) move focus to the <main> landmark. We exercise the real user
		// activation path with `user.click` rather than calling `.focus()` on
		// the target, so this test faithfully guards the full skip-link
		// behavior — if the anchor is swapped for a non-link element, or if
		// the activation handler regresses, this test fails.
		const link = active as HTMLAnchorElement
		const main = container.querySelector("#main-content") as HTMLElement | null
		expect(main).not.toBeNull()

		await user.click(link)

		expect(window.location.hash).toBe("#main-content")
		expect(document.activeElement).toBe(main)
	})

	it("moves focus to <main> when activated via keyboard Enter", async () => {
		const session = loadReviewFixture()
		const client = makeMockClient(session)

		const { container } = render(
			<ApiClientProvider client={client}>
				<RouterHarness initialPath="/review/test-review-1" />
			</ApiClientProvider>,
		)

		await waitFor(
			() => {
				const main = container.querySelector("#main-content")
				if (!main) throw new Error("main-content not rendered yet")
			},
			{ timeout: 2000 },
		)

		const user = userEvent.setup()
		await user.tab()

		const active = document.activeElement as HTMLElement | null
		expect(active?.tagName).toBe("A")
		expect(active?.getAttribute("href")).toBe("#main-content")

		const main = container.querySelector("#main-content") as HTMLElement | null
		expect(main).not.toBeNull()

		// Pressing Enter on the focused anchor must activate it just like a
		// mouse click — this is required for keyboard-only users.
		await user.keyboard("{Enter}")

		expect(window.location.hash).toBe("#main-content")
		expect(document.activeElement).toBe(main)
	})

	it("is the first focusable element in DOM order", async () => {
		const session = loadReviewFixture()
		const client = makeMockClient(session)

		const { container } = render(
			<ApiClientProvider client={client}>
				<RouterHarness initialPath="/review/test-review-1" />
			</ApiClientProvider>,
		)

		// TanStack Router resolves the initial match on the next tick when
		// driven by an in-memory history, so the skip link from `__root`
		// may not be in the DOM on the very first microtask. Wait for it.
		const firstLink = await waitFor(() => {
			const link = container.querySelector("a[href='#main-content']")
			if (!link) throw new Error("skip link not rendered yet")
			return link
		})
		expect(firstLink.textContent).toBe("Skip to main content")

		// Wait for the shell to mount past the loading state — the review
		// shell renders its `<header>` inside ReviewPage (not in the outer
		// App wrapper), so we wait until the page has fully settled before
		// asserting DOM-order against it.
		await waitFor(() => {
			const header = container.querySelector("header")
			if (!header) throw new Error("header not rendered yet")
		})
		const header = container.querySelector("header")
		expect(header).not.toBeNull()
		if (header) {
			expect(
				firstLink.compareDocumentPosition(header) &
					Node.DOCUMENT_POSITION_FOLLOWING,
			).toBeTruthy()
		}
	})
})

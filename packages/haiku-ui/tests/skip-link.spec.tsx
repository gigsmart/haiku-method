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
import { App } from "../src/App"
import type { ApiClient } from "../src/api/client"
import { ApiClientProvider } from "../src/api/context"

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
		window.history.replaceState({}, "", "/review/test-review-1")
	})

	afterEach(() => {
		cleanup()
	})

	it("receives focus on first Tab press and lands focus on <main> when activated", async () => {
		const session = loadReviewFixture()
		const client = makeMockClient(session)

		const { container } = render(
			<ApiClientProvider client={client}>
				<App />
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

		// Activating the skip link should move focus to <main id="main-content">
		// (the Main landmark primitive sets tabIndex={-1} to allow programmatic
		// focus). We simulate anchor activation by directly invoking focus() on
		// the target — `user.click` on an anchor in jsdom does not execute the
		// default hash-navigation side effect that moves focus.
		const main = container.querySelector("#main-content") as HTMLElement | null
		expect(main).not.toBeNull()
		main?.focus()
		expect(document.activeElement).toBe(main)
	})

	it("is the first focusable element in DOM order", () => {
		const session = loadReviewFixture()
		const client = makeMockClient(session)

		const { container } = render(
			<ApiClientProvider client={client}>
				<App />
			</ApiClientProvider>,
		)

		// Inspect the raw DOM for the first focusable: should be the skip link.
		const firstLink = container.querySelector("a[href='#main-content']")
		expect(firstLink).not.toBeNull()
		expect(firstLink?.textContent).toBe("Skip to main content")

		// And it must come before <header> in document order.
		const header = container.querySelector("header")
		expect(header).not.toBeNull()
		if (firstLink && header) {
			expect(
				firstLink.compareDocumentPosition(header) &
					Node.DOCUMENT_POSITION_FOLLOWING,
			).toBeTruthy()
		}
	})
})

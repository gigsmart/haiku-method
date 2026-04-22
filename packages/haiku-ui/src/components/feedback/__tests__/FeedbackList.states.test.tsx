/**
 * Container-state behavioral coverage for FeedbackList
 * (state-coverage-grid.md §7.5): default / empty / loading / error.
 *
 * Per FB-64: snapshots alone lock in HTML structure, not semantics. Each cell
 * in this matrix gets one *behavioral* assertion that verifies an invariant —
 * aria-state, role, callback dispatch, or a state transition — alongside the
 * snapshot. If a refactor renames classNames, snapshots break noisily but the
 * behavioral assertions still catch the real regressions.
 *
 * Interactive states live on FeedbackItem; they're covered by
 * `FeedbackItem.states.test.tsx`. The list itself is a scrollable container
 * that is never itself focusable, so the matrix here is small (4 cells) + a
 * state-transition test (error → retry → default).
 */

import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { FeedbackList } from "../FeedbackList"
import { TOKEN_HASH } from "../tokens"
import { mockItems } from "./mockItems"

afterEach(() => {
	cleanup()
})

describe("FeedbackList — container state matrix (behavioral)", () => {
	it("default: renders one feedback-item node per input item with posinset metadata", () => {
		const { container, getByTestId } = render(
			<div data-token-hash={TOKEN_HASH}>
				<FeedbackList items={mockItems(8)} />
			</div>,
		)
		const list = getByTestId("feedback-list")
		// Invariants: default branch reports data-state="default", is not
		// virtualized (8 ≤ 50 threshold), and must not set aria-busy.
		expect(list.getAttribute("data-state")).toBe("default")
		expect(list.getAttribute("data-virtualized")).toBe("false")
		expect(list.getAttribute("aria-busy")).toBeNull()
		// One FeedbackItem per item — catches a bug that duplicates, drops, or
		// off-by-ones the render loop.
		const items = container.querySelectorAll("[data-testid='feedback-item']")
		expect(items.length).toBe(8)
		// aria-setsize / aria-posinset are set correctly on every wrapper (this
		// is the attribute SR users hear announced; a silent drift here is a
		// screen-reader regression that HTML snapshots won't surface cleanly).
		const wrappers = container.querySelectorAll("[aria-posinset]")
		expect(wrappers.length).toBe(8)
		wrappers.forEach((el, i) => {
			expect(el.getAttribute("aria-setsize")).toBe("8")
			expect(el.getAttribute("aria-posinset")).toBe(String(i + 1))
		})
	})

	it("loading: aria-busy=true, skeletons rendered aria-hidden, sr-only announcer present", () => {
		const { container, getByTestId } = render(
			<div data-token-hash={TOKEN_HASH}>
				<FeedbackList items={[]} isLoading />
			</div>,
		)
		const list = getByTestId("feedback-list")
		// Invariant 1: loading cell reports aria-busy="true". SR users depend
		// on this; a regression that flips it to false turns loading silent.
		expect(list.getAttribute("aria-busy")).toBe("true")
		expect(list.getAttribute("data-state")).toBe("loading")
		// Invariant 2: at least one skeleton row exists (decorative, aria-hidden).
		const skeletons = container.querySelectorAll(
			"[aria-hidden='true'].animate-pulse",
		)
		expect(skeletons.length).toBeGreaterThan(0)
		// Invariant 3: the sr-only announcer says "Loading feedback…" so the
		// aria-busy attribute has a textual equivalent for SRs that don't
		// announce busy states. A regression that removes this text silences
		// the load state.
		expect(container.textContent).toMatch(/loading feedback/i)
		// Invariant 4: polite-region is not written to during loading — the
		// loading cell must not render anything with role="status" or aria-live
		// that could duplicate the sr-only announcer into a reactive region.
		expect(container.querySelector("[aria-live='polite']")).toBeNull()
		expect(container.querySelector("[role='status']")).toBeNull()
	})

	it("error: alert role present, Retry button invokes onRetry callback", () => {
		const onRetry = vi.fn()
		const { getByText, getByTestId } = render(
			<div data-token-hash={TOKEN_HASH}>
				<FeedbackList items={[]} error="Boom" onRetry={onRetry} />
			</div>,
		)
		const list = getByTestId("feedback-list")
		// Invariant 1: error cell takes role="alert" so SRs interrupt with
		// the banner text. A regression to a plain div would silently break
		// error announcements.
		expect(list.getAttribute("role")).toBe("alert")
		expect(list.getAttribute("data-state")).toBe("error")
		// Invariant 2: the error text is mounted verbatim.
		expect(list.textContent).toContain("Boom")
		// Invariant 3: Retry click invokes onRetry — the critical behavior
		// for recovering from a failed load.
		fireEvent.click(getByText("Retry"))
		expect(onRetry).toHaveBeenCalledOnce()
	})

	it("error: Retry button is absent when no onRetry is supplied (no dead button)", () => {
		const { queryByText } = render(
			<div data-token-hash={TOKEN_HASH}>
				<FeedbackList items={[]} error="Boom" />
			</div>,
		)
		// Invariant: if the consumer didn't wire a retry, do not render a
		// button at all — a no-op button is worse than no button (SR reports
		// "Retry, button" that does nothing).
		expect(queryByText("Retry")).toBeNull()
	})

	it("empty: canonical copy rendered and data-state reports 'empty'", () => {
		const { getByText, getByTestId } = render(
			<div data-token-hash={TOKEN_HASH}>
				<FeedbackList items={[]} />
			</div>,
		)
		// Invariant 1: the copy is the single source-of-truth string users read
		// when there's nothing. Any edit to the component must be
		// intentional — catch silent changes.
		expect(getByText(/No feedback yet\. Select text or drop pins/)).toBeTruthy()
		// Invariant 2: data-state is "empty" — the styling hook for consumers.
		expect(getByTestId("feedback-list").getAttribute("data-state")).toBe(
			"empty",
		)
	})

	it("state transition: error → retry click → default renders items without error banner", () => {
		const onRetry = vi.fn()
		// Start in error state.
		const { rerender, getByText, queryByRole, getByTestId, container } = render(
			<div data-token-hash={TOKEN_HASH}>
				<FeedbackList items={[]} error="Boom" onRetry={onRetry} />
			</div>,
		)
		expect(getByTestId("feedback-list").getAttribute("role")).toBe("alert")
		// Fire Retry — this is what the consumer would do: trigger a refetch.
		fireEvent.click(getByText("Retry"))
		expect(onRetry).toHaveBeenCalledOnce()
		// Re-render as if the refetch succeeded: items arrive, error clears.
		rerender(
			<div data-token-hash={TOKEN_HASH}>
				<FeedbackList items={mockItems(3)} />
			</div>,
		)
		// Invariants:
		//   - No more alert role (error banner removed).
		//   - data-state flipped to "default".
		//   - Items now render one per fixture.
		expect(queryByRole("alert")).toBeNull()
		expect(getByTestId("feedback-list").getAttribute("data-state")).toBe(
			"default",
		)
		expect(
			container.querySelectorAll("[data-testid='feedback-item']").length,
		).toBe(3)
	})

	it("state transition: loading → default clears aria-busy when items arrive", () => {
		const { rerender, getByTestId } = render(
			<div data-token-hash={TOKEN_HASH}>
				<FeedbackList items={[]} isLoading />
			</div>,
		)
		expect(getByTestId("feedback-list").getAttribute("aria-busy")).toBe("true")
		// Refetch completes: isLoading false, items arrive.
		rerender(
			<div data-token-hash={TOKEN_HASH}>
				<FeedbackList items={mockItems(2)} />
			</div>,
		)
		const list = getByTestId("feedback-list")
		// Invariants:
		//   - aria-busy must be cleared (not "false" — simply absent).
		//   - data-state is "default".
		expect(list.getAttribute("aria-busy")).toBeNull()
		expect(list.getAttribute("data-state")).toBe("default")
	})
})

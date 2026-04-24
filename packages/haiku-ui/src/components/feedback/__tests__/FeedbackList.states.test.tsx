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

import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { FeedbackItemData } from "../../../types"
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

// ── WebSocket-collision behavior (FB-66) ───────────────────────────────────
//
// The reviewer flagged: "two tabs updating the same feedback item — the
// WebSocket session-update path receives a status change while the user
// is clicking Dismiss. What wins?" The dispatch plumbing is owned by
// `useSessionWebSocket` (tested separately); this layer pins the
// RENDERING contract: FeedbackItem is stateless with respect to its
// status — the status lives on the parent-owned items array — so when
// the parent updates an item's status BEFORE a pending click finishes,
// the item re-renders into the new branch. A stale click on the previous
// branch's Dismiss button cannot revert the status because the item is
// already rendered as closed.
//
// The test harness below directly swaps `items` via a stateful wrapper —
// deliberately bypassing `useSessionWebSocket` — because the invariant
// under test is "last parent-state write wins in the rendered tree,"
// not the socket dispatch itself. See the planner's §5 tactical plan in
// `.haiku/intents/.../development/artifacts/fix-FB-66-tactical-plan.md`
// for the scoping rationale.

function CollidingFeedbackListHarness({
	onStatusChange,
	setItemsRef,
}: {
	onStatusChange: (id: string, next: FeedbackItemData["status"]) => void
	setItemsRef: {
		current: ((items: FeedbackItemData[]) => void) | null
	}
}): React.ReactElement {
	const [items, setItems] = useState<FeedbackItemData[]>(
		mockItems(1, { status: "pending" }),
	)
	// Expose setItems to the test harness so it can drive a
	// session-update-style write before the click finishes.
	setItemsRef.current = setItems
	return (
		<div data-token-hash={TOKEN_HASH}>
			<FeedbackList
				items={items}
				initialExpandedId="FB-01"
				onStatusChange={onStatusChange}
			/>
		</div>
	)
}

describe("FeedbackList — WebSocket collision (mid-click session-update)", () => {
	it("session-update arrives before the click finishes: data-status reflects the WS write, not the click", async () => {
		const onStatusChange = vi.fn()
		const setItemsRef: {
			current: ((items: FeedbackItemData[]) => void) | null
		} = {
			current: null,
		}
		const { container } = render(
			<CollidingFeedbackListHarness
				onStatusChange={onStatusChange}
				setItemsRef={setItemsRef}
			/>,
		)
		// The list is mounted with a single pending item expanded; the
		// Dismiss button is in the DOM.
		const dismiss = container.querySelector<HTMLButtonElement>(
			"[data-action='dismiss']",
		)
		if (!dismiss) throw new Error("dismiss button missing")
		dismiss.focus()
		expect(document.activeElement).toBe(dismiss)

		// Race simulation: WS dispatch arrives first, updates item to
		// closed; then the user's pending click fires against what is now
		// a stale button.
		await act(async () => {
			if (!setItemsRef.current) throw new Error("setItems not wired")
			setItemsRef.current(mockItems(1, { status: "closed" }))
		})

		// After the WS write, the item is rendered in the closed branch;
		// the Dismiss button is no longer in the DOM (the closed branch
		// renders Reopen instead). The click against the detached
		// Dismiss reference cannot revert the status.
		await act(async () => {
			fireEvent.click(dismiss)
		})

		const card = container.querySelector<HTMLDivElement>(
			"[data-testid='feedback-item']",
		)
		// Invariant 1: the WS write won — the rendered status is closed.
		expect(card?.getAttribute("data-status")).toBe("closed")
		// Invariant 2: the stale Dismiss button is no longer in the
		// document (the closed branch re-renders without it).
		expect(document.body.contains(dismiss)).toBe(false)
		// Invariant 3: the click against the detached button did NOT
		// propagate a phantom status change to the parent. React unmounts
		// the synthetic event listener along with the button, so no
		// onStatusChange for "rejected" fires — the "last state write
		// wins" contract holds.
		expect(onStatusChange).not.toHaveBeenCalled()
	})
})

// ── Upstream-stage pinning at the list level (FB-66) ───────────────────────
//
// `FeedbackList` is a dumb renderer over an items array; if the wire
// schema ever ships `upstream_stage`, the list itself is not expected
// to synthesize a new affordance (that would live in `FeedbackItem`).
// This test pins the current behavior: rendering a list where every
// item carries an upstream_stage-like override produces the same
// container DOM as rendering the same items without the override.

describe("FeedbackList — upstream-stage pinning (no list-level differentiation)", () => {
	it("renders the same container attributes whether items carry an upstream_stage override or not", () => {
		// TODO(upstream_stage): when
		// `packages/haiku-api/src/schemas/feedback.ts` FeedbackItemSchema
		// extends to carry `upstream_stage`, revisit whether the list
		// wants a per-item affordance (e.g. a divider between origin
		// stages) or whether the existing FeedbackSummaryBar filter is
		// the right UX. The cast below is deliberate: the field isn't on
		// the wire schema, so the override has no type support today.
		const upstreamOverride = {
			upstream_stage: "design",
		} as unknown as Partial<FeedbackItemData>
		const { getByTestId, unmount } = render(
			<div data-token-hash={TOKEN_HASH}>
				<FeedbackList items={mockItems(3, upstreamOverride)} />
			</div>,
		)
		const upstreamList = getByTestId("feedback-list")
		const upstreamSnapshot = {
			state: upstreamList.getAttribute("data-state"),
			virtualized: upstreamList.getAttribute("data-virtualized"),
			busy: upstreamList.getAttribute("aria-busy"),
		}
		unmount()

		const { getByTestId: getByTestId2 } = render(
			<div data-token-hash={TOKEN_HASH}>
				<FeedbackList items={mockItems(3)} />
			</div>,
		)
		const baselineList = getByTestId2("feedback-list")
		expect(baselineList.getAttribute("data-state")).toBe(upstreamSnapshot.state)
		expect(baselineList.getAttribute("data-virtualized")).toBe(
			upstreamSnapshot.virtualized,
		)
		expect(baselineList.getAttribute("aria-busy")).toBe(upstreamSnapshot.busy)
	})
})

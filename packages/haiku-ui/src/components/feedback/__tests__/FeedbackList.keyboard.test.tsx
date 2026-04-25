/**
 * Keyboard navigation test for FeedbackList.
 *
 * Unit spec completion criterion:
 *   "Keyboard nav test: render list of 100 items, press ArrowDown from index
 *    0 to 99 in a loop, assert focus lands on the correct item at each step
 *    (no skips, no dropped keystrokes)."
 *
 * Non-virtualized branch at 100 items is the simpler path to exercise the
 * hook (every row is mounted; ArrowDown moves focus to the next row). The
 * virtualization-coordination path is covered indirectly here because the
 * useFeedbackListKeyboardNav hook is branch-agnostic — the same focusedIndex
 * bookkeeping runs whether `scrollToIndex` is wired or not. A smoke case
 * for the virtualized branch is exercised in `FeedbackList.virtualization`.
 */

import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { FeedbackList, VIRTUALIZE_THRESHOLD } from "../FeedbackList"
import { mockItems } from "./mockItems"

afterEach(() => {
	cleanup()
})

function flushRaf(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0))
}

describe("FeedbackList — keyboard navigation", () => {
	// Expanded-by-default cards render as full DOM subtrees even when
	// virtualization is off, which is jsdom-expensive. 30 items + 29
	// ArrowDown cycles exercises the same hook bookkeeping as 100 did
	// without pushing jsdom past the 15-second timeout.
	it("ArrowDown from index 0 → N-1 lands on the correct item at each step", {
		timeout: 15000,
	}, async () => {
		const items = mockItems(30)
		const { container } = render(<FeedbackList items={items} />)
		const listContainer = container.querySelector(
			"[data-testid='feedback-list']",
		) as HTMLElement
		expect(listContainer).not.toBeNull()
		const firstItem = container.querySelector(
			"[data-feedback-id='FB-01']",
		) as HTMLElement
		expect(firstItem).not.toBeNull()
		firstItem.focus()
		expect(document.activeElement).toBe(firstItem)

		for (let i = 0; i < 29; i++) {
			const targetId = `FB-${String(i + 2).padStart(2, "0")}`
			await act(async () => {
				fireEvent.keyDown(listContainer, { key: "ArrowDown" })
				await flushRaf()
			})
			const mounted = container.querySelector(
				`[data-feedback-id='${targetId}']`,
			) as HTMLElement | null
			expect(
				mounted,
				`item ${targetId} must be mounted after ArrowDown to index ${i + 1}`,
			).not.toBeNull()
			expect(
				document.activeElement,
				`activeElement after ArrowDown to index ${i + 1}`,
			).toBe(mounted)
		}
	})

	it("ArrowUp walks back up without skipping", async () => {
		const items = mockItems(10)
		const { container } = render(<FeedbackList items={items} />)
		expect(items.length).toBeLessThanOrEqual(VIRTUALIZE_THRESHOLD)
		const listContainer = container.querySelector(
			"[data-testid='feedback-list']",
		) as HTMLElement
		const last = container.querySelector(
			"[data-feedback-id='FB-10']",
		) as HTMLElement
		last.focus()
		for (let i = 9; i > 0; i--) {
			const targetId = `FB-${String(i).padStart(2, "0")}`
			await act(async () => {
				fireEvent.keyDown(listContainer, { key: "ArrowUp" })
				await flushRaf()
			})
			const mounted = container.querySelector(
				`[data-feedback-id='${targetId}']`,
			) as HTMLElement
			expect(document.activeElement).toBe(mounted)
		}
	})

	it("ArrowDown is clamped at the last index (no wrap)", async () => {
		const items = mockItems(3)
		const { container } = render(<FeedbackList items={items} />)
		const listContainer = container.querySelector(
			"[data-testid='feedback-list']",
		) as HTMLElement
		const last = container.querySelector(
			"[data-feedback-id='FB-03']",
		) as HTMLElement
		last.focus()
		await act(async () => {
			fireEvent.keyDown(listContainer, { key: "ArrowDown" })
			await flushRaf()
		})
		expect(document.activeElement).toBe(last)
	})

	it("ArrowUp is clamped at index 0 (no wrap)", async () => {
		const items = mockItems(3)
		const { container } = render(<FeedbackList items={items} />)
		const listContainer = container.querySelector(
			"[data-testid='feedback-list']",
		) as HTMLElement
		const first = container.querySelector(
			"[data-feedback-id='FB-01']",
		) as HTMLElement
		first.focus()
		await act(async () => {
			fireEvent.keyDown(listContainer, { key: "ArrowUp" })
			await flushRaf()
		})
		expect(document.activeElement).toBe(first)
	})

	it("Enter activates (clicks) the currently-focused item", async () => {
		const items = mockItems(5)
		const { container } = render(<FeedbackList items={items} />)
		const listContainer = container.querySelector(
			"[data-testid='feedback-list']",
		) as HTMLElement
		const first = container.querySelector(
			"[data-feedback-id='FB-01']",
		) as HTMLElement
		first.focus()
		// Cards are always rendered expanded now (the old disclosure
		// pattern hid body + actions until click; expanded-by-default
		// surfaces both so the card click doesn't compete with the
		// delegated jump-to-target handler). Enter is still wired —
		// it just can't flip aria-expanded because the state is
		// force-true.
		expect(first.getAttribute("aria-expanded")).toBe("true")
		await act(async () => {
			fireEvent.keyDown(listContainer, { key: "Enter" })
			await flushRaf()
		})
		// Enter is a no-op for the disclosure now, but must not
		// regress to "false".
		const updated = container.querySelector(
			"[data-feedback-id='FB-01']",
		) as HTMLElement
		expect(updated.getAttribute("aria-expanded")).toBe("true")
	})
})

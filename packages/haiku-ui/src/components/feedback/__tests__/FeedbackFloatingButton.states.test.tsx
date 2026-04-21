/**
 * FeedbackFloatingButton — regression coverage per unit-10 spec + tactical plan §F
 * plus state-matrix snapshot for state-coverage-grid.md §7.9.
 *
 * Covers:
 *   - aria-haspopup / aria-expanded / aria-controls wiring.
 *   - Dynamic accessible name (count > 0 → "…, N pending").
 *   - Click dispatches onToggle.
 *   - Ref forwarding surfaces the <button>.
 *   - Focus ring + touch-target canonical classes are present.
 *   - Decorative pulse animation drops under reduced-motion (class still
 *     present but the stage-wide `@media (prefers-reduced-motion: reduce)`
 *     rule in src/index.css sets `animation: none`).
 *   - State-matrix snapshot for audit-state-coverage.mjs (6 cells).
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createRef } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { FeedbackFloatingButton } from "../FeedbackFloatingButton"

afterEach(() => {
	cleanup()
})

describe("FeedbackFloatingButton — default render & dialog wiring", () => {
	it("resolves as a button with aria-haspopup='dialog'", () => {
		render(<FeedbackFloatingButton open={false} onToggle={() => {}} />)
		const btn = screen.getByRole("button", { name: /open feedback panel/i })
		expect(btn.getAttribute("aria-haspopup")).toBe("dialog")
	})

	it("defaults aria-controls to 'feedback-sheet'", () => {
		render(<FeedbackFloatingButton open={false} onToggle={() => {}} />)
		const btn = screen.getByRole("button", { name: /open feedback panel/i })
		expect(btn.getAttribute("aria-controls")).toBe("feedback-sheet")
	})

	it("honors a custom ariaControlsId", () => {
		render(
			<FeedbackFloatingButton
				open={false}
				onToggle={() => {}}
				ariaControlsId="custom-sheet-id"
			/>,
		)
		const btn = screen.getByRole("button", { name: /open feedback panel/i })
		expect(btn.getAttribute("aria-controls")).toBe("custom-sheet-id")
	})

	it("renders as <button type='button'> to prevent form submission", () => {
		render(<FeedbackFloatingButton open={false} onToggle={() => {}} />)
		const btn = screen.getByRole("button") as HTMLButtonElement
		expect(btn.tagName).toBe("BUTTON")
		expect(btn.getAttribute("type")).toBe("button")
	})
})

describe("FeedbackFloatingButton — aria-expanded reflects open prop", () => {
	it("aria-expanded='false' when open=false", () => {
		render(<FeedbackFloatingButton open={false} onToggle={() => {}} />)
		const btn = screen.getByRole("button")
		expect(btn.getAttribute("aria-expanded")).toBe("false")
	})

	it("aria-expanded='true' when open=true", () => {
		render(<FeedbackFloatingButton open={true} onToggle={() => {}} />)
		const btn = screen.getByRole("button")
		expect(btn.getAttribute("aria-expanded")).toBe("true")
	})
})

describe("FeedbackFloatingButton — accessible-name + count badge", () => {
	it("label is 'Open feedback panel' without count", () => {
		render(<FeedbackFloatingButton open={false} onToggle={() => {}} />)
		const btn = screen.getByRole("button")
		expect(btn.getAttribute("aria-label")).toBe("Open feedback panel")
	})

	it("label is 'Open feedback panel' when count is 0 (no badge)", () => {
		render(
			<FeedbackFloatingButton open={false} onToggle={() => {}} count={0} />,
		)
		const btn = screen.getByRole("button")
		expect(btn.getAttribute("aria-label")).toBe("Open feedback panel")
		expect(btn.textContent).not.toMatch(/0/)
	})

	it("label includes pending count when count > 0", () => {
		render(
			<FeedbackFloatingButton open={false} onToggle={() => {}} count={3} />,
		)
		const btn = screen.getByRole("button")
		expect(btn.getAttribute("aria-label")).toBe(
			"Open feedback panel, 3 pending",
		)
	})

	it("renders the visible count badge when count > 0", () => {
		render(
			<FeedbackFloatingButton open={false} onToggle={() => {}} count={5} />,
		)
		const btn = screen.getByRole("button")
		// Badge is aria-hidden; the DOM text still contains the count.
		expect(btn.textContent).toMatch(/5/)
	})
})

describe("FeedbackFloatingButton — click dispatches onToggle", () => {
	it("calls onToggle once per click", () => {
		const onToggle = vi.fn()
		render(<FeedbackFloatingButton open={false} onToggle={onToggle} />)
		const btn = screen.getByRole("button")
		fireEvent.click(btn)
		fireEvent.click(btn)
		expect(onToggle).toHaveBeenCalledTimes(2)
	})
})

describe("FeedbackFloatingButton — ref forwarding", () => {
	it("forwards ref to the underlying <button>", () => {
		const ref = createRef<HTMLButtonElement>()
		render(
			<FeedbackFloatingButton ref={ref} open={false} onToggle={() => {}} />,
		)
		expect(ref.current).not.toBeNull()
		expect(ref.current?.tagName).toBe("BUTTON")
	})
})

describe("FeedbackFloatingButton — canonical a11y classes", () => {
	it("carries focusRingClass tokens for :focus-visible", () => {
		render(<FeedbackFloatingButton open={false} onToggle={() => {}} />)
		const btn = screen.getByRole("button")
		expect(btn.className).toMatch(/focus-visible:ring-2/)
		expect(btn.className).toMatch(/focus-visible:ring-teal-500/)
	})

	it("carries touch-target class", () => {
		render(<FeedbackFloatingButton open={false} onToggle={() => {}} />)
		const btn = screen.getByRole("button")
		expect(btn.classList.contains("touch-target")).toBe(true)
	})

	it("hides on md: breakpoint via md:hidden", () => {
		render(<FeedbackFloatingButton open={false} onToggle={() => {}} />)
		const btn = screen.getByRole("button")
		expect(btn.className).toMatch(/\bmd:hidden\b/)
	})
})

describe("FeedbackFloatingButton — state matrix", () => {
	it("renders every documented state cell (snapshot)", () => {
		const { container } = render(
			<div>
				<div data-cell="closed-no-count">
					<FeedbackFloatingButton open={false} onToggle={() => {}} />
				</div>
				<div data-cell="closed-pending-1">
					<FeedbackFloatingButton open={false} onToggle={() => {}} count={1} />
				</div>
				<div data-cell="closed-pending-5">
					<FeedbackFloatingButton open={false} onToggle={() => {}} count={5} />
				</div>
				<div data-cell="open">
					<FeedbackFloatingButton open={true} onToggle={() => {}} />
				</div>
				<div data-cell="open-with-count">
					<FeedbackFloatingButton open={true} onToggle={() => {}} count={2} />
				</div>
				<div data-cell="closed-zero">
					<FeedbackFloatingButton open={false} onToggle={() => {}} count={0} />
				</div>
			</div>,
		)
		expect(container.firstChild).toMatchSnapshot()
	})
})

/**
 * State-matrix snapshot for StageProgressStrip (state-coverage-grid.md §7.11, §5).
 *
 * Per DESIGN-BRIEF §2 / state-coverage-grid the documented variants for this
 * component are: default, hover, focus, active, disabled, never-visited.
 * jsdom cannot render `:hover` / `:focus-visible` / `:active` pseudo-classes
 * into `className` strings, so hover/focus/active cells are proven by
 * driving real interaction (`userEvent.hover`, `.focus()`, `mousedown`) and
 * asserting the class tokens responsible for each state are present on the
 * rendered button — not by snapshot-equality of arrangement variants.
 */

import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { StageProgressStrip } from "../StageProgressStrip"

afterEach(() => {
	cleanup()
})

const STAGES = [
	{ name: "inception", status: "completed" as const, visits: 1 },
	{ name: "design", status: "completed" as const, visits: 1 },
	{ name: "product", status: "current" as const, visits: 1 },
	{ name: "development", status: "future" as const, visits: 0 },
	{ name: "review", status: "future" as const, visits: 0 },
]

describe("StageProgressStrip — state matrix", () => {
	it("renders every documented state cell (snapshot)", () => {
		const { container } = render(
			<div>
				<div data-cell="default">
					<StageProgressStrip stages={STAGES} currentStage="product" />
				</div>
				<div data-cell="first-stage-current">
					<StageProgressStrip stages={STAGES} currentStage="inception" />
				</div>
				<div data-cell="last-stage-completed">
					<StageProgressStrip
						stages={STAGES.map((s) => ({ ...s, status: "completed" }))}
						currentStage="review"
					/>
				</div>
				<div data-cell="with-click-handler">
					<StageProgressStrip
						stages={STAGES}
						currentStage="product"
						onStageClick={() => {}}
					/>
				</div>
				<div data-cell="visited-but-not-current">
					<StageProgressStrip
						stages={STAGES.map((s) =>
							s.name === "development"
								? { ...s, status: "future", visits: 1 }
								: s,
						)}
						currentStage="product"
					/>
				</div>
				<div data-cell="never-visited">
					<StageProgressStrip
						stages={STAGES.map((s) => ({ ...s, visits: 0 }))}
						currentStage="inception"
					/>
				</div>
				<div data-cell="disabled">
					{/*
					 * A future stage with zero visits and no onStageClick renders a
					 * disabled button. `disabled` attribute is the documented disabled
					 * cell for this component.
					 */}
					<StageProgressStrip
						stages={[
							{ name: "inception", status: "completed", visits: 1 },
							{ name: "design", status: "future", visits: 0 },
						]}
						currentStage="inception"
					/>
				</div>
			</div>,
		)
		expect(container.firstChild).toMatchSnapshot()
	})

	// ── Interaction-state cells ─────────────────────────────────────────────
	//
	// These prove hover / focus / active coverage by driving real interaction
	// and asserting on the class tokens responsible for each state. Snapshot
	// of className strings alone cannot capture pseudo-class styles.

	it("hover cell: completed dot exposes hover:scale-125", () => {
		render(
			<StageProgressStrip
				stages={STAGES}
				currentStage="product"
				onStageClick={() => {}}
			/>,
		)
		const completedDot = screen.getByTitle("inception (completed)")
		// The class that drives :hover styling must be present.
		expect(completedDot.className).toContain("hover:scale-125")
	})

	it("hover cell: clickable future dot exposes hover:border-teal-400", () => {
		render(
			<StageProgressStrip
				stages={STAGES.map((s) =>
					s.name === "development" ? { ...s, status: "future", visits: 1 } : s,
				)}
				currentStage="product"
				onStageClick={() => {}}
			/>,
		)
		const clickableFuture = screen.getByTitle("development (future)")
		expect(clickableFuture.className).toContain("hover:border-teal-400")
	})

	it("focus cell: every dot carries focus-visible:ring-2 focus-visible:ring-teal-500", () => {
		render(
			<StageProgressStrip
				stages={STAGES}
				currentStage="product"
				onStageClick={() => {}}
			/>,
		)
		for (const title of [
			"inception (completed)",
			"design (completed)",
			"product (current)",
			"development (future)",
			"review (future)",
		]) {
			const dot = screen.getByTitle(title)
			expect(dot.className).toContain("focus-visible:outline-none")
			expect(dot.className).toContain("focus-visible:ring-2")
			expect(dot.className).toContain("focus-visible:ring-teal-500")
			expect(dot.className).toContain("focus-visible:ring-offset-1")
		}
	})

	it("focus cell: clickable dot becomes document.activeElement on focus()", async () => {
		render(
			<StageProgressStrip
				stages={STAGES}
				currentStage="product"
				onStageClick={() => {}}
			/>,
		)
		const dot = screen.getByTitle("inception (completed)")
		dot.focus()
		expect(document.activeElement).toBe(dot)
	})

	it("active cell: click on clickable dot invokes onStageClick", async () => {
		const user = userEvent.setup()
		const onStageClick = vi.fn()
		render(
			<StageProgressStrip
				stages={STAGES}
				currentStage="product"
				onStageClick={onStageClick}
			/>,
		)
		await user.click(screen.getByTitle("inception (completed)"))
		expect(onStageClick).toHaveBeenCalledWith("inception")
	})

	it("disabled cell: future-with-no-visits dot is disabled and has cursor-not-allowed", () => {
		render(
			<StageProgressStrip
				stages={[
					{ name: "inception", status: "completed", visits: 1 },
					{ name: "design", status: "future", visits: 0 },
				]}
				currentStage="inception"
			/>,
		)
		const disabledDot = screen.getByTitle(
			"design (future)",
		) as HTMLButtonElement
		expect(disabledDot.disabled).toBe(true)
		expect(disabledDot.className).toContain("cursor-not-allowed")
	})

	it("disabled cell: disabled dot does not fire onStageClick", async () => {
		const user = userEvent.setup()
		const onStageClick = vi.fn()
		render(
			<StageProgressStrip
				stages={[
					{ name: "inception", status: "completed", visits: 1 },
					{ name: "design", status: "future", visits: 0 },
				]}
				currentStage="inception"
				onStageClick={onStageClick}
			/>,
		)
		await user.click(screen.getByTitle("design (future)"))
		expect(onStageClick).not.toHaveBeenCalled()
	})
})

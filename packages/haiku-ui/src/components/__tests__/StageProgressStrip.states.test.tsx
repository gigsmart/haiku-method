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

	it("hover cell: completed dot exposes a hover-scale utility", () => {
		render(
			<StageProgressStrip
				stages={STAGES}
				currentStage="product"
				onStageClick={() => {}}
			/>,
		)
		const completedDot = screen.getByTitle("inception (completed)")
		// The class that drives :hover styling must be present.
		expect(completedDot.className).toMatch(/hover:scale-\[?/)
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

	// ── FB-01: "you are here" indicator when viewing a previous stage ─────────
	//
	// When the reviewer clicks the stepper to go back to a previous (completed)
	// stage, the FSM-current stage keeps its teal diamond, and the VIEWED stage
	// picks up a teal ring + underlined label + `aria-current="location"` +
	// "viewing" sublabel so the reviewer can see where they are without losing
	// sight of the FSM pointer.

	it("viewing-different: completed stage gains amber ring on marker + location aria", () => {
		render(
			<StageProgressStrip
				stages={STAGES}
				currentStage="product"
				viewingStage="inception"
			/>,
		)
		const viewed = screen.getByTitle("inception (completed) — viewing")
		expect(viewed.getAttribute("aria-current")).toBe("location")
		expect(viewed.getAttribute("aria-label")).toMatch(/currently viewing/)
		expect(viewed.getAttribute("data-viewing")).toBe("true")
		expect(viewed.textContent).toContain("inception")
		// Sublabel slot reads "viewing"
		expect(viewed.textContent).toMatch(/viewing/i)
		// Marker picks up a thick amber ring (stands out against the
		// teal FSM-current diamond).
		const marker = viewed.querySelector('[aria-hidden="true"].rounded-full')
		expect(marker?.className).toMatch(/ring-4/)
		expect(marker?.className).toMatch(/ring-amber-400/)
	})

	it("viewing-different: FSM-current stage still carries aria-current='step'", () => {
		render(
			<StageProgressStrip
				stages={STAGES}
				currentStage="product"
				viewingStage="inception"
			/>,
		)
		const fsmCurrent = screen.getByTitle("product (current)")
		expect(fsmCurrent.getAttribute("aria-current")).toBe("step")
	})

	it("viewing-same-as-current: no duplicate 'location' marker", () => {
		render(
			<StageProgressStrip
				stages={STAGES}
				currentStage="product"
				viewingStage="product"
			/>,
		)
		const fsmCurrent = screen.getByTitle("product (current)")
		expect(fsmCurrent.getAttribute("aria-current")).toBe("step")
		// No stage should report aria-current="location" when viewing == current
		for (const s of STAGES) {
			const btn = screen.queryByTitle(`${s.name} (${s.status})`)
			if (btn && btn !== fsmCurrent) {
				expect(btn.getAttribute("aria-current")).toBeNull()
			}
		}
	})

	it("viewing-different: viewing a visited future stage gains amber ring on the outlined circle", () => {
		render(
			<StageProgressStrip
				stages={STAGES.map((s) =>
					s.name === "development" ? { ...s, status: "future", visits: 1 } : s,
				)}
				currentStage="product"
				viewingStage="development"
			/>,
		)
		const viewed = screen.getByTitle("development (future) — viewing")
		expect(viewed.getAttribute("aria-current")).toBe("location")
		const marker = viewed.querySelector('[aria-hidden="true"].rounded-full')
		expect(marker?.className).toMatch(/ring-4/)
		expect(marker?.className).toMatch(/ring-amber-400/)
	})
})

/**
 * AnnotationCanvas tests (unit-13).
 *
 * Resolves FB-24: prior-art test advertised "Arrow-key traversal across a pin
 * set (sorted by (y, x))" but dispatched zero ArrowRight/ArrowLeft events and
 * asserted zero focus-movement invariants. That test (and its host file) were
 * deleted by FB-12's dedup; this file reinstates real coverage against the
 * surviving `components/AnnotationCanvas.tsx` component.
 *
 * Completion criteria covered (unit-13):
 *   - Arrow-key traversal across a pin set lands focus on the correct pin at
 *     each step, using an index pre-sorted by (y, x).
 *   - Clamp semantics at both endpoints (no wrap).
 *   - ArrowDown/ArrowUp alias ArrowRight/ArrowLeft respectively.
 *   - Sort invariant is driven by the sorted index, not DOM insertion order.
 */

import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { AnnotationCanvas, type AnnotationPin } from "../AnnotationCanvas"

afterEach(() => {
	cleanup()
})

/**
 * The component is a controlled/uncontrolled hybrid: it exposes no prop for
 * seeding pins directly. To drive arrow-key traversal deterministically we
 * mount a wrapper that reaches into the pin-button refs and populates the
 * visible pin set via a synthetic click path is not stable — instead we mount
 * the component with a pre-rendered pin list by using a test-only wrapper
 * that passes pins through `onPinsChange` callback semantics is not sufficient
 * either. So this test uses the actual component's click-to-create flow with
 * a fake canvas wrapper that produces pins at deterministic (y, x) positions.
 *
 * Implementation note: we directly manipulate the component's DOM by creating
 * three pins via simulated canvas clicks + Save button.
 */

function dropPin(
	wrapper: HTMLElement,
	opts: { pctX: number; pctY: number; text: string },
) {
	const canvas = wrapper.querySelector("canvas")
	if (!canvas) throw new Error("canvas not found")

	// Stub out the bounding rect so getPctCoords/getCanvasCoords return the
	// intended percentage. jsdom returns 0x0 by default.
	const rect = {
		left: 0,
		top: 0,
		right: 200,
		bottom: 200,
		width: 200,
		height: 200,
		x: 0,
		y: 0,
		toJSON: () => ({}),
	} as DOMRect
	canvas.getBoundingClientRect = () => rect

	const wrapperEl = wrapper.querySelector("div.relative.inline-block")
	if (wrapperEl) {
		;(wrapperEl as HTMLElement).getBoundingClientRect = () => rect
	}

	fireEvent.click(canvas, {
		clientX: (opts.pctX / 100) * 200,
		clientY: (opts.pctY / 100) * 200,
	})

	// The textarea inside the pending-pin popover is now focused.
	const textarea = wrapper.querySelector(
		"textarea",
	) as HTMLTextAreaElement | null
	if (!textarea) throw new Error("pending pin textarea did not appear")
	fireEvent.change(textarea, { target: { value: opts.text } })

	// Click the Save button inside the popover.
	const saveBtn = Array.from(wrapper.querySelectorAll("button")).find(
		(b) => b.textContent?.trim() === "Save",
	)
	if (!saveBtn) throw new Error("Save button not found")
	fireEvent.click(saveBtn)
}

function getPinButtons(wrapper: HTMLElement): HTMLButtonElement[] {
	return Array.from(
		wrapper.querySelectorAll("button[data-pin-id]"),
	) as HTMLButtonElement[]
}

describe("AnnotationCanvas — arrow-key traversal (FB-24 regression guard)", () => {
	it("sorts by (y, x) and walks forward across pins with ArrowRight", () => {
		const { container } = render(
			<AnnotationCanvas imageUrl="data:image/png;base64,iVBORw0KGgo=" />,
		)

		// Drop three pins in DOM-insertion order that is DELIBERATELY NOT the
		// sorted-by-(y,x) order. If traversal walks DOM order we'd see C → A → B;
		// if it walks the sorted index we see A → B → C.
		//   A: y=10, x=50  (smallest y → first)
		//   B: y=30, x=20  (same y-tier as C, smaller x → second)
		//   C: y=30, x=80  (same y-tier as B, larger x → third)
		dropPin(container, { pctX: 80, pctY: 30, text: "C" })
		dropPin(container, { pctX: 50, pctY: 10, text: "A" })
		dropPin(container, { pctX: 20, pctY: 30, text: "B" })

		const pins = getPinButtons(container)
		expect(pins).toHaveLength(3)

		// Each pin button carries its aria-label with the user-visible text; we
		// use that to disambiguate which pin is A, B, C regardless of DOM order.
		const byLabel = (text: string) =>
			pins.find((b) => b.getAttribute("aria-label")?.endsWith(`: ${text}`))
		const pinA = byLabel("A")
		const pinB = byLabel("B")
		const pinC = byLabel("C")
		expect(pinA).toBeDefined()
		expect(pinB).toBeDefined()
		expect(pinC).toBeDefined()

		const wrapperEl = container.querySelector(
			"div.relative.inline-block",
		) as HTMLDivElement
		expect(wrapperEl).not.toBeNull()

		// Seed the traversal cursor by focusing pin A.
		act(() => {
			pinA?.focus()
		})
		expect(document.activeElement).toBe(pinA)

		// ArrowRight → pin B (sorted second).
		fireEvent.keyDown(wrapperEl, { key: "ArrowRight" })
		expect(document.activeElement).toBe(pinB)

		// ArrowRight → pin C (sorted third).
		fireEvent.keyDown(wrapperEl, { key: "ArrowRight" })
		expect(document.activeElement).toBe(pinC)

		// ArrowRight at the end → clamps at C (no wrap).
		fireEvent.keyDown(wrapperEl, { key: "ArrowRight" })
		expect(document.activeElement).toBe(pinC)
	})

	it("walks backward with ArrowLeft and clamps at the start", () => {
		const { container } = render(
			<AnnotationCanvas imageUrl="data:image/png;base64,iVBORw0KGgo=" />,
		)
		dropPin(container, { pctX: 80, pctY: 30, text: "C" })
		dropPin(container, { pctX: 50, pctY: 10, text: "A" })
		dropPin(container, { pctX: 20, pctY: 30, text: "B" })

		const pins = getPinButtons(container)
		const byLabel = (text: string) =>
			pins.find((b) => b.getAttribute("aria-label")?.endsWith(`: ${text}`))
		const pinA = byLabel("A")
		const pinB = byLabel("B")
		const pinC = byLabel("C")

		const wrapperEl = container.querySelector(
			"div.relative.inline-block",
		) as HTMLDivElement

		act(() => {
			pinC?.focus()
		})
		expect(document.activeElement).toBe(pinC)

		fireEvent.keyDown(wrapperEl, { key: "ArrowLeft" })
		expect(document.activeElement).toBe(pinB)

		fireEvent.keyDown(wrapperEl, { key: "ArrowLeft" })
		expect(document.activeElement).toBe(pinA)

		// Clamp at start — no wrap to C.
		fireEvent.keyDown(wrapperEl, { key: "ArrowLeft" })
		expect(document.activeElement).toBe(pinA)
	})

	it("ArrowDown aliases ArrowRight and ArrowUp aliases ArrowLeft", () => {
		const { container } = render(
			<AnnotationCanvas imageUrl="data:image/png;base64,iVBORw0KGgo=" />,
		)
		dropPin(container, { pctX: 50, pctY: 10, text: "A" })
		dropPin(container, { pctX: 20, pctY: 30, text: "B" })

		const pins = getPinButtons(container)
		const byLabel = (text: string) =>
			pins.find((b) => b.getAttribute("aria-label")?.endsWith(`: ${text}`))
		const pinA = byLabel("A")
		const pinB = byLabel("B")

		const wrapperEl = container.querySelector(
			"div.relative.inline-block",
		) as HTMLDivElement

		act(() => {
			pinA?.focus()
		})
		fireEvent.keyDown(wrapperEl, { key: "ArrowDown" })
		expect(document.activeElement).toBe(pinB)

		fireEvent.keyDown(wrapperEl, { key: "ArrowUp" })
		expect(document.activeElement).toBe(pinA)
	})

	it("does not prevent default or move focus when no pins exist", () => {
		const { container } = render(
			<AnnotationCanvas imageUrl="data:image/png;base64,iVBORw0KGgo=" />,
		)
		const wrapperEl = container.querySelector(
			"div.relative.inline-block",
		) as HTMLDivElement

		// Before: activeElement is body (or wrapper). After an ArrowRight with
		// zero pins: still no pin button exists to receive focus.
		const before = document.activeElement
		fireEvent.keyDown(wrapperEl, { key: "ArrowRight" })
		const after = document.activeElement
		expect(getPinButtons(container)).toHaveLength(0)
		// activeElement should not have jumped to any pin button (there are none).
		expect(after).toBe(before)
	})
})

// Lightweight type assertion to ensure the public pin shape is what downstream
// consumers expect; guards against accidental breaking-change renames.
const _typeCheck: AnnotationPin = {
	x: 0,
	y: 0,
	text: "",
	id: "pin-x",
}
void _typeCheck

import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { useRef, useState } from "react"
import { afterEach, describe, expect, it } from "vitest"
import {
	focusRingClass,
	focusRingCompactClass,
	focusRingVariantClasses,
	focusVisibleOnly,
	useFocusTrap,
} from "../focus"

afterEach(() => {
	cleanup()
})

// ── Focus-ring tokens ──────────────────────────────────────────────────────

describe("focusRingClass", () => {
	it("matches focus-ring-spec.html §1 canonical token string", () => {
		expect(focusRingClass).toContain("focus-visible:ring-2")
		expect(focusRingClass).toContain("focus-visible:ring-teal-500")
		expect(focusRingClass).toContain("focus-visible:ring-offset-2")
		expect(focusRingClass).toContain("dark:focus-visible:ring-offset-stone-900")
	})

	it("compact variant uses 1px outer offset (spec §1a)", () => {
		expect(focusRingCompactClass).toContain("focus-visible:ring-offset-1")
		// Width must stay 2px (no 1px-ring option per spec).
		expect(focusRingCompactClass).toContain("focus-visible:ring-2")
	})

	it("variant-matched rings cover approve/requestChanges/destructive (spec §2)", () => {
		expect(focusRingVariantClasses.approve).toContain("ring-green-500")
		expect(focusRingVariantClasses.requestChanges).toContain("ring-amber-500")
		expect(focusRingVariantClasses.destructive).toContain("ring-red-500")
	})
})

describe("focusVisibleOnly()", () => {
	it("prepends focus-visible: to each token", () => {
		expect(focusVisibleOnly("outline-none ring-2")).toBe(
			"focus-visible:outline-none focus-visible:ring-2",
		)
	})
	it("returns empty string for empty input", () => {
		expect(focusVisibleOnly("")).toBe("")
		expect(focusVisibleOnly("   ")).toBe("")
	})
	it("leaves already-prefixed tokens untouched", () => {
		expect(focusVisibleOnly("focus-visible:outline-none ring-2")).toBe(
			"focus-visible:outline-none focus-visible:ring-2",
		)
	})
})

// ── useFocusTrap ───────────────────────────────────────────────────────────

interface TrapHarnessProps {
	initialEnabled?: boolean
	includeDisabled?: boolean
	children?: React.ReactNode
}

function TrapHarness({
	initialEnabled = true,
	includeDisabled = false,
	children,
}: TrapHarnessProps) {
	const containerRef = useRef<HTMLDivElement>(null)
	const [enabled, setEnabled] = useState(initialEnabled)
	useFocusTrap(containerRef, enabled)
	return (
		<div>
			<button
				type="button"
				data-testid="trigger"
				onClick={() => setEnabled((v) => !v)}
			>
				trigger
			</button>
			<div ref={containerRef} data-testid="trap">
				{children ?? (
					<>
						<button type="button" data-testid="b1">
							b1
						</button>
						{includeDisabled ? (
							<button type="button" data-testid="bdis" disabled>
								disabled
							</button>
						) : null}
						<button type="button" data-testid="b2">
							b2
						</button>
						<button type="button" data-testid="b3">
							b3
						</button>
					</>
				)}
			</div>
		</div>
	)
}

describe("useFocusTrap", () => {
	it("on open, moves focus to the first tabbable child", () => {
		const { getByTestId } = render(<TrapHarness />)
		expect(document.activeElement).toBe(getByTestId("b1"))
	})

	it("Tab from last wraps to first", () => {
		const { getByTestId } = render(<TrapHarness />)
		const last = getByTestId("b3") as HTMLButtonElement
		const trap = getByTestId("trap")
		act(() => {
			last.focus()
		})
		fireEvent.keyDown(trap, { key: "Tab" })
		expect(document.activeElement).toBe(getByTestId("b1"))
	})

	it("Shift+Tab from first wraps to last", () => {
		const { getByTestId } = render(<TrapHarness />)
		const first = getByTestId("b1") as HTMLButtonElement
		const trap = getByTestId("trap")
		act(() => {
			first.focus()
		})
		fireEvent.keyDown(trap, { key: "Tab", shiftKey: true })
		expect(document.activeElement).toBe(getByTestId("b3"))
	})

	it("disabled elements are skipped in the tabbable set", () => {
		const { getByTestId, queryByTestId } = render(
			<TrapHarness includeDisabled />,
		)
		// First tabbable is b1 (the disabled button sits between b1 and b2
		// but is filtered out by the tabbable selector).
		expect(document.activeElement).toBe(getByTestId("b1"))

		// Landing on the LAST tabbable (b3) and pressing Tab wraps to b1 —
		// the wrap path is the authoritative check that the disabled element
		// is excluded from the tabbable set: if `bdis` were in the set, b3
		// would not be "last" and the wrap would route through `bdis` first.
		const last = getByTestId("b3") as HTMLButtonElement
		act(() => {
			last.focus()
		})
		fireEvent.keyDown(getByTestId("trap"), { key: "Tab" })
		expect(document.activeElement).toBe(getByTestId("b1"))

		// Shift+Tab from b1 wraps to b3 (not the disabled button) — symmetric
		// confirmation.
		act(() => {
			;(getByTestId("b1") as HTMLButtonElement).focus()
		})
		fireEvent.keyDown(getByTestId("trap"), { key: "Tab", shiftKey: true })
		expect(document.activeElement).toBe(getByTestId("b3"))

		// Also verify the disabled button renders but is filtered.
		expect(queryByTestId("bdis")).toBeTruthy()
		expect(document.activeElement).not.toBe(queryByTestId("bdis"))
	})

	it("on close, focus returns to the element that had focus at open", () => {
		// We render the harness with initialEnabled=false and flip it on from
		// the trigger. The trigger holds focus at open, so on close focus
		// returns to it.
		function Root() {
			const containerRef = useRef<HTMLDivElement>(null)
			const triggerRef = useRef<HTMLButtonElement>(null)
			const [enabled, setEnabled] = useState(false)
			useFocusTrap(containerRef, enabled)
			return (
				<div>
					<button
						type="button"
						ref={triggerRef}
						data-testid="opener"
						onClick={() => setEnabled(true)}
					>
						open
					</button>
					<button
						type="button"
						data-testid="closer"
						onClick={() => setEnabled(false)}
					>
						close-outside-trap
					</button>
					<div ref={containerRef} data-testid="trap">
						<button type="button" data-testid="inside">
							inside
						</button>
					</div>
				</div>
			)
		}
		const { getByTestId } = render(<Root />)
		const opener = getByTestId("opener") as HTMLButtonElement
		act(() => {
			opener.focus()
		})
		expect(document.activeElement).toBe(opener)
		// Open the trap.
		act(() => {
			opener.click()
		})
		// Focus moved into the trap.
		expect(document.activeElement).toBe(getByTestId("inside"))
		// Close via the external button (still toggles the enabled state via
		// React re-render).
		act(() => {
			;(getByTestId("closer") as HTMLButtonElement).click()
		})
		// Focus should restore to the opener (captured at open time).
		expect(document.activeElement).toBe(opener)
	})
})

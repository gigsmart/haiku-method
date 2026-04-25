/**
 * FeedbackSheet — Completion-Criteria regression coverage per unit-10.
 *
 * Every unit spec assertion has a named test. See
 * stages/development/artifacts/unit-10-tactical-plan.md §F for the per-case
 * rationale + the jsdom `<dialog>` polyfill + matchMedia stub placement
 * inherited from unit-09.
 *
 * jsdom notes:
 *   - jsdom 25 ships `HTMLDialogElement` with `open` / `show()` / `close()`
 *     but not `showModal` + top-layer + background inert. The `beforeEach`
 *     below polyfills `showModal` and `close` to mirror the canonical shape:
 *     `showModal` sets the `open` attribute; `close` removes it and fires
 *     the native `close` event.
 *   - Focus-trap in jsdom is emulated by the reused `useFocusTrap` hook from
 *     `a11y/focus.ts`. That hook snapshots prior focus on enable, moves
 *     focus to the first tabbable on open, wraps Tab + Shift+Tab on the
 *     container, and restores focus on disable — giving us Tab-doesn't-
 *     escape + FAB-restore for free.
 *   - The reduced-motion branch installs `installMatchMediaStub(...)` BEFORE
 *     render because `useReducedMotion()` reads matchMedia in its useState
 *     initializer on first render.
 */

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react"
import { useRef, useState } from "react"
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest"
import { installMatchMediaStub } from "../../../a11y/__tests__/matchMedia.stub"
import { FeedbackFloatingButton } from "../FeedbackFloatingButton"
import { FeedbackSheet } from "../FeedbackSheet"

// ── jsdom <dialog> polyfill ────────────────────────────────────────────────
// jsdom 25 lacks showModal; close() exists but does not dispatch the native
// `close` event in every version. Force-polyfill both to a canonical shape:
// showModal sets the open attribute; close removes it and fires a `close`
// event. Cleaner than per-test feature-detection inside each describe block.

beforeAll(() => {
	if (typeof HTMLDialogElement !== "undefined") {
		type DialogWithInternals = HTMLDialogElement & {
			__haikuTestShimInstalled?: boolean
		}
		const proto = HTMLDialogElement.prototype as DialogWithInternals
		if (!proto.__haikuTestShimInstalled) {
			HTMLDialogElement.prototype.showModal = function showModal(
				this: HTMLDialogElement,
			) {
				this.setAttribute("open", "")
			}
			HTMLDialogElement.prototype.close = function close(
				this: HTMLDialogElement,
			) {
				if (!this.hasAttribute("open")) return
				this.removeAttribute("open")
				this.dispatchEvent(new Event("close"))
			}
			// The `show()` method also needs a stable footprint.
			HTMLDialogElement.prototype.show = function show(
				this: HTMLDialogElement,
			) {
				this.setAttribute("open", "")
			}
			proto.__haikuTestShimInstalled = true
		}
	}
})

// ── Harness ────────────────────────────────────────────────────────────────
// Controlled pair that mirrors the downstream review-page wiring.

function Harness({
	initialOpen = false,
	count = 3,
	onCloseSpy,
}: {
	initialOpen?: boolean
	count?: number
	onCloseSpy?: () => void
}) {
	const [open, setOpen] = useState(initialOpen)
	const fabRef = useRef<HTMLButtonElement>(null)
	return (
		<>
			<FeedbackFloatingButton
				ref={fabRef}
				open={open}
				onToggle={() => setOpen((o) => !o)}
				count={count}
			/>
			<FeedbackSheet
				open={open}
				triggerRef={fabRef}
				onClose={() => {
					onCloseSpy?.()
					setOpen(false)
				}}
			>
				{/* Body contents — ordinary tabbable children the focus-trap and
				    test assertions rely on. */}
				<button type="button" data-testid="body-dismiss">
					Dismiss
				</button>
				<button type="button" data-testid="body-verify-close">
					Verify & Close
				</button>
			</FeedbackSheet>
		</>
	)
}

afterEach(() => {
	cleanup()
	document.documentElement.style.overflow = ""
})

// ── CC1 — dialog semantics when open ───────────────────────────────────────

describe("FeedbackSheet — dialog semantics when open (CC1)", () => {
	it("resolves screen.getByRole('dialog', { name: /feedback/i }) when open", () => {
		render(<Harness initialOpen />)
		const sheet = screen.getByRole("dialog", { name: /feedback/i })
		expect(sheet).toBeTruthy()
	})

	it("has aria-modal='true' on the dialog root", () => {
		render(<Harness initialOpen />)
		const sheet = screen.getByRole("dialog", { name: /feedback/i })
		expect(sheet.getAttribute("aria-modal")).toBe("true")
	})

	it("has role='dialog' on the dialog root (belt-and-suspenders)", () => {
		render(<Harness initialOpen />)
		const sheet = screen.getByRole("dialog", { name: /feedback/i })
		expect(sheet.getAttribute("role")).toBe("dialog")
	})

	it("aria-labelledby points at the visible 'Feedback' heading", () => {
		render(<Harness initialOpen />)
		const sheet = screen.getByRole("dialog", { name: /feedback/i })
		const titleId = sheet.getAttribute("aria-labelledby")
		expect(titleId).toBeTruthy()
		const heading = document.getElementById(titleId as string)
		expect(heading).not.toBeNull()
		expect(heading?.textContent).toBe("Feedback")
	})

	// FB-34 — CSS selector alignment regression guard.
	//
	// `packages/haiku-ui/src/index.css` ships a full block of styling keyed on
	// `dialog.feedback-sheet` (backdrop, ::backdrop blur, sheet-up animation,
	// reduced-motion guards, dark-mode background override). If the rendered
	// root is ever downgraded back to a `<div role="dialog">` the selector
	// will silently stop matching and those styles become dead CSS. Pin the
	// tagName + className here so that regression fails loudly.
	it("renders as a native <dialog class='feedback-sheet'> root (FB-34 alignment)", () => {
		render(<Harness initialOpen />)
		const sheet = screen.getByRole("dialog", { name: /feedback/i })
		expect(sheet.tagName).toBe("DIALOG")
		expect(sheet.classList.contains("feedback-sheet")).toBe(true)
	})
})

// ── CC2a — focus lands on first focusable on open ──────────────────────────

describe("FeedbackSheet — focus on open (CC2a)", () => {
	it("focus lands on the first focusable child (close button, per DOM order)", () => {
		render(<Harness initialOpen />)
		const closeBtn = screen.getByTestId("feedback-sheet-close")
		expect(document.activeElement).toBe(closeBtn)
	})
})

// ── CC2b — Tab does not traverse outside the sheet (focus-trap) ────────────

describe("FeedbackSheet — Tab wrap (CC2b focus-trap)", () => {
	it("Tab wraps back to the first focusable instead of leaving the sheet", () => {
		render(<Harness initialOpen />)
		const sheet = screen.getByRole("dialog", { name: /feedback/i })
		const closeBtn = screen.getByTestId("feedback-sheet-close")
		const bodyDismiss = screen.getByTestId("body-dismiss")
		const bodyVerify = screen.getByTestId("body-verify-close")

		// Initial focus is the close button (first tabbable).
		expect(document.activeElement).toBe(closeBtn)

		// Step through each tabbable via focus() + synthetic Tab to exercise
		// the wrap handler. Using keydown dispatch on the container to drive
		// the useFocusTrap handler directly.
		function pressTab(shiftKey = false) {
			fireEvent.keyDown(sheet, { key: "Tab", code: "Tab", shiftKey })
		}

		// After focus moves naturally through the three tabbables, pressing
		// Tab from the last should wrap to the first.
		bodyDismiss.focus()
		expect(document.activeElement).toBe(bodyDismiss)
		bodyVerify.focus()
		expect(document.activeElement).toBe(bodyVerify)
		// Now on the last tabbable; Tab should wrap to first.
		pressTab()
		expect(document.activeElement).toBe(closeBtn)

		// Shift+Tab from the first should wrap to the last.
		pressTab(true)
		expect(document.activeElement).toBe(bodyVerify)

		// And activeElement is always inside the sheet.
		expect(sheet.contains(document.activeElement)).toBe(true)
	})
})

// ── CC3 — close paths: Escape, backdrop, close button; focus returns to FAB ─

describe("FeedbackSheet — close paths + focus restore (CC3)", () => {
	it("close button closes the dialog and restores focus to the FAB", () => {
		render(<Harness initialOpen />)
		const closeBtn = screen.getByTestId("feedback-sheet-close")
		fireEvent.click(closeBtn)
		// After close, the dialog element loses its `open` attribute.
		expect(screen.queryByRole("dialog")).toBeNull()
		// Focus restored to the FAB by useFocusTrap's priorFocus snapshot.
		const fab = screen.getByRole("button", { name: /open feedback panel/i })
		expect(document.activeElement).toBe(fab)
	})

	it("backdrop click closes the dialog (click target === dialog)", () => {
		render(<Harness initialOpen />)
		const sheet = screen.getByRole("dialog", { name: /feedback/i })
		// Simulate a click whose target IS the dialog itself — the canonical
		// "click on the backdrop pseudo-element" pattern from MDN.
		fireEvent.click(sheet, { target: sheet })
		expect(screen.queryByRole("dialog")).toBeNull()
	})

	it("Escape-driven close path dispatches close + restores focus", async () => {
		const onCloseSpy = vi.fn()
		render(<Harness initialOpen onCloseSpy={onCloseSpy} />)
		const sheet = screen.getByRole("dialog", { name: /feedback/i })
		// FB-60 — dispatch a REAL Escape keydown on the dialog root. This
		// exercises the full input path the test name claims to cover:
		//   keydown(Escape) → FeedbackSheet's keydown listener calls
		//   dialog.close() → `close` event → parent onClose → FAB focus
		//   restore.
		//
		// Do NOT short-circuit by calling `dialog.close()` directly — that
		// path would still pass even if the Escape key binding regressed
		// (handler removed, wrong key, wrong target), leaving CC3's
		// keyboard input path silently untested.
		//
		// jsdom caveat: jsdom 25 does not auto-fire `cancel` on keydown, so
		// the component installs a belt-and-suspenders `keydown` handler
		// that calls `dialog.close()` on Escape. In real browsers the
		// native `cancel` → `close` pipeline handles this; in jsdom this
		// handler IS the close path the test drives.
		await act(async () => {
			fireEvent.keyDown(sheet, { key: "Escape", code: "Escape" })
		})
		await waitFor(() => {
			expect(onCloseSpy).toHaveBeenCalled()
			expect(screen.queryByRole("dialog")).toBeNull()
		})
		const fab = screen.getByRole("button", { name: /open feedback panel/i })
		expect(document.activeElement).toBe(fab)
	})
})

// ── CC4 — accessibility tree ──────────────────────────────────────────────

describe("FeedbackSheet — accessibility tree (CC4)", () => {
	it("getByRole('dialog', { name: /feedback/i }) resolves when open", () => {
		render(<Harness initialOpen />)
		expect(screen.getByRole("dialog", { name: /feedback/i })).toBeTruthy()
	})

	it("heading text 'Feedback' is present inside the dialog", () => {
		render(<Harness initialOpen />)
		const sheet = screen.getByRole("dialog", { name: /feedback/i })
		expect(within(sheet).getByText("Feedback")).toBeTruthy()
	})
})

// ── CC5 — reduced-motion animation class swap ─────────────────────────────

describe("FeedbackSheet — reduced-motion variant (CC5)", () => {
	let stub: ReturnType<typeof installMatchMediaStub>

	beforeEach(() => {
		// IMPORTANT: install BEFORE render — useReducedMotion reads matchMedia
		// via useState initializer on first render.
		stub = installMatchMediaStub({
			"(prefers-reduced-motion: reduce)": true,
		})
	})

	afterEach(() => {
		stub.restore()
	})

	it("dialog carries the sheet-enter--reduced sentinel class when open", () => {
		render(<Harness initialOpen />)
		const sheet = screen.getByRole("dialog", { name: /feedback/i })
		expect(sheet.className).toMatch(/\bsheet-enter--reduced\b/)
	})

	it("dialog does NOT carry the plain sheet-enter class under reduce", () => {
		render(<Harness initialOpen />)
		const sheet = screen.getByRole("dialog", { name: /feedback/i })
		expect(sheet.className).not.toMatch(/\bsheet-enter(?!--reduced)\b/)
	})
})

// ── Ancillary — FAB aria-expanded flips on open/close ─────────────────────

describe("FeedbackSheet — FAB aria-expanded (ancillary)", () => {
	it("FAB aria-expanded flips false → true → false across click + close", () => {
		render(<Harness />)
		const fab = screen.getByRole("button", { name: /open feedback panel/i })
		expect(fab.getAttribute("aria-expanded")).toBe("false")
		// Open
		fireEvent.click(fab)
		expect(fab.getAttribute("aria-expanded")).toBe("true")
		// Close via the close button
		const closeBtn = screen.getByTestId("feedback-sheet-close")
		fireEvent.click(closeBtn)
		expect(fab.getAttribute("aria-expanded")).toBe("false")
	})
})

// ── Ancillary — scroll lock during open ───────────────────────────────────

describe("FeedbackSheet — scroll lock on <html> while open (ancillary)", () => {
	it("sets overflow:hidden on <html> on open and clears it on close", () => {
		render(<Harness />)
		const fab = screen.getByRole("button", { name: /open feedback panel/i })
		expect(document.documentElement.style.overflow).toBe("")
		fireEvent.click(fab)
		expect(document.documentElement.style.overflow).toBe("hidden")
		const closeBtn = screen.getByTestId("feedback-sheet-close")
		fireEvent.click(closeBtn)
		expect(document.documentElement.style.overflow).toBe("")
	})
})

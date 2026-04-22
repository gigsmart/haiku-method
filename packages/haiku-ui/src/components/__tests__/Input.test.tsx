/**
 * Primitive tests assert behavioral + public-API contracts only:
 *   - DOM element / tag
 *   - ARIA state (aria-disabled, aria-invalid)
 *   - data-* API attributes (data-invalid)
 *   - Event wiring + ref + prop passthrough
 *   - disabled interaction (events blocked, value unchanged)
 *
 * Token-pair contrast is audited by `scripts/audit-contrast.mjs`.
 * Banned token patterns (opacity-*, focus:ring-1, text-stone-500 on bg-stone-100)
 * are audited by `tests/audit-banned-patterns.test.ts`.
 * Structural a11y is audited by `tests/a11y-pages.spec.tsx`.
 * Re-asserting token strings here would couple the test to implementation detail
 * and duplicate those audits — FB-48.
 */

import { cleanup, fireEvent, render } from "@testing-library/react"
import { createRef } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Input } from "../Input"

afterEach(() => {
	cleanup()
})

describe("Input primitive", () => {
	it("renders an <input> with aria-invalid and data-invalid absent by default", () => {
		const { container } = render(<Input placeholder="type here" />)
		const input = container.querySelector("input") as HTMLInputElement
		expect(input).not.toBeNull()
		expect(input.tagName).toBe("INPUT")
		expect(input.getAttribute("aria-invalid")).toBeNull()
		expect(input.getAttribute("data-invalid")).toBeNull()
		expect(input.disabled).toBe(false)
	})

	it("sets aria-invalid and data-invalid when invalid", () => {
		const { container } = render(<Input invalid />)
		const input = container.querySelector("input") as HTMLInputElement
		expect(input.getAttribute("aria-invalid")).toBe("true")
		expect(input.getAttribute("data-invalid")).toBe("true")
	})

	it("exposes disabled state via disabled + aria-disabled", () => {
		const { container } = render(<Input disabled />)
		const input = container.querySelector("input") as HTMLInputElement
		expect(input.disabled).toBe(true)
		expect(input.getAttribute("aria-disabled")).toBe("true")
	})

	it("disabled input blocks click-driven focus and user interaction", () => {
		// Real-user semantics: `disabled` blocks focus, pointer interaction,
		// and form submission. jsdom's `fireEvent.change` bypasses the browser's
		// disabled-gate, so we assert the API-surface guard (`disabled === true`)
		// and the user-visible guard (click does not focus a disabled input).
		const onClick = vi.fn()
		const { container } = render(<Input disabled onClick={onClick} />)
		const input = container.querySelector("input") as HTMLInputElement
		expect(input.disabled).toBe(true)
		fireEvent.click(input)
		// A disabled input should not become the active element when clicked.
		expect(document.activeElement).not.toBe(input)
		// Disabled elements still dispatch click in jsdom, but real browsers
		// block. The key behavioral guarantee tests read is `disabled === true`
		// — the rest is enforced by the DOM/browser spec, not by our code.
		expect(onClick).not.toHaveBeenCalled()
	})

	it("forwards ref to the underlying <input>", () => {
		const ref = createRef<HTMLInputElement>()
		render(<Input ref={ref} />)
		expect(ref.current).not.toBeNull()
		expect(ref.current?.tagName).toBe("INPUT")
	})

	it("passes through className + arbitrary html attrs", () => {
		const { container } = render(
			<Input className="my-extra-class" data-testid="my-input" name="email" />,
		)
		const input = container.querySelector("input") as HTMLInputElement
		// className merges rather than replaces — verify the extra token is
		// present without coupling to the (implementation-detail) base tokens.
		const tokens = input.className.split(/\s+/)
		expect(tokens).toContain("my-extra-class")
		expect(input.getAttribute("data-testid")).toBe("my-input")
		expect(input.getAttribute("name")).toBe("email")
	})
})

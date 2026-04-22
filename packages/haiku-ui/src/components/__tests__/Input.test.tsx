import { cleanup, render } from "@testing-library/react"
import { createRef } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { Input } from "../Input"

afterEach(() => {
	cleanup()
})

describe("Input primitive", () => {
	it("renders with valid border token pair by default", () => {
		const { container } = render(<Input placeholder="type here" />)
		const input = container.querySelector("input") as HTMLInputElement
		const cls = input.className
		expect(cls).toContain("border-stone-300")
		expect(cls).toContain("focus-visible:ring-2")
		expect(cls).toContain("focus-visible:ring-teal-500")
	})

	it("swaps to red border + aria-invalid when invalid", () => {
		const { container } = render(<Input invalid />)
		const input = container.querySelector("input") as HTMLInputElement
		expect(input.className).toContain("border-red-500")
		expect(input.className).toContain("focus-visible:ring-red-500")
		expect(input.getAttribute("aria-invalid")).toBe("true")
	})

	it("applies token-based disabled styles with aria-disabled", () => {
		const { container } = render(<Input disabled />)
		const input = container.querySelector("input") as HTMLInputElement
		expect(input.disabled).toBe(true)
		expect(input.getAttribute("aria-disabled")).toBe("true")
		const cls = input.className
		expect(cls).toContain("disabled:bg-stone-100")
		expect(cls).toContain("disabled:text-stone-600")
		expect(cls).toContain("disabled:border-stone-400")
		// Banned: disabled:opacity-*.
		expect(cls).not.toMatch(/disabled:opacity-(50|60|70)/)
	})

	it("forwards ref to the underlying input", () => {
		const ref = createRef<HTMLInputElement>()
		render(<Input ref={ref} />)
		expect(ref.current).not.toBeNull()
		expect(ref.current?.tagName).toBe("INPUT")
	})

	it("uses focus-visible:ring-2 (NOT focus:ring-1)", () => {
		const { container } = render(<Input />)
		const cls = container.querySelector("input")?.className ?? ""
		expect(cls).not.toMatch(/\bfocus:ring-1\b/)
		expect(cls).toContain("focus-visible:ring-2")
	})
})

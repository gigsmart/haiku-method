import { act, cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { motionSafeClass, useReducedMotion } from "../reduced-motion"
import { installMatchMediaStub } from "./matchMedia.stub"

let stubHandle: ReturnType<typeof installMatchMediaStub>

beforeEach(() => {
	stubHandle = installMatchMediaStub({
		"(prefers-reduced-motion: reduce)": false,
	})
})

afterEach(() => {
	cleanup()
	stubHandle.restore()
})

describe("motionSafeClass", () => {
	it("returns the class string when prefersReducedMotion is false", () => {
		expect(motionSafeClass("transition-colors duration-300", false)).toBe(
			"transition-colors duration-300",
		)
	})
	it("returns empty string when prefersReducedMotion is true", () => {
		expect(motionSafeClass("transition-colors duration-300", true)).toBe("")
	})
})

describe("useReducedMotion", () => {
	it("returns false when the media query does not match", () => {
		let observed = true
		function Probe() {
			observed = useReducedMotion()
			return null
		}
		render(<Probe />)
		expect(observed).toBe(false)
	})

	it("reacts to a 'change' event from the matchMedia stub", () => {
		let observed: boolean | null = null
		function Probe() {
			observed = useReducedMotion()
			return <div data-testid="val">{String(observed)}</div>
		}
		const { getByTestId } = render(<Probe />)
		expect(observed).toBe(false)
		expect(getByTestId("val").textContent).toBe("false")

		act(() => {
			stubHandle.emitChange("(prefers-reduced-motion: reduce)", true)
		})
		expect(observed).toBe(true)
		expect(getByTestId("val").textContent).toBe("true")

		act(() => {
			stubHandle.emitChange("(prefers-reduced-motion: reduce)", false)
		})
		expect(observed).toBe(false)
	})
})

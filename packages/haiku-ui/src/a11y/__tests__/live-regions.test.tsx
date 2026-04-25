import { act, cleanup, render } from "@testing-library/react"
import { useEffect } from "react"
import { afterEach, describe, expect, it } from "vitest"
import {
	ASSERTIVE_REGION_ID,
	announce,
	LiveRegionShell,
	POLITE_REGION_ID,
	useAnnounce,
} from "../live-regions"

afterEach(() => {
	cleanup()
})

function queryPolite(): HTMLElement | null {
	return document.getElementById(POLITE_REGION_ID)
}

function queryAssertive(): HTMLElement | null {
	return document.getElementById(ASSERTIVE_REGION_ID)
}

describe("LiveRegionShell", () => {
	it("mounts both regions with canonical ids + ARIA attributes", () => {
		render(<LiveRegionShell />)
		const polite = queryPolite()
		const assertive = queryAssertive()
		expect(polite).toBeTruthy()
		expect(polite?.getAttribute("role")).toBe("status")
		expect(polite?.getAttribute("aria-live")).toBe("polite")
		expect(polite?.getAttribute("aria-atomic")).toBe("true")
		expect(polite?.className).toContain("sr-only")
		expect(assertive).toBeTruthy()
		expect(assertive?.getAttribute("role")).toBe("alert")
		expect(assertive?.getAttribute("aria-live")).toBe("assertive")
		expect(assertive?.getAttribute("aria-atomic")).toBe("true")
	})
})

describe("announce()", () => {
	it("writes 'hello' into #feedback-live-polite", () => {
		render(<LiveRegionShell />)
		announce("polite", "hello")
		expect(queryPolite()?.textContent).toBe("hello")
	})

	it("writes 'error' into #feedback-live-assertive", () => {
		render(<LiveRegionShell />)
		announce("assertive", "error")
		expect(queryAssertive()?.textContent).toBe("error")
	})

	it("re-announces identical text by clearing first then setting", () => {
		render(<LiveRegionShell />)
		announce("polite", "same")
		expect(queryPolite()?.textContent).toBe("same")
		// Writing the same string again should still land — the clear-then-set
		// pattern means AT will re-read it. We only observe end-state here.
		announce("polite", "same")
		expect(queryPolite()?.textContent).toBe("same")
	})

	it("no-ops when the shell is not mounted (does not throw)", () => {
		// Deliberately do not render the shell.
		expect(() => announce("polite", "orphan")).not.toThrow()
		expect(() => announce("assertive", "orphan")).not.toThrow()
	})
})

describe("useAnnounce()", () => {
	it("returns a stable function that writes into the matching region", () => {
		function Harness() {
			const a = useAnnounce()
			useEffect(() => {
				a("polite", "from-hook")
			}, [a])
			return null
		}
		render(
			<>
				<LiveRegionShell />
				<Harness />
			</>,
		)
		expect(queryPolite()?.textContent).toBe("from-hook")
	})

	it("written message is reflected in useEffect across both severities", () => {
		function Harness() {
			const a = useAnnounce()
			useEffect(() => {
				act(() => {
					a("assertive", "oops")
				})
			}, [a])
			return null
		}
		render(
			<>
				<LiveRegionShell />
				<Harness />
			</>,
		)
		expect(queryAssertive()?.textContent).toBe("oops")
	})
})

/**
 * Perf budget for the AnnotationCanvas — unit-13 completion criterion.
 *
 * The spec named a Playwright perf test, but Playwright is banned on this
 * repo (see commit 28e66e4c). This vitest substitute runs the same
 * assertions inside jsdom. Budgets are RELATIVE regression gates rather
 * than user-facing paint guarantees:
 *
 *  - First paint ≤ 200 ms with 200 pins pre-seeded (2× jsdom cushion — see
 *    unit-13 tactical plan R4).
 *  - Per-keypress p95 ≤ 32 ms for an ArrowRight traversal (2× jsdom cushion
 *    vs the spec's 16 ms real-browser budget — same R4 rationale).
 *
 * Rationale: under `npm test` with 37+ parallel test files, occasional GC
 * pauses and host-load jitter spike individual jsdom iterations well past
 * 16 ms even when the underlying React render path is comfortably within
 * budget. A real regression that adds per-keystroke sort work or a listener
 * leak will still shift the distribution by orders of magnitude (hundreds
 * of milliseconds), so the 2× cushion catches the regressions the spec
 * targets without burning CI time on flakes. If a future regression gets
 * past this gate, either the budget is too loose (tighten it) or the
 * regression is in a real-browser paint path (add a Lighthouse CI job
 * rather than tightening this jsdom stub).
 */

import { act, fireEvent, render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { LiveRegionShell } from "../src/a11y"
import { __resetShortcutRegistryForTests } from "../src/a11y/keyboard"
import { AnnotationCanvas } from "../src/pages/review/AnnotationCanvas"

function pinsPayload(n: number, sessionId: string): string {
	return JSON.stringify({
		sessionId,
		pins: Array.from({ length: n }, (_, i) => ({
			id: `pin-${i}`,
			pageId: "page-1",
			x: (i % 20) / 20, // 20 columns
			y: Math.floor(i / 20) / 10, // 10 rows
			viewportWidth: 1000,
			viewportHeight: 800,
			title: `Pin ${i}`,
			body: "",
			state: "draft",
		})),
		savedAt: new Date().toISOString(),
	})
}

// Budget constants — see header comment for the 2× jsdom cushion rationale.
const FIRST_PAINT_BUDGET_MS = 200
const KEYPRESS_P95_BUDGET_MS = 32

describe("AnnotationCanvas — perf budget (jsdom-relative)", () => {
	it("first paint within budget with 200 pins pre-seeded", () => {
		const sessionId = "perf-first-paint"
		localStorage.setItem(
			`haiku-ui:annotation-draft:${sessionId}`,
			pinsPayload(200, sessionId),
		)
		const t0 = performance.now()
		const { unmount } = render(
			<>
				<LiveRegionShell />
				<AnnotationCanvas
					sessionId={sessionId}
					pageId="page-1"
					viewportWidth={1000}
					viewportHeight={800}
					onSubmit={async () => {}}
				/>
			</>,
		)
		const t1 = performance.now()
		const elapsed = t1 - t0
		// Tolerance: jsdom first-render budget — see header comment.
		expect(elapsed).toBeLessThanOrEqual(FIRST_PAINT_BUDGET_MS)
		unmount()
		__resetShortcutRegistryForTests()
		localStorage.clear()
	})

	it("keypress-to-paint p95 within budget per ArrowRight across 200 pins", async () => {
		const sessionId = "perf-arrow-right"
		localStorage.setItem(
			`haiku-ui:annotation-draft:${sessionId}`,
			pinsPayload(200, sessionId),
		)
		const { unmount, getByTestId } = render(
			<>
				<LiveRegionShell />
				<AnnotationCanvas
					sessionId={sessionId}
					pageId="page-1"
					viewportWidth={1000}
					viewportHeight={800}
					onSubmit={async () => {}}
				/>
			</>,
		)
		const root = getByTestId("annotation-canvas-root")
		// Wait until the boot-time read-back restores the pins.
		await vi.waitFor(() => {
			const pins = root.querySelectorAll("button[data-pin-id]")
			expect(pins.length).toBe(200)
		})
		// Focus the first pin (sorted order by (y, x) is deterministic).
		const firstPin = root.querySelector(
			"button[data-pin-id]",
		) as HTMLButtonElement
		act(() => {
			firstPin.focus()
		})
		// Warmup: first keydown pays one-time costs (lazy memoized selector
		// and initial focus-ring layout). Discard to stabilize the budget.
		act(() => {
			fireEvent.keyDown(root, { key: "ArrowRight" })
		})
		// 200 ArrowRight keypresses — capture per-iter latency, assert p95.
		// Single-sample assertions are too flaky under parallel vitest
		// (occasional GC pauses spike one or two iterations past 16 ms even
		// when the underlying render path is comfortably within budget).
		// The p95 gate captures the steady-state regression signal the spec
		// intends: a real regression that shifts the distribution (e.g. a
		// per-keystroke resort) will push p95 well past 16 ms.
		const samples: number[] = []
		for (let i = 0; i < 200; i += 1) {
			const t0 = performance.now()
			act(() => {
				fireEvent.keyDown(root, { key: "ArrowRight" })
			})
			const t1 = performance.now()
			samples.push(t1 - t0)
		}
		samples.sort((a, b) => a - b)
		const p95 = samples[Math.floor(samples.length * 0.95)]
		const max = samples[samples.length - 1]
		expect(
			p95,
			`p95 = ${p95.toFixed(2)}ms, max = ${max.toFixed(2)}ms`,
		).toBeLessThanOrEqual(KEYPRESS_P95_BUDGET_MS)
		unmount()
		__resetShortcutRegistryForTests()
		localStorage.clear()
	})
})

/**
 * AssessorSummaryCard tests (unit-11).
 *
 * Completion criteria covered:
 *   - Root element `<article>` has role="status" + aria-live="polite".
 *   - No `opacity-50/60/70` classes on root — inline regex guard to surface
 *     violations locally (the canonical CI check is
 *     `audit-banned-patterns.mjs --profile=tokens`).
 *   - Count transition test: rerender with increased `closed` triggers a
 *     polite announcement within 500ms matching the acceptance-criterion regex.
 *   - Debounce: bursts of rerenders within 500ms produce ONE announcement
 *     matching the final state.
 *   - `screen.getByRole('status', { name: /feedback assessor summary/i })`
 *     resolves — disambiguated from any shell live regions via aria-label.
 *   - Zero findings renders an italic empty-state message; role=status still
 *     present.
 */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LiveRegionShell, POLITE_REGION_ID } from "../../a11y/live-regions"
import {
	type AssessorFinding,
	AssessorSummaryCard,
} from "../AssessorSummaryCard"

afterEach(() => {
	cleanup()
	vi.useRealTimers()
})

const baseFindings: AssessorFinding[] = [
	{ id: "FB-01", status: "closed", addressedBy: "unit-01" },
	{ id: "FB-02", status: "addressed", addressedBy: "unit-02" },
	{ id: "FB-03", status: "addressed", addressedBy: "unit-03" },
]

describe("AssessorSummaryCard — DOM shell", () => {
	it("renders an <article> root with role=status + aria-live=polite + aria-atomic", () => {
		const { container } = render(
			<AssessorSummaryCard
				total={3}
				closed={3}
				stillOpen={0}
				rejected={0}
				findings={baseFindings}
			/>,
		)
		const root = container.firstElementChild as HTMLElement
		expect(root.tagName).toBe("ARTICLE")
		expect(root.getAttribute("role")).toBe("status")
		expect(root.getAttribute("aria-live")).toBe("polite")
		expect(root.getAttribute("aria-atomic")).toBe("true")
	})

	it("resolves via screen.getByRole('status') scoped to its aria-label", () => {
		render(
			<>
				<LiveRegionShell />
				<AssessorSummaryCard
					total={3}
					closed={3}
					stillOpen={0}
					rejected={0}
					findings={baseFindings}
				/>
			</>,
		)
		// Multiple role=status regions exist (LiveRegionShell adds one); the
		// card is disambiguated by aria-label.
		const card = screen.getByRole("status", {
			name: /feedback assessor summary/i,
		})
		expect(card.tagName).toBe("ARTICLE")
	})

	it("has no opacity-50|60|70 classes anywhere on the tree (belt-and-suspenders for the tokens audit)", () => {
		const { container } = render(
			<AssessorSummaryCard
				total={5}
				closed={3}
				stillOpen={2}
				rejected={0}
				findings={baseFindings}
			/>,
		)
		const html = container.innerHTML
		expect(/\bopacity-(50|60|70)\b/.test(html)).toBe(false)
	})
})

describe("AssessorSummaryCard — clean vs pending visual states", () => {
	it("renders the clean badge when stillOpen === 0", () => {
		render(
			<AssessorSummaryCard
				total={3}
				closed={3}
				stillOpen={0}
				rejected={0}
				findings={baseFindings}
			/>,
		)
		expect(screen.getByText(/^clean$/i)).toBeTruthy()
	})

	it("renders the pending badge when stillOpen > 0", () => {
		render(
			<AssessorSummaryCard
				total={5}
				closed={2}
				stillOpen={3}
				rejected={0}
				findings={[]}
			/>,
		)
		// Badge + grid-cell label both say "pending"; make the assertion
		// order-independent by counting the matches rather than uniquing.
		expect(screen.getAllByText(/^pending$/i).length).toBeGreaterThan(0)
	})

	it("surfaces a rejected callout when rejected > 0", () => {
		render(
			<AssessorSummaryCard
				total={5}
				closed={3}
				stillOpen={1}
				rejected={1}
				findings={baseFindings}
			/>,
		)
		expect(screen.getByText(/^1 rejected$/i)).toBeTruthy()
	})

	it("renders a 'No findings yet.' empty state when findings is empty", () => {
		render(
			<AssessorSummaryCard
				total={0}
				closed={0}
				stillOpen={0}
				rejected={0}
				findings={[]}
			/>,
		)
		expect(screen.getByText(/no findings yet/i)).toBeTruthy()
		expect(screen.getByRole("status")).toBeTruthy()
	})
})

describe("AssessorSummaryCard — count-transition live-region announcements", () => {
	it("announces politely on count change with text matching the acceptance regex", async () => {
		vi.useFakeTimers()
		const { rerender } = render(
			<>
				<LiveRegionShell />
				<AssessorSummaryCard
					total={7}
					closed={3}
					stillOpen={4}
					rejected={0}
					findings={[]}
				/>
			</>,
		)
		// Initial mount suppresses the announcement (nothing has changed yet).
		const polite = document.getElementById(POLITE_REGION_ID)
		expect(polite?.textContent).toBe("")
		rerender(
			<>
				<LiveRegionShell />
				<AssessorSummaryCard
					total={7}
					closed={5}
					stillOpen={2}
					rejected={0}
					findings={[]}
				/>
			</>,
		)
		// Before the debounce flushes, nothing announced yet.
		expect(polite?.textContent).toBe("")
		// Advance past the 500ms trailing edge.
		await vi.advanceTimersByTimeAsync(500)
		expect(polite?.textContent ?? "").toMatch(
			/5 (of \d+ )?findings? (addressed|resolved|closed)/i,
		)
	})

	it("coalesces bursts into a single announcement matching the final state", async () => {
		vi.useFakeTimers()
		const { rerender } = render(
			<>
				<LiveRegionShell />
				<AssessorSummaryCard
					total={10}
					closed={1}
					stillOpen={9}
					rejected={0}
					findings={[]}
				/>
			</>,
		)
		// Rapid bursts well inside the 500ms window.
		rerender(
			<>
				<LiveRegionShell />
				<AssessorSummaryCard
					total={10}
					closed={3}
					stillOpen={7}
					rejected={0}
					findings={[]}
				/>
			</>,
		)
		await vi.advanceTimersByTimeAsync(100)
		rerender(
			<>
				<LiveRegionShell />
				<AssessorSummaryCard
					total={10}
					closed={6}
					stillOpen={4}
					rejected={0}
					findings={[]}
				/>
			</>,
		)
		await vi.advanceTimersByTimeAsync(100)
		rerender(
			<>
				<LiveRegionShell />
				<AssessorSummaryCard
					total={10}
					closed={9}
					stillOpen={1}
					rejected={0}
					findings={[]}
				/>
			</>,
		)
		// Debounce is trailing-edge: nothing announced yet.
		const polite = document.getElementById(POLITE_REGION_ID)
		expect(polite?.textContent).toBe("")
		await vi.advanceTimersByTimeAsync(500)
		// Exactly one announcement, matching the FINAL state (closed=9).
		expect(polite?.textContent ?? "").toMatch(
			/9 (of \d+ )?findings? (addressed|resolved|closed)/i,
		)
	})

	it("does not announce on initial mount (only on transitions)", async () => {
		vi.useFakeTimers()
		render(
			<>
				<LiveRegionShell />
				<AssessorSummaryCard
					total={4}
					closed={2}
					stillOpen={2}
					rejected={0}
					findings={[]}
				/>
			</>,
		)
		await vi.advanceTimersByTimeAsync(1000)
		const polite = document.getElementById(POLITE_REGION_ID)
		expect(polite?.textContent).toBe("")
	})
})

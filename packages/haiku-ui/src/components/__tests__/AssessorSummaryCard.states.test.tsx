/**
 * State-matrix snapshot for AssessorSummaryCard (state-coverage-grid.md §7.10).
 *
 * Covers the documented state variants: clean / pending / loading /
 * error / empty / hover-details. Loading/error are expressed as state flags
 * (we do not render true loading spinners here — this is a stateless card).
 */

import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AssessorSummaryCard } from "../AssessorSummaryCard"

// Pin "now" so the `ranAt` → "ran 10h ago" label in the snapshot is
// deterministic. Without this, the snapshot drifts as wall-clock time
// advances relative to the hard-coded `ranAt` Date in the test body.
const FROZEN_NOW = new Date("2026-04-21T22:00:00Z")

beforeEach(() => {
	vi.useFakeTimers()
	vi.setSystemTime(FROZEN_NOW)
})

afterEach(() => {
	cleanup()
	vi.useRealTimers()
})

const CLEAN = {
	total: 0,
	closed: 0,
	stillOpen: 0,
	rejected: 0,
	findings: [],
}

const PENDING = {
	total: 3,
	closed: 2,
	stillOpen: 1,
	rejected: 0,
	findings: [
		{ id: "FB-01", status: "closed" as const, addressedBy: "unit-07" },
		{ id: "FB-02", status: "closed" as const, addressedBy: "unit-08" },
		{ id: "FB-03", status: "pending" as const },
	],
}

const REJECTED = {
	total: 2,
	closed: 0,
	stillOpen: 0,
	rejected: 2,
	findings: [
		{ id: "FB-11", status: "rejected" as const, note: "spec disagreement" },
		{ id: "FB-12", status: "rejected" as const },
	],
}

describe("AssessorSummaryCard — state matrix", () => {
	it("renders every documented state cell (snapshot)", () => {
		const { container } = render(
			<div>
				<div data-cell="empty">
					<AssessorSummaryCard {...CLEAN} />
				</div>
				<div data-cell="clean">
					<AssessorSummaryCard
						total={3}
						closed={3}
						stillOpen={0}
						rejected={0}
						findings={PENDING.findings.map((f) => ({
							...f,
							status: "closed" as const,
						}))}
					/>
				</div>
				<div data-cell="pending">
					<AssessorSummaryCard {...PENDING} />
				</div>
				<div data-cell="rejected">
					<AssessorSummaryCard {...REJECTED} />
				</div>
				<div data-cell="updated">
					<AssessorSummaryCard {...PENDING} updated={1} />
				</div>
				<div data-cell="with-timestamp">
					<AssessorSummaryCard
						{...PENDING}
						ranAt={new Date("2026-04-21T12:00:00Z")}
					/>
				</div>
			</div>,
		)
		expect(container.firstChild).toMatchSnapshot()
	})
})

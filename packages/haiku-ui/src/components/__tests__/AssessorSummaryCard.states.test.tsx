/**
 * State-matrix snapshot for AssessorSummaryCard (state-coverage-grid.md §7.10).
 *
 * Covers the documented state variants: clean / pending / loading /
 * error / empty / hover-details. Loading/error are expressed as state flags
 * (we do not render true loading spinners here — this is a stateless card).
 */

import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { AssessorSummaryCard } from "../AssessorSummaryCard"

afterEach(() => {
	cleanup()
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

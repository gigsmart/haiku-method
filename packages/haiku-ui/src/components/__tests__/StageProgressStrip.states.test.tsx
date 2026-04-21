/**
 * State-matrix snapshot for StageProgressStrip (state-coverage-grid.md §7.11, §5).
 */

import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { StageProgressStrip } from "../StageProgressStrip"

afterEach(() => {
	cleanup()
})

const STAGES = [
	{ name: "inception", status: "completed" as const, visits: 1 },
	{ name: "design", status: "completed" as const, visits: 1 },
	{ name: "product", status: "current" as const, visits: 1 },
	{ name: "development", status: "future" as const, visits: 0 },
	{ name: "review", status: "future" as const, visits: 0 },
]

describe("StageProgressStrip — state matrix", () => {
	it("renders every documented state cell (snapshot)", () => {
		const { container } = render(
			<div>
				<div data-cell="default">
					<StageProgressStrip stages={STAGES} currentStage="product" />
				</div>
				<div data-cell="first-stage-current">
					<StageProgressStrip stages={STAGES} currentStage="inception" />
				</div>
				<div data-cell="last-stage-completed">
					<StageProgressStrip
						stages={STAGES.map((s) => ({ ...s, status: "completed" }))}
						currentStage="review"
					/>
				</div>
				<div data-cell="with-click-handler">
					<StageProgressStrip
						stages={STAGES}
						currentStage="product"
						onStageClick={() => {}}
					/>
				</div>
				<div data-cell="visited-but-not-current">
					<StageProgressStrip
						stages={STAGES.map((s) =>
							s.name === "development"
								? { ...s, status: "future", visits: 1 }
								: s,
						)}
						currentStage="product"
					/>
				</div>
				<div data-cell="never-visited">
					<StageProgressStrip
						stages={STAGES.map((s) => ({ ...s, visits: 0 }))}
						currentStage="inception"
					/>
				</div>
			</div>,
		)
		expect(container.firstChild).toMatchSnapshot()
	})
})

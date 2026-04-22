/**
 * State-matrix snapshot for AgentFeedbackToggle (state-coverage-grid.md §7.7).
 *
 * Cardinality: 6 cells — off / on / focus-off / focus-on / disabled-off /
 * disabled-on. Each row carries a data-cell attribute keyed on the cell name
 * so the audit-state-coverage.mjs audit can enumerate presence.
 */

import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { AgentFeedbackToggle } from "../AgentFeedbackToggle"

afterEach(() => {
	cleanup()
})

describe("AgentFeedbackToggle — state matrix", () => {
	it("renders every documented state cell (snapshot)", () => {
		const { container } = render(
			<div>
				<div data-cell="off">
					<AgentFeedbackToggle checked={false} onChange={() => {}} />
				</div>
				<div data-cell="on">
					<AgentFeedbackToggle checked={true} onChange={() => {}} />
				</div>
				<div data-cell="off-with-count">
					<AgentFeedbackToggle checked={false} count={3} onChange={() => {}} />
				</div>
				<div data-cell="on-with-count">
					<AgentFeedbackToggle checked={true} count={3} onChange={() => {}} />
				</div>
				<div data-cell="disabled-off">
					<AgentFeedbackToggle checked={false} disabled onChange={() => {}} />
				</div>
				<div data-cell="disabled-on">
					<AgentFeedbackToggle checked={true} disabled onChange={() => {}} />
				</div>
			</div>,
		)
		expect(container.firstChild).toMatchSnapshot()
	})
})

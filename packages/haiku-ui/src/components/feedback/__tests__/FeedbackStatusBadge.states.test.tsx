/**
 * State-matrix snapshot + aria assertions for FeedbackStatusBadge
 * (state-coverage-grid.md §7.1).
 *
 * Cardinality: 4 status variants × (default + error-card) = 8 cells. Well
 * under the 36-cell cap per unit spec.
 */

import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { FeedbackStatusBadge } from "../FeedbackStatusBadge"
import { type FeedbackStatus, TOKEN_HASH } from "../tokens"

afterEach(() => {
	cleanup()
})

const STATUSES: FeedbackStatus[] = [
	"pending",
	"addressed",
	"closed",
	"rejected",
]

function Matrix(): React.ReactElement {
	return (
		<div data-token-hash={TOKEN_HASH}>
			{STATUSES.map((status) => (
				<div key={`default-${status}`} data-cell={`default-${status}`}>
					<FeedbackStatusBadge status={status} />
				</div>
			))}
			{STATUSES.map((status) => (
				<div
					key={`error-${status}`}
					data-cell={`error-${status}`}
					className="state-error bg-red-50 dark:bg-red-950/20 p-1"
				>
					<FeedbackStatusBadge status={status} />
				</div>
			))}
		</div>
	)
}

describe("FeedbackStatusBadge — state matrix", () => {
	it("renders every (status × {default, error-card}) cell (snapshot)", () => {
		const { container } = render(<Matrix />)
		expect(container.firstChild).toMatchSnapshot()
	})

	for (const status of STATUSES) {
		it(`attaches aria-label="Status: ${status}"`, () => {
			const { getByLabelText } = render(<FeedbackStatusBadge status={status} />)
			const node = getByLabelText(`Status: ${status}`)
			expect(node.textContent).toBe(status)
		})
	}

	it("rejected variant uses the AA-lifted text-stone-600 / dark:text-stone-300 pair", () => {
		const { getByLabelText } = render(<FeedbackStatusBadge status="rejected" />)
		const node = getByLabelText("Status: rejected")
		expect(node.className).toContain("text-stone-600")
		expect(node.className).toContain("dark:text-stone-300")
		// Rejected MUST NOT fall back to the banned stone-400 pair.
		expect(node.className).not.toContain("text-stone-400")
	})

	it("TOKEN_HASH is a 16-char hex string (snapshot-header contract)", () => {
		expect(TOKEN_HASH).toMatch(/^[0-9a-f]{16}$/)
	})
})

/**
 * State-matrix snapshot + label assertions for FeedbackOriginIcon
 * (state-coverage-grid.md §7.2).
 *
 * Cardinality: 6 origin variants × 2 label-visibility states = 12 cells.
 * Well under the 36-cell cap per unit spec.
 *
 * Critical regression guard: the visible label MUST be the humanized
 * `originLabels[origin]` value, NOT the raw `origin` slug. This is the
 * `{origin}` banned-pattern class.
 */

import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { FeedbackOriginIcon } from "../FeedbackOriginIcon"
import { type FeedbackOrigin, originLabels, TOKEN_HASH } from "../tokens"

afterEach(() => {
	cleanup()
})

const ORIGINS: FeedbackOrigin[] = [
	"adversarial-review",
	"external-pr",
	"external-mr",
	"user-visual",
	"user-chat",
	"agent",
]

function Matrix(): React.ReactElement {
	return (
		<div data-token-hash={TOKEN_HASH}>
			{ORIGINS.map((origin) => (
				<div key={`label-${origin}`} data-cell={`with-label-${origin}`}>
					<FeedbackOriginIcon origin={origin} showLabel />
				</div>
			))}
			{ORIGINS.map((origin) => (
				<div key={`icon-${origin}`} data-cell={`icon-only-${origin}`}>
					<FeedbackOriginIcon origin={origin} showLabel={false} />
				</div>
			))}
		</div>
	)
}

describe("FeedbackOriginIcon — state matrix", () => {
	it("renders every (origin × label-visibility) cell (snapshot)", () => {
		const { container } = render(<Matrix />)
		expect(container.firstChild).toMatchSnapshot()
	})

	for (const origin of ORIGINS) {
		it(`renders the human label "${originLabels[origin]}" for origin="${origin}" (not the slug)`, () => {
			const { getByText } = render(
				<FeedbackOriginIcon origin={origin} showLabel />,
			)
			const node = getByText(originLabels[origin])
			expect(node).toBeTruthy()
		})

		it(`never renders the raw slug "${origin}" as visible text`, () => {
			const { queryByText } = render(
				<FeedbackOriginIcon origin={origin} showLabel />,
			)
			// The label is humanized; the raw slug should not appear as text.
			// (We check for exact-text match; the label substring contains the
			// mapped humanized label, not the slug.)
			expect(queryByText(origin)).toBeNull()
		})
	}

	it("with-label: emoji is aria-hidden; label carries semantics", () => {
		const { container } = render(
			<FeedbackOriginIcon origin="adversarial-review" showLabel />,
		)
		const hidden = container.querySelector("[aria-hidden='true']")
		expect(hidden).not.toBeNull()
		// No role="img" when a label is visible.
		expect(container.querySelector("[role='img']")).toBeNull()
	})

	it("icon-only: emoji carries role=img + aria-label with the humanized label", () => {
		const { container } = render(
			<FeedbackOriginIcon origin="user-visual" showLabel={false} />,
		)
		const img = container.querySelector("[role='img']")
		expect(img).not.toBeNull()
		expect(img?.getAttribute("aria-label")).toBe(originLabels["user-visual"])
	})
})

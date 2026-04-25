/**
 * State-matrix snapshot for FeedbackSheet (state-coverage-grid.md §7.8, §3).
 *
 * FeedbackSheet is a <dialog>; we force-open the component in jsdom by
 * rendering with `open={true}`. jsdom's <dialog> element no-ops
 * `showModal()`, but the component still renders its descendants, which is
 * what the state matrix exercises.
 */

import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { FeedbackSheet } from "../FeedbackSheet"

afterEach(() => {
	cleanup()
})

describe("FeedbackSheet — state matrix", () => {
	it("renders every documented state cell (snapshot)", () => {
		const { container } = render(
			<div>
				<div data-cell="closed">
					<FeedbackSheet open={false} onClose={() => {}} title="Feedback" />
				</div>
				<div data-cell="open-empty">
					<FeedbackSheet open={true} onClose={() => {}} title="Feedback" />
				</div>
				<div data-cell="open-with-body">
					<FeedbackSheet open={true} onClose={() => {}} title="Feedback">
						<p>Body content</p>
					</FeedbackSheet>
				</div>
				<div data-cell="open-custom-title">
					<FeedbackSheet open={true} onClose={() => {}} title="Review notes" />
				</div>
				<div data-cell="open-custom-id">
					<FeedbackSheet
						open={true}
						onClose={() => {}}
						title="Feedback"
						id="feedback-sheet-alt"
					/>
				</div>
				<div data-cell="open-aria-labelled">
					<FeedbackSheet
						open={true}
						onClose={() => {}}
						title="Feedback"
						titleId="feedback-sheet-title-alt"
					/>
				</div>
			</div>,
		)
		expect(container.firstChild).toMatchSnapshot()
	})
})

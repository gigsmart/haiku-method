/**
 * State-matrix snapshot for RevisitModal (state-coverage-grid.md §7.12, §4).
 *
 * The modal is a native `<dialog>`; jsdom renders its children regardless of
 * the `.showModal()` no-op, so the state-matrix capture enumerates the
 * documented variants by prop combinations.
 */

import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RevisitModal } from "../RevisitModal"

beforeEach(() => {
	// Stabilize UUIDs so the snapshot is reproducible across runs.
	let counter = 0
	vi.spyOn(crypto, "randomUUID").mockImplementation(
		() => `11111111-2222-3333-4444-${String(counter++).padStart(12, "0")}`,
	)
})

afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
})

describe("RevisitModal — state matrix", () => {
	it("renders every documented state cell (snapshot)", () => {
		const { container } = render(
			<div>
				<div data-cell="closed">
					<RevisitModal sessionId="s1" open={false} onClose={() => {}} />
				</div>
				<div data-cell="open-default">
					<RevisitModal sessionId="s1" open={true} onClose={() => {}} />
				</div>
				<div data-cell="open-with-target-stage">
					<RevisitModal
						sessionId="s1"
						open={true}
						onClose={() => {}}
						targetStage="product"
					/>
				</div>
				<div data-cell="open-with-success-cb">
					<RevisitModal
						sessionId="s1"
						open={true}
						onClose={() => {}}
						onSuccess={() => {}}
					/>
				</div>
				<div data-cell="open-alt-session">
					<RevisitModal sessionId="s2-alt" open={true} onClose={() => {}} />
				</div>
				<div data-cell="open-target-development">
					<RevisitModal
						sessionId="s1"
						open={true}
						onClose={() => {}}
						targetStage="development"
					/>
				</div>
			</div>,
		)
		expect(container.firstChild).toMatchSnapshot()
	})
})

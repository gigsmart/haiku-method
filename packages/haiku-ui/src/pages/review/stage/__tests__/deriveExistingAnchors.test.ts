/**
 * Regression test for deriveExistingAnchors — the projector that hands
 * `inline_anchor` data to <InlineComments> for the PERSISTENT yellow
 * highlight layer.
 *
 * Boundary asserted here:
 *   - Open feedback (pending/fixing/addressed/answered) → painted
 *   - Closed / rejected feedback → NOT painted (would clutter)
 *
 * The click-to-flash path on a closed feedback card is driven by a
 * different prop (`flashAnchor`, computed on demand in
 * `-stage-content.tsx`) and IS NOT subject to this filter. That's the
 * "tap to remember what I said" UX — confirmed by reading the relevant
 * effect, no separate test needed here because the effect just reads
 * `item.inline_anchor` directly.
 */

import { describe, expect, it } from "vitest"
import type { FeedbackItemData } from "../../../../types"
import { deriveExistingAnchors } from "../StageReview"

function fb(
	id: string,
	status: FeedbackItemData["status"],
	hasAnchor: boolean,
): FeedbackItemData {
	return {
		feedback_id: id,
		title: `${id} title`,
		body: "body",
		status,
		origin: "user-chat",
		author: "user",
		author_type: "human",
		created_at: "2026-05-07T12:00:00Z",
		visit: 1,
		source_ref: null,
		closed_by: null,
		...(hasAnchor
			? {
					inline_anchor: {
						selected_text: `excerpt for ${id}`,
						paragraph: 0,
						location: "Unit: Test",
					},
				}
			: {}),
	} as FeedbackItemData
}

describe("deriveExistingAnchors", () => {
	it("includes open items that carry an inline_anchor", () => {
		const items = [
			fb("FB-01", "pending", true),
			fb("FB-02", "addressed", true),
			fb("FB-03", "fixing", true),
			fb("FB-04", "answered", true),
		]
		const out = deriveExistingAnchors(items)
		expect(out).toHaveLength(4)
		expect(out.map((a) => a.selectedText)).toEqual([
			"excerpt for FB-01",
			"excerpt for FB-02",
			"excerpt for FB-03",
			"excerpt for FB-04",
		])
	})

	it("excludes closed items from the persistent highlight layer", () => {
		const items = [fb("FB-01", "pending", true), fb("FB-02", "closed", true)]
		const out = deriveExistingAnchors(items)
		expect(out).toHaveLength(1)
		expect(out[0].selectedText).toBe("excerpt for FB-01")
	})

	it("excludes rejected items from the persistent highlight layer", () => {
		const items = [fb("FB-01", "pending", true), fb("FB-02", "rejected", true)]
		const out = deriveExistingAnchors(items)
		expect(out).toHaveLength(1)
		expect(out[0].selectedText).toBe("excerpt for FB-01")
	})

	it("skips items without an inline_anchor", () => {
		const items = [fb("FB-01", "pending", false), fb("FB-02", "pending", true)]
		const out = deriveExistingAnchors(items)
		expect(out).toHaveLength(1)
		expect(out[0].selectedText).toBe("excerpt for FB-02")
	})

	it("returns empty for an empty list", () => {
		expect(deriveExistingAnchors([])).toEqual([])
	})
})

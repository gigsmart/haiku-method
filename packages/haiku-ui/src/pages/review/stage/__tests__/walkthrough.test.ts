/**
 * Tests for `composeWalkthroughItems` — the pure function that picks
 * the relevant set of items for the StageReview walkthrough based on
 * which gate fired.
 *
 * The mapping is load-bearing for the user-facing review flow:
 *   - pre-exec gates (`elaborate_to_execute`) → units only
 *   - post-exec gates (`stage_gate`, `intent_completion`) → outputs only
 *   - everything else → existing units → knowledge → outputs union
 */

import { describe, expect, it } from "vitest"
import { composeWalkthroughItems } from "../walkthrough"

const inputs = {
	units: [{ slug: "unit-01-acceptance" }, { slug: "unit-02-design" }],
	knowledgeVMs: [{ name: "DISCOVERY" }, { name: "knowledge/UPLOAD-FLOW" }],
	outputVMs: [{ name: "ARCHITECTURE" }, { name: "wireframes/foo" }],
}

describe("composeWalkthroughItems", () => {
	it("elaborate_to_execute → units only", () => {
		const items = composeWalkthroughItems("elaborate_to_execute", inputs)
		expect(items.map((i) => i.tab)).toEqual(["units", "units"])
		expect(items.map((i) => i.name)).toEqual([
			"unit-01-acceptance",
			"unit-02-design",
		])
	})

	it("stage_gate → outputs only", () => {
		const items = composeWalkthroughItems("stage_gate", inputs)
		expect(items.map((i) => i.tab)).toEqual(["outputs", "outputs"])
		expect(items.map((i) => i.name)).toEqual(["ARCHITECTURE", "wireframes/foo"])
	})

	it("intent_completion → outputs only", () => {
		const items = composeWalkthroughItems("intent_completion", inputs)
		expect(items.map((i) => i.tab)).toEqual(["outputs", "outputs"])
		expect(items.map((i) => i.name)).toEqual(["ARCHITECTURE", "wireframes/foo"])
	})

	it("intent_review → falls through to the union (handled at IntentReview surface)", () => {
		const items = composeWalkthroughItems("intent_review", inputs)
		expect(items.map((i) => i.tab)).toEqual([
			"units",
			"units",
			"knowledge",
			"knowledge",
			"outputs",
			"outputs",
		])
	})

	it("undefined gate context → existing union (back-compat for ad-hoc reviews)", () => {
		const items = composeWalkthroughItems(undefined, inputs)
		expect(items.map((i) => i.tab)).toEqual([
			"units",
			"units",
			"knowledge",
			"knowledge",
			"outputs",
			"outputs",
		])
	})

	it("unknown gate context → falls through to the union", () => {
		const items = composeWalkthroughItems(
			"future_gate_we_dont_know_about",
			inputs,
		)
		expect(items.map((i) => i.tab)).toEqual([
			"units",
			"units",
			"knowledge",
			"knowledge",
			"outputs",
			"outputs",
		])
	})

	it("empty inputs produce empty output regardless of gate context", () => {
		const empty = { units: [], knowledgeVMs: [], outputVMs: [] }
		expect(composeWalkthroughItems("elaborate_to_execute", empty)).toEqual([])
		expect(composeWalkthroughItems("stage_gate", empty)).toEqual([])
		expect(composeWalkthroughItems(undefined, empty)).toEqual([])
	})

	it("preserves union order: units → knowledge → outputs", () => {
		const items = composeWalkthroughItems(undefined, inputs)
		// First two are units, then knowledge, then outputs.
		expect(items[0].tab).toBe("units")
		expect(items[1].tab).toBe("units")
		expect(items[2].tab).toBe("knowledge")
		expect(items[3].tab).toBe("knowledge")
		expect(items[4].tab).toBe("outputs")
		expect(items[5].tab).toBe("outputs")
	})
})

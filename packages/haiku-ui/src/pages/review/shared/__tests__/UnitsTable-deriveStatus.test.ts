/**
 * Tests for `deriveUnitStatus` — UnitsTable's v3↔v4 dual-path status
 * derivation. v3 wrote `status` directly. v4 dropped it; the SPA must
 * derive completion from `iterations[]`.
 */

import { describe, expect, it } from "vitest"
import { deriveUnitStatus } from "../UnitsTable"

describe("deriveUnitStatus", () => {
	it("v3 — explicit status wins", () => {
		expect(deriveUnitStatus({ status: "completed" })).toBe("completed")
		expect(deriveUnitStatus({ status: "rejected" })).toBe("rejected")
		expect(deriveUnitStatus({ status: "in_progress" })).toBe("in_progress")
	})

	it("v3 — explicit status is preferred even if v4 iterations exist", () => {
		expect(
			deriveUnitStatus({
				status: "in_progress",
				iterations: [
					{ hat: "verifier", result: "advance", started_at: "x" },
				],
			}),
		).toBe("in_progress")
	})

	it("v4 — last iteration result === advance => completed", () => {
		expect(
			deriveUnitStatus({
				iterations: [
					{ hat: "researcher", result: "advance" },
					{ hat: "distiller", result: "advance" },
					{ hat: "verifier", result: "advance" },
				],
			}),
		).toBe("completed")
	})

	it("v4 — last iteration result === reject => rejected", () => {
		expect(
			deriveUnitStatus({
				iterations: [
					{ hat: "researcher", result: "advance" },
					{ hat: "verifier", result: "reject" },
				],
			}),
		).toBe("rejected")
	})

	it("v4 — earlier reject does NOT shadow a later advance", () => {
		// A reject creates a new iteration on the same hat; the LAST
		// iteration is what matters.
		expect(
			deriveUnitStatus({
				iterations: [
					{ hat: "researcher", result: "advance" },
					{ hat: "verifier", result: "reject" },
					{ hat: "researcher", result: "advance" },
					{ hat: "verifier", result: "advance" },
				],
			}),
		).toBe("completed")
	})

	it("v4 — iterations exist but last has no result yet => in_progress", () => {
		expect(
			deriveUnitStatus({
				iterations: [
					{ hat: "researcher", result: "advance" },
					{ hat: "distiller" }, // no `result` yet
				],
			}),
		).toBe("in_progress")
	})

	it("empty iterations + no status => pending", () => {
		expect(deriveUnitStatus({ iterations: [] })).toBe("pending")
	})

	it("nothing on FM at all => pending", () => {
		expect(deriveUnitStatus({})).toBe("pending")
	})
})

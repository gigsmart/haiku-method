/**
 * Tests for the v3↔v4 dual-path helpers in `-review-helpers.ts`.
 *
 * Both helpers are load-bearing for the SPA's terminal-intent guard
 * (deep links to `/stages/<X>` redirect to `/intent` only when this
 * fires) and the per-stage status display (the chrome shows
 * "completed" when v4 stages merge into intent main, even though v4
 * never writes `status: completed` to per-stage state.json).
 */

import { describe, expect, it } from "vitest"
import type { ReviewPageSessionData } from "../../../../pages/review/shared/session-data"
import { isIntentTerminal, resolveActiveStage } from "../-review-helpers"

function makeSession(
	intentFrontmatter: Record<string, unknown>,
	stageStates: Record<string, unknown> = {},
	currentState: { stage?: string } | undefined = undefined,
): ReviewPageSessionData {
	return {
		intent: {
			slug: "test",
			title: "test",
			frontmatter: intentFrontmatter as never,
			sections: [],
			rawContent: "",
		},
		units: [],
		stage_states: stageStates as never,
		current_state: currentState as never,
	} as unknown as ReviewPageSessionData
}

describe("isIntentTerminal", () => {
	it("v4 — sealed_at set => terminal", () => {
		expect(
			isIntentTerminal(makeSession({ sealed_at: "2026-05-06T00:00:00Z" })),
		).toBe(true)
	})

	it("v4 — sealed_at empty string => not terminal", () => {
		expect(isIntentTerminal(makeSession({ sealed_at: "" }))).toBe(false)
	})

	it("v4 — sealed_at missing entirely => not terminal", () => {
		expect(isIntentTerminal(makeSession({}))).toBe(false)
	})

	it("v3 fallback — status: completed => terminal", () => {
		expect(isIntentTerminal(makeSession({ status: "completed" }))).toBe(true)
	})

	it("v3 fallback — phase: awaiting_completion_review => terminal", () => {
		expect(
			isIntentTerminal(makeSession({ phase: "awaiting_completion_review" })),
		).toBe(true)
	})

	it("v3 fallback — phase: intent_completion => terminal", () => {
		expect(isIntentTerminal(makeSession({ phase: "intent_completion" }))).toBe(
			true,
		)
	})

	it("v3 fallback — phase: execute => not terminal", () => {
		expect(isIntentTerminal(makeSession({ phase: "execute" }))).toBe(false)
	})

	it("dual presence — v4 sealed_at wins even if v3 status missing", () => {
		expect(
			isIntentTerminal(
				makeSession({ sealed_at: "2026-05-06T00:00:00Z", status: undefined }),
			),
		).toBe(true)
	})

	it("missing intent => not terminal", () => {
		const session = { intent: null } as unknown as ReviewPageSessionData
		expect(isIntentTerminal(session)).toBe(false)
	})
})

describe("resolveActiveStage v4 mergedIntoMain path", () => {
	it("returns first stage with mergedIntoMain === false", () => {
		const session = makeSession(
			{ stages: ["a", "b", "c"] },
			{
				a: { mergedIntoMain: true },
				b: { mergedIntoMain: false },
				c: { mergedIntoMain: false },
			},
		)
		expect(resolveActiveStage(session)).toBe("b")
	})

	it("falls back to v3 status === active when mergedIntoMain absent", () => {
		const session = makeSession(
			{ stages: ["a", "b"] },
			{
				a: { status: "completed" },
				b: { status: "active" },
			},
		)
		expect(resolveActiveStage(session)).toBe("b")
	})

	it("prefers server-authoritative current_state.stage when present", () => {
		const session = makeSession(
			{ stages: ["a", "b"] },
			{
				a: { mergedIntoMain: false },
				b: { mergedIntoMain: true },
			},
			{ stage: "a" },
		)
		expect(resolveActiveStage(session)).toBe("a")
	})
})

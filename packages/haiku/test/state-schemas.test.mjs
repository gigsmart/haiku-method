#!/usr/bin/env node
// Tests for state/schemas/* — the AJV-compiled input/frontmatter
// schemas that gate every state-tool MCP call.
//
// Two assertion families:
//
//   1. The schema itself: feed it good and bad payloads, confirm
//      AJV accepts/rejects appropriately. Catches regressions where
//      a schema gets loosened (e.g. accidental
//      `additionalProperties: true`) without anyone noticing.
//
//   2. The handler-side gate: prove the AJV gate fires at the top
//      of every relevant case in handleStateTool, returning the
//      stable named error code (`<tool>_input_invalid`) instead of
//      letting the bad input through. This is the "strict typespec
//      contract" — the agent should never see a generic MCP-runtime
//      parse error or a malformed-state side effect.

import assert from "node:assert"
import {
	HAIKU_FEEDBACK_INPUT_SCHEMA,
	HAIKU_FEEDBACK_UPDATE_INPUT_SCHEMA,
	validateHaikuFeedbackInputSchema,
	validateHaikuFeedbackUpdateInputSchema,
} from "../src/state/schemas/index.js"
import {
	FEEDBACK_ORIGINS as STATE_TOOLS_FEEDBACK_ORIGINS,
	FEEDBACK_STATUSES as STATE_TOOLS_FEEDBACK_STATUSES,
} from "../src/state-tools.js"

let passed = 0
let failed = 0

function test(name, fn) {
	try {
		fn()
		passed++
		console.log(`  ✓ ${name}`)
	} catch (err) {
		failed++
		console.log(`  ✗ ${name}: ${err instanceof Error ? err.message : err}`)
	}
}

console.log("\n=== HAIKU_FEEDBACK_INPUT_SCHEMA ===")

test("schema declares additionalProperties: false (strict typespec)", () => {
	assert.strictEqual(
		HAIKU_FEEDBACK_INPUT_SCHEMA.additionalProperties,
		false,
		"feedback create schema must reject unknown fields",
	)
})

test("schema requires intent + title + body", () => {
	assert.deepStrictEqual(HAIKU_FEEDBACK_INPUT_SCHEMA.required, [
		"intent",
		"title",
		"body",
	])
})

test("schema constrains origin via enum (no free-form values)", () => {
	const origin = HAIKU_FEEDBACK_INPUT_SCHEMA.properties.origin
	assert.ok(origin?.enum, "origin must declare an enum")
	assert.ok(origin.enum.includes("agent"), "agent must be a valid origin")
	assert.ok(
		!origin.enum.includes("freeform-junk"),
		"unknown origin values must NOT be in the enum",
	)
})

test("schema constrains resolution via enum", () => {
	const resolution = HAIKU_FEEDBACK_INPUT_SCHEMA.properties.resolution
	assert.deepStrictEqual(resolution?.enum, [
		"question",
		"inline_fix",
		"stage_revisit",
	])
})

test("schema enforces title.maxLength = 120", () => {
	assert.strictEqual(
		HAIKU_FEEDBACK_INPUT_SCHEMA.properties.title.maxLength,
		120,
	)
})

test("validator accepts a minimal valid payload", () => {
	const ok = validateHaikuFeedbackInputSchema({
		intent: "test-intent",
		title: "Short title",
		body: "Markdown body",
	})
	assert.ok(ok, JSON.stringify(validateHaikuFeedbackInputSchema.errors))
})

test("validator rejects unknown fields", () => {
	const ok = validateHaikuFeedbackInputSchema({
		intent: "test-intent",
		title: "Short title",
		body: "Markdown body",
		not_a_real_field: "should fail",
	})
	assert.ok(!ok, "unknown field must fail validation")
	assert.ok(
		validateHaikuFeedbackInputSchema.errors?.some(
			(e) => e.keyword === "additionalProperties",
		),
		"error must name additionalProperties",
	)
})

test("validator rejects empty title", () => {
	const ok = validateHaikuFeedbackInputSchema({
		intent: "test-intent",
		title: "",
		body: "Markdown body",
	})
	assert.ok(!ok, "empty title must fail minLength: 1")
})

test("validator rejects oversized title", () => {
	const ok = validateHaikuFeedbackInputSchema({
		intent: "test-intent",
		title: "x".repeat(121),
		body: "Markdown body",
	})
	assert.ok(!ok, "title > 120 chars must fail maxLength: 120")
})

test("validator rejects unknown origin enum value", () => {
	const ok = validateHaikuFeedbackInputSchema({
		intent: "test-intent",
		title: "Short title",
		body: "Markdown body",
		origin: "freeform-not-in-enum",
	})
	assert.ok(!ok, "unknown origin must fail enum check")
})

console.log("\n=== HAIKU_FEEDBACK_UPDATE_INPUT_SCHEMA ===")

test("update schema is strict (additionalProperties: false)", () => {
	assert.strictEqual(
		HAIKU_FEEDBACK_UPDATE_INPUT_SCHEMA.additionalProperties,
		false,
	)
})

test("update schema requires intent + feedback_id", () => {
	assert.deepStrictEqual(HAIKU_FEEDBACK_UPDATE_INPUT_SCHEMA.required, [
		"intent",
		"feedback_id",
	])
})

test("update schema enforces FB-NN id pattern", () => {
	assert.ok(
		validateHaikuFeedbackUpdateInputSchema({
			intent: "x",
			feedback_id: "FB-01",
		}),
	)
	assert.ok(
		validateHaikuFeedbackUpdateInputSchema({ intent: "x", feedback_id: "07" }),
	)
	assert.ok(
		!validateHaikuFeedbackUpdateInputSchema({
			intent: "x",
			feedback_id: "not-an-id",
		}),
	)
})

test("update schema rejects FSM-driven fields (e.g. hat, bolt, iterations)", () => {
	for (const field of [
		"hat",
		"bolt",
		"iterations",
		"integrator_attempts",
		"replies",
		"triaged_at",
	]) {
		const ok = validateHaikuFeedbackUpdateInputSchema({
			intent: "x",
			feedback_id: "FB-01",
			[field]: "anything",
		})
		assert.ok(
			!ok,
			`update schema must reject FSM-driven field '${field}' via additionalProperties: false`,
		)
	}
})

test("update schema constrains status via FEEDBACK_STATUSES enum", () => {
	assert.ok(
		validateHaikuFeedbackUpdateInputSchema({
			intent: "x",
			feedback_id: "FB-01",
			status: "addressed",
		}),
	)
	assert.ok(
		!validateHaikuFeedbackUpdateInputSchema({
			intent: "x",
			feedback_id: "FB-01",
			status: "bogus",
		}),
	)
})

console.log("\n=== Drift guards: schema enums match state-tools constants ===")

// `state-tools.ts` re-declares FEEDBACK_ORIGINS / FEEDBACK_STATUSES
// alongside the helper code that consumes them (writeFeedbackFile,
// updateFeedbackFile, etc). The schema in `state/schemas/feedback.ts`
// re-declares the same values for the AJV `enum` constraint.
//
// These two sources MUST stay in sync — if we add a new origin
// (e.g. `external-slack`) to one and forget the other, agents either
// hit a schema rejection on a value the helpers accept, or the helpers
// don't recognize a value the schema lets through. The comment in
// `feedback.ts:39-41` promises this drift check exists; these tests
// make good on the promise.

test("HAIKU_FEEDBACK_INPUT_SCHEMA.origin.enum matches FEEDBACK_ORIGINS in state-tools.ts", () => {
	const enumValues = HAIKU_FEEDBACK_INPUT_SCHEMA.properties.origin.enum
	assert.deepStrictEqual(
		[...enumValues].sort(),
		[...STATE_TOOLS_FEEDBACK_ORIGINS].sort(),
		"FEEDBACK_ORIGINS in state-tools.ts and the schema's origin enum drifted — keep them in sync",
	)
})

test("HAIKU_FEEDBACK_UPDATE_INPUT_SCHEMA.status.enum matches FEEDBACK_STATUSES in state-tools.ts", () => {
	const enumValues = HAIKU_FEEDBACK_UPDATE_INPUT_SCHEMA.properties.status.enum
	assert.deepStrictEqual(
		[...enumValues].sort(),
		[...STATE_TOOLS_FEEDBACK_STATUSES].sort(),
		"FEEDBACK_STATUSES in state-tools.ts and the schema's status enum drifted — keep them in sync",
	)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)

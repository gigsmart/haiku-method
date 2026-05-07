#!/usr/bin/env npx tsx
// Test that the announcement contract block lands in every multi-spawn
// fan-out prompt. Designer-freaked-out fix (2026-05-06): a designer
// using H·AI·K·U watched four discovery agents kick off silently and
// got panicky. Without an announcement contract, the parent agent
// might not narrate the spawn — depends on its discretion. This block
// bakes the rule in at the prompt layer, so every multi-spawn dispatch
// includes it verbatim.

import assert from "node:assert"
import startUnitHat from "../src/orchestrator/prompts/start_unit_hat.ts"
import { WORKFLOW_CONTRACTS_ANNOUNCEMENT_BLOCK } from "../src/orchestrator/prompts/WORKFLOW_CONTRACTS_ANNOUNCEMENT_BLOCK.ts"

let passed = 0
let failed = 0

function test(name, fn) {
	try {
		fn()
		passed++
		console.log(`  ✓ ${name}`)
	} catch (e) {
		failed++
		console.log(`  ✗ ${name}: ${e.message}`)
	}
}

console.log("\n── Announcement Contract: block content ──────────────────────")

test("block names the symptom", () => {
	assert.match(WORKFLOW_CONTRACTS_ANNOUNCEMENT_BLOCK, /silent.*panic|panic/i)
})

test("block forbids tool-name jargon", () => {
	assert.match(WORKFLOW_CONTRACTS_ANNOUNCEMENT_BLOCK, /tool names/i)
})

test("block requires the announcement and the spawn in one response", () => {
	assert.match(
		WORKFLOW_CONTRACTS_ANNOUNCEMENT_BLOCK,
		/same response|single message/i,
	)
})

test("block carries a good and a bad example", () => {
	assert.match(WORKFLOW_CONTRACTS_ANNOUNCEMENT_BLOCK, /\*\*Good:\*\*/)
	assert.match(WORKFLOW_CONTRACTS_ANNOUNCEMENT_BLOCK, /\*\*Bad:\*\*/)
})

console.log("\n── Announcement Contract: emission in start_unit_hat ──────────")

const ctx = (action) => ({
	slug: "intent-test",
	studio: "test-studio",
	action,
	dir: "/tmp",
})

test("multi-unit hat dispatch includes the announcement block", () => {
	const out = startUnitHat(
		ctx({
			stage: "design",
			hat: "researcher",
			units: ["unit-01-foo", "unit-02-bar", "unit-03-baz"],
		}),
	)
	assert.ok(
		out.includes(WORKFLOW_CONTRACTS_ANNOUNCEMENT_BLOCK),
		"announcement block missing from multi-unit start_unit_hat output",
	)
})

test("single-unit hat dispatch SKIPS the announcement block", () => {
	const out = startUnitHat(
		ctx({
			stage: "design",
			hat: "researcher",
			units: ["unit-01-foo"],
		}),
	)
	assert.ok(
		!out.includes(WORKFLOW_CONTRACTS_ANNOUNCEMENT_BLOCK),
		"announcement block should NOT appear for single-spawn dispatches (no panic risk)",
	)
})

test("zero-unit dispatch returns the noop hint", () => {
	const out = startUnitHat(
		ctx({
			stage: "design",
			hat: "researcher",
			units: [],
		}),
	)
	assert.match(out, /no units|retick/i)
})

console.log(`\n── Result: ${passed} passed, ${failed} failed ──────────────────`)
process.exit(failed > 0 ? 1 : 0)

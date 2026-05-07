#!/usr/bin/env npx tsx
// Locks in the (2026-05-06) UX fix: gate-review timeouts are
// "still waiting" continuation cues, not failures. Without these
// helpers, regressions silently flip back to `isError: true`, which
// resurrects the noisy retry-loop the user complained about.

import assert from "node:assert"
import {
	buildAwaitTimeoutResponse,
	isAwaitWaitTimeoutError,
} from "../src/tools/orchestrator/_await_gate_timeout.ts"

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

console.log("\n── isAwaitWaitTimeoutError ────────────────────────────────")

test("recognises lowercase 'timeout' anywhere in the message", () => {
	assert.strictEqual(isAwaitWaitTimeoutError("operation timeout"), true)
	assert.strictEqual(
		isAwaitWaitTimeoutError("Promise rejected after timeout"),
		true,
	)
})

test("recognises capitalised 'Timeout'", () => {
	assert.strictEqual(isAwaitWaitTimeoutError("Timeout"), true)
})

test("recognises 'Review timeout' (the legacy phrasing)", () => {
	assert.strictEqual(
		isAwaitWaitTimeoutError("Review timeout after 30 minutes"),
		true,
	)
})

test("recognises 'Session timeout' (the sessions.ts phrasing)", () => {
	assert.strictEqual(isAwaitWaitTimeoutError("Session timeout"), true)
})

test("does NOT classify generic errors as timeouts", () => {
	assert.strictEqual(isAwaitWaitTimeoutError("ENOENT: no such file"), false)
	assert.strictEqual(
		isAwaitWaitTimeoutError("Could not parse intent frontmatter"),
		false,
	)
	assert.strictEqual(
		isAwaitWaitTimeoutError("session not found"),
		false,
	)
})

console.log("\n── buildAwaitTimeoutResponse ──────────────────────────────")

test("response carries isError: false (regression guard)", () => {
	const r = buildAwaitTimeoutResponse("test-intent")
	assert.strictEqual(
		r.isError,
		false,
		"Timeout response MUST be isError: false — flipping it back to true resurrects the noisy retry-loop UX bug",
	)
})

test("response message contains the intent slug", () => {
	const r = buildAwaitTimeoutResponse("ingest-pipeline-rebuild")
	assert.match(r.content[0].text, /ingest-pipeline-rebuild/)
})

test("response tells the agent it's normal + how to re-await", () => {
	const r = buildAwaitTimeoutResponse("test-intent")
	const text = r.content[0].text
	assert.match(text, /still waiting/i)
	assert.match(text, /this is normal/i)
	assert.match(text, /haiku_await_gate/)
})

test("response does NOT use alarming language ('failed', 'error')", () => {
	const r = buildAwaitTimeoutResponse("test-intent")
	const text = r.content[0].text.toLowerCase()
	assert.ok(
		!text.includes("error"),
		"timeout message must not mention 'error' — the agent surfaces those to the user as faults",
	)
	assert.ok(
		!text.includes("fail"),
		"timeout message must not mention 'fail' — same reason",
	)
})

console.log(`\n── Result: ${passed} passed, ${failed} failed ────────────────────`)
process.exit(failed > 0 ? 1 : 0)

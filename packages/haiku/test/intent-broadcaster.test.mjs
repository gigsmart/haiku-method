#!/usr/bin/env npx tsx
// Test suite for the per-intent live-state broadcaster.
//
// Covers:
//  - Single subscribe/broadcast/unsubscribe round-trip.
//  - Multiple subscribers on the same intent both receive events.
//  - Subscribers on different intents are isolated.
//  - Unsubscribe stops further deliveries.

import assert from "node:assert"

import {
	_resetIntentBroadcaster,
	broadcastIntent,
	subscribeIntent,
} from "../src/intent-broadcaster.ts"

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

console.log("\n=== intent-broadcaster ===")

test("single subscriber receives a broadcast", () => {
	_resetIntentBroadcaster()
	const received = []
	const unsub = subscribeIntent("a", (e) => received.push(e))
	broadcastIntent("a", {
		type: "tick_committed",
		action: "advance_phase",
		phase: "execute",
		stage: "design",
	})
	assert.strictEqual(received.length, 1)
	assert.strictEqual(received[0].type, "tick_committed")
	assert.strictEqual(received[0].action, "advance_phase")
	unsub()
})

test("two subscribers on the same intent both fire", () => {
	_resetIntentBroadcaster()
	const a = []
	const b = []
	const unsubA = subscribeIntent("intent-1", (e) => a.push(e))
	const unsubB = subscribeIntent("intent-1", (e) => b.push(e))
	broadcastIntent("intent-1", {
		type: "await_state_changed",
		session_id: "s1",
		await_active: true,
	})
	assert.strictEqual(a.length, 1)
	assert.strictEqual(b.length, 1)
	assert.strictEqual(a[0].await_active, true)
	assert.strictEqual(b[0].await_active, true)
	unsubA()
	unsubB()
})

test("subscribers on different intents stay isolated", () => {
	_resetIntentBroadcaster()
	const aEvents = []
	const bEvents = []
	const unsubA = subscribeIntent("intent-A", (e) => aEvents.push(e))
	const unsubB = subscribeIntent("intent-B", (e) => bEvents.push(e))
	broadcastIntent("intent-A", {
		type: "feedback_changed",
		feedback_id: "FB-001",
		status: "open",
	})
	assert.strictEqual(aEvents.length, 1)
	assert.strictEqual(bEvents.length, 0)
	broadcastIntent("intent-B", {
		type: "unit_changed",
		unit_name: "unit-01",
		status: "completed",
	})
	assert.strictEqual(aEvents.length, 1)
	assert.strictEqual(bEvents.length, 1)
	unsubA()
	unsubB()
})

test("unsubscribe stops further deliveries", () => {
	_resetIntentBroadcaster()
	const received = []
	const unsub = subscribeIntent("x", (e) => received.push(e))
	broadcastIntent("x", {
		type: "tick_committed",
		action: "advance_stage",
	})
	unsub()
	broadcastIntent("x", {
		type: "tick_committed",
		action: "feedback_dispatch",
	})
	assert.strictEqual(
		received.length,
		1,
		"unsubscribed listener should not fire",
	)
})

test("broadcast to an intent with no subscribers is a no-op", () => {
	_resetIntentBroadcaster()
	// Just shouldn't throw.
	broadcastIntent("nobody-listening", {
		type: "tick_committed",
		action: "noop",
	})
	assert.ok(true)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)

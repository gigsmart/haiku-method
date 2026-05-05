#!/usr/bin/env npx tsx
// Test suite for the live-session redesign of haiku_await_gate.
//
// Covers:
//  - Decision queued before any await opens → next await drains immediately.
//  - Decision queued during an active await → await wakes and consumes via
//    notifySessionUpdate path.
//  - Two queued decisions → last-write-wins (most recent submit consumed).
//  - Session survives an await timeout (no deletion, can be re-awaited).
//  - await_active flag tracks the lifecycle (false → true → false).

import assert from "node:assert"

import { startHttpServer, stopHttpServer } from "../src/http.ts"
import { awaitGateReviewSession } from "../src/server/tool-call.ts"
import {
	createSession,
	deleteSession,
	findLiveReviewSessionForIntent,
	getSession,
	notifySessionUpdate,
	updateSession,
} from "../src/sessions.ts"

let passed = 0
let failed = 0

function test(name, fn) {
	try {
		const result = fn()
		if (result && typeof result.then === "function") {
			return result.then(
				() => {
					passed++
					console.log(`  ✓ ${name}`)
				},
				(e) => {
					failed++
					console.log(`  ✗ ${name}: ${e.message}`)
				},
			)
		}
		passed++
		console.log(`  ✓ ${name}`)
	} catch (e) {
		failed++
		console.log(`  ✗ ${name}: ${e.message}`)
	}
}

function makeSession() {
	return createSession({
		intent_dir: "/tmp/no-such-dir",
		intent_slug: "test-intent",
		target: "test",
	})
}

console.log("\n=== haiku_await_gate live-session queueing ===")

await test("queued decision drains on entry (no waiting)", async () => {
	const session = makeSession()
	updateSession(session.session_id, {
		pending_decision: {
			decision: "approved",
			feedback: "lgtm",
			submitted_at: new Date().toISOString(),
		},
	})
	const result = await awaitGateReviewSession(session.session_id, {
		autoOpen: false,
		timeoutMs: 30_000,
	})
	assert.strictEqual(result.decision, "approved")
	assert.strictEqual(result.feedback, "lgtm")
	const after = getSession(session.session_id)
	assert.ok(after, "session should still exist after await")
	assert.ok(
		!after.pending_decision,
		"pending_decision should be cleared after drain",
	)
	deleteSession(session.session_id)
})

await test("decision submitted during active await wakes and consumes", async () => {
	const session = makeSession()
	const promise = awaitGateReviewSession(session.session_id, {
		autoOpen: false,
		timeoutMs: 5_000,
	})
	// Give the await a tick to mark itself active before we submit.
	await new Promise((r) => setTimeout(r, 50))
	const live = getSession(session.session_id)
	assert.ok(live, "session should still exist mid-await")
	assert.strictEqual(live.await_active, true, "await_active should be true")

	updateSession(session.session_id, {
		pending_decision: {
			decision: "changes_requested",
			feedback: "need more detail",
			submitted_at: new Date().toISOString(),
		},
	})
	notifySessionUpdate(session.session_id)

	const result = await promise
	assert.strictEqual(result.decision, "changes_requested")
	assert.strictEqual(result.feedback, "need more detail")
	const after = getSession(session.session_id)
	assert.ok(after, "session should still exist after await ends")
	assert.strictEqual(after.await_active, false, "await_active should reset")
	deleteSession(session.session_id)
})

await test("last-write-wins on multiple submits", async () => {
	const session = makeSession()
	updateSession(session.session_id, {
		pending_decision: {
			decision: "approved",
			feedback: "first take",
			submitted_at: new Date().toISOString(),
		},
	})
	updateSession(session.session_id, {
		pending_decision: {
			decision: "changes_requested",
			feedback: "second take",
			submitted_at: new Date().toISOString(),
		},
	})
	const result = await awaitGateReviewSession(session.session_id, {
		autoOpen: false,
		timeoutMs: 30_000,
	})
	assert.strictEqual(result.decision, "changes_requested")
	assert.strictEqual(result.feedback, "second take")
	deleteSession(session.session_id)
})

await test("revisit-style queued decision drains with annotations intact", async () => {
	// The revisit endpoint (POST /api/revisit/:sessionId) writes a
	// pending_decision with revisit_action / revisit_stage /
	// revisit_message annotations. awaitGateReviewSession must drain
	// it AND surface the annotations so haiku_await_gate's revisit
	// short-circuit can dispatch correctly. This guards the bug
	// where the revisit endpoint was left on status="decided" while
	// the rest of the system migrated to pending_decision.
	const session = makeSession()
	updateSession(session.session_id, {
		pending_decision: {
			decision: "changes_requested",
			feedback: "",
			annotations: {
				revisit_action: "revisit_pending",
				revisit_stage: "design",
				revisit_message: "Created 1 stage_revisit feedback item.",
			},
			submitted_at: new Date().toISOString(),
		},
	})
	const result = await awaitGateReviewSession(session.session_id, {
		autoOpen: false,
		timeoutMs: 30_000,
	})
	assert.strictEqual(result.decision, "changes_requested")
	const ann = result.annotations
	assert.ok(ann, "annotations should pass through to caller")
	assert.strictEqual(ann.revisit_action, "revisit_pending")
	assert.strictEqual(ann.revisit_stage, "design")
	assert.match(ann.revisit_message, /stage_revisit/)
	deleteSession(session.session_id)
})

await test("await unwinds promptly when MCP signal aborts", async () => {
	const session = makeSession()
	const controller = new AbortController()
	const start = Date.now()
	const promise = awaitGateReviewSession(session.session_id, {
		autoOpen: false,
		timeoutMs: 30 * 60 * 1000,
		signal: controller.signal,
	})
	await new Promise((r) => setTimeout(r, 50))
	controller.abort("test cancel")

	let threw = false
	try {
		await promise
	} catch (err) {
		threw = true
		assert.match(err.message, /abort/i, "expected abort error message")
	}
	const elapsed = Date.now() - start
	assert.ok(threw, "await should reject on signal abort")
	assert.ok(
		elapsed < 5_000,
		`abort should unwind in well under 5s, got ${elapsed}ms`,
	)
	const after = getSession(session.session_id)
	assert.ok(after, "session must outlive an aborted await")
	assert.strictEqual(after.await_active, false, "await_active should reset")
	deleteSession(session.session_id)
})

await test("session survives await timeout, can be re-awaited", async () => {
	const session = makeSession()
	let threw = false
	try {
		await awaitGateReviewSession(session.session_id, {
			autoOpen: false,
			timeoutMs: 100,
		})
	} catch (err) {
		threw = true
		assert.match(err.message, /timeout/i)
	}
	assert.ok(threw, "await should throw on timeout")

	const after = getSession(session.session_id)
	assert.ok(after, "session must outlive the await timeout")
	assert.strictEqual(
		after.await_active,
		false,
		"await_active should be reset after timeout",
	)
	assert.strictEqual(
		after.await_count,
		1,
		"await_count should reflect the timed-out await",
	)
	assert.ok(after.last_await_started_at, "last_await_started_at should be set")
	assert.ok(after.last_await_ended_at, "last_await_ended_at should be set")

	// Submit a decision and re-await — should drain immediately.
	updateSession(session.session_id, {
		pending_decision: {
			decision: "approved",
			feedback: "after retry",
			submitted_at: new Date().toISOString(),
		},
	})
	const result = await awaitGateReviewSession(session.session_id, {
		autoOpen: false,
		timeoutMs: 30_000,
	})
	assert.strictEqual(result.decision, "approved")
	assert.strictEqual(result.feedback, "after retry")
	const final = getSession(session.session_id)
	assert.strictEqual(
		final.await_count,
		2,
		"await_count should increment on re-await",
	)
	deleteSession(session.session_id)
})

console.log("\n=== HTTP /review/:id/decide → pending_decision pipeline ===")

await test("HTTP submit queues pending_decision and unblocks await", async () => {
	const port = await startHttpServer()
	const session = makeSession()
	const promise = awaitGateReviewSession(session.session_id, {
		autoOpen: false,
		timeoutMs: 5_000,
	})
	// Wait for the await to mark itself active before submitting.
	await new Promise((r) => setTimeout(r, 50))

	const res = await fetch(
		`http://127.0.0.1:${port}/review/${session.session_id}/decide`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				decision: "approved",
				feedback: "looks good",
			}),
		},
	)
	assert.strictEqual(res.status, 200, "HTTP decide should return 200")
	const body = await res.json()
	assert.strictEqual(body.ok, true)
	assert.strictEqual(body.decision, "approved")

	// awaitGateReviewSession needs notifySessionUpdate to wake on the
	// queued decision. updateSession (called by the route) fires
	// notifySessionUpdate internally, so the wait below should resolve
	// quickly. If this hangs to the timeoutMs, the HTTP path is not
	// queueing into pending_decision (i.e., the regression the bot
	// flagged is back).
	const result = await promise
	assert.strictEqual(result.decision, "approved")
	assert.strictEqual(result.feedback, "looks good")

	const after = getSession(session.session_id)
	assert.ok(after, "session must outlive HTTP submit")
	assert.ok(
		!after.pending_decision,
		"pending_decision should be cleared after consume",
	)
	deleteSession(session.session_id)
})

console.log("\n=== findLiveReviewSessionForIntent reuse semantics ===")

await test("returns the most recent live session for an intent", () => {
	const a = createSession({
		intent_dir: "/tmp/x",
		intent_slug: "reuse-test",
		target: "",
	})
	// Brief pause so created_at differs.
	const start = Date.now()
	while (Date.now() === start) {
		/* spin */
	}
	const b = createSession({
		intent_dir: "/tmp/x",
		intent_slug: "reuse-test",
		target: "",
	})
	const found = findLiveReviewSessionForIntent("reuse-test")
	assert.ok(found, "expected a live session")
	assert.strictEqual(
		found.session_id,
		b.session_id,
		"expected most recent session to win",
	)
	deleteSession(a.session_id)
	deleteSession(b.session_id)
})

await test("ignores ad-hoc sessions", () => {
	const adHoc = createSession({
		intent_dir: "/tmp/x",
		intent_slug: "reuse-test-2",
		target: "",
		ad_hoc: true,
	})
	const found = findLiveReviewSessionForIntent("reuse-test-2")
	assert.strictEqual(
		found,
		undefined,
		"ad-hoc sessions should not be reused for gate-review",
	)
	deleteSession(adHoc.session_id)
})

await test("returns undefined for an intent with no sessions", () => {
	const found = findLiveReviewSessionForIntent("never-existed")
	assert.strictEqual(found, undefined)
})

console.log(`\n${passed} passed, ${failed} failed`)
// startHttpServer registered a Fastify instance that keeps the event
// loop alive — explicitly stop so the test process exits without
// needing a SIGTERM.
await stopHttpServer().catch(() => {})
if (failed > 0) process.exit(1)

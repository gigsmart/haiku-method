#!/usr/bin/env npx tsx
// await-gate-announce-dedup.test.mjs — Locks the per-session
// announcement dedup contract. The agent should announce the review
// URL ONCE per session; subsequent gate_review emissions on the same
// session_id (timeout retries, refresh ticks) must NOT re-post the
// URL to the user.

import assert from "node:assert"
import {
	createSession,
	deleteSession,
	getSession,
	updateSession,
} from "../src/sessions.ts"

let passed = 0
let failed = 0

function test(name, fn) {
	try {
		fn()
		passed++
		console.log(`  ✓ ${name}`)
	} catch (e) {
		failed++
		const msg = e instanceof Error ? e.message : String(e)
		console.log(`  ✗ ${name}: ${msg}`)
	}
}

console.log("\n── Session announced_at dedup ────────────────────────────")

test("fresh session has no announced_at (announce on first emission)", () => {
	const s = createSession({
		intent_dir: "/tmp/no-such",
		intent_slug: "test",
		target: "test",
	})
	try {
		const fresh = getSession(s.session_id)
		assert.strictEqual(fresh?.session_type, "review")
		// Type guard before reading the announce field.
		const ann =
			fresh?.session_type === "review" ? fresh.announced_at : undefined
		assert.ok(
			ann == null,
			`fresh session should have no announced_at; got: ${ann}`,
		)
	} finally {
		deleteSession(s.session_id)
	}
})

test("updateSession can stamp announced_at, getSession reflects it", () => {
	const s = createSession({
		intent_dir: "/tmp/no-such",
		intent_slug: "test",
		target: "test",
	})
	try {
		const ts = "2026-05-06T16:30:00Z"
		updateSession(s.session_id, { announced_at: ts })
		const after = getSession(s.session_id)
		assert.strictEqual(after?.session_type, "review")
		const ann =
			after?.session_type === "review" ? after.announced_at : undefined
		assert.strictEqual(ann, ts)
	} finally {
		deleteSession(s.session_id)
	}
})

test("a second updateSession with the same announced_at is idempotent", () => {
	const s = createSession({
		intent_dir: "/tmp/no-such",
		intent_slug: "test",
		target: "test",
	})
	try {
		const ts = "2026-05-06T16:30:00Z"
		updateSession(s.session_id, { announced_at: ts })
		updateSession(s.session_id, { announced_at: ts })
		const after = getSession(s.session_id)
		const ann =
			after?.session_type === "review" ? after.announced_at : undefined
		assert.strictEqual(ann, ts)
	} finally {
		deleteSession(s.session_id)
	}
})

test("clearing announced_at via null reverts to fresh state", () => {
	const s = createSession({
		intent_dir: "/tmp/no-such",
		intent_slug: "test",
		target: "test",
	})
	try {
		updateSession(s.session_id, { announced_at: "2026-05-06T16:30:00Z" })
		updateSession(s.session_id, { announced_at: null })
		const after = getSession(s.session_id)
		const ann =
			after?.session_type === "review" ? after.announced_at : undefined
		assert.strictEqual(ann, null)
	} finally {
		deleteSession(s.session_id)
	}
})

console.log(`\n── Result: ${passed} passed, ${failed} failed ──────────────`)
process.exit(failed > 0 ? 1 : 0)

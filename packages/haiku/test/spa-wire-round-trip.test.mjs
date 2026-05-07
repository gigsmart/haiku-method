#!/usr/bin/env npx tsx
// Test suite for the haiku_review_open SPA wire round-trip.
//
// Coverage:
//   1. Approve round-trip — handleToolCall("haiku_review_open") creates a
//      session, blocks on waitForSession, then returns the canonical
//      "no changes requested" copy when the session decides "approved".
//   2. Request-changes round-trip — same setup, decision flips to
//      "changes_requested", tool return nudges the agent toward
//      `haiku_run_next` so durable feedback flows into the fix loop.
//   3. Schema rejection — bad args return the stable named code
//      `haiku_review_open_input_invalid`.
//
// Wire round-trip: schema → session creation → HTTP server →
// /review/:id/decide POST → handler drainPending → tool return.
//
// 2026-05-07: ad-hoc review handler now consumes `pending_decision`
// the same way awaitGateReviewSession does, so the wire POST naturally
// wakes the handler — no short-circuit needed. The wire writes
// pending_decision; the handler's drainPending pattern picks it up.
//
// Run: npx tsx test/spa-wire-round-trip.test.mjs

import assert from "node:assert"
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"

const _origCwd = process.cwd()
process.env.CLAUDE_PLUGIN_ROOT = `${_origCwd}/../../plugin`

// ─── Fixture: tmpdir with a single active intent ──────────────────────────

const tmp = mkdtempSync(join(tmpdir(), "haiku-spa-wire-test-"))
const projDir = join(tmp, "project")
const haikuRoot = join(projDir, ".haiku")
const intentSlug = "spa-wire-test"
const intentDirPath = join(haikuRoot, "intents", intentSlug)
const stageName = "development"

mkdirSync(join(intentDirPath, "stages", stageName, "units"), {
	recursive: true,
})

writeFileSync(
	join(intentDirPath, "intent.md"),
	`---
title: SPA Wire Round-Trip Fixture
studio: software
mode: continuous
active_stage: ${stageName}
status: active
stages:
  - ${stageName}
started_at: 2026-05-07T00:00:00Z
completed_at: null
---

# SPA Wire Round-Trip Fixture

A minimal intent so haiku_review_open can resolve the active intent and
build a review URL.
`,
)

writeFileSync(
	join(intentDirPath, "stages", stageName, "state.json"),
	JSON.stringify(
		{
			stage: stageName,
			status: "active",
			phase: "execute",
			visits: 0,
		},
		null,
		2,
	),
)

// PATH-stub `open` (macOS), `xdg-open` (linux), and `git` so the
// best-effort browser launch doesn't actually pop a tab on the test
// host and any incidental git rev-parse during state-tool import
// returns a clean exit. The handler treats failures as best-effort,
// so a no-op stub keeps things quiet.
const fakeBin = join(tmp, "fake-bin")
mkdirSync(fakeBin, { recursive: true })
for (const bin of ["open", "xdg-open", "git"]) {
	const path = join(fakeBin, bin)
	writeFileSync(path, "#!/bin/sh\nexit 0\n")
	chmodSync(path, 0o755)
}
process.env.PATH = `${fakeBin}:${process.env.PATH}`

// ─── Wire the engine to the fixture ──────────────────────────────────────

const { setHaikuRootForTests, setIsGitRepoForTests } = await import(
	"../src/state/shared.ts"
)
setHaikuRootForTests(haikuRoot)
// Force non-git mode — the handler's branch-detection (intentFromCurrentBranch)
// needs to short-circuit so we exercise the listVisibleIntents fallback
// (single active intent → auto-resolve slug).
setIsGitRepoForTests(false)

const { handleToolCall } = await import("../src/server/tool-call.ts")
const { stopHttpServer, getActualPort } = await import("../src/http.ts")
const { deleteSession, getSession, updateSession } = await import(
	"../src/sessions.ts"
)

// ─── Test runner ──────────────────────────────────────────────────────────

let passed = 0
let failed = 0

async function test(name, fn) {
	try {
		await fn()
		passed++
		console.log(`  ✓ ${name}`)
	} catch (e) {
		failed++
		console.log(`  ✗ ${name}: ${e.message}`)
		if (process.env.VERBOSE) console.error(e)
	}
}

// Helper: dispatch haiku_review_open with no slug; the handler
// auto-resolves the sole active intent from the fixture.
function callReviewOpen(args = {}, signal) {
	return handleToolCall(
		{
			params: {
				name: "haiku_review_open",
				arguments: args,
			},
		},
		signal,
	)
}

// Approach: scrape the session id off `console.error` output. The
// handler always calls launchBrowserBestEffort which logs
//   [haiku] Ad-hoc review ready → http://127.0.0.1:PORT/review/SESSION_ID
// before blocking on waitForSession. ES module exports are immutable
// bindings, so monkey-patching createSession isn't possible.
const _origConsoleError = console.error
let _capturedSessionId = null
const _consoleErrorBuffer = []
console.error = function captured(...args) {
	const line = args
		.map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
		.join(" ")
	_consoleErrorBuffer.push(line)
	const m = line.match(/\/review\/([A-Za-z0-9_-]+)/)
	if (m) _capturedSessionId = m[1]
	if (process.env.VERBOSE) _origConsoleError.apply(this, args)
}
function _resetCapture() {
	_capturedSessionId = null
	_consoleErrorBuffer.length = 0
}

console.log("\n=== haiku_review_open: SPA wire round-trip ===")

await test("approve round-trip — wire POST /decide queues + status flip resolves with 'no changes requested' copy", async () => {
	_resetCapture()
	const reviewPromise = callReviewOpen({ intent: intentSlug, stage: stageName })

	// Wait for the handler to mint the session and start blocking on
	// waitForSession. The createSession spy captures the id the moment
	// it's minted.
	for (let i = 0; i < 100 && !_capturedSessionId; i++) {
		await delay(10)
	}
	assert.ok(
		_capturedSessionId,
		`session id not captured from console.error in time. Buffered lines: ${_consoleErrorBuffer.slice(-3).join(" | ")}`,
	)
	const sessionId = _capturedSessionId

	// Confirm the session is registered as ad_hoc + pending — the wire
	// is up.
	const initial = getSession(sessionId)
	assert.ok(initial, "session must exist in registry after handler creation")
	assert.strictEqual(initial.session_type, "review")
	assert.strictEqual(initial.ad_hoc, true)
	assert.strictEqual(initial.status, "pending")

	// Real wire: POST /review/:id/decide. This is the actual SPA
	// submit path used in production. It writes pending_decision —
	// the canonical live-session channel — and broadcasts the queued
	// signal.
	const port = getActualPort()
	assert.ok(port, "http server must be listening after handler started")
	const wireRes = await fetch(
		`http://127.0.0.1:${port}/review/${sessionId}/decide`,
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ decision: "approved", feedback: "" }),
		},
	)
	assert.strictEqual(wireRes.status, 200, `expected 200 from /decide, got ${wireRes.status}`)
	const wireBody = await wireRes.json()
	assert.strictEqual(wireBody.ok, true)
	assert.strictEqual(wireBody.decision, "approved")

	// The wire writes pending_decision and broadcasts a session
	// update. The handler's drainPending picks it up on the next
	// loop iteration — no short-circuit needed (2026-05-07 fix).
	const result = await reviewPromise
	assert.ok(result.content?.length > 0, "result must have content")
	const body = result.content[0].text
	assert.ok(
		/no changes requested/i.test(body) || /Done/.test(body),
		`approve return must signal no-changes; got: ${body.slice(0, 300)}`,
	)
	assert.ok(
		!result.isError,
		"approve return must not be flagged isError",
	)
})

await test("request-changes round-trip — return nudges agent toward haiku_run_next", async () => {
	_resetCapture()
	const reviewPromise = callReviewOpen({ intent: intentSlug, stage: stageName })

	for (let i = 0; i < 100 && !_capturedSessionId; i++) {
		await delay(10)
	}
	assert.ok(_capturedSessionId, "session id not captured from console.error in time")
	const sessionId = _capturedSessionId

	const port = getActualPort()
	const wireRes = await fetch(
		`http://127.0.0.1:${port}/review/${sessionId}/decide`,
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				decision: "changes_requested",
				feedback: "Please revise the units",
			}),
		},
	)
	assert.strictEqual(wireRes.status, 200)
	const wireBody = await wireRes.json()
	assert.strictEqual(wireBody.decision, "changes_requested")

	// Handler's drainPending wakes on the broadcast and consumes
	// pending_decision. No short-circuit needed.
	const result = await reviewPromise
	assert.ok(result.content?.length > 0)
	const body = result.content[0].text
	assert.ok(
		/Request Changes|changes_requested/i.test(body),
		`return must mention the request-changes outcome; got: ${body.slice(0, 300)}`,
	)
	assert.ok(
		/haiku_run_next/.test(body),
		`return must nudge toward haiku_run_next so feedback flows into fix-loop; got: ${body.slice(0, 300)}`,
	)
	assert.ok(!result.isError, "request-changes return must not be flagged isError")
})

await test("schema rejection — malformed args returns haiku_review_open_input_invalid", async () => {
	// `additionalProperties: false` on the input schema rejects any
	// stray field. `intent` is typed as string — passing a number
	// also fails the gate.
	const result = await handleToolCall({
		params: {
			name: "haiku_review_open",
			arguments: { intent: 123, bogus_extra_field: "nope" },
		},
	})
	assert.ok(result.isError === true, "schema-invalid input must flag isError")
	const body = result.content[0].text
	const parsed = JSON.parse(body)
	assert.strictEqual(
		parsed.error,
		"haiku_review_open_input_invalid",
		`expected stable error code, got: ${parsed.error}`,
	)
	assert.strictEqual(parsed.tool, "haiku_review_open")
	assert.ok(
		Array.isArray(parsed.errors) && parsed.errors.length > 0,
		"schema rejection must include errors[]",
	)
	// Confirm structuredContent matches the named-code contract.
	assert.strictEqual(
		result.structuredContent?.error,
		"haiku_review_open_input_invalid",
	)
})

// ─── Cleanup ──────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`)

try {
	// Drop any sessions the spy captured but the handler may not have
	// torn down (best-effort; the handler's finally already runs).
	if (_capturedSessionId) deleteSession(_capturedSessionId)
} catch {
	/* ignore */
}

try {
	await stopHttpServer()
} catch {
	/* ignore */
}

// Restore console.error.
console.error = _origConsoleError

// Restore overrides.
setHaikuRootForTests(null)
setIsGitRepoForTests(null)

process.chdir(_origCwd)

try {
	rmSync(tmp, { recursive: true })
} catch {
	/* ignore */
}

process.exit(failed > 0 ? 1 : 0)

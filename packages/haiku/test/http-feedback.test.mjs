#!/usr/bin/env npx tsx
// Test suite for H·AI·K·U HTTP feedback CRUD endpoints and /api/review/current
// Run: npx tsx test/http-feedback.test.mjs

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
import { startHttpServer } from "../src/http.ts"
import { readFeedbackFiles, writeFeedbackFile } from "../src/state-tools.ts"

// ── Setup ──────────────────────────────────────────────────────────────────

const tmp = mkdtempSync(join(tmpdir(), "haiku-http-feedback-test-"))
const origCwd = process.cwd()

const projDir = join(tmp, "project")
const haikuRoot = join(projDir, ".haiku")
const intentSlug = "test-http-intent"
const intentDirPath = join(haikuRoot, "intents", intentSlug)
const stageName = "development"

mkdirSync(join(intentDirPath, "stages", stageName, "units"), {
	recursive: true,
})

writeFileSync(
	join(intentDirPath, "intent.md"),
	`---
title: Test HTTP Intent
studio: software
mode: continuous
active_stage: ${stageName}
status: active
stages:
  - ${stageName}
  - security
started_at: 2026-04-15T18:00:00Z
completed_at: null
---

This is a test intent for HTTP feedback testing.
`,
)

writeFileSync(
	join(intentDirPath, "stages", stageName, "state.json"),
	JSON.stringify(
		{
			stage: stageName,
			status: "active",
			phase: "execute",
			started_at: "2026-04-15T18:05:00Z",
			completed_at: null,
			gate_entered_at: null,
			gate_outcome: null,
			visits: 0,
		},
		null,
		2,
	),
)

// Create a second stage for testing
mkdirSync(join(intentDirPath, "stages", "security"), { recursive: true })
writeFileSync(
	join(intentDirPath, "stages", "security", "state.json"),
	JSON.stringify(
		{
			stage: "security",
			status: "pending",
			phase: "elaborate",
			visits: 0,
		},
		null,
		2,
	),
)

// Create a unit file
writeFileSync(
	join(intentDirPath, "stages", stageName, "units", "unit-01-example.md"),
	`---
title: Example Unit
type: implementation
status: active
depends_on: []
bolt: 1
hat: implementer
---

# Example Unit

This is an example unit.
`,
)

// Stub git so gitCommitState doesn't fail
process.env.PATH = `${join(tmp, "fake-bin")}:${process.env.PATH}`
mkdirSync(join(tmp, "fake-bin"), { recursive: true })
writeFileSync(join(tmp, "fake-bin", "git"), "#!/bin/sh\nexit 0\n")
chmodSync(join(tmp, "fake-bin", "git"), 0o755)

process.chdir(projDir)

let passed = 0
let failed = 0

function test(name, fn) {
	return fn().then(
		() => {
			passed++
			console.log(`  \u2713 ${name}`)
		},
		(e) => {
			failed++
			console.log(`  \u2717 ${name}: ${e.message}`)
		},
	)
}

let baseUrl

// ── Start server ──────────────────────────────────────────────────────────

async function run() {
	const port = await startHttpServer()
	baseUrl = `http://127.0.0.1:${port}`

	// Seed some feedback items for GET tests
	writeFeedbackFile(intentSlug, stageName, {
		title: "Pre-existing issue A",
		body: "Body A",
		origin: "adversarial-review",
		author: "security-review-agent",
	})
	writeFeedbackFile(intentSlug, stageName, {
		title: "Pre-existing issue B",
		body: "Body B",
		origin: "user-visual",
		author: "user",
	})

	// ── GET /api/feedback/:intent/:stage ────────────────────────────────────

	console.log("\n=== GET /api/feedback/:intent/:stage ===")

	await test("returns all feedback items for a stage", async () => {
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}`,
		)
		assert.strictEqual(res.status, 200)
		const data = await res.json()
		assert.strictEqual(data.intent, intentSlug)
		assert.strictEqual(data.stage, stageName)
		assert.strictEqual(data.count, 2)
		assert.strictEqual(data.items.length, 2)
		assert.strictEqual(data.items[0].feedback_id, "FB-01")
		assert.strictEqual(data.items[1].feedback_id, "FB-02")
		assert.ok(data.items[0].body)
		assert.ok(data.items[0].title)
	})

	await test("filters by status=pending", async () => {
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}?status=pending`,
		)
		assert.strictEqual(res.status, 200)
		const data = await res.json()
		for (const item of data.items) {
			assert.strictEqual(item.status, "pending")
		}
	})

	await test("returns empty for status=closed when none exist", async () => {
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}?status=closed`,
		)
		assert.strictEqual(res.status, 200)
		const data = await res.json()
		assert.strictEqual(data.count, 0)
		assert.deepStrictEqual(data.items, [])
	})

	await test("returns 404 for nonexistent intent", async () => {
		const res = await fetch(
			`${baseUrl}/api/feedback/nonexistent-intent/${stageName}`,
		)
		assert.strictEqual(res.status, 404)
		const data = await res.json()
		assert.ok(data.error.includes("Intent not found"))
	})

	await test("returns 404 for nonexistent stage", async () => {
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/nonexistent-stage`,
		)
		assert.strictEqual(res.status, 404)
		const data = await res.json()
		assert.ok(data.error.includes("Stage not found"))
	})

	// ── POST /api/feedback/:intent/:stage ───────────────────────────────────

	console.log("\n=== POST /api/feedback/:intent/:stage ===")

	await test("creates feedback item and returns 201", async () => {
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					title: "New user feedback",
					body: "This is a new feedback item from the review UI.",
					origin: "user-visual",
				}),
			},
		)
		assert.strictEqual(res.status, 201)
		const data = await res.json()
		assert.strictEqual(data.feedback_id, "FB-03")
		assert.strictEqual(data.status, "pending")
		assert.ok(data.message.includes("FB-03 created"))
		assert.ok(data.file.includes("03-"))
	})

	await test("POST returns 400 for missing title", async () => {
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ body: "No title here" }),
			},
		)
		assert.strictEqual(res.status, 400)
		const data = await res.json()
		assert.strictEqual(data.error, "validation_failed")
		assert.ok(Array.isArray(data.issues))
		assert.ok(data.issues.length > 0)
	})

	await test("POST returns 400 for empty body", async () => {
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: "Valid title", body: "" }),
			},
		)
		assert.strictEqual(res.status, 400)
	})

	await test("POST returns 404 for nonexistent intent", async () => {
		const res = await fetch(
			`${baseUrl}/api/feedback/nonexistent-intent/${stageName}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: "Test", body: "Test" }),
			},
		)
		assert.strictEqual(res.status, 404)
	})

	await test("POST defaults origin to user-visual", async () => {
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					title: "Default origin test",
					body: "Testing defaults.",
				}),
			},
		)
		assert.strictEqual(res.status, 201)
		// Verify on disk
		const items = readFeedbackFiles(intentSlug, stageName)
		const created = items.find((i) => i.title === "Default origin test")
		assert.ok(created)
		assert.strictEqual(created.origin, "user-visual")
		assert.strictEqual(created.author, "user")
		assert.strictEqual(created.author_type, "human")
	})

	// ── PUT /api/feedback/:intent/:stage/:id ────────────────────────────────

	console.log("\n=== PUT /api/feedback/:intent/:stage/:id ===")

	await test("updates status field and returns 200", async () => {
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}/FB-01`,
			{
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ status: "addressed" }),
			},
		)
		assert.strictEqual(res.status, 200)
		const data = await res.json()
		assert.strictEqual(data.feedback_id, "FB-01")
		assert.deepStrictEqual(data.updated_fields, ["status"])
		assert.ok(data.message.includes("FB-01 updated"))
	})

	await test("updates closed_by field", async () => {
		// Stub the unit file so the ghost-unit guard in updateFeedbackFile
		// sees the spec on disk. In a real lifecycle the unit spec lands
		// during additive elaboration before a finding is closed against it.
		writeFileSync(
			join(intentDirPath, "stages", stageName, "units", "unit-99-fix.md"),
			"---\ntitle: stub\n---\n\nstub unit for closed_by test.\n",
		)
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}/FB-01`,
			{
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ closed_by: "unit-99-fix" }),
			},
		)
		assert.strictEqual(res.status, 200)
		const data = await res.json()
		assert.ok(data.updated_fields.includes("closed_by"))
	})

	await test("human can close human-authored feedback via PUT", async () => {
		// FB-02 is human-authored (user-visual)
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}/FB-02`,
			{
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ status: "closed" }),
			},
		)
		assert.strictEqual(res.status, 200)
		const data = await res.json()
		assert.ok(data.updated_fields.includes("status"))
	})

	await test("PUT returns 400 for no updatable fields", async () => {
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}/FB-01`,
			{
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			},
		)
		assert.strictEqual(res.status, 400)
	})

	await test("PUT returns 404 for nonexistent feedback id", async () => {
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}/FB-99`,
			{
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ status: "addressed" }),
			},
		)
		assert.strictEqual(res.status, 404)
	})

	// ── DELETE /api/feedback/:intent/:stage/:id ─────────────────────────────

	console.log("\n=== DELETE /api/feedback/:intent/:stage/:id ===")

	await test("DELETE returns 409 for pending feedback", async () => {
		// FB-03 is pending
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}/FB-03`,
			{
				method: "DELETE",
			},
		)
		assert.strictEqual(res.status, 409)
		const data = await res.json()
		assert.ok(data.error.includes("pending"))
	})

	await test("DELETE returns 200 for non-pending feedback", async () => {
		// FB-01 was set to addressed
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}/FB-01`,
			{
				method: "DELETE",
			},
		)
		assert.strictEqual(res.status, 200)
		const data = await res.json()
		assert.strictEqual(data.feedback_id, "FB-01")
		assert.strictEqual(data.deleted, true)
		assert.ok(data.message.includes("FB-01 deleted"))
	})

	await test("DELETE returns 404 for nonexistent feedback id", async () => {
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}/FB-99`,
			{
				method: "DELETE",
			},
		)
		assert.strictEqual(res.status, 404)
	})

	await test("human can delete closed human-authored feedback", async () => {
		// FB-02 was closed above
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}/FB-02`,
			{
				method: "DELETE",
			},
		)
		assert.strictEqual(res.status, 200)
		const data = await res.json()
		assert.strictEqual(data.deleted, true)
	})

	// ── GET /api/review/current ─────────────────────────────────────────────

	console.log("\n=== GET /api/review/current ===")

	await test("returns current active intent state", async () => {
		const res = await fetch(`${baseUrl}/api/review/current`)
		assert.strictEqual(res.status, 200)
		const data = await res.json()
		assert.strictEqual(data.intent, intentSlug)
		assert.strictEqual(data.stage, stageName)
		assert.strictEqual(data.phase, "execute")
		assert.ok(Array.isArray(data.units))
		assert.ok(data.units.length > 0)
		assert.ok(data.feedback_summary)
		assert.ok(typeof data.feedback_summary.pending === "number")
		assert.ok(typeof data.feedback_summary.addressed === "number")
		assert.ok(typeof data.feedback_summary.closed === "number")
		assert.ok(typeof data.feedback_summary.rejected === "number")
		assert.ok(Array.isArray(data.stages))
		assert.ok(data.stages.length >= 1)
		// Stage data should include name and status
		const devStage = data.stages.find((s) => s.name === stageName)
		assert.ok(devStage)
		assert.strictEqual(devStage.status, "active")
	})

	await test("review current includes unit info", async () => {
		const res = await fetch(`${baseUrl}/api/review/current`)
		const data = await res.json()
		const unit = data.units.find((u) => u.slug === "unit-01-example")
		assert.ok(unit)
		assert.strictEqual(unit.title, "Example Unit")
		assert.strictEqual(unit.status, "active")
	})

	// ── Path traversal rejection (security) ──────────────────────────────────

	console.log("\n=== Path traversal rejection ===")

	await test("GET /api/feedback with ..%2Fetc as intent returns 400", async () => {
		const res = await fetch(`${baseUrl}/api/feedback/..%2Fetc/${stageName}`)
		assert.strictEqual(res.status, 400)
		const data = await res.json()
		assert.ok(data.error.includes("Invalid slug"))
	})

	await test("POST /api/feedback with dot-dot traversal intent returns 400", async () => {
		const res = await fetch(`${baseUrl}/api/feedback/foo..bar/${stageName}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title: "Test", body: "Test" }),
		})
		assert.strictEqual(res.status, 400)
		const data = await res.json()
		assert.ok(data.error.includes("Invalid slug"))
	})

	await test("PUT /api/feedback with traversal in stage returns 400", async () => {
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/..%2Fetc/FB-01`,
			{
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ status: "addressed" }),
			},
		)
		assert.strictEqual(res.status, 400)
		const data = await res.json()
		assert.ok(data.error.includes("Invalid slug"))
	})

	await test("DELETE /api/feedback with traversal in id returns 400", async () => {
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}/..%2Fetc`,
			{
				method: "DELETE",
			},
		)
		assert.strictEqual(res.status, 400)
		const data = await res.json()
		assert.ok(data.error.includes("Invalid slug"))
	})

	await test("GET /api/feedback with backslash in intent returns 400", async () => {
		const res = await fetch(`${baseUrl}/api/feedback/foo%5Cbar/${stageName}`)
		assert.strictEqual(res.status, 400)
		const data = await res.json()
		assert.ok(data.error.includes("Invalid slug"))
	})

	// ── Typed validation envelope ────────────────────────────────────────────

	console.log("\n=== Typed validation envelope ===")

	await test("POST malformed JSON body returns 400 with invalid_json issue", async () => {
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "{not json",
			},
		)
		assert.strictEqual(res.status, 400)
		const data = await res.json()
		assert.strictEqual(data.error, "validation_failed")
		assert.ok(Array.isArray(data.issues))
		assert.ok(data.issues.some((i) => i.code === "invalid_json"))
	})

	await test("PUT with empty body returns 400 with validation_failed", async () => {
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}/FB-01`,
			{
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			},
		)
		assert.strictEqual(res.status, 400)
		const data = await res.json()
		assert.strictEqual(data.error, "validation_failed")
		assert.ok(Array.isArray(data.issues))
	})

	// ── Feedback body size cap (128 KiB) ─────────────────────────────────────

	console.log("\n=== Feedback body size cap (128 KiB) ===")

	await test("POST body > 128 KiB returns 413", async () => {
		const huge = "x".repeat(130 * 1024) // 130 KiB, above the 128 KiB cap
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: "big", body: huge }),
			},
		)
		assert.strictEqual(res.status, 413)
		const data = await res.json()
		assert.strictEqual(data.error, "payload_too_large")
		assert.strictEqual(data.max_bytes, 131072)
	})

	await test("POST body at the cap still accepted (happy path)", async () => {
		// 9 KiB body — comfortably inside the schema's 10,000-char body cap
		// (the 128 KiB envelope cap fires earlier for truly huge payloads).
		const fitting = "x".repeat(9 * 1024)
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: "within cap", body: fitting }),
			},
		)
		assert.strictEqual(res.status, 201)
	})

	// ── Cross-session mutation guard ─────────────────────────────────────────

	console.log("\n=== Cross-session mutation guard ===")

	await test("PUT with mismatched X-Haiku-Session-Id returns 403", async () => {
		const { createSession } = await import("../src/sessions.ts")
		// Fake session belonging to a different intent.
		const other = createSession({
			intent_slug: "different-intent",
			intent_dir: projDir,
			review_type: "intent",
			target: "review",
		})
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}/FB-01`,
			{
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
					"X-Haiku-Session-Id": other.session_id,
				},
				body: JSON.stringify({ status: "addressed" }),
			},
		)
		assert.strictEqual(res.status, 403)
		const data = await res.json()
		assert.strictEqual(data.error, "forbidden_cross_session")
	})

	await test("DELETE with unknown session header returns 403", async () => {
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}/FB-01`,
			{
				method: "DELETE",
				headers: { "X-Haiku-Session-Id": "does-not-exist" },
			},
		)
		assert.strictEqual(res.status, 403)
		const data = await res.json()
		assert.strictEqual(data.error, "forbidden_cross_session")
	})

	await test("PUT with matching session header proceeds", async () => {
		const { createSession } = await import("../src/sessions.ts")
		const matching = createSession({
			intent_slug: intentSlug,
			intent_dir: intentDirPath,
			review_type: "intent",
			target: "review",
		})
		// Seed a feedback item we know exists
		const create = writeFeedbackFile(intentSlug, stageName, {
			title: "for-auth-test",
			body: "body",
			origin: "agent",
			author: "tester",
			source_ref: null,
		})
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}/${create.feedback_id}`,
			{
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
					"X-Haiku-Session-Id": matching.session_id,
				},
				body: JSON.stringify({ status: "addressed" }),
			},
		)
		assert.strictEqual(res.status, 200)
	})

	// ── Revisit endpoint ─────────────────────────────────────────────────────

	console.log("\n=== POST /api/revisit/:sessionId ===")

	await test("POST /api/revisit/:id rejects malformed JSON", async () => {
		const { createSession } = await import("../src/sessions.ts")
		const revSession = createSession({
			intent_slug: intentSlug,
			intent_dir: intentDirPath,
			review_type: "intent",
			target: "review",
		})
		const res = await fetch(`${baseUrl}/api/revisit/${revSession.session_id}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{bad",
		})
		assert.strictEqual(res.status, 400)
		const data = await res.json()
		assert.strictEqual(data.error, "validation_failed")
	})

	await test("POST /api/revisit/:id returns 404 for missing session", async () => {
		const res = await fetch(`${baseUrl}/api/revisit/nonexistent-session-id`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({}),
		})
		assert.strictEqual(res.status, 404)
	})

	// ── Cleanup ───────────────────────────────────────────────────────────────

	console.log(`\n${passed} passed, ${failed} failed\n`)
}

try {
	await run()
} finally {
	process.chdir(origCwd)
	rmSync(tmp, { recursive: true })
	process.exit(failed > 0 ? 1 : 0)
}

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
		assert.strictEqual(data.items[0].feedback_id, "FB-001")
		assert.strictEqual(data.items[1].feedback_id, "FB-002")
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
		assert.strictEqual(data.feedback_id, "FB-003")
		assert.strictEqual(data.status, "pending")
		assert.ok(data.message.includes("FB-003 created"))
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
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}/FB-001`,
			{
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ status: "addressed" }),
			},
		)
		assert.strictEqual(res.status, 200)
		const data = await res.json()
		assert.strictEqual(data.feedback_id, "FB-001")
		assert.deepStrictEqual(data.updated_fields, ["status"])
		assert.ok(data.message.includes("FB-001 updated"))
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
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}/FB-001`,
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
		// FB-002 is human-authored (user-visual)
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}/FB-002`,
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
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}/FB-001`,
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
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}/FB-099`,
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
		// FB-003 is pending
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}/FB-003`,
			{
				method: "DELETE",
			},
		)
		assert.strictEqual(res.status, 409)
		const data = await res.json()
		assert.ok(data.error.includes("pending"))
	})

	await test("DELETE returns 200 for non-pending feedback", async () => {
		// FB-001 was set to addressed
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}/FB-001`,
			{
				method: "DELETE",
			},
		)
		assert.strictEqual(res.status, 200)
		const data = await res.json()
		assert.strictEqual(data.feedback_id, "FB-001")
		assert.strictEqual(data.deleted, true)
		assert.ok(data.message.includes("FB-001 deleted"))
	})

	await test("DELETE returns 404 for nonexistent feedback id", async () => {
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}/FB-099`,
			{
				method: "DELETE",
			},
		)
		assert.strictEqual(res.status, 404)
	})

	await test("human can delete closed human-authored feedback", async () => {
		// FB-002 was closed above
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}/FB-002`,
			{
				method: "DELETE",
			},
		)
		assert.strictEqual(res.status, 200)
		const data = await res.json()
		assert.strictEqual(data.deleted, true)
	})

	// ── GET /api/review/current removed ─────────────────────────────────────
	// The legacy `/api/review/current` route was deleted when the ad-hoc
	// review UX moved to session-scoped URLs (see `haiku_review_open`
	// in server.ts + `/review/<sessionId>` in http.ts). There is no
	// longer an unscoped current-intent JSON endpoint — consumers that
	// needed it were rolled into the SPA's per-session payload.

	// ── GET /api/feedback-intent/:intent ────────────────────────────────────

	console.log("\n=== GET /api/feedback-intent/:intent ===")

	// Seed intent-scope feedback (stage = "" writes under
	// `.haiku/intents/<slug>/feedback/`, not under a stage directory).
	writeFeedbackFile(intentSlug, "", {
		title: "Studio-review: cross-stage contract drift",
		body: "DATA-CONTRACTS.md lists 4 enum values but implementation ships 6.",
		origin: "studio-review",
		author: "cross-stage-consistency",
	})
	writeFeedbackFile(intentSlug, "", {
		title: "Studio-review: stale file path in knowledge",
		body: "knowledge/ARCHITECTURE.md still points at packages/haiku/review-app/.",
		origin: "studio-review",
		author: "cross-stage-consistency",
	})

	await test("returns intent-scope feedback items", async () => {
		const res = await fetch(`${baseUrl}/api/feedback-intent/${intentSlug}`)
		assert.strictEqual(res.status, 200)
		const data = await res.json()
		assert.strictEqual(data.intent, intentSlug)
		assert.strictEqual(data.stage, "")
		assert.ok(data.count >= 2)
		// Every returned item should carry scope: "intent" so the sidebar
		// can render the chip. Stage-scope items are served by the other
		// endpoint.
		for (const item of data.items) {
			assert.strictEqual(
				item.scope,
				"intent",
				`expected scope="intent", got ${item.scope}`,
			)
		}
		const titles = data.items.map((i) => i.title)
		assert.ok(
			titles.some((t) => t.includes("cross-stage contract drift")),
			"seeded intent-scope item not in response",
		)
	})

	await test("GET /api/feedback-intent filters by status=pending", async () => {
		const res = await fetch(
			`${baseUrl}/api/feedback-intent/${intentSlug}?status=pending`,
		)
		assert.strictEqual(res.status, 200)
		const data = await res.json()
		for (const item of data.items) {
			assert.strictEqual(item.status, "pending")
		}
	})

	await test("GET /api/feedback-intent returns 400 for invalid status filter", async () => {
		const res = await fetch(
			`${baseUrl}/api/feedback-intent/${intentSlug}?status=bogus`,
		)
		assert.strictEqual(res.status, 400)
		const data = await res.json()
		assert.ok(data.error.includes("Invalid status filter"))
	})

	await test("GET /api/feedback-intent returns 404 for nonexistent intent", async () => {
		const res = await fetch(`${baseUrl}/api/feedback-intent/does-not-exist`)
		assert.strictEqual(res.status, 404)
	})

	await test("GET /api/feedback-intent returns 400 for path-traversal slug", async () => {
		const res = await fetch(`${baseUrl}/api/feedback-intent/..%2Fetc`)
		assert.strictEqual(res.status, 400)
	})

	// Stage-scope endpoint must not leak intent-scope items — the
	// merging happens client-side. Server-side the two surfaces are
	// separate buckets.
	await test("GET /api/feedback/:intent/:stage does NOT include intent-scope items", async () => {
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}`,
		)
		assert.strictEqual(res.status, 200)
		const data = await res.json()
		for (const item of data.items) {
			assert.strictEqual(
				item.scope,
				"stage",
				`stage endpoint leaked an intent-scope item: ${item.feedback_id}`,
			)
		}
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
			`${baseUrl}/api/feedback/${intentSlug}/..%2Fetc/FB-001`,
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
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}/FB-001`,
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

	// ── Feedback body size cap ────────────────────────────────────────────
	//
	// POST uses the larger FEEDBACK_CREATE_MAX_BYTES (8 MiB) because the
	// body may carry a base64 screenshot attachment. Anything below that
	// passes the envelope check, after which the Zod schema (`body` max
	// 10,000 chars, `attachment_data_url` max ~6 MiB) decides whether to
	// reject at 400. Updates still use the tighter 128 KiB cap.

	console.log("\n=== Feedback body size cap ===")

	await test("POST body > 8 MiB returns 413 (envelope cap)", async () => {
		// 9 MiB raw body — exceeds FEEDBACK_CREATE_MAX_BYTES (8 MiB).
		const huge = "x".repeat(9 * 1024 * 1024)
		let res
		try {
			res = await fetch(`${baseUrl}/api/feedback/${intentSlug}/${stageName}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: "big", body: huge }),
			})
		} catch (e) {
			// Fastify sends the 413 and closes while the client is still
			// writing the 9 MiB body, which some HTTP clients surface as
			// ECONNRESET. The refusal itself is what matters — accept the
			// reset as a valid path.
			const code = e?.cause?.code
			if (code === "ECONNRESET" || code === "UND_ERR_SOCKET") return
			throw e
		}
		assert.strictEqual(res.status, 413)
		const data = await res.json()
		assert.strictEqual(data.error, "payload_too_large")
		assert.strictEqual(data.max_bytes, 8_388_608)
	})

	await test("POST body at the cap still accepted (happy path)", async () => {
		// 9 KiB body — comfortably inside the schema's 10,000-char body cap
		// (the envelope cap only fires for truly huge attachment payloads).
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
	//
	// In local (non-tunneled) mode the server is loopback-bound and
	// does NOT gate mutations by session id — any caller reaching
	// localhost already has full file-system access through the same
	// process, so a header check adds no real defense.
	//
	// In tunneled mode the cross-session gate runs off the JWT's `sid`
	// claim — covered end-to-end in `tunnel-auth.test.mjs`. Here we
	// just verify the local-mode no-gate contract so a future tightening
	// doesn't silently 401 on the local UI.

	console.log("\n=== Cross-session mutation guard (local-mode no-gate) ===")

	await test("PUT in local mode proceeds without any session header", async () => {
		const create = writeFeedbackFile(intentSlug, stageName, {
			title: "for-local-no-gate-test",
			body: "body",
			origin: "agent",
			author: "tester",
			source_ref: null,
		})
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}/${create.feedback_id}`,
			{
				method: "PUT",
				headers: { "Content-Type": "application/json" },
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

	await test("POST /api/revisit/:id returns 409 nothing_to_revisit when target stage has no open feedback", async () => {
		const { createSession } = await import("../src/sessions.ts")
		const revSession = createSession({
			intent_slug: intentSlug,
			intent_dir: intentDirPath,
			review_type: "intent",
			target: "review",
		})
		// `security` stage starts with zero feedback — empty `reasons[]` +
		// no open FBs is the silent-no-op guard.
		const res = await fetch(`${baseUrl}/api/revisit/${revSession.session_id}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ stage: "security" }),
		})
		assert.strictEqual(res.status, 409)
		const data = await res.json()
		assert.strictEqual(data.error, "nothing_to_revisit")
	})

	await test("POST /api/revisit/:id succeeds with empty reasons when an open FB exists with non-stage_revisit resolution", async () => {
		// Regression guard for #294: the HTTP handler used to filter
		// `resolution === "stage_revisit"` here, which rejected legitimate
		// revisit clicks where the open FB was tagged `inline_fix`,
		// `question`, or null (untriaged). Pre-tick gate routes any open
		// FB regardless of resolution; the handler must agree.
		writeFeedbackFile(intentSlug, "security", {
			title: "inline-fix-tagged finding",
			body: "Pre-tick gate dispatches this even though resolution !== stage_revisit.",
			origin: "user-visual",
			author: "user",
			resolution: "inline_fix",
		})
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
			body: JSON.stringify({ stage: "security" }),
		})
		assert.strictEqual(res.status, 200)
		const data = await res.json()
		assert.strictEqual(data.ok, true)
		assert.strictEqual(data.action, "revisit_pending")
		assert.strictEqual(data.stage, "security")
		assert.deepStrictEqual(data.feedback_created, [])
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

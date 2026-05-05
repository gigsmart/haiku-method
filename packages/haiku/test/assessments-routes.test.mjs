#!/usr/bin/env npx tsx
// Test suite for drift-assessment HTTP endpoints.
//
// Covers:
//  1. GET /api/intents/:intent/assessments — lists most-recent-first.
//  2. Filters by stage and outcome.
//  3. GET /api/intents/:intent/assessments/:id — single assessment.
//  4. 404 for missing intent.
//  5. 404 for missing DA-*.json file.
//
// Run: npx tsx test/assessments-routes.test.mjs

import assert from "node:assert"
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// ── Test environment setup ─────────────────────────────────────────────────

const tmp = mkdtempSync(join(tmpdir(), "haiku-assessments-test-"))
const projDir = join(tmp, "project")
const haikuRoot = join(projDir, ".haiku")
const intentSlug = "test-assessments-intent"
const intentDirPath = join(haikuRoot, "intents", intentSlug)

// Create intent with two stages.
const stage1 = "design"
const stage2 = "development"

mkdirSync(join(intentDirPath, "stages", stage1, "drift-assessments"), {
	recursive: true,
})
mkdirSync(join(intentDirPath, "stages", stage2, "drift-assessments"), {
	recursive: true,
})
mkdirSync(join(intentDirPath, "stages", stage1, "units"), { recursive: true })
mkdirSync(join(intentDirPath, "stages", stage2, "units"), { recursive: true })

writeFileSync(
	join(intentDirPath, "intent.md"),
	`---
title: Test Assessments Intent
studio: software
mode: continuous
active_stage: ${stage1}
status: active
stages:
  - ${stage1}
  - ${stage2}
started_at: 2026-04-15T18:00:00Z
completed_at: null
---
`,
)

writeFileSync(
	join(intentDirPath, "stages", stage1, "state.json"),
	JSON.stringify({
		stage: stage1,
		status: "active",
		phase: "execute",
		visits: 0,
	}),
)
writeFileSync(
	join(intentDirPath, "stages", stage2, "state.json"),
	JSON.stringify({
		stage: stage2,
		status: "active",
		phase: "execute",
		visits: 0,
	}),
)

// Create test DA records — t1 < t2 < t3.
const da1 = {
	id: "DA-01",
	created_at: "2026-04-01T10:00:00Z",
	findings: [
		{
			path: "stages/design/artifacts/hero.html",
			stage: stage1,
			change_kind: "modified",
		},
	],
	classifications: [
		{ outcome: "ignore", path: "stages/design/artifacts/hero.html" },
	],
	agent_rationale: "Minor tweak.",
}
const da2 = {
	id: "DA-02",
	created_at: "2026-04-02T10:00:00Z",
	findings: [
		{
			path: "stages/development/artifacts/app.ts",
			stage: stage2,
			change_kind: "modified",
		},
	],
	classifications: [
		{
			outcome: "surface-as-feedback",
			path: "stages/development/artifacts/app.ts",
		},
	],
	agent_rationale: "Substantial change.",
}
const da3 = {
	id: "DA-03",
	created_at: "2026-04-03T10:00:00Z",
	findings: [
		{
			path: "stages/design/artifacts/layout.html",
			stage: stage1,
			change_kind: "new-file-detected",
		},
	],
	classifications: [
		{ outcome: "inline-fix", path: "stages/design/artifacts/layout.html" },
	],
	agent_rationale: "New layout file added.",
}

writeFileSync(
	join(intentDirPath, "stages", stage1, "drift-assessments", "DA-01.json"),
	JSON.stringify(da1),
)
writeFileSync(
	join(intentDirPath, "stages", stage2, "drift-assessments", "DA-02.json"),
	JSON.stringify(da2),
)
writeFileSync(
	join(intentDirPath, "stages", stage1, "drift-assessments", "DA-03.json"),
	JSON.stringify(da3),
)

// VULN-REPORT V-09 fixture: an assessment with rationales OVER the
// list-view truncation cap (256 chars). Verifies the list endpoint
// truncates while the detail endpoint returns the full text.
const longRationale = "L".repeat(2000) // 2000 chars > 256 cap
const longExcerpt = "E".repeat(2000)
const da4 = {
	id: "DA-04",
	created_at: "2026-04-04T10:00:00Z",
	findings: [
		{
			path: "stages/design/artifacts/big.md",
			stage: stage1,
			change_kind: "modified",
		},
	],
	classifications: [
		{
			outcome: "ignore",
			path: "stages/design/artifacts/big.md",
			rationale_excerpt: longExcerpt,
		},
	],
	agent_rationale: longRationale,
}
writeFileSync(
	join(intentDirPath, "stages", stage1, "drift-assessments", "DA-04.json"),
	JSON.stringify(da4),
)

// Stub git.
const fakeBinDir = join(tmp, "fake-bin")
mkdirSync(fakeBinDir, { recursive: true })
writeFileSync(join(fakeBinDir, "git"), "#!/bin/sh\nexit 0\n")
chmodSync(join(fakeBinDir, "git"), 0o755)
process.env.PATH = `${fakeBinDir}:${process.env.PATH}`

process.chdir(projDir)

// ── Imports ────────────────────────────────────────────────────────────────

const { startHttpServer } = await import("../src/http.ts")

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
		if (process.env.VERBOSE) console.log(e.stack)
	}
}

async function run() {
	const port = await startHttpServer()
	const baseUrl = `http://127.0.0.1:${port}`

	console.log("\n=== GET /api/intents/:intent/assessments ===")

	await test("Returns all assessments most-recent-first by created_at", async () => {
		const res = await fetch(`${baseUrl}/api/intents/${intentSlug}/assessments`)
		assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`)
		const data = await res.json()
		assert.ok(data.ok)
		assert.ok(Array.isArray(data.assessments))
		assert.strictEqual(data.assessments.length, 4)
		// Most recent (DA-04) should come first; DA-04 is the V-09 truncation
		// fixture, then DA-03 / DA-02 / DA-01 by descending created_at.
		assert.strictEqual(data.assessments[0].id, "DA-04")
		assert.strictEqual(data.assessments[1].id, "DA-03")
		assert.strictEqual(data.assessments[2].id, "DA-02")
		assert.strictEqual(data.assessments[3].id, "DA-01")
		assert.strictEqual(data.total, 4)
		assert.strictEqual(data.has_more, false)
	})

	await test("Filters by stage — only design stage assessments", async () => {
		const res = await fetch(
			`${baseUrl}/api/intents/${intentSlug}/assessments?stage=${stage1}`,
		)
		assert.strictEqual(res.status, 200)
		const data = await res.json()
		assert.ok(data.ok)
		// DA-01, DA-03, DA-04 belong to design stage.
		assert.strictEqual(data.assessments.length, 3)
		const ids = data.assessments.map((a) => a.id)
		assert.ok(ids.includes("DA-01"))
		assert.ok(ids.includes("DA-03"))
		assert.ok(ids.includes("DA-04"))
		assert.ok(!ids.includes("DA-02"))
	})

	await test("Filters by outcome — only surface-as-feedback", async () => {
		const res = await fetch(
			`${baseUrl}/api/intents/${intentSlug}/assessments?outcome=surface-as-feedback`,
		)
		assert.strictEqual(res.status, 200)
		const data = await res.json()
		assert.ok(data.ok)
		assert.strictEqual(data.assessments.length, 1)
		assert.strictEqual(data.assessments[0].id, "DA-02")
	})

	await test("limit parameter caps results", async () => {
		const res = await fetch(
			`${baseUrl}/api/intents/${intentSlug}/assessments?limit=2`,
		)
		assert.strictEqual(res.status, 200)
		const data = await res.json()
		assert.strictEqual(data.assessments.length, 2)
		assert.strictEqual(data.total, 4)
		assert.strictEqual(data.has_more, true)
	})

	await test("Returns 400 for invalid limit", async () => {
		const res = await fetch(
			`${baseUrl}/api/intents/${intentSlug}/assessments?limit=abc`,
		)
		assert.strictEqual(res.status, 400)
		const data = await res.json()
		assert.ok(data.error === "bad_param" || data.code === "bad_param")
	})

	await test("Returns 404 for missing intent", async () => {
		const res = await fetch(`${baseUrl}/api/intents/no-such-intent/assessments`)
		assert.strictEqual(res.status, 404)
		const data = await res.json()
		assert.ok(
			data.error === "intent_not_found" || data.code === "intent_not_found",
		)
	})

	console.log("\n=== GET /api/intents/:intent/assessments/:assessmentId ===")

	await test("Single assessment GET returns full record", async () => {
		const res = await fetch(
			`${baseUrl}/api/intents/${intentSlug}/assessments/DA-01`,
		)
		assert.strictEqual(res.status, 200)
		const data = await res.json()
		assert.ok(data.ok)
		assert.ok(data.assessment)
		assert.strictEqual(data.assessment.id, "DA-01")
		assert.strictEqual(data.assessment.created_at, "2026-04-01T10:00:00Z")
		assert.ok(data.assessment.findings)
		assert.ok(data.assessment.classifications)
	})

	await test("Returns 404 for missing DA-*.json file", async () => {
		const res = await fetch(
			`${baseUrl}/api/intents/${intentSlug}/assessments/DA-99`,
		)
		assert.strictEqual(res.status, 404)
		const data = await res.json()
		assert.ok(
			data.error === "assessment_not_found" ||
				data.code === "assessment_not_found",
		)
	})

	await test("Returns 404 for invalid assessment ID format", async () => {
		const res = await fetch(
			`${baseUrl}/api/intents/${intentSlug}/assessments/not-a-valid-id`,
		)
		assert.strictEqual(res.status, 404)
		const data = await res.json()
		assert.ok(
			data.error === "assessment_not_found" ||
				data.code === "assessment_not_found",
		)
	})

	await test("Returns 404 for missing intent on single GET", async () => {
		const res = await fetch(
			`${baseUrl}/api/intents/no-such-intent/assessments/DA-01`,
		)
		assert.strictEqual(res.status, 404)
		const data = await res.json()
		assert.ok(
			data.error === "intent_not_found" || data.code === "intent_not_found",
		)
	})

	// ── VULN-REPORT V-09: list endpoint truncates rationale fields ───────────

	console.log(
		"\n=== VULN-REPORT V-09: list endpoint truncates oversize rationales ===",
	)

	await test("list endpoint truncates agent_rationale to a list-view-safe preview (V-09)", async () => {
		const res = await fetch(`${baseUrl}/api/intents/${intentSlug}/assessments`)
		assert.strictEqual(res.status, 200)
		const data = await res.json()
		const da4 = data.assessments.find((a) => a.id === "DA-04")
		assert.ok(da4, "DA-04 fixture should be present")
		assert.ok(
			typeof da4.agent_rationale === "string",
			"agent_rationale should be a string",
		)
		// Original was 2000 chars; truncated form must be much shorter and
		// end with the '…' marker.
		assert.ok(
			da4.agent_rationale.length <= 257,
			`Expected agent_rationale truncated to ≤ 257 chars (256 + '…'), got ${da4.agent_rationale.length}`,
		)
		assert.ok(
			da4.agent_rationale.endsWith("…"),
			"Truncated agent_rationale should end with '…'",
		)
	})

	await test("list endpoint truncates per-classification rationale_excerpt (V-09)", async () => {
		const res = await fetch(`${baseUrl}/api/intents/${intentSlug}/assessments`)
		assert.strictEqual(res.status, 200)
		const data = await res.json()
		const da4 = data.assessments.find((a) => a.id === "DA-04")
		assert.ok(da4)
		const cls = da4.classifications[0]
		assert.ok(cls)
		assert.ok(typeof cls.rationale_excerpt === "string")
		assert.ok(
			cls.rationale_excerpt.length <= 257,
			`Expected rationale_excerpt truncated to ≤ 257 chars, got ${cls.rationale_excerpt.length}`,
		)
		assert.ok(
			cls.rationale_excerpt.endsWith("…"),
			"Truncated rationale_excerpt should end with '…'",
		)
	})

	await test("list endpoint leaves short rationales untouched (no spurious truncation)", async () => {
		const res = await fetch(`${baseUrl}/api/intents/${intentSlug}/assessments`)
		assert.strictEqual(res.status, 200)
		const data = await res.json()
		const da1 = data.assessments.find((a) => a.id === "DA-01")
		assert.ok(da1)
		// Original agent_rationale was "Minor tweak." — well under 256 chars.
		assert.strictEqual(
			da1.agent_rationale,
			"Minor tweak.",
			"Short rationale must be returned untouched",
		)
	})

	await test("detail endpoint returns FULL agent_rationale + rationale_excerpt — no truncation (V-09)", async () => {
		const res = await fetch(
			`${baseUrl}/api/intents/${intentSlug}/assessments/DA-04`,
		)
		assert.strictEqual(res.status, 200)
		const data = await res.json()
		assert.ok(data.assessment)
		assert.strictEqual(
			data.assessment.agent_rationale.length,
			2000,
			"Detail endpoint MUST return the full agent_rationale (no truncation)",
		)
		assert.strictEqual(
			data.assessment.classifications[0].rationale_excerpt.length,
			2000,
			"Detail endpoint MUST return the full rationale_excerpt",
		)
	})

	console.log(`\n${passed} passed, ${failed} failed`)
	process.exit(failed > 0 ? 1 : 0)
}

run().catch((err) => {
	console.error("Test runner crashed:", err)
	process.exit(1)
})

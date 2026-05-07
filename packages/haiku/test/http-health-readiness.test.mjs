#!/usr/bin/env npx tsx
// FB-006 regression guard: `/health` must split liveness from readiness.
//
// Before FB-006 the endpoint always replied 200 `"ok"`, so a tunnel or
// load balancer probing it during startup would believe the instance
// was ready to serve traffic while buildApp() / post-listen init was
// still running. The fix adds a module-level `ready` flag in
// packages/haiku/src/http.ts that flips to `true` only at the very end
// of startHttpServer(). Until then the endpoint returns HTTP 503
// `"starting"`. This suite verifies both sides of the transition plus
// the stop/restart reset.

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
import {
	_resetReadyForTests,
	isReady,
	startHttpServer,
	stopHttpServer,
} from "../src/http.ts"

// ── Setup ──────────────────────────────────────────────────────────────────

const tmp = mkdtempSync(join(tmpdir(), "haiku-http-health-"))
const origCwd = process.cwd()

const projDir = join(tmp, "project")
const haikuRoot = join(projDir, ".haiku")
const intentSlug = "test-http-health"
const intentDirPath = join(haikuRoot, "intents", intentSlug)

mkdirSync(intentDirPath, { recursive: true })
writeFileSync(
	join(intentDirPath, "intent.md"),
	`---
title: Health Readiness Test
studio: software
mode: continuous
active_stage: development
status: active
stages:
  - development
started_at: 2026-04-23T00:00:00Z
completed_at: null
---

Health readiness regression guard.
`,
)

process.chdir(projDir)

// ── Test harness ───────────────────────────────────────────────────────────

let passed = 0
let failed = 0

async function test(name, fn) {
	try {
		await fn()
		console.log(`  ✓ ${name}`)
		passed++
	} catch (err) {
		console.log(`  ✗ ${name}`)
		console.log(`    ${err.message}`)
		failed++
	}
}

// ── Tests ──────────────────────────────────────────────────────────────────

try {
	console.log("\n=== /health readiness gate ===")

	const port = await startHttpServer()
	const baseUrl = `http://127.0.0.1:${port}`

	await test("after startHttpServer() returns, /health is 200 `ok` (ready)", async () => {
		assert.strictEqual(isReady(), true, "isReady() should be true post-start")
		const res = await fetch(`${baseUrl}/health`)
		assert.strictEqual(res.status, 200)
		const body = await res.text()
		assert.strictEqual(body, "ok")
		assert.match(
			res.headers.get("content-type") ?? "",
			/^text\/plain/,
			"content-type should be text/plain",
		)
	})

	await test("flipping ready to false yields 503 `starting` (liveness-vs-readiness split)", async () => {
		_resetReadyForTests()
		assert.strictEqual(
			isReady(),
			false,
			"isReady() should be false after reset",
		)
		const res = await fetch(`${baseUrl}/health`)
		assert.strictEqual(
			res.status,
			503,
			"503 is the canonical signal that a probe should not route traffic yet",
		)
		const body = await res.text()
		assert.strictEqual(body, "starting")
		assert.match(
			res.headers.get("content-type") ?? "",
			/^text\/plain/,
			"content-type should be text/plain in the unready path too",
		)
	})

	await test("stopHttpServer() clears the ready flag so a subsequent start sees 503 first", async () => {
		await stopHttpServer()
		assert.strictEqual(
			isReady(),
			false,
			"readiness must not survive shutdown — the next start has its own readiness lifecycle",
		)
	})
} finally {
	try {
		await stopHttpServer()
	} catch {
		/* best-effort */
	}
	process.chdir(origCwd)
	try {
		chmodSync(tmp, 0o755)
		rmSync(tmp, { recursive: true, force: true })
	} catch {
		/* best-effort */
	}
}

// ── Summary ────────────────────────────────────────────────────────────────

console.log("")
console.log(`${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)

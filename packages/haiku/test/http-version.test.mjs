#!/usr/bin/env npx tsx
// `/api/version` route — surfaces the running MCP + plugin version to
// the SPA's footer badge so reviewers can see which build is serving
// the page when behavior diverges from CHANGELOG / docs.

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
import { startHttpServer, stopHttpServer } from "../src/http.ts"

const tmp = mkdtempSync(join(tmpdir(), "haiku-http-version-"))
const origCwd = process.cwd()

const projDir = join(tmp, "project")
const haikuRoot = join(projDir, ".haiku")
const intentSlug = "test-version"
const intentDirPath = join(haikuRoot, "intents", intentSlug)

mkdirSync(intentDirPath, { recursive: true })
writeFileSync(
	join(intentDirPath, "intent.md"),
	`---
title: Version Route Test
studio: software
mode: continuous
active_stage: development
status: active
stages:
  - development
started_at: 2026-04-29T00:00:00Z
completed_at: null
---

Version route test.
`,
)

process.chdir(projDir)

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

try {
	console.log("\n=== GET /api/version ===")

	const port = await startHttpServer()
	const baseUrl = `http://127.0.0.1:${port}`

	await test("returns JSON with mcp_version + plugin_version fields", async () => {
		const res = await fetch(`${baseUrl}/api/version`)
		assert.strictEqual(res.status, 200)
		assert.match(
			res.headers.get("content-type") ?? "",
			/^application\/json/,
			"should be JSON",
		)
		const body = await res.json()
		assert.strictEqual(typeof body.mcp_version, "string", "mcp_version is string")
		assert.strictEqual(
			typeof body.plugin_version,
			"string",
			"plugin_version is string",
		)
		assert.ok(body.mcp_version.length > 0, "mcp_version is non-empty")
		assert.ok(body.plugin_version.length > 0, "plugin_version is non-empty")
	})

	await test("does not require auth (version is non-sensitive metadata)", async () => {
		// No Authorization header — should still 200. Reviewers reach the
		// SPA via a tunnel-auth JWT in the URL fragment, but the version
		// endpoint is fetched in `useEffect` before any session context
		// is loaded, so it cannot rely on the JWT being present.
		const res = await fetch(`${baseUrl}/api/version`)
		assert.strictEqual(res.status, 200)
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

console.log("")
console.log(`${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)

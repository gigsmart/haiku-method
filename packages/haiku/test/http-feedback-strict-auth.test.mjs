#!/usr/bin/env npx tsx
// Strict-mode feedback mutation auth test (FB-20 regression guard).
//
// When `HAIKU_REMOTE_REVIEW=1` the public tunnel is live and the server MUST
// reject POST/PUT/DELETE /api/feedback/... without `X-Haiku-Session-Id` as
// 401. Before FB-20 this was a fail-open soft gate — any unauthenticated
// cross-origin caller could poison review state.
//
// This file is the subprocess entrypoint: it runs the assertions with
// HAIKU_REMOTE_REVIEW=1 in its own env. run-all.mjs invokes it directly via
// `npx tsx` and run-all.mjs already parses `N passed, M failed` from stdout.
// For local invocation we re-exec ourselves with the flag set if it isn't
// already — keeps the test self-contained.

import assert from "node:assert"
import { spawnSync } from "node:child_process"
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

// If we weren't invoked with the feature flag on, re-exec ourselves so
// features.remoteReview is `true` when config.ts loads.
if (process.env.HAIKU_REMOTE_REVIEW !== "1") {
	const __filename = fileURLToPath(import.meta.url)
	const result = spawnSync("npx", ["tsx", __filename], {
		encoding: "utf8",
		stdio: "inherit",
		env: { ...process.env, HAIKU_REMOTE_REVIEW: "1" },
		timeout: 60000,
	})
	process.exit(result.status ?? 0)
}

const { startHttpServer } = await import("../src/http.ts")
const { writeFeedbackFile } = await import("../src/state-tools.ts")
const { createSession } = await import("../src/sessions.ts")

const tmp = mkdtempSync(join(tmpdir(), "haiku-http-strict-auth-"))
const origCwd = process.cwd()

const projDir = join(tmp, "project")
const haikuRoot = join(projDir, ".haiku")
const intentSlug = "strict-auth-intent"
const intentDirPath = join(haikuRoot, "intents", intentSlug)
const stageName = "development"

mkdirSync(join(intentDirPath, "stages", stageName, "units"), { recursive: true })

writeFileSync(
	join(intentDirPath, "intent.md"),
	`---
title: Strict Auth Test
studio: software
mode: continuous
active_stage: ${stageName}
status: active
stages:
  - ${stageName}
started_at: 2026-04-21T18:00:00Z
completed_at: null
---

Strict auth regression guard.
`,
)

writeFileSync(
	join(intentDirPath, "stages", stageName, "state.json"),
	JSON.stringify(
		{
			stage: stageName,
			status: "active",
			phase: "execute",
			started_at: "2026-04-21T18:05:00Z",
			completed_at: null,
			gate_entered_at: null,
			gate_outcome: null,
			visits: 0,
		},
		null,
		2,
	),
)

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

Example.
`,
)

// Stub git.
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
			console.log(`  ✓ ${name}`)
		},
		(e) => {
			failed++
			console.log(`  ✗ ${name}: ${e.message}`)
		},
	)
}

async function run() {
	const port = await startHttpServer()
	const baseUrl = `http://127.0.0.1:${port}`

	// Seed one feedback item for PUT/DELETE cases.
	const seeded = writeFeedbackFile(intentSlug, stageName, {
		title: "seed",
		body: "body",
		origin: "adversarial-review",
		author: "tester",
		source_ref: null,
	})

	console.log("\n=== Strict mutation auth (HAIKU_REMOTE_REVIEW=1) ===")

	await test(
		"POST without X-Haiku-Session-Id returns 401 (not 201)",
		async () => {
			const res = await fetch(
				`${baseUrl}/api/feedback/${intentSlug}/${stageName}`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ title: "unauth", body: "x" }),
				},
			)
			assert.strictEqual(res.status, 401)
			const data = await res.json()
			assert.strictEqual(data.error, "unauthorized")
			assert.strictEqual(data.reason, "missing_session_header")
		},
	)

	await test(
		"PUT without X-Haiku-Session-Id returns 401",
		async () => {
			const res = await fetch(
				`${baseUrl}/api/feedback/${intentSlug}/${stageName}/${seeded.feedback_id}`,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ status: "addressed" }),
				},
			)
			assert.strictEqual(res.status, 401)
			const data = await res.json()
			assert.strictEqual(data.error, "unauthorized")
		},
	)

	await test(
		"DELETE without X-Haiku-Session-Id returns 401",
		async () => {
			const res = await fetch(
				`${baseUrl}/api/feedback/${intentSlug}/${stageName}/${seeded.feedback_id}`,
				{ method: "DELETE" },
			)
			assert.strictEqual(res.status, 401)
		},
	)

	await test(
		"POST with matching X-Haiku-Session-Id proceeds (201)",
		async () => {
			const session = createSession({
				intent_slug: intentSlug,
				intent_dir: intentDirPath,
				review_type: "intent",
				target: "review",
			})
			const res = await fetch(
				`${baseUrl}/api/feedback/${intentSlug}/${stageName}`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-Haiku-Session-Id": session.session_id,
					},
					body: JSON.stringify({ title: "authed", body: "x" }),
				},
			)
			assert.strictEqual(res.status, 201)
		},
	)

	await test(
		"CORS preflight advertises X-Haiku-Session-Id in Allow-Headers",
		async () => {
			const res = await fetch(
				`${baseUrl}/api/feedback/${intentSlug}/${stageName}`,
				{ method: "OPTIONS" },
			)
			// 204 with CORS middleware applied.
			assert.strictEqual(res.status, 204)
			const allow = res.headers.get("access-control-allow-headers") ?? ""
			assert.ok(
				/x-haiku-session-id/i.test(allow),
				`Access-Control-Allow-Headers missing X-Haiku-Session-Id — got "${allow}"`,
			)
		},
	)

	console.log(`\n${passed} passed, ${failed} failed\n`)
}

try {
	await run()
} finally {
	process.chdir(origCwd)
	rmSync(tmp, { recursive: true })
	process.exit(failed > 0 ? 1 : 0)
}

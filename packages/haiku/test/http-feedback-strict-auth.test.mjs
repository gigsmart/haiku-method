#!/usr/bin/env npx tsx
// Strict-mode feedback mutation auth test (FB-020 regression guard).
//
// When `HAIKU_REMOTE_REVIEW=1` the public tunnel is live and the server MUST
// reject POST/PUT/DELETE /api/feedback/... without `X-Haiku-Session-Id` as
// 401. Before FB-020 this was a fail-open soft gate — any unauthenticated
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
import { join } from "node:path"
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
const { __setActiveTunnelForTesting, signJWT } = await import(
	"../src/tunnel.ts"
)
const { review } = await import("../src/config.ts")

// FB-030 added tunnel-JWT auth that fires BEFORE the feedback mutation
// guard. In remote mode every request needs a valid JWT to get past
// the auth layer at all. Stub an active tunnel so verifyTunnelJWT can
// validate tokens we mint here.
const STUB_TUNNEL_URL = "https://stub-strict-auth.loca.lt"
__setActiveTunnelForTesting(STUB_TUNNEL_URL)

function mintJWT(sid) {
	const now = Math.floor(Date.now() / 1000)
	return signJWT({
		tun: STUB_TUNNEL_URL,
		sid,
		typ: "review",
		key: "dGVzdA",
		iat: now,
		exp: now + 3600,
	})
}

// FB-036 made CORS origin-checked. The test's OPTIONS preflight must
// send a valid Origin to get CORS headers back. Default allow-list
// entry is `review.siteUrl`.
const ALLOWED_ORIGIN =
	review.allowedOrigins.filter((o) => o && o !== "*")[0] ?? review.siteUrl

const tmp = mkdtempSync(join(tmpdir(), "haiku-http-strict-auth-"))
const origCwd = process.cwd()

const projDir = join(tmp, "project")
const haikuRoot = join(projDir, ".haiku")
const intentSlug = "strict-auth-intent"
const intentDirPath = join(haikuRoot, "intents", intentSlug)
const stageName = "development"

mkdirSync(join(intentDirPath, "stages", stageName, "units"), {
	recursive: true,
})

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

	// Seed a session + JWT. FB-030 added the tunnel-JWT gate that now
	// fires BEFORE the feedback mutation gate (FB-020), so requests
	// missing the JWT never reach the feedback guard — they 401 at the
	// outer gate with `missing_token`. Tests that want to exercise the
	// feedback gate must send a valid JWT first.
	const session = createSession({
		intent_slug: intentSlug,
		intent_dir: intentDirPath,
		review_type: "intent",
		target: "review",
	})
	const jwtToken = mintJWT(session.session_id)
	// V-08 (unit-03): mutating routes in tunnel mode require an
	// allow-listed Origin header (Layer 2 of the CSRF defence). The
	// default allow-list is `http://localhost:*`, so a localhost Origin
	// matches and the request reaches the auth gate. Tests below send
	// this Origin so they exercise auth, not CSRF — see csrf.test.mjs
	// for the bare CSRF assertions.
	const csrfOrigin = `http://localhost:${port}`
	const authz = {
		Authorization: `Bearer ${jwtToken}`,
		Origin: csrfOrigin,
	}

	await test("POST with no auth at all but with Origin returns 401 (CSRF passes → tunnel gate: missing_token)", async () => {
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json", Origin: csrfOrigin },
				body: JSON.stringify({ title: "unauth", body: "x" }),
			},
		)
		assert.strictEqual(res.status, 401)
		const data = await res.json()
		assert.strictEqual(data.error, "unauthorized")
		assert.strictEqual(data.reason, "missing_token")
	})

	await test("POST with valid JWT proceeds (201) — JWT + Origin is the auth surface", async () => {
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json", ...authz },
				body: JSON.stringify({ title: "authed", body: "x" }),
			},
		)
		assert.strictEqual(
			res.status,
			201,
			`expected 201 with valid JWT, got ${res.status}`,
		)
	})

	await test("PUT with valid JWT proceeds (200)", async () => {
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}/${seeded.feedback_id}`,
			{
				method: "PUT",
				headers: { "Content-Type": "application/json", ...authz },
				body: JSON.stringify({ status: "addressed" }),
			},
		)
		assert.strictEqual(
			res.status,
			200,
			`expected 200 with valid JWT, got ${res.status}`,
		)
	})

	// JWT-claim session binding: the session embedded in the JWT must
	// match the intent in the URL. A JWT bound to one intent's session
	// cannot mutate a different intent's feedback even though the token
	// is cryptographically valid. This is the real auth invariant — the
	// prior `X-Haiku-Session-Id` header check was superseded.
	await test("JWT for session bound to a DIFFERENT intent returns 403 forbidden_cross_session", async () => {
		// Create a session bound to a different intent slug, mint a JWT
		// for it, then try to POST feedback against our intent.
		const otherIntent = "strict-auth-other-intent"
		const otherIntentDir = join(haikuRoot, "intents", otherIntent)
		mkdirSync(join(otherIntentDir, "stages", stageName, "units"), {
			recursive: true,
		})
		writeFileSync(
			join(otherIntentDir, "intent.md"),
			`---\ntitle: Other\nstudio: software\nmode: continuous\nactive_stage: ${stageName}\nstatus: active\nstages:\n  - ${stageName}\n---\n\nOther intent.\n`,
		)
		writeFileSync(
			join(otherIntentDir, "stages", stageName, "state.json"),
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
		const otherSession = createSession({
			intent_slug: otherIntent,
			intent_dir: otherIntentDir,
			review_type: "intent",
			target: "review",
		})
		const otherJwt = mintJWT(otherSession.session_id)

		// Use otherIntent's JWT against OUR intent's feedback endpoint.
		// Origin must be sent so V-08 Layer 2 passes; the assertion below
		// is about the JWT-claim mismatch, not CSRF.
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${otherJwt}`,
					Origin: csrfOrigin,
				},
				body: JSON.stringify({ title: "cross-intent", body: "x" }),
			},
		)
		assert.strictEqual(
			res.status,
			403,
			`expected 403 cross-intent, got ${res.status}`,
		)
		const data = await res.json()
		assert.strictEqual(data.error, "forbidden_cross_session")
		assert.strictEqual(data.reason, "intent_mismatch")
	})

	await test("JWT with unknown session id returns 403 forbidden_cross_session", async () => {
		// Mint a JWT referencing a session id that was never created.
		const bogusJwt = mintJWT("sess-does-not-exist")
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${bogusJwt}`,
					Origin: csrfOrigin,
				},
				body: JSON.stringify({ title: "bogus", body: "x" }),
			},
		)
		assert.strictEqual(res.status, 403)
		const data = await res.json()
		assert.strictEqual(data.error, "forbidden_cross_session")
		assert.strictEqual(data.reason, "unknown_session")
	})

	await test("CORS preflight advertises Authorization in Allow-Headers", async () => {
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}`,
			{
				method: "OPTIONS",
				headers: {
					Origin: ALLOWED_ORIGIN,
					"Access-Control-Request-Method": "POST",
				},
			},
		)
		assert.strictEqual(res.status, 204)
		const allow = res.headers.get("access-control-allow-headers") ?? ""
		// Authorization is the tunnel-auth bearer header — the only
		// header the SPA now attaches on every tunnel-reachable call.
		assert.ok(
			/authorization/i.test(allow),
			`Access-Control-Allow-Headers missing Authorization — got "${allow}"`,
		)
	})

	console.log(`\n${passed} passed, ${failed} failed\n`)
}

// Guard against silent exits — run() throwing before any test() call would
// leave `failed === 0` and the finally would `process.exit(0)`, hiding the
// real failure. Capture any pre-test crash explicitly.
let hardFailure = null
try {
	await run()
} catch (err) {
	hardFailure = err
	console.error(
		`\n✗ run() crashed before completing tests: ${err instanceof Error ? err.message : err}`,
	)
	if (err instanceof Error && err.stack) console.error(err.stack)
} finally {
	__setActiveTunnelForTesting(null)
	process.chdir(origCwd)
	rmSync(tmp, { recursive: true })
	const exitCode = failed > 0 || hardFailure ? 1 : 0
	process.exit(exitCode)
}

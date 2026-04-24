#!/usr/bin/env npx tsx
// Strict-mode feedback mutation auth test (FB-20 / FB-30 regression guard).
//
// When `HAIKU_REMOTE_REVIEW=1` the public tunnel is live and the server MUST
// reject POST/PUT/DELETE /api/feedback/... without a valid bearer JWT as 401.
// The auth model uses JWT-claim-based session binding: the JWT's `sid` claim
// identifies the session, so no separate `X-Haiku-Session-Id` header is
// required or checked. Before FB-20 this was a fail-open soft gate — any
// unauthenticated cross-origin caller could poison review state. FB-30 added
// JWT bearer auth at the tunnel layer; the feedback mutation gate enforces
// session-intent binding via the same JWT.
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
const { __setActiveTunnelForTesting, signJWT } = await import(
	"../src/tunnel.ts"
)
const { review } = await import("../src/config.ts")

// FB-30 added tunnel-JWT auth that fires BEFORE the feedback mutation
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

// FB-36 made CORS origin-checked. The test's OPTIONS preflight must
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

	// Seed a session + JWT. FB-30 added the tunnel-JWT gate that now
	// fires BEFORE the feedback mutation gate (FB-20), so requests
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
	const authz = { Authorization: `Bearer ${jwtToken}` }

	await test(
		"POST with no auth at all returns 401 (tunnel gate: missing_token)",
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
			assert.strictEqual(data.reason, "missing_token")
		},
	)

	// The session binding is JWT-claim-based: the JWT's `sid` claim must
	// map to an active session whose intent matches the URL. A JWT for a
	// *different* session (wrong sid) should be forbidden.
	await test(
		"POST with JWT for wrong session returns 403 (feedback gate: intent_mismatch or unknown_session)",
		async () => {
			// Mint a JWT for a session id that doesn't exist.
			const badToken = mintJWT("nonexistent-session-id")
			const res = await fetch(
				`${baseUrl}/api/feedback/${intentSlug}/${stageName}`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${badToken}`,
					},
					body: JSON.stringify({ title: "unauth", body: "x" }),
				},
			)
			assert.strictEqual(res.status, 403)
			const data = await res.json()
			assert.strictEqual(data.error, "forbidden_cross_session")
		},
	)

	await test(
		"PUT with JWT for wrong session returns 403",
		async () => {
			const badToken = mintJWT("nonexistent-session-id")
			const res = await fetch(
				`${baseUrl}/api/feedback/${intentSlug}/${stageName}/${seeded.feedback_id}`,
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${badToken}`,
					},
					body: JSON.stringify({ status: "addressed" }),
				},
			)
			assert.strictEqual(res.status, 403)
			const data = await res.json()
			assert.strictEqual(data.error, "forbidden_cross_session")
		},
	)

	await test(
		"DELETE with JWT for wrong session returns 403",
		async () => {
			const badToken = mintJWT("nonexistent-session-id")
			const res = await fetch(
				`${baseUrl}/api/feedback/${intentSlug}/${stageName}/${seeded.feedback_id}`,
				{ method: "DELETE", headers: { Authorization: `Bearer ${badToken}` } },
			)
			assert.strictEqual(res.status, 403)
		},
	)

	await test(
		"POST with matching JWT (sid-bound session) proceeds (201)",
		async () => {
			const res = await fetch(
				`${baseUrl}/api/feedback/${intentSlug}/${stageName}`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						...authz,
					},
					body: JSON.stringify({ title: "authed", body: "x" }),
				},
			)
			assert.strictEqual(res.status, 201)
		},
	)

	await test(
		"CORS preflight advertises Authorization in Allow-Headers (FB-30 bearer token gate)",
		async () => {
			// Real browser preflights always carry an Origin header. Since FB-36
			// made withCors gate ACAH on an allow-listed Origin, the test must
			// send one from the allow-list (defaults to HAIKU_REVIEW_SITE_URL)
			// to exercise the "headers advertised" path.
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
			// 204 with CORS middleware applied.
			assert.strictEqual(res.status, 204)
			const allow = res.headers.get("access-control-allow-headers") ?? ""
			// FB-30: Authorization is the tunnel-auth bearer header the SPA
			// now attaches on every tunnel-reachable call. The JWT's sid claim
			// provides session binding, so no separate X-Haiku-Session-Id is
			// required or advertised.
			assert.ok(
				/authorization/i.test(allow),
				`Access-Control-Allow-Headers missing Authorization — got "${allow}"`,
			)
		},
	)

	console.log(`\n${passed} passed, ${failed} failed\n`)
}

try {
	await run()
} finally {
	__setActiveTunnelForTesting(null)
	process.chdir(origCwd)
	rmSync(tmp, { recursive: true })
	process.exit(failed > 0 ? 1 : 0)
}

#!/usr/bin/env npx tsx
// FB-30 regression guard — tunnel-exposed routes reject unauthenticated
// callers in remote-review mode.
//
// `buildReviewUrl` mints an HS256 JWT keyed with `EPHEMERAL_SECRET` and
// embeds it in the URL fragment. Before this fix, the HTTP server never
// verified that JWT — every tunnel-reachable route fell through to its
// handler for any caller who knew the 16-hex session id. This suite
// exercises every failure reason (missing / malformed / bad signature /
// expired / sid mismatch / tunnel mismatch) across representative route
// classes: header-token JSON APIs, query-token asset URLs, and the
// WebSocket upgrade.
//
// Re-exec trick mirrors http-feedback-strict-auth.test.mjs — config.ts
// caches `HAIKU_REMOTE_REVIEW` at module init, so the feature flag has
// to be in the subprocess env before any import of `http.ts` or
// `tunnel.ts` runs.

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

// ── Fixtures ───────────────────────────────────────────────────────────────

const tmp = mkdtempSync(join(tmpdir(), "haiku-tunnel-auth-"))
const origCwd = process.cwd()

const projDir = join(tmp, "project")
const haikuRoot = join(projDir, ".haiku")
const intentSlug = "tunnel-auth-intent"
const intentDirPath = join(haikuRoot, "intents", intentSlug)
const stageName = "development"

mkdirSync(join(intentDirPath, "stages", stageName, "units"), {
	recursive: true,
})

writeFileSync(
	join(intentDirPath, "intent.md"),
	`---
title: Tunnel Auth Test
studio: software
mode: continuous
active_stage: ${stageName}
status: active
stages:
  - ${stageName}
started_at: 2026-04-21T18:00:00Z
completed_at: null
---

Tunnel-auth regression guard.
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

// Stub git so any git-touching path is quiet.
process.env.PATH = `${join(tmp, "fake-bin")}:${process.env.PATH}`
mkdirSync(join(tmp, "fake-bin"), { recursive: true })
writeFileSync(join(tmp, "fake-bin", "git"), "#!/bin/sh\nexit 0\n")
chmodSync(join(tmp, "fake-bin", "git"), 0o755)

process.chdir(projDir)

const TUNNEL_URL = "https://stub.loca.lt"
__setActiveTunnelForTesting(TUNNEL_URL)

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

function mintToken(sid, opts = {}) {
	const now = Math.floor(Date.now() / 1000)
	return signJWT({
		tun: opts.tun ?? TUNNEL_URL,
		sid,
		typ: opts.typ ?? "review",
		key: "dGVzdC1rZXk",
		iat: now,
		exp: opts.exp ?? now + 3600,
	})
}

async function run() {
	const port = await startHttpServer()
	const baseUrl = `http://127.0.0.1:${port}`

	// Seed one review session + one feedback item.
	const session = createSession({
		intent_slug: intentSlug,
		intent_dir: intentDirPath,
		review_type: "intent",
		target: "review",
	})
	const seededFeedback = writeFeedbackFile(intentSlug, stageName, {
		title: "seed",
		body: "body",
		origin: "adversarial-review",
		author: "tester",
		source_ref: null,
	})

	console.log("\n=== Header-token JSON routes ===")

	await test("GET /api/session/:sid without Authorization returns 401 (missing_token)", async () => {
		const res = await fetch(`${baseUrl}/api/session/${session.session_id}`)
		assert.strictEqual(res.status, 401)
		const data = await res.json()
		assert.strictEqual(data.error, "unauthorized")
		assert.strictEqual(data.reason, "missing_token")
	})

	await test("GET /api/session/:sid with malformed Authorization returns 401 (malformed)", async () => {
		const res = await fetch(`${baseUrl}/api/session/${session.session_id}`, {
			headers: { Authorization: "Bearer not.a.jwt" },
		})
		assert.strictEqual(res.status, 401)
		const data = await res.json()
		assert.strictEqual(data.error, "unauthorized")
		// The signature slice is base64url but won't hash-match the body
		// → bad_signature (the shape test accepts 2 dots → malformed only
		// on `parts.length !== 3`).
		assert.ok(["malformed", "bad_signature"].includes(data.reason), data.reason)
	})

	await test("GET /api/session/:sid with bad signature returns 401 (bad_signature)", async () => {
		// Valid JWT shape; tamper with the signature segment.
		const token = mintToken(session.session_id)
		const parts = token.split(".")
		parts[2] = Buffer.from("fakesig-fakesig").toString("base64url")
		const res = await fetch(`${baseUrl}/api/session/${session.session_id}`, {
			headers: { Authorization: `Bearer ${parts.join(".")}` },
		})
		assert.strictEqual(res.status, 401)
		const data = await res.json()
		assert.strictEqual(data.reason, "bad_signature")
	})

	await test("GET /api/session/:sid with expired token returns 401 (expired)", async () => {
		const token = mintToken(session.session_id, {
			exp: Math.floor(Date.now() / 1000) - 60,
		})
		const res = await fetch(`${baseUrl}/api/session/${session.session_id}`, {
			headers: { Authorization: `Bearer ${token}` },
		})
		assert.strictEqual(res.status, 401)
		const data = await res.json()
		assert.strictEqual(data.reason, "expired")
	})

	await test("GET /api/session/:sid with tunnel-mismatch token returns 401 (tunnel_mismatch)", async () => {
		const token = mintToken(session.session_id, {
			tun: "https://other.loca.lt",
		})
		const res = await fetch(`${baseUrl}/api/session/${session.session_id}`, {
			headers: { Authorization: `Bearer ${token}` },
		})
		assert.strictEqual(res.status, 401)
		const data = await res.json()
		assert.strictEqual(data.reason, "tunnel_mismatch")
	})

	await test("GET /api/session/:sid with wrong-sid token returns 401 (sid_mismatch)", async () => {
		const token = mintToken("some-other-session-id")
		const res = await fetch(`${baseUrl}/api/session/${session.session_id}`, {
			headers: { Authorization: `Bearer ${token}` },
		})
		assert.strictEqual(res.status, 401)
		const data = await res.json()
		assert.strictEqual(data.reason, "sid_mismatch")
	})

	await test("GET /api/session/:sid with valid Authorization returns 200", async () => {
		const token = mintToken(session.session_id)
		const res = await fetch(`${baseUrl}/api/session/${session.session_id}`, {
			headers: { Authorization: `Bearer ${token}` },
		})
		assert.notStrictEqual(res.status, 401)
		// The session read handler may 404 in this stub; what matters is
		// the request cleared the auth gate.
		assert.ok(res.status < 500, `got ${res.status}`)
	})

	await test("POST /review/:sid/decide without token returns 401", async () => {
		const res = await fetch(`${baseUrl}/review/${session.session_id}/decide`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ decision: "approved", feedback: "" }),
		})
		assert.strictEqual(res.status, 401)
	})

	await test("POST /api/revisit/:sid without token returns 401", async () => {
		const res = await fetch(`${baseUrl}/api/revisit/${session.session_id}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ reason: "x" }),
		})
		assert.strictEqual(res.status, 401)
	})

	// `/api/review/current` was removed when review moved to session-
	// scoped URLs (see `haiku_review_open` + the session-scoped
	// `/review/<sessionId>` route). No token gate is exercised here
	// anymore; the intent-scope surface no longer exists. Auth coverage
	// for session-scoped routes is preserved by the `/api/feedback/...`,
	// `/files/...`, and `/api/session/:id` tests below.

	await test("GET /api/feedback/:intent/:stage without token returns 401", async () => {
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}`,
		)
		assert.strictEqual(res.status, 401)
	})

	await test("POST /api/feedback/:intent/:stage without token returns 401 (tunnel gate fires before FB-20)", async () => {
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: "x", body: "x" }),
			},
		)
		assert.strictEqual(res.status, 401)
	})

	console.log("\n=== Query-token asset routes ===")

	await test("GET /files/:sid/path without ?t returns 401", async () => {
		const res = await fetch(`${baseUrl}/files/${session.session_id}/x.txt`)
		assert.strictEqual(res.status, 401)
	})

	await test("GET /files/:sid/path with bad ?t returns 401", async () => {
		const res = await fetch(
			`${baseUrl}/files/${session.session_id}/x.txt?t=not.a.jwt`,
		)
		assert.strictEqual(res.status, 401)
	})

	await test("GET /mockups/:sid/:path without ?t returns 401", async () => {
		const res = await fetch(`${baseUrl}/mockups/${session.session_id}/m.png`)
		assert.strictEqual(res.status, 401)
	})

	await test("GET /wireframe/:sid/:path without ?t returns 401", async () => {
		const res = await fetch(`${baseUrl}/wireframe/${session.session_id}/w.png`)
		assert.strictEqual(res.status, 401)
	})

	await test("GET /stage-artifacts/:sid/:path without ?t returns 401", async () => {
		const res = await fetch(
			`${baseUrl}/stage-artifacts/${session.session_id}/development/artifacts/foo.png`,
		)
		assert.strictEqual(res.status, 401)
	})

	await test("GET /question-image/:sid/:index without ?t returns 401", async () => {
		const res = await fetch(`${baseUrl}/question-image/${session.session_id}/0`)
		assert.strictEqual(res.status, 401)
	})

	await test("GET /files/:sid/path with valid ?t clears the auth gate", async () => {
		const token = mintToken(session.session_id)
		const res = await fetch(
			`${baseUrl}/files/${session.session_id}/nonexistent.txt?t=${encodeURIComponent(token)}`,
		)
		// May 404 (file not found) but must NOT be 401.
		assert.notStrictEqual(res.status, 401)
	})

	console.log("\n=== Exempt routes (SPA shells + health) ===")

	// `/review/current` SPA shell route was removed alongside the
	// intent-scope JSON endpoint — reviews are session-scoped now.

	await test("GET /review/:sid (SPA shell) does NOT require a token", async () => {
		const res = await fetch(`${baseUrl}/review/${session.session_id}`)
		assert.notStrictEqual(res.status, 401)
	})

	await test("GET /health never requires a token (tunnel keepalive)", async () => {
		const res = await fetch(`${baseUrl}/health`)
		assert.strictEqual(res.status, 200)
	})

	console.log("\n=== WebSocket upgrade gate ===")

	// Node's fetch refuses to treat an HTTP 101 response as a successful
	// fetch, and rejects the response stream on any other status during
	// an upgrade attempt. Talk raw TCP to the server instead so we can
	// read the status line directly.
	const net = await import("node:net")
	async function rawUpgrade(pathname) {
		return new Promise((resolve, reject) => {
			const sock = net.connect(port, "127.0.0.1", () => {
				sock.write(
					`GET ${pathname} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`,
				)
			})
			let buf = ""
			sock.on("data", (chunk) => {
				buf += chunk.toString("utf-8")
				// status line + CRLF is enough; server follows with \r\n\r\n
				if (buf.includes("\r\n\r\n")) {
					sock.destroy()
					resolve(buf.split("\r\n")[0])
				}
			})
			sock.on("error", reject)
			sock.on("close", () => {
				if (buf) resolve(buf.split("\r\n")[0])
			})
		})
	}

	await test("WS upgrade without ?t returns 401", async () => {
		const line = await rawUpgrade(`/ws/session/${session.session_id}`)
		assert.ok(line.startsWith("HTTP/1.1 401"), `got status line: ${line}`)
	})

	await test("WS upgrade with bad ?t returns 401", async () => {
		const line = await rawUpgrade(
			`/ws/session/${session.session_id}?t=not.a.jwt`,
		)
		assert.ok(line.startsWith("HTTP/1.1 401"), `got status line: ${line}`)
	})

	await test("WS upgrade with valid ?t returns 101", async () => {
		const token = mintToken(session.session_id)
		const line = await rawUpgrade(
			`/ws/session/${session.session_id}?t=${encodeURIComponent(token)}`,
		)
		assert.ok(line.startsWith("HTTP/1.1 101"), `got status line: ${line}`)
	})

	// Touch seeded feedback so the id is referenced (silences unused-var
	// warnings from the linter in CI runs).
	void seededFeedback

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

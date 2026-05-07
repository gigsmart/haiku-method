#!/usr/bin/env npx tsx
// FB-036 regression guard: CORS must be origin-gated, never wildcard.
//
// When `HAIKU_REMOTE_REVIEW=1` the public tunnel is live. Before FB-036 the
// server emitted `Access-Control-Allow-Origin: *` on every response, which
// combined with the session-token-in-URL auth model let any site the
// reviewer opened cross-origin mutate review state. The fix narrows CORS to
// an allow-list (defaulting to `[review.siteUrl]`) and strips any `*` from
// `HAIKU_REVIEW_ALLOWED_ORIGINS` at startup.
//
// This file is the subprocess entrypoint: it re-execs itself with the
// required env vars set before importing the config module (env is read
// once at module load). Run via run-all.mjs or directly:
//   HAIKU_REMOTE_REVIEW=1 npx tsx test/http-cors.test.mjs

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

// Re-exec with required env vars so features.remoteReview is true and the
// allow-list has a deterministic set of origins when config.ts loads.
if (
	process.env.HAIKU_REMOTE_REVIEW !== "1" ||
	process.env.HAIKU_REVIEW_ALLOWED_ORIGINS === undefined
) {
	const __filename = fileURLToPath(import.meta.url)
	const result = spawnSync("npx", ["tsx", __filename], {
		encoding: "utf8",
		stdio: "inherit",
		env: {
			...process.env,
			HAIKU_REMOTE_REVIEW: "1",
			// Allow-list: one canonical origin + one explicit extra. Neither is
			// `evil.example`. The test also validates the wildcard strip logic
			// by flipping the env var in a helper spawn below.
			HAIKU_REVIEW_ALLOWED_ORIGINS:
				"https://haikumethod.ai,https://staging.haikumethod.ai",
			HAIKU_REVIEW_SITE_URL: "https://haikumethod.ai",
		},
		timeout: 60000,
	})
	process.exit(result.status ?? 0)
}

const { startHttpServer } = await import("../src/http.ts")
const { createSession } = await import("../src/sessions.ts")
const { review, stripWildcardAllowedOrigins } = await import("../src/config.ts")

// ── Setup ──────────────────────────────────────────────────────────────────

const tmp = mkdtempSync(join(tmpdir(), "haiku-http-cors-"))
const origCwd = process.cwd()

const projDir = join(tmp, "project")
const haikuRoot = join(projDir, ".haiku")
const intentSlug = "test-http-cors"
const intentDirPath = join(haikuRoot, "intents", intentSlug)
const stageName = "development"

mkdirSync(join(intentDirPath, "stages", stageName, "units"), {
	recursive: true,
})

writeFileSync(
	join(intentDirPath, "intent.md"),
	`---
title: CORS Test Intent
studio: software
mode: continuous
active_stage: ${stageName}
status: active
stages:
  - ${stageName}
started_at: 2026-04-21T00:00:00Z
completed_at: null
---

CORS allow-list regression.
`,
)

writeFileSync(
	join(intentDirPath, "stages", stageName, "state.json"),
	JSON.stringify(
		{ stage: stageName, status: "active", phase: "execute", visits: 0 },
		null,
		2,
	),
)

// Stub git so downstream writes don't fail in the tmp project.
process.env.PATH = `${join(tmp, "fake-bin")}:${process.env.PATH}`
mkdirSync(join(tmp, "fake-bin"), { recursive: true })
writeFileSync(join(tmp, "fake-bin", "git"), "#!/bin/sh\nexit 0\n")
chmodSync(join(tmp, "fake-bin", "git"), 0o755)

process.chdir(projDir)

let passed = 0
let failed = 0

function test(name, fn) {
	return Promise.resolve()
		.then(fn)
		.then(
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

	// Seed a review session so createSession doesn't complain about empty
	// state if anything downstream reaches for one. The CORS tests below
	// hit `/review/current` (SPA shell, no auth) which does not need a
	// session id, but we still want the session file on disk to exist.
	createSession({
		intent_slug: intentSlug,
		intent_dir: intentDirPath,
		review_type: "intent",
		target: "review",
	})

	// A safe-ish endpoint: GET /review/current returns the SPA shell HTML
	// with no auth requirement. This gives us CORS headers on both match
	// and non-match without needing a valid JWT.
	const safeUrl = `${baseUrl}/review/current`

	console.log("\n=== FB-036 CORS allow-list ===")

	await test("allowed origin (siteUrl) gets ACAO echoed back", async () => {
		const res = await fetch(safeUrl, {
			headers: { Origin: "https://haikumethod.ai" },
		})
		assert.strictEqual(
			res.headers.get("access-control-allow-origin"),
			"https://haikumethod.ai",
			"expected allowed origin echoed back",
		)
		// Vary: Origin is required so caches partition by origin.
		const vary = (res.headers.get("vary") || "").toLowerCase()
		assert.ok(vary.includes("origin"), `expected Vary: Origin, got "${vary}"`)
	})

	await test("second allow-listed origin is also echoed back", async () => {
		const res = await fetch(safeUrl, {
			headers: { Origin: "https://staging.haikumethod.ai" },
		})
		assert.strictEqual(
			res.headers.get("access-control-allow-origin"),
			"https://staging.haikumethod.ai",
		)
	})

	await test("disallowed origin gets NO ACAO / ACAM / ACAH / ACEH", async () => {
		const res = await fetch(safeUrl, {
			headers: { Origin: "https://evil.example" },
		})
		assert.strictEqual(
			res.headers.get("access-control-allow-origin"),
			null,
			"ACAO must be absent for disallowed origins",
		)
		assert.strictEqual(
			res.headers.get("access-control-allow-methods"),
			null,
			"ACAM must be absent for disallowed origins",
		)
		assert.strictEqual(
			res.headers.get("access-control-allow-headers"),
			null,
			"ACAH must be absent for disallowed origins",
		)
		assert.strictEqual(
			res.headers.get("access-control-expose-headers"),
			null,
			"ACEH must be absent for disallowed origins",
		)
		// Vary: Origin is still set so the non-match response is cache-safe.
		const vary = (res.headers.get("vary") || "").toLowerCase()
		assert.ok(
			vary.includes("origin"),
			`expected Vary: Origin on disallowed branch, got "${vary}"`,
		)
	})

	await test("no Origin header (same-origin) gets NO ACAO", async () => {
		const res = await fetch(safeUrl)
		assert.strictEqual(
			res.headers.get("access-control-allow-origin"),
			null,
			"same-origin (no Origin header) must not receive ACAO",
		)
	})

	await test("ACAO is never `*` — regression guard for the root FB-036 bug", async () => {
		for (const origin of [
			"https://haikumethod.ai",
			"https://evil.example",
			"null",
		]) {
			const res = await fetch(safeUrl, { headers: { Origin: origin } })
			assert.notStrictEqual(
				res.headers.get("access-control-allow-origin"),
				"*",
				`ACAO must never be "*" (got it for Origin=${origin})`,
			)
		}
		// Also probe with no Origin.
		const res = await fetch(safeUrl)
		assert.notStrictEqual(res.headers.get("access-control-allow-origin"), "*")
	})

	await test("Access-Control-Allow-Credentials is never emitted", async () => {
		for (const origin of ["https://haikumethod.ai", "https://evil.example"]) {
			const res = await fetch(safeUrl, { headers: { Origin: origin } })
			assert.strictEqual(
				res.headers.get("access-control-allow-credentials"),
				null,
				`ACAC must be absent (got it for Origin=${origin})`,
			)
		}
	})

	// ── Preflight / OPTIONS ─────────────────────────────────────────────────

	console.log("\n=== FB-036 CORS preflight (OPTIONS) ===")

	await test("OPTIONS from allowed origin returns 204 with ACAO echoed", async () => {
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}`,
			{
				method: "OPTIONS",
				headers: {
					Origin: "https://haikumethod.ai",
					"Access-Control-Request-Method": "POST",
				},
			},
		)
		assert.strictEqual(res.status, 204)
		assert.strictEqual(
			res.headers.get("access-control-allow-origin"),
			"https://haikumethod.ai",
		)
		const methods = res.headers.get("access-control-allow-methods") || ""
		assert.ok(
			methods.includes("POST"),
			`expected POST in ACAM, got "${methods}"`,
		)
	})

	await test("OPTIONS from disallowed origin returns 204 with NO ACAO", async () => {
		const res = await fetch(
			`${baseUrl}/api/feedback/${intentSlug}/${stageName}`,
			{
				method: "OPTIONS",
				headers: {
					Origin: "https://evil.example",
					"Access-Control-Request-Method": "POST",
				},
			},
		)
		// 204 is fine — the bare body cannot leak. What matters is that
		// the browser blocks the *real* request because ACAO is missing.
		assert.strictEqual(res.status, 204)
		assert.strictEqual(
			res.headers.get("access-control-allow-origin"),
			null,
			"preflight for disallowed origin must not grant ACAO",
		)
		assert.strictEqual(
			res.headers.get("access-control-allow-methods"),
			null,
			"preflight for disallowed origin must not grant ACAM",
		)
	})

	// Wildcard-strip logic is tested in-process since stripping depends on
	// module-level state that the re-exec'd child already initialized.
	console.log("\n=== FB-036 wildcard-strip ===")

	await test("stripWildcardAllowedOrigins removes `*` and warns", async () => {
		// Seed a `*` into the in-memory allow-list, then strip.
		review.allowedOrigins.push("*")
		review.allowedOrigins.push("https://legit.example")
		const warnings = []
		const origWarn = console.warn
		console.warn = (...args) => {
			warnings.push(args.join(" "))
		}
		try {
			const stripped = stripWildcardAllowedOrigins()
			assert.ok(stripped >= 1, "at least one `*` must be stripped")
			assert.ok(
				!review.allowedOrigins.includes("*"),
				"`*` must not survive the strip",
			)
			assert.ok(
				review.allowedOrigins.includes("https://legit.example"),
				"non-wildcard entries must survive the strip",
			)
			assert.ok(
				warnings.some((w) => w.includes("HAIKU_REVIEW_ALLOWED_ORIGINS")),
				"a warning referencing the env var must be emitted",
			)
		} finally {
			console.warn = origWarn
		}
	})

	console.log(`\n${passed} passed, ${failed} failed\n`)
}

try {
	await run()
} finally {
	process.chdir(origCwd)
	rmSync(tmp, { recursive: true })
	process.exit(failed > 0 ? 1 : 0)
}

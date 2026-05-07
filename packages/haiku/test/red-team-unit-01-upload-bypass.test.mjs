#!/usr/bin/env npx tsx
// Red-team regression guard for unit-01 (Upload content validation).
//
// Originally bolt-1 demonstrated bypasses (.js/.css/octet-stream/MIME-spoof)
// that left V-01/V-02 reachable via equivalent extensions. Bolt 3 closed the
// gaps:
//   - `.js`, `.mjs`, `.cjs`, `.css`, `.htc`, `.hta`, `.htaccess` added to
//     BLOCKED_EXTENSIONS
//   - `application/octet-stream` removed from BOTH ALLOWED_MIMES_*
//
// This test now asserts REJECTION (415 unsupported_media_type) for the same
// payloads that previously slipped through, so a future regression that
// re-introduces either gap fails the suite immediately.
//
// Run: npx tsx packages/haiku/test/red-team-unit-01-upload-bypass.test.mjs

import assert from "node:assert"
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const tmp = mkdtempSync(join(tmpdir(), "haiku-redteam-unit01-"))
const projDir = join(tmp, "project")
const haikuRoot = join(projDir, ".haiku")
const intentSlug = "redteam-unit01"
const intentDirPath = join(haikuRoot, "intents", intentSlug)
const stageName = "design"

mkdirSync(join(intentDirPath, "stages", stageName, "units"), {
	recursive: true,
})
mkdirSync(join(intentDirPath, "stages", stageName, "artifacts"), {
	recursive: true,
})
mkdirSync(join(intentDirPath, "knowledge"), { recursive: true })

writeFileSync(
	join(intentDirPath, "intent.md"),
	`---
title: Red Team PoC Intent
studio: software
mode: continuous
active_stage: ${stageName}
status: active
stages:
  - ${stageName}
started_at: 2026-05-01T00:00:00Z
completed_at: null
---
`,
)

writeFileSync(
	join(intentDirPath, "stages", stageName, "state.json"),
	JSON.stringify({
		stage: stageName,
		status: "active",
		phase: "execute",
		visits: 0,
		iteration: 1,
	}),
)

const fakeBinDir = join(tmp, "fake-bin")
mkdirSync(fakeBinDir, { recursive: true })
writeFileSync(join(fakeBinDir, "git"), "#!/bin/sh\nexit 0\n")
chmodSync(join(fakeBinDir, "git"), 0o755)
process.env.PATH = `${fakeBinDir}:${process.env.PATH}`

process.chdir(projDir)

const { startHttpServer, stopHttpServer } = await import("../src/http.ts")

let passed = 0
let failed = 0

async function test(name, fn) {
	try {
		await fn()
		passed++
		console.log(`  PASS ${name}`)
	} catch (e) {
		failed++
		console.log(`  FAIL ${name}: ${e.message}`)
		if (process.env.VERBOSE) console.log(e.stack)
	}
}

function buildMultipart(fields, files) {
	const boundary = `----RTBoundary${Math.random().toString(36).slice(2)}`
	const parts = []
	for (const [name, value] of Object.entries(fields)) {
		parts.push(
			`--${boundary}\r\n` +
				`Content-Disposition: form-data; name="${name}"\r\n\r\n` +
				`${value}\r\n`,
		)
	}
	for (const { name, filename, content, contentType } of files) {
		const ct = contentType ?? "application/octet-stream"
		parts.push(
			`--${boundary}\r\n` +
				`Content-Disposition: form-data; name="${name}"; filename="${filename}"\r\n` +
				`Content-Type: ${ct}\r\n\r\n`,
		)
		parts.push(content)
		parts.push("\r\n")
	}
	parts.push(`--${boundary}--\r\n`)
	const buffers = parts.map((p) =>
		typeof p === "string" ? Buffer.from(p, "utf-8") : p,
	)
	return {
		body: Buffer.concat(buffers),
		contentType: `multipart/form-data; boundary=${boundary}`,
	}
}

async function run() {
	const port = await startHttpServer()
	const baseUrl = `http://127.0.0.1:${port}`

	console.log(
		"\n=== Red-team regression guards: V-01/V-02 bypasses closed in bolt 3 ===",
	)

	await test("R-01 closed: .js upload via application/octet-stream now rejected with 415", async () => {
		const payload = Buffer.from("alert(document.cookie); // pwn.js")
		const { body, contentType } = buildMultipart(
			{
				stage: stageName,
				target_path: "artifacts/pwn.js",
				mode: "upsert",
				attribute_to_user: "attacker",
			},
			[
				{
					name: "file",
					filename: "pwn.js",
					content: payload,
					contentType: "application/octet-stream",
				},
			],
		)
		const res = await fetch(
			`${baseUrl}/api/intents/${intentSlug}/uploads/stage-output`,
			{
				method: "POST",
				headers: { "Content-Type": contentType },
				body,
			},
		)
		assert.strictEqual(
			res.status,
			415,
			`R-01: .js + octet-stream MUST be rejected with 415 (bolt 3 closure of V-01/V-02 equivalent-class bypass). Got ${res.status}.`,
		)
		const data = await res.json()
		assert.ok(
			data.error === "unsupported_media_type" ||
				data.code === "unsupported_media_type",
			`Expected unsupported_media_type, got ${JSON.stringify(data)}`,
		)
	})

	await test("R-02 closed: .css upload via application/octet-stream now rejected with 415", async () => {
		const payload = Buffer.from(
			"input[type=password] { background: url(https://evil/x); }",
		)
		const { body, contentType } = buildMultipart(
			{
				stage: stageName,
				target_path: "artifacts/pwn.css",
				mode: "upsert",
				attribute_to_user: "attacker",
			},
			[
				{
					name: "file",
					filename: "pwn.css",
					content: payload,
					contentType: "application/octet-stream",
				},
			],
		)
		const res = await fetch(
			`${baseUrl}/api/intents/${intentSlug}/uploads/stage-output`,
			{
				method: "POST",
				headers: { "Content-Type": contentType },
				body,
			},
		)
		assert.strictEqual(
			res.status,
			415,
			`R-02: .css + octet-stream MUST be rejected (stylesheet injection vector). Got ${res.status}.`,
		)
	})

	await test("R-03 closed: text/markdown MIME + .js extension rejected on extension blocklist", async () => {
		const payload = Buffer.from("alert('via markdown MIME spoof');")
		const { body, contentType } = buildMultipart(
			{
				stage: stageName,
				target_path: "artifacts/spoof.js",
				mode: "upsert",
				attribute_to_user: "attacker",
			},
			[
				{
					name: "file",
					filename: "spoof.js",
					content: payload,
					contentType: "text/markdown",
				},
			],
		)
		const res = await fetch(
			`${baseUrl}/api/intents/${intentSlug}/uploads/stage-output`,
			{
				method: "POST",
				headers: { "Content-Type": contentType },
				body,
			},
		)
		assert.strictEqual(
			res.status,
			415,
			`R-03: .js extension MUST be rejected even when MIME claims text/markdown. Got ${res.status}.`,
		)
	})

	await test("R-04 (positive control): the V-02 fix DOES still reject .html + text/plain", async () => {
		const payload = Buffer.from("<script>alert(1)</script>")
		const { body, contentType } = buildMultipart(
			{
				stage: stageName,
				target_path: "artifacts/control.html",
				mode: "upsert",
				attribute_to_user: "attacker",
			},
			[
				{
					name: "file",
					filename: "control.html",
					content: payload,
					contentType: "text/plain",
				},
			],
		)
		const res = await fetch(
			`${baseUrl}/api/intents/${intentSlug}/uploads/stage-output`,
			{
				method: "POST",
				headers: { "Content-Type": contentType },
				body,
			},
		)
		assert.strictEqual(
			res.status,
			415,
			`Positive control: V-02 fix should still reject .html. Got ${res.status}.`,
		)
	})

	await test("R-05 (knowledge route): .js + octet-stream now uploads successfully — V-01 defense moved to serveFile", async () => {
		// The knowledge route used to reject .js + octet-stream at the
		// upload boundary. That guard rejected legitimate designer /
		// researcher artifacts (Sketch HTML exports, .docx, .csv) too.
		// V-01 / R-05 are now closed at serve time: serveFile in
		// http/path-safety.ts downgrades any non-allowlisted MIME to
		// `application/octet-stream` + `Content-Disposition: attachment`
		// before the reviewer's browser sees it. The serve-side defense
		// has its own coverage; this test guards against re-introducing
		// the upload-side rejection.
		const payload = Buffer.from("alert('knowledge .js')")
		const { body, contentType } = buildMultipart(
			{
				target_filename: "pwn-knowledge.js",
				attribute_to_user: "researcher",
			},
			[
				{
					name: "file",
					filename: "pwn-knowledge.js",
					content: payload,
					contentType: "application/octet-stream",
				},
			],
		)
		const res = await fetch(
			`${baseUrl}/api/intents/${intentSlug}/uploads/knowledge`,
			{
				method: "POST",
				headers: { "Content-Type": contentType },
				body,
			},
		)
		assert.strictEqual(
			res.status,
			200,
			`Knowledge route accepts any file; serveFile is the XSS boundary. Got ${res.status}.`,
		)
	})

	await test("R-06: bare octet-stream MIME (no blocked extension) now rejected — allowlist no longer accepts it", async () => {
		// .bin extension is not in BLOCKED_EXTENSIONS, but octet-stream is
		// no longer on ALLOWED_MIMES_STAGE_OUTPUT, so the allowlist now
		// rejects this payload. Closes red-team R-03 (allowlist no-op).
		const payload = Buffer.from("opaque binary blob")
		const { body, contentType } = buildMultipart(
			{
				stage: stageName,
				target_path: "artifacts/blob.bin",
				mode: "upsert",
				attribute_to_user: "attacker",
			},
			[
				{
					name: "file",
					filename: "blob.bin",
					content: payload,
					contentType: "application/octet-stream",
				},
			],
		)
		const res = await fetch(
			`${baseUrl}/api/intents/${intentSlug}/uploads/stage-output`,
			{
				method: "POST",
				headers: { "Content-Type": contentType },
				body,
			},
		)
		assert.strictEqual(
			res.status,
			415,
			`R-06: octet-stream MUST be rejected even on a non-blocked extension. Got ${res.status}.`,
		)
	})

	await test("R-07: attribute_to_user with HTML payload rejected with bad_attribute_to_user (audit-log XSS guard)", async () => {
		const payload = Buffer.from("legitimate markdown\n")
		const { body, contentType } = buildMultipart(
			{
				stage: stageName,
				target_path: "artifacts/doc.md",
				mode: "upsert",
				attribute_to_user: "<img src=x onerror=alert(1)>",
			},
			[
				{
					name: "file",
					filename: "doc.md",
					content: payload,
					contentType: "text/markdown",
				},
			],
		)
		const res = await fetch(
			`${baseUrl}/api/intents/${intentSlug}/uploads/stage-output`,
			{
				method: "POST",
				headers: { "Content-Type": contentType },
				body,
			},
		)
		assert.strictEqual(
			res.status,
			400,
			`R-07: HTML payload in attribute_to_user MUST be rejected with 400. Got ${res.status}.`,
		)
		const data = await res.json()
		assert.ok(
			data.error === "bad_attribute_to_user" ||
				data.code === "bad_attribute_to_user",
			`Expected bad_attribute_to_user, got ${JSON.stringify(data)}`,
		)
	})

	await stopHttpServer()
	console.log(`\n${passed} passed, ${failed} failed`)
	if (failed > 0) process.exit(1)
}

run().catch((err) => {
	console.error("Test runner failed:", err)
	process.exit(1)
})

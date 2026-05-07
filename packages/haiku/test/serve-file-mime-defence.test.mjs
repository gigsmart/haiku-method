#!/usr/bin/env npx tsx
// FB-021 — defence-in-depth against OOB filesystem drops at the read sink.
//
// The upload routes block dangerous extensions, but the entire raison
// d'être of the `out-of-band-human-file-modifications` intent is files
// that land in the tracked surface via filesystem writes that bypass
// the upload boundary. This regression suite asserts that `serveFile`
// is the second line of defence: every browser-renderable extension
// (`.html`, `.htm`, `.svg`, `.xml`, `.xhtml`, `.mhtml`, `.js`, `.mjs`,
// `.cjs`, `.css`, `.htc`, `.hta`, `.htaccess`) is forced to
// `application/octet-stream` + `Content-Disposition: attachment` even
// when the file lands on disk via OOB write rather than via the upload
// route. Inline rendering is preserved only for the explicit safe-list
// (images, PDF, plain text, markdown, JSON).
//
// `X-Content-Type-Options: nosniff` is asserted unconditionally so a
// browser cannot upgrade an octet-stream payload back to a renderable
// type via byte heuristics.

import assert from "node:assert"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const tmp = mkdtempSync(join(tmpdir(), "haiku-fb-21-"))

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
		if (process.env.VERBOSE) console.error(e)
	}
}

const { serveFile } = await import("../src/http/path-safety.ts")

/** Minimal mock of FastifyReply that records header() and send() calls. */
function mockReply() {
	const headers = {}
	const state = { statusCode: 200, body: null }
	return {
		headers,
		state,
		header(name, value) {
			headers[name] = value
			return this
		},
		status(code) {
			state.statusCode = code
			return this
		},
		send(data) {
			state.body = data
			return this
		},
	}
}

async function serveAndCapture(realPath) {
	const reply = mockReply()
	await serveFile(reply, realPath)
	return reply
}

console.log(
	"\n=== FB-021 — OOB-drop browser-renderable extensions forced to attachment ===",
)

const BLOCKED_EXTS = [
	".html",
	".htm",
	".svg",
	".xml",
	".xhtml",
	".mhtml",
	".js",
	".mjs",
	".cjs",
	".css",
	".htc",
	".hta",
	".htaccess",
]

for (const ext of BLOCKED_EXTS) {
	await test(`OOB drop of poison${ext} forces attachment + octet-stream`, async () => {
		const file = join(tmp, `poison${ext}`)
		writeFileSync(file, "<script>alert(1)</script>")
		const reply = await serveAndCapture(file)

		assert.strictEqual(
			reply.headers["Content-Type"],
			"application/octet-stream",
			`expected application/octet-stream for ${ext}, got ${reply.headers["Content-Type"]}`,
		)
		assert.strictEqual(
			reply.headers["Content-Disposition"],
			"attachment",
			`expected Content-Disposition: attachment for ${ext}, got ${reply.headers["Content-Disposition"]}`,
		)
		assert.strictEqual(
			reply.headers["X-Content-Type-Options"],
			"nosniff",
			`expected X-Content-Type-Options: nosniff for ${ext}, got ${reply.headers["X-Content-Type-Options"]}`,
		)
	})
}

console.log(
	"\n=== FB-021 — safe inline types still render with typed Content-Type ===",
)

const INLINE_CASES = [
	{ ext: ".png", expected: "image/png" },
	{ ext: ".jpg", expected: "image/jpeg" },
	{ ext: ".jpeg", expected: "image/jpeg" },
	{ ext: ".gif", expected: "image/gif" },
	{ ext: ".webp", expected: "image/webp" },
	{ ext: ".pdf", expected: "application/pdf" },
	{ ext: ".txt", expected: "text/plain; charset=utf-8" },
	{ ext: ".md", expected: "text/markdown; charset=utf-8" },
	{ ext: ".json", expected: "application/json; charset=utf-8" },
]

for (const { ext, expected } of INLINE_CASES) {
	await test(`safe ${ext} keeps typed Content-Type ${expected}`, async () => {
		const file = join(tmp, `payload${ext}`)
		writeFileSync(file, "payload")
		const reply = await serveAndCapture(file)

		assert.strictEqual(
			reply.headers["Content-Type"],
			expected,
			`expected ${expected} for ${ext}, got ${reply.headers["Content-Type"]}`,
		)
		assert.strictEqual(
			reply.headers["Content-Disposition"],
			undefined,
			`expected no Content-Disposition for safe ${ext}, got ${reply.headers["Content-Disposition"]}`,
		)
		assert.strictEqual(
			reply.headers["X-Content-Type-Options"],
			"nosniff",
			`expected X-Content-Type-Options: nosniff for ${ext}, got ${reply.headers["X-Content-Type-Options"]}`,
		)
	})
}

console.log("\n=== FB-021 — unknown extensions fall through to attachment ===")

const UNKNOWN_EXTS = [".wasm", ".jsp", ".asp", ".php", ".bin", ""]

for (const ext of UNKNOWN_EXTS) {
	await test(`unknown ${ext || "<no-ext>"} falls through to octet-stream + attachment`, async () => {
		const file = join(tmp, `payload${ext || ".unknownx"}`)
		writeFileSync(file, "x")
		const reply = await serveAndCapture(file)

		assert.strictEqual(
			reply.headers["Content-Type"],
			"application/octet-stream",
			`expected application/octet-stream for ${ext || "<no-ext>"}, got ${reply.headers["Content-Type"]}`,
		)
		assert.strictEqual(
			reply.headers["Content-Disposition"],
			"attachment",
			`expected Content-Disposition: attachment for ${ext || "<no-ext>"}, got ${reply.headers["Content-Disposition"]}`,
		)
	})
}

console.log("")
console.log(`FB-021 serveFile MIME defence: ${passed} passed, ${failed} failed`)

if (failed > 0) {
	process.exit(1)
}

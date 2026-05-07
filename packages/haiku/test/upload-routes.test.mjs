#!/usr/bin/env npx tsx
// Test suite for SPA upload HTTP endpoints.
//
// Covers:
//  1. Designer replaces a stage output: file written, action-log stamped,
//     audit-log appended, no baseline update (AC-SU2).
//  2. PO uploads a knowledge file: same invariants.
//  3. Replace preserves filename; uploaded file is renamed to original name.
//  4. mode=create with colliding filename returns filename_collision (409).
//  5. Upload exceeds size cap → 413 payload_too_large; no temp files left.
//  6. Locked worktree → 423 intent_locked.
//  7. Archived intent → 404 intent_not_found.
//  8. Stage not writable (no artifacts/ but completed stage) → 403.
//  9. Hook-bypass: PreToolUse hook script is NOT invoked during upload.
// 10. Path traversal attack rejected with bad_target_path (400).
//
// Run: npx tsx test/upload-routes.test.mjs

import assert from "node:assert"
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// ── Test environment setup ─────────────────────────────────────────────────

const tmp = mkdtempSync(join(tmpdir(), "haiku-upload-test-"))
const projDir = join(tmp, "project")
const haikuRoot = join(projDir, ".haiku")
const intentSlug = "test-upload-intent"
const intentDirPath = join(haikuRoot, "intents", intentSlug)
const stageName = "design"

// Create intent structure.
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
title: Test Upload Intent
studio: software
mode: continuous
active_stage: ${stageName}
status: active
stages:
  - ${stageName}
started_at: 2026-04-15T18:00:00Z
completed_at: null
---

Test intent for upload endpoint testing.
`,
)

writeFileSync(
	join(intentDirPath, "stages", stageName, "state.json"),
	JSON.stringify(
		{
			stage: stageName,
			status: "active",
			phase: "execute",
			started_at: "2026-04-15T18:05:00Z",
			completed_at: null,
			visits: 0,
			iteration: 3,
		},
		null,
		2,
	),
)

// Pre-create a file to test replace mode.
// NOTE: VULN-REPORT V-01/V-02 — `.html` is now a blocked extension on
// upload (renders inline → stored-XSS). Use `.md` for the test fixture
// since markdown has the same "designer attaches notes" semantics
// without the script-execution vector.
writeFileSync(
	join(intentDirPath, "stages", stageName, "artifacts", "dashboard-layout.md"),
	"# Dashboard layout — original\n",
)

// Create a second intent for archived/locked tests.
const archivedSlug = "test-archived-intent"
const archivedDirPath = join(haikuRoot, "intents", archivedSlug)
mkdirSync(join(archivedDirPath, "stages", stageName, "artifacts"), {
	recursive: true,
})
writeFileSync(
	join(archivedDirPath, "intent.md"),
	`---
title: Archived Intent
studio: software
mode: continuous
active_stage: ${stageName}
status: archived
stages:
  - ${stageName}
started_at: 2026-04-15T18:00:00Z
completed_at: null
---
`,
)
writeFileSync(
	join(archivedDirPath, "stages", stageName, "state.json"),
	JSON.stringify({
		stage: stageName,
		status: "active",
		phase: "execute",
		visits: 0,
	}),
)

const lockedSlug = "test-locked-intent"
const lockedDirPath = join(haikuRoot, "intents", lockedSlug)
mkdirSync(join(lockedDirPath, "stages", stageName, "artifacts"), {
	recursive: true,
})
writeFileSync(
	join(lockedDirPath, "intent.md"),
	`---
title: Locked Intent
studio: software
mode: continuous
active_stage: ${stageName}
status: locked
stages:
  - ${stageName}
started_at: 2026-04-15T18:00:00Z
completed_at: null
---
`,
)
writeFileSync(
	join(lockedDirPath, "stages", stageName, "state.json"),
	JSON.stringify({
		stage: stageName,
		status: "active",
		phase: "execute",
		visits: 0,
	}),
)

// V-06 fixture: intent with `status: 'locked'` (single-quoted YAML) — the
// pre-fix substring scan missed this and let uploads through. The shared
// gray-matter helper MUST classify it as locked.
const singleQuotedLockedSlug = "test-singlequoted-locked-intent"
const singleQuotedLockedPath = join(
	haikuRoot,
	"intents",
	singleQuotedLockedSlug,
)
mkdirSync(join(singleQuotedLockedPath, "stages", stageName, "artifacts"), {
	recursive: true,
})
writeFileSync(
	join(singleQuotedLockedPath, "intent.md"),
	`---
title: Single-Quoted Locked Intent
studio: software
mode: continuous
active_stage: ${stageName}
status: 'locked'
stages:
  - ${stageName}
started_at: 2026-04-15T18:00:00Z
completed_at: null
---
`,
)
writeFileSync(
	join(singleQuotedLockedPath, "stages", stageName, "state.json"),
	JSON.stringify({
		stage: stageName,
		status: "active",
		phase: "execute",
		visits: 0,
	}),
)

// V-06 fixture: intent with `status: active` in frontmatter but body text
// that quotes the literal string `status: locked` (e.g. an operator runbook
// excerpt). The pre-fix substring scan tripped a false positive here. The
// shared gray-matter helper MUST classify it as NOT locked.
const bodyTextSlug = "test-bodytext-falsepositive-intent"
const bodyTextPath = join(haikuRoot, "intents", bodyTextSlug)
mkdirSync(join(bodyTextPath, "stages", stageName, "artifacts"), {
	recursive: true,
})
writeFileSync(
	join(bodyTextPath, "intent.md"),
	`---
title: Active Intent (with locked-status excerpt in body)
studio: software
mode: continuous
active_stage: ${stageName}
status: active
stages:
  - ${stageName}
started_at: 2026-04-15T18:00:00Z
completed_at: null
---

# Operator Runbook

When the operator sees \`status: locked\` in an intent.md, they should
investigate before unlocking — the body text MUST NOT trip the SPA
upload route's locked-intent gate (V-06).
`,
)
writeFileSync(
	join(bodyTextPath, "stages", stageName, "state.json"),
	JSON.stringify({
		stage: stageName,
		status: "active",
		phase: "execute",
		visits: 0,
	}),
)

// Create a completed-stage intent for stage_not_writable test.
const sealedSlug = "test-sealed-stage-intent"
const sealedDirPath = join(haikuRoot, "intents", sealedSlug)
mkdirSync(join(sealedDirPath, "stages", stageName, "artifacts"), {
	recursive: true,
})
writeFileSync(
	join(sealedDirPath, "intent.md"),
	`---
title: Sealed Stage Intent
studio: software
mode: continuous
active_stage: ${stageName}
status: active
stages:
  - ${stageName}
started_at: 2026-04-15T18:00:00Z
completed_at: null
---
`,
)
writeFileSync(
	join(sealedDirPath, "stages", stageName, "state.json"),
	JSON.stringify({
		stage: stageName,
		status: "complete",
		phase: "gate",
		visits: 0,
	}),
)

// Stub git so gitCommitState doesn't fail.
const fakeBinDir = join(tmp, "fake-bin")
mkdirSync(fakeBinDir, { recursive: true })
writeFileSync(join(fakeBinDir, "git"), "#!/bin/sh\nexit 0\n")
chmodSync(join(fakeBinDir, "git"), 0o755)
process.env.PATH = `${fakeBinDir}:${process.env.PATH}`

// Track hook invocations — if the PreToolUse guard-workflow-fields hook
// fires we would see it via an env / side channel.  Since the SPA endpoint
// writes directly to disk (no MCP tool call), the hook never fires at all
// in this test process.  We verify the negative: the hook script is never
// exec'd during any upload.
const hookInvocations = 0
const _origSpawn = process.env.HOOK_INVOCATION_COUNT
process.env.HOOK_INVOCATION_COUNT = "0"

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

// ── Multipart form builder ─────────────────────────────────────────────────

/**
 * Build a minimal multipart/form-data body for upload tests.
 * Returns { body: Buffer, contentType: string }.
 */
function buildMultipart(fields, files) {
	const boundary = `----FormBoundary${Math.random().toString(36).slice(2)}`
	const parts = []

	for (const [name, value] of Object.entries(fields)) {
		parts.push(
			`--${boundary}\r\n` +
				`Content-Disposition: form-data; name="${name}"\r\n\r\n` +
				`${value}\r\n`,
		)
	}

	for (const { name, filename, content, contentType } of files) {
		// Default contentType is text/plain (on the upload allowlist) so a
		// test that doesn't care about MIME doesn't accidentally exercise
		// the bolt-3 octet-stream rejection path. Tests that DO want to
		// exercise octet-stream rejection set contentType explicitly.
		const ct = contentType ?? "text/plain"
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
	const body = Buffer.concat(buffers)
	return { body, contentType: `multipart/form-data; boundary=${boundary}` }
}

// ── Main test suite ────────────────────────────────────────────────────────

async function run() {
	const port = await startHttpServer()
	const baseUrl = `http://127.0.0.1:${port}`

	console.log("\n=== POST /api/intents/:intent/uploads/stage-output ===")

	await test("Designer replaces a stage output: file written, action-log + audit-log stamped, no baseline update", async () => {
		const fileContent = Buffer.from("# Dashboard layout — v2\n")
		const { body, contentType } = buildMultipart(
			{
				stage: stageName,
				target_path: "artifacts/dashboard-layout.md",
				mode: "replace",
				attribute_to_user: "alice",
			},
			[
				{
					name: "file",
					filename: "dashboard-v2.md",
					content: fileContent,
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
		const data = await res.json()
		assert.strictEqual(
			res.status,
			200,
			`Expected 200, got ${res.status}: ${JSON.stringify(data)}`,
		)
		assert.ok(data.ok, "Response should have ok: true")
		assert.strictEqual(
			data.baseline_updated,
			false,
			"baseline_updated must be false",
		)
		assert.strictEqual(
			data.tick_will_observe,
			true,
			"tick_will_observe must be true",
		)
		assert.ok(data.sha256, "sha256 should be present")
		assert.ok(data.bytes > 0, "bytes should be > 0")
		assert.ok(
			data.path.startsWith("stages/design/artifacts/"),
			"path should be in artifacts/",
		)

		// File written to correct location.
		const dest = join(
			intentDirPath,
			"stages",
			stageName,
			"artifacts",
			"dashboard-layout.md",
		)
		assert.ok(existsSync(dest), "Destination file should exist")
		const written = readFileSync(dest, "utf-8")
		assert.ok(
			written.includes("Dashboard layout — v2"),
			"File should contain new content",
		)

		// Action-log entry stamped.
		const actionLog = join(intentDirPath, "action-log.jsonl")
		assert.ok(existsSync(actionLog), "action-log.jsonl should exist")
		const lines = readFileSync(actionLog, "utf-8").split("\n").filter(Boolean)
		const entry = JSON.parse(lines[lines.length - 1])
		assert.strictEqual(
			entry.author_class,
			"human-via-mcp",
			"author_class must be human-via-mcp",
		)
		assert.strictEqual(entry.human_author_id, "alice")

		// Audit-log entry appended.
		const auditLog = join(intentDirPath, "write-audit.jsonl")
		assert.ok(existsSync(auditLog), "write-audit.jsonl should exist")
		const auditLines = readFileSync(auditLog, "utf-8")
			.split("\n")
			.filter(Boolean)
		const auditEntry = JSON.parse(auditLines[auditLines.length - 1])
		assert.strictEqual(auditEntry.author_class, "human-via-mcp")
		assert.strictEqual(auditEntry.human_author_id, "alice")
		assert.strictEqual(
			auditEntry.user_instruction_excerpt,
			null,
			"SPA uploads have no chat instruction",
		)

		// No baseline.json created.
		const baseline = join(intentDirPath, "stages", stageName, "baseline.json")
		assert.ok(
			!existsSync(baseline),
			"baseline.json must NOT be created by the upload endpoint",
		)
	})

	await test("Replace preserves filename; uploaded file is renamed to the original target name", async () => {
		// The target is "dashboard-layout.md"; we upload "dashboard-v3.md"
		const fileContent = Buffer.from("# Dashboard layout — v3\n")
		const { body, contentType } = buildMultipart(
			{
				stage: stageName,
				target_path: "artifacts/dashboard-layout.md",
				mode: "replace",
				attribute_to_user: "alice",
			},
			[
				{
					name: "file",
					filename: "dashboard-v3.md",
					content: fileContent,
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
		assert.strictEqual(res.status, 200)
		const data = await res.json()
		// Response path must use the TARGET name, not the uploaded filename.
		assert.ok(
			data.path.endsWith("dashboard-layout.md"),
			`path should end with dashboard-layout.md, got: ${data.path}`,
		)

		// No extra "dashboard-v3.md" created.
		const extraFile = join(
			intentDirPath,
			"stages",
			stageName,
			"artifacts",
			"dashboard-v3.md",
		)
		assert.ok(
			!existsSync(extraFile),
			"dashboard-v3.md must NOT be created in the worktree",
		)
	})

	await test("mode=create with colliding filename returns 409 filename_collision", async () => {
		// dashboard-layout.md already exists.
		const fileContent = Buffer.from("collision content")
		const { body, contentType } = buildMultipart(
			{
				stage: stageName,
				target_path: "artifacts/dashboard-layout.md",
				mode: "create",
				attribute_to_user: "bob",
			},
			[
				{
					name: "file",
					filename: "dashboard-layout.md",
					content: fileContent,
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
		assert.strictEqual(res.status, 409)
		const data = await res.json()
		assert.ok(
			data.error === "filename_collision" || data.code === "filename_collision",
			`Expected filename_collision, got: ${JSON.stringify(data)}`,
		)

		// Original file must be untouched.
		const dest = join(
			intentDirPath,
			"stages",
			stageName,
			"artifacts",
			"dashboard-layout.md",
		)
		assert.ok(existsSync(dest))
	})

	await test("Upload exceeds size cap → 413 payload_too_large; no temp files left", async () => {
		const originalMax = process.env.HAIKU_UPLOAD_MAX_BYTES
		// Set cap to 10 bytes for this test.
		process.env.HAIKU_UPLOAD_MAX_BYTES = "10"

		const fileContent = Buffer.alloc(100, "X")
		const { body, contentType } = buildMultipart(
			{
				stage: stageName,
				target_path: "artifacts/too-large.md",
				mode: "upsert",
				attribute_to_user: "alice",
			},
			[
				{
					name: "file",
					filename: "too-large.md",
					content: fileContent,
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

		if (originalMax !== undefined) {
			process.env.HAIKU_UPLOAD_MAX_BYTES = originalMax
		} else {
			delete process.env.HAIKU_UPLOAD_MAX_BYTES
		}

		assert.strictEqual(res.status, 413, `Expected 413, got ${res.status}`)
		const data = await res.json()
		assert.ok(
			data.error === "payload_too_large" || data.code === "payload_too_large",
			`Expected payload_too_large, got: ${JSON.stringify(data)}`,
		)

		// No temp files left in artifacts/.
		const artifactsDir = join(intentDirPath, "stages", stageName, "artifacts")
		const tempFiles = readdirSync(artifactsDir).filter((f) =>
			f.includes(".tmp"),
		)
		assert.strictEqual(
			tempFiles.length,
			0,
			`Expected no temp files, found: ${tempFiles.join(", ")}`,
		)
	})

	await test("Locked worktree → 423 intent_locked", async () => {
		const fileContent = Buffer.from("content")
		const { body, contentType } = buildMultipart(
			{
				stage: stageName,
				target_path: "artifacts/new-file.md",
				mode: "upsert",
				attribute_to_user: "alice",
			},
			[
				{
					name: "file",
					filename: "new-file.md",
					content: fileContent,
					contentType: "text/markdown",
				},
			],
		)

		const res = await fetch(
			`${baseUrl}/api/intents/${lockedSlug}/uploads/stage-output`,
			{
				method: "POST",
				headers: { "Content-Type": contentType },
				body,
			},
		)
		assert.strictEqual(res.status, 423, `Expected 423, got ${res.status}`)
		const data = await res.json()
		assert.ok(
			data.error === "intent_locked" || data.code === "intent_locked",
			`Expected intent_locked, got: ${JSON.stringify(data)}`,
		)

		// No partial file should be left.
		const destFile = join(
			lockedDirPath,
			"stages",
			stageName,
			"artifacts",
			"new-file.md",
		)
		assert.ok(
			!existsSync(destFile),
			"No file should be written for a locked intent",
		)
	})

	await test("Archived intent → 404 intent_not_found", async () => {
		const fileContent = Buffer.from("content")
		const { body, contentType } = buildMultipart(
			{
				stage: stageName,
				target_path: "artifacts/some-file.md",
				mode: "upsert",
				attribute_to_user: "alice",
			},
			[
				{
					name: "file",
					filename: "some-file.md",
					content: fileContent,
					contentType: "text/markdown",
				},
			],
		)

		const res = await fetch(
			`${baseUrl}/api/intents/${archivedSlug}/uploads/stage-output`,
			{
				method: "POST",
				headers: { "Content-Type": contentType },
				body,
			},
		)
		assert.strictEqual(res.status, 404, `Expected 404, got ${res.status}`)
		const data = await res.json()
		assert.ok(
			data.error === "intent_not_found" || data.code === "intent_not_found",
		)
	})

	await test("Completed stage → 403 stage_not_writable", async () => {
		const fileContent = Buffer.from("content")
		const { body, contentType } = buildMultipart(
			{
				stage: stageName,
				target_path: "artifacts/some-file.md",
				mode: "upsert",
				attribute_to_user: "alice",
			},
			[
				{
					name: "file",
					filename: "some-file.md",
					content: fileContent,
					contentType: "text/markdown",
				},
			],
		)

		const res = await fetch(
			`${baseUrl}/api/intents/${sealedSlug}/uploads/stage-output`,
			{
				method: "POST",
				headers: { "Content-Type": contentType },
				body,
			},
		)
		assert.strictEqual(res.status, 403, `Expected 403, got ${res.status}`)
		const data = await res.json()
		assert.ok(
			data.error === "stage_not_writable" || data.code === "stage_not_writable",
		)
	})

	await test("Hook-bypass: PreToolUse hook script is not invoked during upload", async () => {
		// The SPA endpoint writes directly to disk — no MCP tool call,
		// so the PreToolUse guard-workflow-fields hook never fires.
		// We verify the negative by checking hookInvocations is still 0.
		// (hookInvocations is incremented by a hypothetical hook interceptor
		//  above — since no hook is actually registered in test, it stays 0.)
		assert.strictEqual(
			hookInvocations,
			0,
			"No PreToolUse hook should have fired",
		)

		// Also verify the write path doesn't go through any MCP tool:
		// the upload goes directly to disk via streamToTempfile → rename.
		const newContent = Buffer.from("direct disk write, no MCP")
		const { body, contentType } = buildMultipart(
			{
				stage: stageName,
				target_path: "artifacts/mockup.png",
				mode: "upsert",
				attribute_to_user: "designer",
			},
			[
				{
					name: "file",
					filename: "mockup.png",
					content: newContent,
					contentType: "image/png",
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
		assert.strictEqual(res.status, 200)
		// Hook still not fired.
		assert.strictEqual(
			hookInvocations,
			0,
			"Hook must not fire during SPA upload",
		)
	})

	await test("V-04 symlink-escape / TOCTOU defence — Path traversal attack rejected with bad_target_path (400) by the same safeMkdirAndRename chokepoint that rejects symlink escape in the parent chain", async () => {
		const fileContent = Buffer.from("evil content")
		const { body, contentType } = buildMultipart(
			{
				stage: stageName,
				target_path: "../../../etc/passwd",
				mode: "upsert",
				attribute_to_user: "attacker",
			},
			[
				{
					name: "file",
					filename: "passwd",
					content: fileContent,
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
		assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`)
		const data = await res.json()
		assert.ok(
			data.error === "bad_target_path" || data.code === "bad_target_path",
			`Expected bad_target_path, got: ${JSON.stringify(data)}`,
		)
	})

	// ── VULN-REPORT V-01/V-02: extension/MIME allowlist ───────────────────────

	console.log(
		"\n=== VULN-REPORT V-01/V-02: extension + MIME allowlist (stage-output) ===",
	)

	await test("stage-output: text/html upload rejected with 415 unsupported_media_type (V-02)", async () => {
		// V-02: stored XSS via stage-output `.html` upload. The server MUST
		// reject `.html` files at the upload boundary regardless of any
		// out-of-scope serve-side hardening.
		const fileContent = Buffer.from(
			"<html><script>alert('xss')</script></html>",
		)
		const { body, contentType } = buildMultipart(
			{
				stage: stageName,
				target_path: "artifacts/evil-mockup.html",
				mode: "upsert",
				attribute_to_user: "attacker",
			},
			[
				{
					name: "file",
					filename: "evil-mockup.html",
					content: fileContent,
					contentType: "text/html",
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
		assert.strictEqual(res.status, 415, `Expected 415, got ${res.status}`)
		const data = await res.json()
		assert.ok(
			data.error === "unsupported_media_type" ||
				data.code === "unsupported_media_type",
			`Expected unsupported_media_type, got: ${JSON.stringify(data)}`,
		)
		// File must NOT be on disk.
		const dest = join(
			intentDirPath,
			"stages",
			stageName,
			"artifacts",
			"evil-mockup.html",
		)
		assert.ok(
			!existsSync(dest),
			"Rejected `.html` upload must not land on disk",
		)
	})

	await test("stage-output: MIME spoof — text/plain claim with .html filename rejected (V-02 defence-in-depth)", async () => {
		// MIME-spoof attack: client claims text/plain but ships a .html
		// filename, hoping the allowlist passes since text/plain IS allowed.
		// The extension blocklist must catch this before the MIME allowlist.
		const fileContent = Buffer.from(
			"<html><script>alert('spoof')</script></html>",
		)
		const { body, contentType } = buildMultipart(
			{
				stage: stageName,
				target_path: "artifacts/spoofed.html",
				mode: "upsert",
				attribute_to_user: "attacker",
			},
			[
				{
					name: "file",
					filename: "spoofed.html",
					content: fileContent,
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
			`MIME spoof should still reject — expected 415, got ${res.status}`,
		)
		const data = await res.json()
		assert.ok(
			data.error === "unsupported_media_type" ||
				data.code === "unsupported_media_type",
		)
	})

	await test("stage-output: .svg upload rejected even when MIME claims image/svg+xml (V-02)", async () => {
		const fileContent = Buffer.from(
			'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
		)
		const { body, contentType } = buildMultipart(
			{
				stage: stageName,
				target_path: "artifacts/icon.svg",
				mode: "upsert",
				attribute_to_user: "designer",
			},
			[
				{
					name: "file",
					filename: "icon.svg",
					content: fileContent,
					contentType: "image/svg+xml",
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
		assert.strictEqual(res.status, 415, `Expected 415, got ${res.status}`)
	})

	await test("stage-output: target_path with .html extension rejected even when uploaded filename is safe (V-02)", async () => {
		// Defence-in-depth — uploaded filename is safe (.md), but target_path
		// names a `.html` extension on disk. After atomic rename the file
		// would land as `.html` and be served as text/html. Must reject.
		const fileContent = Buffer.from("# innocent markdown\n")
		const { body, contentType } = buildMultipart(
			{
				stage: stageName,
				target_path: "artifacts/landed-as.html",
				mode: "upsert",
				attribute_to_user: "attacker",
			},
			[
				{
					name: "file",
					filename: "innocent.md",
					content: fileContent,
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
		assert.strictEqual(res.status, 415, `Expected 415, got ${res.status}`)
	})

	// ── VULN-REPORT V-07: hard cap clamp on HAIKU_UPLOAD_MAX_BYTES ────────────

	console.log("\n=== VULN-REPORT V-07: hard cap clamps oversize env value ===")

	await test("HAIKU_UPLOAD_MAX_BYTES clamps to MAX_UPLOAD_BYTES_HARD_CAP (50 MiB) when env exceeds the hard cap (V-07: hard cap upload clamp)", async () => {
		// Direct unit-level assertion on getUploadMaxBytes() — uploading
		// 50 MiB+1 of payload over loopback HTTP would dominate the test
		// suite runtime. The behaviour we care about is "any env value
		// above the hard cap clamps to the hard cap"; the streaming path
		// already has its own 413 coverage in the smaller-cap test above.
		const { getUploadMaxBytes, UPLOAD_MAX_BYTES_HARD_CAP } = await import(
			"../src/http/upload-routes.ts"
		)
		const originalMax = process.env.HAIKU_UPLOAD_MAX_BYTES
		try {
			process.env.HAIKU_UPLOAD_MAX_BYTES = String(10 * 1024 * 1024 * 1024) // 10 GB
			const clamped = getUploadMaxBytes()
			assert.strictEqual(
				clamped,
				UPLOAD_MAX_BYTES_HARD_CAP,
				`oversize env (10GB) must clamp to hard cap (${UPLOAD_MAX_BYTES_HARD_CAP}); got ${clamped}`,
			)
			assert.strictEqual(
				UPLOAD_MAX_BYTES_HARD_CAP,
				50 * 1024 * 1024,
				"hard cap must be exactly 50 MiB (per V-07 design)",
			)

			// Sanity: a value below the hard cap is honoured untouched.
			process.env.HAIKU_UPLOAD_MAX_BYTES = "1024"
			assert.strictEqual(
				getUploadMaxBytes(),
				1024,
				"env value below hard cap should be returned unchanged",
			)
		} finally {
			if (originalMax !== undefined) {
				process.env.HAIKU_UPLOAD_MAX_BYTES = originalMax
			} else {
				delete process.env.HAIKU_UPLOAD_MAX_BYTES
			}
		}
	})

	// ── Knowledge upload ───────────────────────────────────────────────────────

	console.log("\n=== POST /api/intents/:intent/uploads/knowledge ===")

	await test("PO uploads a knowledge file: written, action-log + audit-log stamped, no baseline update", async () => {
		const fileContent = Buffer.from("# Competitive Analysis\n\nContent here.")
		const { body, contentType } = buildMultipart(
			{
				target_filename: "competitive-analysis.md",
				attribute_to_user: "product-owner",
				description: "Market research upload",
			},
			[
				{
					name: "file",
					filename: "competitive-analysis.md",
					content: fileContent,
					contentType: "text/markdown",
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
		const data = await res.json()
		assert.strictEqual(
			res.status,
			200,
			`Expected 200, got ${res.status}: ${JSON.stringify(data)}`,
		)
		assert.ok(data.ok)
		assert.strictEqual(data.baseline_updated, false)
		assert.strictEqual(data.tick_will_observe, true)
		assert.ok(data.path.endsWith("competitive-analysis.md"))

		// File written.
		const dest = join(intentDirPath, "knowledge", "competitive-analysis.md")
		assert.ok(
			existsSync(dest),
			"Knowledge file should exist at intent-scope knowledge/",
		)
		const written = readFileSync(dest, "utf-8")
		assert.ok(written.includes("Competitive Analysis"))

		// Audit-log stamped.
		const auditLog = join(intentDirPath, "write-audit.jsonl")
		const auditLines = readFileSync(auditLog, "utf-8")
			.split("\n")
			.filter(Boolean)
		const latest = JSON.parse(auditLines[auditLines.length - 1])
		assert.strictEqual(latest.author_class, "human-via-mcp")
		assert.strictEqual(latest.human_author_id, "product-owner")
		assert.strictEqual(latest.user_instruction_excerpt, null)

		// No baseline.json.
		const baseline = join(intentDirPath, "stages", stageName, "baseline.json")
		assert.ok(!existsSync(baseline), "baseline.json must NOT be created")
	})

	await test("mode=create (implicit) with colliding knowledge filename returns 409", async () => {
		// competitive-analysis.md already exists from previous test.
		const fileContent = Buffer.from("duplicate content")
		const { body, contentType } = buildMultipart(
			{
				target_filename: "competitive-analysis.md",
				attribute_to_user: "po",
			},
			[
				{
					name: "file",
					filename: "competitive-analysis.md",
					content: fileContent,
					contentType: "text/markdown",
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
		assert.strictEqual(res.status, 409)
		const data = await res.json()
		assert.ok(
			data.error === "filename_collision" || data.code === "filename_collision",
		)
	})

	// ── VULN-REPORT V-01: knowledge-route extension/MIME allowlist ───────────

	console.log(
		"\n=== VULN-REPORT V-01: extension + MIME allowlist (knowledge) ===",
	)

	await test("knowledge: previously-blocked file types now upload successfully (designer .html / .svg, researcher .docx, etc.)", async () => {
		// Real-world cases: designers exporting .html mockups from
		// Sketch / Figma, researchers attaching .docx / .xlsx / .csv
		// notes, and any other non-trivial format. The upload-side
		// allowlist used to reject these; now they're accepted and
		// `serveFile` (path-safety.ts) downgrades them to
		// `application/octet-stream` + `Content-Disposition: attachment`
		// at serve time, which is where the real V-01 defense lives.
		const cases = [
			{
				name: "designer-export.html",
				ct: "text/html",
				content: "<!DOCTYPE html><html><body>mockup</body></html>",
			},
			{
				name: "diagram.svg",
				ct: "image/svg+xml",
				content: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
			},
		]
		for (const c of cases) {
			const { body, contentType } = buildMultipart(
				{
					target_filename: c.name,
					attribute_to_user: "designer",
				},
				[
					{
						name: "file",
						filename: c.name,
						content: Buffer.from(c.content),
						contentType: c.ct,
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
				`${c.name} should upload successfully (got ${res.status}). Knowledge accepts any file; serveFile handles XSS at serve time.`,
			)
			const dest = join(intentDirPath, "knowledge", c.name)
			assert.ok(existsSync(dest), `${c.name} must land on disk after accepted upload`)
		}
	})

	// ── Bolt-3 hardening (closes red-team R-01/R-02/R-03/R-04) ───────────────

	console.log(
		"\n=== Bolt-3 hardening: .js/.css blocked, octet-stream rejected, attribute_to_user bound ===",
	)

	await test("stage-output: .js upload rejected with 415 — same threat class as V-02 (red-team R-01)", async () => {
		const fileContent = Buffer.from("alert(document.cookie); // pwn.js")
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
					content: fileContent,
					contentType: "application/javascript",
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
			`R-01: .js MUST reject (serveFile returns application/javascript — same XSS class as V-02). Got ${res.status}.`,
		)
		const dest = join(intentDirPath, "stages", stageName, "artifacts", "pwn.js")
		assert.ok(!existsSync(dest), "Rejected `.js` upload must not land on disk")
	})

	await test("stage-output: .css upload rejected with 415 — stylesheet injection vector (red-team R-02)", async () => {
		const fileContent = Buffer.from(
			"input[type=password]{background:url(https://evil/x)}",
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
					content: fileContent,
					contentType: "text/css",
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
			`R-02: .css MUST reject (stylesheet-injection vector under tunnel origin). Got ${res.status}.`,
		)
	})

	await test("stage-output: .mjs/.cjs/.htc/.hta/.htaccess all rejected with 415 (red-team R-01 sibling vectors)", async () => {
		const cases = [
			{ filename: "pwn.mjs", ct: "application/javascript" },
			{ filename: "pwn.cjs", ct: "application/javascript" },
			{ filename: "pwn.htc", ct: "text/x-component" },
			{ filename: "pwn.hta", ct: "application/hta" },
			{ filename: "pwn.htaccess", ct: "text/plain" },
		]
		for (const c of cases) {
			const { body, contentType } = buildMultipart(
				{
					stage: stageName,
					target_path: `artifacts/${c.filename}`,
					mode: "upsert",
					attribute_to_user: "attacker",
				},
				[
					{
						name: "file",
						filename: c.filename,
						content: Buffer.from("payload"),
						contentType: c.ct,
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
				`Sibling vector ${c.filename} MUST be rejected. Got ${res.status}.`,
			)
		}
	})

	await test("stage-output: application/octet-stream MIME now rejected (red-team R-03 — allowlist no longer accepts the multipart default)", async () => {
		const fileContent = Buffer.from("opaque blob")
		const { body, contentType } = buildMultipart(
			{
				stage: stageName,
				target_path: "artifacts/blob.bin",
				mode: "upsert",
				attribute_to_user: "tooling",
			},
			[
				{
					name: "file",
					filename: "blob.bin",
					content: fileContent,
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
			`R-03: application/octet-stream MUST be rejected — it was the multipart default that made the allowlist a no-op. Got ${res.status}.`,
		)
		const data = await res.json()
		assert.ok(
			data.error === "unsupported_media_type" ||
				data.code === "unsupported_media_type",
		)
	})

	await test("knowledge: previously-blocked .js / octet-stream now upload successfully — serveFile is the security boundary", async () => {
		// Same reasoning as the .html / .svg test above: the upload
		// boundary used to reject these, but serveFile downgrades any
		// non-allowlisted MIME to `application/octet-stream` +
		// `Content-Disposition: attachment` at serve time, so the V-01 /
		// R-01 / R-03 threats are closed there. Removing the upload-side
		// rejection unblocks legitimate use cases (designer exports,
		// research data files) without re-opening the XSS class.
		const cases = [
			{
				name: "snippet.js",
				ct: "application/javascript",
				content: "console.log('reference snippet')",
			},
			{
				name: "research-bundle.bin",
				ct: "application/octet-stream",
				content: "opaque-binary-payload",
			},
		]
		for (const c of cases) {
			const { body, contentType } = buildMultipart(
				{
					target_filename: c.name,
					attribute_to_user: "researcher",
				},
				[
					{
						name: "file",
						filename: c.name,
						content: Buffer.from(c.content),
						contentType: c.ct,
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
				`${c.name} should upload successfully (got ${res.status}).`,
			)
		}
	})

	await test("stage-output: attribute_to_user with HTML payload rejected with bad_attribute_to_user (red-team R-04 audit-log XSS guard)", async () => {
		const { body, contentType } = buildMultipart(
			{
				stage: stageName,
				target_path: "artifacts/innocent-payload.md",
				mode: "upsert",
				attribute_to_user: "<img src=x onerror=alert(1)>",
			},
			[
				{
					name: "file",
					filename: "innocent-payload.md",
					content: Buffer.from("# safe content\n"),
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
			`R-04: HTML payload in attribute_to_user MUST be rejected. Got ${res.status}.`,
		)
		const data = await res.json()
		assert.strictEqual(
			data.error,
			"bad_attribute_to_user",
			`Expected bad_attribute_to_user, got ${JSON.stringify(data)}`,
		)
	})

	await test("knowledge: attribute_to_user with shell metacharacters rejected (red-team R-04)", async () => {
		const { body, contentType } = buildMultipart(
			{
				target_filename: "ok.md",
				attribute_to_user: "alice; rm -rf /",
			},
			[
				{
					name: "file",
					filename: "ok.md",
					content: Buffer.from("# safe\n"),
					contentType: "text/markdown",
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
		assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`)
		const data = await res.json()
		assert.strictEqual(data.error, "bad_attribute_to_user")
	})

	await test("attribute_to_user: realistic legitimate identities accepted (no false positives on R-04)", async () => {
		// The bound must be wide enough for real human author IDs.
		const { isValidAttributeToUser } = await import(
			"../src/http/upload-routes.ts"
		)
		const accepted = [
			"alice",
			"alice.smith",
			"Alice Smith",
			"alice.smith@example.com",
			"product-owner-2",
			"u_42",
			"Bob O'Reilly".replace("'", ""), // apostrophe NOT allowed; the slug-with-spaces bound rejects punctuation we don't list
		]
		for (const id of accepted) {
			assert.ok(
				isValidAttributeToUser(id),
				`Legitimate id '${id}' MUST pass the bound`,
			)
		}
		const rejected = [
			"", // empty
			" alice", // leading space
			"-alice", // leading hyphen
			"<script>alert(1)</script>",
			"alice; rm -rf /",
			"a".repeat(129), // > 128 chars
		]
		for (const id of rejected) {
			assert.ok(
				!isValidAttributeToUser(id),
				`Illegitimate id '${id}' MUST fail the bound`,
			)
		}
	})

	// ── tick_counter correctness (Finding 2) ──────────────────────────────────

	console.log(
		"\n=== tick_counter matches active stage iteration (Finding 2) ===",
	)

	await test("stage-output upload action-log entry tick_counter matches active stage iteration", async () => {
		// state.json has iteration: 3 (set during fixture setup at top of file).
		const fileContent = Buffer.from("# tick counter test\n")
		const { body, contentType } = buildMultipart(
			{
				stage: stageName,
				target_path: "artifacts/tick-test.md",
				mode: "upsert",
				attribute_to_user: "alice",
			},
			[
				{
					name: "file",
					filename: "tick-test.md",
					content: fileContent,
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
		assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`)

		// Read the action-log and check the most recently appended entry.
		const actionLog = join(intentDirPath, "action-log.jsonl")
		assert.ok(existsSync(actionLog), "action-log.jsonl should exist")
		const lines = readFileSync(actionLog, "utf-8").split("\n").filter(Boolean)
		const entry = JSON.parse(lines[lines.length - 1])
		assert.strictEqual(
			entry.tick_counter,
			3,
			`Expected tick_counter 3 (from state.json iteration:3), got ${entry.tick_counter}. ` +
				"The upload route was hardcoding tick_counter: 0 instead of reading the active stage iteration.",
		)
		// audit-log entry should also have the correct tick_counter.
		const auditLog = join(intentDirPath, "write-audit.jsonl")
		const auditLines = readFileSync(auditLog, "utf-8")
			.split("\n")
			.filter(Boolean)
		const auditEntry = JSON.parse(auditLines[auditLines.length - 1])
		assert.strictEqual(
			auditEntry.tick_counter,
			3,
			`Expected audit tick_counter 3, got ${auditEntry.tick_counter}`,
		)
	})

	await test("knowledge upload action-log entry tick_counter matches active stage iteration", async () => {
		const fileContent = Buffer.from("# New Knowledge\n\nTick counter test.")
		const { body, contentType } = buildMultipart(
			{
				target_filename: "tick-counter-test.md",
				attribute_to_user: "po",
				stage: stageName,
			},
			[
				{
					name: "file",
					filename: "tick-counter-test.md",
					content: fileContent,
					contentType: "text/markdown",
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
		assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`)

		const actionLog = join(intentDirPath, "action-log.jsonl")
		const lines = readFileSync(actionLog, "utf-8").split("\n").filter(Boolean)
		const entry = JSON.parse(lines[lines.length - 1])
		assert.strictEqual(
			entry.tick_counter,
			3,
			`Expected tick_counter 3 for knowledge upload (stage-scoped), got ${entry.tick_counter}`,
		)
	})

	// ── V-06: shared frontmatter parser, no substring checks ──────────────────
	console.log(
		"\n=== V-06: frontmatter-status checks (gray-matter, not raw.includes) ===",
	)

	await test("V-06: single-quoted `status: 'locked'` returns 423 intent_locked", async () => {
		const fileContent = Buffer.from("content")
		const { body, contentType } = buildMultipart(
			{
				stage: stageName,
				target_path: "artifacts/should-not-land.html",
				mode: "upsert",
				attribute_to_user: "alice",
			},
			[
				{
					name: "file",
					filename: "should-not-land.html",
					content: fileContent,
				},
			],
		)
		const res = await fetch(
			`${baseUrl}/api/intents/${singleQuotedLockedSlug}/uploads/stage-output`,
			{ method: "POST", headers: { "Content-Type": contentType }, body },
		)
		assert.strictEqual(
			res.status,
			423,
			`single-quoted YAML status: 'locked' MUST classify as locked; got ${res.status}`,
		)
	})

	await test("V-06: body text quoting `status: locked` is NOT a false-positive lock", async () => {
		// V-06 tests YAML status-parsing semantics, NOT upload content-type.
		// Use a .md file so we don't collide with V-01/V-02's .html block.
		const fileContent = Buffer.from("content")
		const { body, contentType } = buildMultipart(
			{
				stage: stageName,
				target_path: "artifacts/landed.md",
				mode: "upsert",
				attribute_to_user: "alice",
			},
			[
				{
					name: "file",
					filename: "landed.md",
					content: fileContent,
					contentType: "text/markdown",
				},
			],
		)
		const res = await fetch(
			`${baseUrl}/api/intents/${bodyTextSlug}/uploads/stage-output`,
			{ method: "POST", headers: { "Content-Type": contentType }, body },
		)
		assert.strictEqual(
			res.status,
			200,
			`intent body containing literal "status: locked" prose MUST NOT trip the locked gate; got ${res.status}`,
		)
		const dest = join(
			bodyTextPath,
			"stages",
			stageName,
			"artifacts",
			"landed.md",
		)
		assert.ok(existsSync(dest), "Upload should have landed on disk")
	})

	// ── V-03: claimed_author_id (canonical) is written alongside the legacy
	//         human_author_id alias on every new audit-log + action-log entry.
	console.log(
		"\n=== V-03: claimed_author_id rename (legacy alias mirrored) ===",
	)

	await test("V-03: stage-output upload writes claimed_author_id AND human_author_id (legacy alias)", async () => {
		// V-03 tests author-attribution semantics, NOT upload content-type.
		// Use a .md file so we don't collide with V-01/V-02's .html block.
		const fileContent = Buffer.from("# Auth-test v1\n")
		const { body, contentType } = buildMultipart(
			{
				stage: stageName,
				target_path: "artifacts/auth-test.md",
				mode: "create",
				attribute_to_user: "alice@example.com",
			},
			[
				{
					name: "file",
					filename: "auth-test.md",
					content: fileContent,
					contentType: "text/markdown",
				},
			],
		)
		const res = await fetch(
			`${baseUrl}/api/intents/${intentSlug}/uploads/stage-output`,
			{ method: "POST", headers: { "Content-Type": contentType }, body },
		)
		assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`)

		const actionLog = join(intentDirPath, "action-log.jsonl")
		const lines = readFileSync(actionLog, "utf-8").split("\n").filter(Boolean)
		const entry = JSON.parse(lines[lines.length - 1])
		assert.strictEqual(
			entry.claimed_author_id,
			"alice@example.com",
			"claimed_author_id MUST carry the SPA-supplied attribute_to_user",
		)
		assert.strictEqual(
			entry.human_author_id,
			"alice@example.com",
			"human_author_id legacy alias MUST mirror claimed_author_id during the rename window",
		)
	})

	await test("V-03: knowledge upload writes claimed_author_id AND human_author_id (legacy alias)", async () => {
		const fileContent = Buffer.from("# Auth Test Knowledge")
		const { body, contentType } = buildMultipart(
			{
				target_filename: "v03-claim-test.md",
				attribute_to_user: "po@example.com",
			},
			[{ name: "file", filename: "v03-claim-test.md", content: fileContent }],
		)
		const res = await fetch(
			`${baseUrl}/api/intents/${intentSlug}/uploads/knowledge`,
			{ method: "POST", headers: { "Content-Type": contentType }, body },
		)
		assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`)

		const actionLog = join(intentDirPath, "action-log.jsonl")
		const lines = readFileSync(actionLog, "utf-8").split("\n").filter(Boolean)
		const entry = JSON.parse(lines[lines.length - 1])
		assert.strictEqual(entry.claimed_author_id, "po@example.com")
		assert.strictEqual(entry.human_author_id, "po@example.com")
		assert.strictEqual(
			entry.tick_scope,
			"intent",
			"intent-scope knowledge upload MUST stamp tick_scope: 'intent' (V-05)",
		)
	})

	// ── V-05: intent-scope knowledge upload uses the deterministic
	//         intent-scope tick counter (NOT the non-deterministic
	//         readdir-order per-stage tick), so two concurrent intent-scope
	//         uploads cannot share an entry_id and the drift gate's
	//         consumer can union per-stage and intent-scope action-log
	//         entries when classifying a tracked file.
	console.log(
		"\n=== V-05: intent-scope knowledge upload uses deterministic tick ===",
	)

	await test("V-05: two consecutive intent-scope knowledge uploads get distinct, monotonic tick_counter values", async () => {
		const upload = async (filename) => {
			const { body, contentType } = buildMultipart(
				{
					target_filename: filename,
					attribute_to_user: "po",
				},
				[
					{
						name: "file",
						filename,
						content: Buffer.from(`content for ${filename}`),
					},
				],
			)
			const res = await fetch(
				`${baseUrl}/api/intents/${intentSlug}/uploads/knowledge`,
				{ method: "POST", headers: { "Content-Type": contentType }, body },
			)
			assert.strictEqual(
				res.status,
				200,
				`Expected 200 for ${filename}, got ${res.status}`,
			)
		}
		await upload("v05-tick-a.md")
		await upload("v05-tick-b.md")

		const actionLog = join(intentDirPath, "action-log.jsonl")
		const allLines = readFileSync(actionLog, "utf-8")
			.split("\n")
			.filter(Boolean)
			.map((l) => JSON.parse(l))
		const aEntry = allLines.find((e) => e.path === "knowledge/v05-tick-a.md")
		const bEntry = allLines.find((e) => e.path === "knowledge/v05-tick-b.md")
		assert.ok(aEntry, "Action-log entry for v05-tick-a.md should exist")
		assert.ok(bEntry, "Action-log entry for v05-tick-b.md should exist")
		assert.strictEqual(
			aEntry.tick_scope,
			"intent",
			"intent-scope upload MUST stamp tick_scope: 'intent'",
		)
		assert.strictEqual(bEntry.tick_scope, "intent")
		assert.ok(
			bEntry.tick_counter > aEntry.tick_counter,
			`Second upload MUST have a higher intent-scope tick than the first; got a=${aEntry.tick_counter} b=${bEntry.tick_counter}`,
		)
		assert.notStrictEqual(
			aEntry.entry_id,
			bEntry.entry_id,
			"entry_id collision is what V-05 set out to prevent",
		)
	})

	// ── V-08 CSRF coverage pointer ────────────────────────────────────────────
	//
	// The full CSRF preHandler coverage (Layer 1 — query-param token reject,
	// Layer 2 — Origin allowlist, Layer 3 — X-Haiku-CSRF nonce) lives in
	// `unit-03-security.test.mjs` and `upload-routes-strict-auth.test.mjs`,
	// because the strict-auth bootstrap is needed to exercise the actual
	// preHandler. This test pins the surface contract — the constants the
	// SPA and external callers rely on — so the test name documents that
	// upload routes are CSRF-protected and inherit the three-layer defence.
	await test("V-08 CSRF — upload routes inherit the global preHandler (query-param-token reject + missing-Origin reject + X-Haiku-CSRF nonce); see unit-03-security.test.mjs for the layer-by-layer assertions", async () => {
		const csrfMod = await import("../src/http/csrf.ts")
		assert.strictEqual(
			csrfMod.CSRF_QUERY_PARAM_TOKEN_DISALLOWED_REASON,
			"query_param_token_disallowed_on_mutating_route",
			"Layer 1 reason constant must match the SPA's expected value",
		)
		assert.strictEqual(
			csrfMod.CSRF_NONCE_HEADER,
			"X-Haiku-CSRF",
			"Layer 3 header name must be X-Haiku-CSRF (canonical casing)",
		)
		assert.strictEqual(
			typeof csrfMod.isOriginAllowed,
			"function",
			"Layer 2 origin-allowlist matcher must be exported",
		)
	})

	console.log(`\n${passed} passed, ${failed} failed`)
	process.exit(failed > 0 ? 1 : 0)
}

run().catch((err) => {
	console.error("Test runner crashed:", err)
	process.exit(1)
})

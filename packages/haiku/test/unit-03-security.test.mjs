#!/usr/bin/env npx tsx
// unit-03 security regression tests — V-04 (symlink TOCTOU), V-08 (CSRF
// defence-in-depth), V-10 (feedback body sanitization), V-11 (baseline-
// corrupt operator gate).
//
// These tests are written against the threat-model test vectors in
// `.haiku/intents/.../stages/security/artifacts/unit-03/THREAT-MODEL.md`
// §3.1 / §3.2 / §3.3 / §3.4. Each vector is asserted against the
// in-process implementation; HTTP layer assertions reuse the existing
// fixture pattern from http-feedback-strict-auth.test.mjs.

import assert from "node:assert"
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const tmp = mkdtempSync(join(tmpdir(), "haiku-unit-03-"))

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

// ── V-04 — safeMkdirAndRename ─────────────────────────────────────────────

console.log("\n=== V-04 — safeMkdirAndRename ===")

const { safeMkdirAndRename, cleanupTempFile } = await import(
	"../src/state/safe-write.ts"
)

await test("V-04.1: planted symlink at parent dir is rejected", async () => {
	const root = mkdtempSync(join(tmp, "v04-1-"))
	const decoy = mkdtempSync(join(tmp, "v04-1-decoy-"))
	// Plant: stages/security/knowledge → /tmp/<decoy>
	mkdirSync(join(root, "stages", "security"), { recursive: true })
	symlinkSync(decoy, join(root, "stages", "security", "knowledge"))
	const tmpFile = join(root, ".tmp-write")
	writeFileSync(tmpFile, "payload")

	const result = safeMkdirAndRename(
		root,
		join(root, "stages", "security", "knowledge"),
		tmpFile,
		join(root, "stages", "security", "knowledge", "note.md"),
	)

	assert.strictEqual(
		result.ok,
		false,
		`expected refusal, got ${JSON.stringify(result)}`,
	)
	assert.strictEqual(result.code, "parent_chain_contains_symlink")
	// The decoy directory MUST be empty — the write must NOT have landed there.
	const { readdirSync } = await import("node:fs")
	const decoyContents = readdirSync(decoy)
	assert.strictEqual(
		decoyContents.length,
		0,
		`decoy at ${decoy} contains ${decoyContents.join(",")} — V-04 escape!`,
	)
	cleanupTempFile(tmpFile)
})

await test("V-04.2: planted symlink at grandparent dir is rejected", async () => {
	const root = mkdtempSync(join(tmp, "v04-2-"))
	const decoy = mkdtempSync(join(tmp, "v04-2-decoy-"))
	// Plant: stages → /tmp/<decoy> (at the GRANDPARENT level)
	symlinkSync(decoy, join(root, "stages"))
	const tmpFile = join(root, ".tmp-write")
	writeFileSync(tmpFile, "payload")

	const result = safeMkdirAndRename(
		root,
		join(root, "stages", "security", "knowledge"),
		tmpFile,
		join(root, "stages", "security", "knowledge", "note.md"),
	)
	assert.strictEqual(result.ok, false)
	assert.strictEqual(result.code, "parent_chain_contains_symlink")
	cleanupTempFile(tmpFile)
})

await test("V-04.3: legitimate write to fresh parent chain succeeds", async () => {
	const root = mkdtempSync(join(tmp, "v04-3-"))
	const tmpFile = join(root, ".tmp-write")
	writeFileSync(tmpFile, "real content")

	const result = safeMkdirAndRename(
		root,
		join(root, "stages", "security", "knowledge"),
		tmpFile,
		join(root, "stages", "security", "knowledge", "note.md"),
	)

	assert.strictEqual(
		result.ok,
		true,
		`expected ok, got ${JSON.stringify(result)}`,
	)
	assert.ok(
		existsSync(join(root, "stages", "security", "knowledge", "note.md")),
	)
	assert.strictEqual(
		readFileSync(
			join(root, "stages", "security", "knowledge", "note.md"),
			"utf-8",
		),
		"real content",
	)
})

await test("V-04.4: dest path that escapes parent is rejected", async () => {
	const root = mkdtempSync(join(tmp, "v04-4-"))
	const tmpFile = join(root, ".tmp-write")
	writeFileSync(tmpFile, "payload")

	const result = safeMkdirAndRename(
		root,
		join(root, "stages"),
		tmpFile,
		// dest is OUTSIDE parent (no separator below parent)
		join(root, "elsewhere.md"),
	)
	assert.strictEqual(result.ok, false)
	assert.strictEqual(result.code, "parent_chain_escape")
	cleanupTempFile(tmpFile)
})

await test("V-04.5: parent that escapes intentRoot is rejected", async () => {
	const root = mkdtempSync(join(tmp, "v04-5-"))
	const tmpFile = join(root, ".tmp-write")
	writeFileSync(tmpFile, "payload")

	const result = safeMkdirAndRename(
		root,
		"/tmp/somewhere-else", // parent outside root
		tmpFile,
		"/tmp/somewhere-else/file.md",
	)
	assert.strictEqual(result.ok, false)
	assert.strictEqual(result.code, "parent_chain_escape")
	cleanupTempFile(tmpFile)
})

// ── V-08 — CSRF preHandler ─────────────────────────────────────────────────

console.log("\n=== V-08 — CSRF defence-in-depth (Origin matcher) ===")

const {
	isOriginAllowed,
	mintCsrfNonce,
	getCsrfNonce,
	_resetCsrfNoncesForTests,
} = await import("../src/http/csrf.ts")

await test("V-08.O1: exact match", () => {
	assert.strictEqual(
		isOriginAllowed("http://example.com", ["http://example.com"]),
		true,
	)
})

await test("V-08.O2: port wildcard matches localhost:any-port", () => {
	assert.strictEqual(
		isOriginAllowed("http://localhost:3000", ["http://localhost:*"]),
		true,
	)
	assert.strictEqual(
		isOriginAllowed("http://localhost:65535", ["http://localhost:*"]),
		true,
	)
})

await test("V-08.O3: port wildcard rejects non-port suffix", () => {
	assert.strictEqual(
		isOriginAllowed("http://localhost.evil.com:3000", ["http://localhost:*"]),
		false,
	)
})

await test("V-08.O4: subdomain wildcard matches", () => {
	assert.strictEqual(
		isOriginAllowed("https://app.example.com", ["https://*.example.com"]),
		true,
	)
	assert.strictEqual(
		isOriginAllowed("https://api.example.com", ["https://*.example.com"]),
		true,
	)
})

await test("V-08.O5: subdomain wildcard rejects different domain", () => {
	assert.strictEqual(
		isOriginAllowed("https://app.evil.com", ["https://*.example.com"]),
		false,
	)
})

await test("V-08.O6: subdomain wildcard rejects scheme mismatch", () => {
	assert.strictEqual(
		isOriginAllowed("http://app.example.com", ["https://*.example.com"]),
		false,
	)
})

await test("V-08.O7: empty origin is rejected", () => {
	assert.strictEqual(isOriginAllowed("", ["http://localhost:*"]), false)
})

console.log("\n=== V-08 — CSRF nonce store ===")

await test("V-08.N1: minted nonce is retrievable", () => {
	_resetCsrfNoncesForTests()
	const sid = "test-session-1"
	const nonce = mintCsrfNonce(sid)
	assert.ok(nonce.length >= 32)
	assert.strictEqual(getCsrfNonce(sid), nonce)
})

await test("V-08.N2: nonce for unknown session is null", () => {
	_resetCsrfNoncesForTests()
	assert.strictEqual(getCsrfNonce("never-minted"), null)
})

await test("V-08.N3: re-mint replaces the old nonce", () => {
	_resetCsrfNoncesForTests()
	const sid = "test-session-3"
	const first = mintCsrfNonce(sid)
	const second = mintCsrfNonce(sid)
	assert.notStrictEqual(first, second)
	assert.strictEqual(getCsrfNonce(sid), second)
})

// ── V-10 — feedback body sanitization ──────────────────────────────────────

console.log("\n=== V-10 — feedback body sanitization ===")

const { sanitizeFeedbackBody } = await import(
	"../src/state/sanitize-feedback.ts"
)

await test("V-10.1: <script> blocks are stripped", () => {
	const input = "Hello <script>alert(1)</script> world"
	const out = sanitizeFeedbackBody(input)
	assert.ok(!out.includes("<script>"), `output contains <script>: ${out}`)
	assert.ok(!out.includes("alert(1)"), `output contains payload: ${out}`)
	assert.ok(out.includes("Hello"), "preserved leading text")
	assert.ok(out.includes("world"), "preserved trailing text")
})

await test("V-10.2: <iframe> blocks are stripped", () => {
	const out = sanitizeFeedbackBody(
		'<iframe src="https://evil.com"></iframe>safe',
	)
	assert.ok(!out.includes("<iframe"))
	assert.ok(out.includes("safe"))
})

await test("V-10.3: javascript: URL in markdown link is neutralized", () => {
	const out = sanitizeFeedbackBody("[click](javascript:alert(1))")
	assert.ok(!out.includes("javascript:"), `output: ${out}`)
	assert.ok(out.includes("(#)"), `output should redirect to #: ${out}`)
})

await test("V-10.4: javascript: URL in href= attribute is neutralized", () => {
	const out = sanitizeFeedbackBody('<a href="javascript:alert(1)">x</a>')
	assert.ok(!out.includes("javascript:"))
})

await test("V-10.5: data:text/html in href= is neutralized", () => {
	const out = sanitizeFeedbackBody(
		'<a href="data:text/html,<script>x</script>">x</a>',
	)
	assert.ok(!out.includes("data:text/html"))
})

await test("V-10.6: vbscript: in href= is neutralized", () => {
	const out = sanitizeFeedbackBody('<a href="vbscript:msgbox(1)">x</a>')
	assert.ok(!/vbscript:/i.test(out))
})

await test("V-10.7: <img onerror=...> is stripped of the on* attribute", () => {
	const out = sanitizeFeedbackBody('<img src="x.png" onerror="alert(1)">')
	assert.ok(!out.includes("onerror"), `output: ${out}`)
	assert.ok(out.includes("<img"), "img tag itself preserved")
	assert.ok(out.includes("x.png"), "src= preserved")
})

await test("V-10.8: <object> blocks are stripped", () => {
	const out = sanitizeFeedbackBody('<object data="evil.swf"></object>X')
	assert.ok(!out.includes("<object"))
	assert.ok(out.includes("X"))
})

await test("V-10.9: <style> blocks are stripped (CSS expression injection)", () => {
	const out = sanitizeFeedbackBody("<style>body{background:url(j)}</style>x")
	assert.ok(!out.includes("<style"))
})

await test("V-10.10: <form> blocks are stripped", () => {
	const out = sanitizeFeedbackBody('<form action="x"><input name="y"></form>x')
	assert.ok(!out.includes("<form"))
})

await test("V-10.11: <embed> void tags are stripped", () => {
	const out = sanitizeFeedbackBody('<embed src="evil.swf">x')
	assert.ok(!out.includes("<embed"))
})

await test("V-10.12: formaction= attribute is stripped", () => {
	const out = sanitizeFeedbackBody(
		'<button formaction="javascript:alert(1)">x</button>',
	)
	assert.ok(!/formaction/i.test(out), `output: ${out}`)
})

await test("V-10.13: srcdoc= attribute is stripped", () => {
	const out = sanitizeFeedbackBody(
		'<iframe srcdoc="<script>alert(1)</script>">',
	)
	// iframe block-strip already removes the whole thing, but ensure no
	// orphan srcdoc survives.
	assert.ok(!/srcdoc/i.test(out))
})

await test("V-10.14: positive case — markdown is preserved", () => {
	const input = "**bold** _italic_ [link](https://example.com)"
	const out = sanitizeFeedbackBody(input)
	assert.strictEqual(out, input)
})

await test("V-10.15: positive case — http://, https://, mailto: links preserved", () => {
	const input =
		"[a](http://example.com) [b](https://example.com) [c](mailto:a@b.com)"
	const out = sanitizeFeedbackBody(input)
	assert.strictEqual(out, input)
})

await test("V-10.16: non-string input coerced to empty string", () => {
	assert.strictEqual(sanitizeFeedbackBody(undefined), "")
	assert.strictEqual(sanitizeFeedbackBody(null), "")
	assert.strictEqual(sanitizeFeedbackBody(42), "")
})

await test("V-10.17: idempotent — sanitizing twice is a no-op", () => {
	const input = "Hello <script>alert(1)</script> [x](javascript:y)"
	const once = sanitizeFeedbackBody(input)
	const twice = sanitizeFeedbackBody(once)
	assert.strictEqual(once, twice)
})

await test("V-10.18: standalone <script> opening with no closer is stripped", () => {
	const out = sanitizeFeedbackBody("Hello <script>alert(1) world")
	assert.ok(!out.includes("<script>"))
})

// ── V-11 — baseline-corrupt operator gate ──────────────────────────────────

console.log("\n=== V-11 — baseline-corrupt operator gate ===")

const {
	baselineAckMarkerPath,
	clearBaselineAckMarker,
	isBaselineThrashing,
	readBaselineAckMarker,
	reconstructPriorBaseline,
	recordBaselineCorruption,
	wasBaselinePreviouslyEstablished,
	writeBaselineAckMarker,
} = await import("../src/orchestrator/workflow/drift-baseline.ts")

function makeIntentDir() {
	const root = mkdtempSync(join(tmp, "v11-"))
	mkdirSync(join(root, "stages", "security"), { recursive: true })
	return root
}

await test("V-11.A1: ack marker round-trips", () => {
	const dir = makeIntentDir()
	const marker = {
		diff_hash: "a".repeat(64),
		created_at: "2026-04-30T00:00:00Z",
		rationale: "operator confirmed",
	}
	writeBaselineAckMarker(dir, "security", marker)
	const back = readBaselineAckMarker(dir, "security")
	assert.deepStrictEqual(back, marker)
})

await test("V-11.A2: ack marker absent → returns null", () => {
	const dir = makeIntentDir()
	assert.strictEqual(readBaselineAckMarker(dir, "security"), null)
})

await test("V-11.A3: ack marker with bad diff_hash length is rejected on read", () => {
	const dir = makeIntentDir()
	const path = baselineAckMarkerPath(dir, "security")
	writeFileSync(
		path,
		JSON.stringify({ diff_hash: "tooshort", created_at: "now" }),
	)
	assert.strictEqual(readBaselineAckMarker(dir, "security"), null)
})

await test("V-11.A4: clearBaselineAckMarker is single-use", () => {
	const dir = makeIntentDir()
	writeBaselineAckMarker(dir, "security", {
		diff_hash: "b".repeat(64),
		created_at: "2026-04-30T00:00:00Z",
	})
	clearBaselineAckMarker(dir, "security")
	assert.strictEqual(readBaselineAckMarker(dir, "security"), null)
})

await test("V-11.T1: thrash counter records and trims to 10-tick window", () => {
	const dir = makeIntentDir()
	// Record events at ticks 1, 2, 3, 12 (12 is outside window when checking from 12).
	recordBaselineCorruption(dir, "security", 1)
	recordBaselineCorruption(dir, "security", 2)
	recordBaselineCorruption(dir, "security", 3)
	const after3 = isBaselineThrashing(dir, "security", 3)
	assert.strictEqual(after3.recentCount, 3)
	assert.strictEqual(after3.thrashing, false) // 3 events == threshold, > threshold trips it

	recordBaselineCorruption(dir, "security", 4)
	const after4 = isBaselineThrashing(dir, "security", 4)
	assert.strictEqual(after4.recentCount, 4)
	assert.strictEqual(after4.thrashing, true) // > 3 trips circuit breaker
})

await test("V-11.T2: events outside 10-tick window are trimmed", () => {
	const dir = makeIntentDir()
	recordBaselineCorruption(dir, "security", 0)
	// 100 ticks later — old event must be trimmed
	const result = isBaselineThrashing(dir, "security", 100)
	assert.strictEqual(result.recentCount, 0)
})

await test("V-11.S1: wasBaselinePreviouslyEstablished — false when state.json absent", () => {
	const dir = makeIntentDir()
	assert.strictEqual(wasBaselinePreviouslyEstablished(dir, "security"), false)
})

await test("V-11.S2: wasBaselinePreviouslyEstablished — false when stamp absent", () => {
	const dir = makeIntentDir()
	writeFileSync(
		join(dir, "stages", "security", "state.json"),
		JSON.stringify({ status: "active" }),
	)
	assert.strictEqual(wasBaselinePreviouslyEstablished(dir, "security"), false)
})

await test("V-11.S3: wasBaselinePreviouslyEstablished — true when stamp present", () => {
	const dir = makeIntentDir()
	writeFileSync(
		join(dir, "stages", "security", "state.json"),
		JSON.stringify({
			status: "active",
			drift_baseline_established_at: "2026-04-30T00:00:00Z",
		}),
	)
	assert.strictEqual(wasBaselinePreviouslyEstablished(dir, "security"), true)
})

await test("V-11.R1: reconstructPriorBaseline returns null when no sidecars exist", () => {
	const dir = makeIntentDir()
	assert.strictEqual(reconstructPriorBaseline(dir, "security"), null)
})

await test("V-11.R2: reconstructPriorBaseline returns null when sidecars exist but no action log", async () => {
	const dir = makeIntentDir()
	const { createHash } = await import("node:crypto")
	const content = Buffer.from("hello world")
	const sha = createHash("sha256").update(content).digest("hex")
	mkdirSync(join(dir, "stages", "security", "baseline-content"), {
		recursive: true,
	})
	writeFileSync(
		join(dir, "stages", "security", "baseline-content", sha),
		content,
	)
	assert.strictEqual(reconstructPriorBaseline(dir, "security"), null)
})

await test("V-11.R3: reconstructPriorBaseline rebuilds from valid sidecar + action log", async () => {
	const dir = makeIntentDir()
	const { createHash } = await import("node:crypto")
	const content = Buffer.from("hello world")
	const sha = createHash("sha256").update(content).digest("hex")
	mkdirSync(join(dir, "stages", "security", "baseline-content"), {
		recursive: true,
	})
	writeFileSync(
		join(dir, "stages", "security", "baseline-content", sha),
		content,
	)
	writeFileSync(
		join(dir, "action-log.jsonl"),
		`${JSON.stringify({
			path: "stages/security/artifacts/x.md",
			sha,
			author_class: "agent",
			timestamp: "2026-04-30T00:00:00Z",
			entry_type: "agent_write",
			tick_counter: 1,
		})}\n`,
	)
	const result = reconstructPriorBaseline(dir, "security")
	assert.ok(result, "expected non-null reconstructed baseline")
	const entry = result.entries.get("stages/security/artifacts/x.md")
	assert.ok(entry, "expected entry for the seeded path")
	assert.strictEqual(entry.sha256, sha)
})

await test("V-11.R4: reconstructPriorBaseline rejects sidecar with mismatched hash", async () => {
	const dir = makeIntentDir()
	const claimedSha = "a".repeat(64)
	mkdirSync(join(dir, "stages", "security", "baseline-content"), {
		recursive: true,
	})
	// Filename claims sha=aaa..., but content is "hello"
	writeFileSync(
		join(dir, "stages", "security", "baseline-content", claimedSha),
		"hello",
	)
	writeFileSync(
		join(dir, "action-log.jsonl"),
		`${JSON.stringify({
			path: "stages/security/artifacts/x.md",
			sha: claimedSha,
			tick_counter: 1,
		})}\n`,
	)
	// Sidecar fails sha validation → no validated shas → reconstruction returns null
	assert.strictEqual(reconstructPriorBaseline(dir, "security"), null)
})

// ── V-11 blue-team — tamper-evident anchor regression tests ────────────────
//
// These tests pin the blue-team fix (unit-03 bolt 1) for the V-11.RT1 /
// RT2 / RT6 bypasses. They assert the contract directly at the helper
// boundary so the unit-03-red-team.test.mjs HELD outcomes don't
// silently regress if someone refactors the helpers without realising
// the action-log + sidecar are load-bearing for the V-11 gate.

await test("V-11.B1 (blue-team): wasBaselinePreviouslyEstablished — true via action-log marker even when state.json is absent", () => {
	const dir = makeIntentDir()
	// Append a baseline_established marker to the action log, with NO
	// state.json on disk. The legacy implementation would return false
	// (no state.json → no stamp → "first tick"). The fix returns true
	// because the action-log marker is tamper-evident.
	writeFileSync(
		join(dir, "action-log.jsonl"),
		`${JSON.stringify({
			entry_type: "baseline_established",
			path: "__baseline_marker__:established:security",
			sha: "",
			author_class: "agent",
			timestamp: "2026-04-30T00:00:00Z",
			human_author_id: null,
			entry_id: "BLN-EST-1-aaa",
			tick_counter: 1,
		})}\n`,
	)
	assert.strictEqual(wasBaselinePreviouslyEstablished(dir, "security"), true)
})

await test("V-11.B2 (blue-team): wasBaselinePreviouslyEstablished — true via validated sidecar even when state.json + log are absent", async () => {
	const dir = makeIntentDir()
	const { createHash } = await import("node:crypto")
	const buf = Buffer.from("baselined content")
	const sha = createHash("sha256").update(buf).digest("hex")
	mkdirSync(join(dir, "stages", "security", "baseline-content"), {
		recursive: true,
	})
	writeFileSync(join(dir, "stages", "security", "baseline-content", sha), buf)
	// No state.json, no action-log — only a content-addressed sidecar.
	// The fix returns true because the sidecar is tamper-evident.
	assert.strictEqual(wasBaselinePreviouslyEstablished(dir, "security"), true)
})

await test("V-11.B3 (blue-team): wasBaselinePreviouslyEstablished — sidecar with mismatched hash is ignored (no false positive)", () => {
	const dir = makeIntentDir()
	// File named like a sha but with mismatched content — does NOT
	// validate as a tamper-evident sidecar.
	const fakeSha = "f".repeat(64)
	mkdirSync(join(dir, "stages", "security", "baseline-content"), {
		recursive: true,
	})
	writeFileSync(
		join(dir, "stages", "security", "baseline-content", fakeSha),
		"actual content does not hash to f-repeated",
	)
	assert.strictEqual(wasBaselinePreviouslyEstablished(dir, "security"), false)
})

await test("V-11.B4 (blue-team): isBaselineThrashing — action-log floor preserves count when baseline-thrash.json is deleted", () => {
	const dir = makeIntentDir()
	// Build up to thrashing via the public API (which writes to BOTH
	// the cache file AND the action-log).
	recordBaselineCorruption(dir, "security", 1)
	recordBaselineCorruption(dir, "security", 2)
	recordBaselineCorruption(dir, "security", 3)
	recordBaselineCorruption(dir, "security", 4)
	assert.strictEqual(
		isBaselineThrashing(dir, "security", 4).thrashing,
		true,
		"setup: thrashing engaged",
	)
	// Attacker deletes the cache file (out-of-band).
	unlinkSync(join(dir, "stages", "security", "baseline-thrash.json"))
	// Action-log floor preserves the count → still thrashing.
	const after = isBaselineThrashing(dir, "security", 4)
	assert.strictEqual(after.thrashing, true)
	assert.strictEqual(after.recentCount, 4)
})

await test("V-11.B5 (blue-team): wasBaselinePreviouslyEstablished — false when ALL three sources are absent (legitimate first-tick)", () => {
	const dir = makeIntentDir()
	// No state.json, no sidecar, no action-log marker — this is the
	// only case where the fix should return false (legitimate first-
	// tick establish, allowed).
	assert.strictEqual(wasBaselinePreviouslyEstablished(dir, "security"), false)
})

console.log(`\n${passed} passed, ${failed} failed\n`)

// Cleanup
try {
	rmSync(tmp, { recursive: true, force: true })
} catch {
	// Best-effort.
}

process.exit(failed > 0 ? 1 : 0)

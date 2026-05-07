#!/usr/bin/env npx tsx
// Tests for drift-baseline.ts — baseline storage layer.
//
// Coverage:
//   1. Round-trip: writeBaseline → readBaseline returns identical entry set.
//   2. Missing file returns null (establish-mode signal).
//   3. Corrupt JSON throws BaselineCorruptError carrying the stage name.
//   4. Schema violation (missing sha256, invalid author_class) throws BaselineCorruptError.
//   5. computeFileSha256 matches a known SHA for a fixture file.
//   6. isBinary returns true for a PNG fixture, false for a markdown fixture.
//   7. enumerateTrackedSurface includes artifacts/, knowledge/, discovery/,
//      intent-scope knowledge/; excludes units/, feedback/, intent.md,
//      state.json, baseline.json, drift-markers.json, write-audit.jsonl,
//      and editor-temp patterns.
//   8. canonicalisePath rewrites outputs/ → artifacts/ and leaves canonical
//      paths untouched.
//   9. Atomic write: write tempfile but do not rename → prior baseline.json
//      intact (simulates crash mid-write).
//  10. updateBaselineEntry returns a new map with the entry inserted/updated;
//      does not mutate the input baseline.

import assert from "node:assert"
import { createHash } from "node:crypto"
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const tmp = mkdtempSync(join(tmpdir(), "haiku-drift-baseline-test-"))

const {
	BaselineCorruptError,
	canonicalisePath,
	computeFileSha256,
	computeFileSha256Sync,
	enumerateTrackedSurface,
	isBinary,
	readBaseline,
	updateBaselineEntry,
	writeBaseline,
} = await import("../src/orchestrator/workflow/drift-baseline.ts")

let passed = 0
let failed = 0

function test(name, fn) {
	try {
		const r = fn()
		if (r && typeof r.then === "function") {
			return r.then(
				() => {
					passed++
					console.log(`  ✓ ${name}`)
				},
				(e) => {
					failed++
					console.log(`  ✗ ${name}: ${e.message}`)
					if (process.env.VERBOSE) console.error(e)
				},
			)
		}
		passed++
		console.log(`  ✓ ${name}`)
	} catch (e) {
		failed++
		console.log(`  ✗ ${name}: ${e.message}`)
		if (process.env.VERBOSE) console.error(e)
	}
}

// ── Helpers ────────────────────────────────────────────────────────────────

function makeIntentDir(name, opts = {}) {
	const intentDir = join(tmp, name)
	const stage = opts.stage || "development"
	const stageDir = join(intentDir, "stages", stage)
	mkdirSync(stageDir, { recursive: true })
	return { intentDir, stage, stageDir }
}

function makeEntry(overrides = {}) {
	return {
		path: "stages/development/artifacts/output.md",
		sha256: "a".repeat(64),
		bytes: 100,
		mtime_ns: 1714312320123456,
		is_binary: false,
		author_class: "agent",
		acknowledged_at: "2026-04-28T14:32:00Z",
		acknowledged_via: "agent-write",
		stage: "development",
		tracking_class: "stage-output",
		...overrides,
	}
}

// ── Tests ──────────────────────────────────────────────────────────────────

console.log("\n=== readBaseline / writeBaseline ===")

await test("round-trip: write then read returns identical entry set", async () => {
	const { intentDir, stage } = makeIntentDir("round-trip")
	const entry1 = makeEntry({ path: "stages/development/artifacts/a.md" })
	const entry2 = makeEntry({
		path: "stages/development/knowledge/notes.md",
		tracking_class: "knowledge",
	})
	const baseline = {
		entries: new Map([
			[entry1.path, entry1],
			[entry2.path, entry2],
		]),
	}
	await writeBaseline(intentDir, stage, baseline)
	const got = readBaseline(intentDir, stage)
	assert.ok(got !== null, "should not be null after write")
	assert.strictEqual(got.entries.size, 2)
	assert.deepStrictEqual(got.entries.get(entry1.path), entry1)
	assert.deepStrictEqual(got.entries.get(entry2.path), entry2)
})

console.log("\n=== readBaseline — missing file ===")

test("missing baseline.json returns null (establish-mode signal)", () => {
	const { intentDir, stage } = makeIntentDir("missing-baseline")
	const result = readBaseline(intentDir, stage)
	assert.strictEqual(result, null)
})

console.log("\n=== readBaseline — corrupt file ===")

test("corrupt JSON throws BaselineCorruptError carrying stage name", () => {
	const { intentDir, stage, stageDir } = makeIntentDir("corrupt-json")
	writeFileSync(join(stageDir, "baseline.json"), "{ this is not json }")
	try {
		readBaseline(intentDir, stage)
		assert.fail("should have thrown")
	} catch (e) {
		assert.ok(
			e instanceof BaselineCorruptError,
			"should be BaselineCorruptError",
		)
		assert.strictEqual(e.stage, stage)
		assert.ok(e.message.includes(stage))
	}
})

test("schema violation: missing sha256 throws BaselineCorruptError", () => {
	const { intentDir, stage, stageDir } = makeIntentDir("schema-missing-sha")
	const badEntry = {
		path: "stages/development/artifacts/a.md",
		// sha256 intentionally omitted
		bytes: 100,
		mtime_ns: 0,
		is_binary: false,
		author_class: "agent",
		acknowledged_at: "2026-04-28T00:00:00Z",
		acknowledged_via: "agent-write",
		stage: "development",
		tracking_class: "stage-output",
	}
	writeFileSync(
		join(stageDir, "baseline.json"),
		JSON.stringify({ "stages/development/artifacts/a.md": badEntry }, null, 2),
	)
	try {
		readBaseline(intentDir, stage)
		assert.fail("should have thrown")
	} catch (e) {
		assert.ok(
			e instanceof BaselineCorruptError,
			"should be BaselineCorruptError",
		)
		assert.strictEqual(e.stage, stage)
	}
})

test("schema violation: invalid author_class throws BaselineCorruptError", () => {
	const { intentDir, stage, stageDir } = makeIntentDir("schema-bad-author")
	const badEntry = makeEntry({ author_class: "robot" }) // invalid
	writeFileSync(
		join(stageDir, "baseline.json"),
		JSON.stringify({ [badEntry.path]: badEntry }, null, 2),
	)
	try {
		readBaseline(intentDir, stage)
		assert.fail("should have thrown")
	} catch (e) {
		assert.ok(
			e instanceof BaselineCorruptError,
			"should be BaselineCorruptError",
		)
		assert.strictEqual(e.stage, stage)
	}
})

console.log("\n=== computeFileSha256 ===")

await test("matches known SHA for a fixture file", async () => {
	const fixturePath = join(tmp, "sha-fixture.txt")
	const content = "hello haiku drift detection\n"
	writeFileSync(fixturePath, content)
	const expected = createHash("sha256").update(content).digest("hex")
	const got = await computeFileSha256(fixturePath)
	assert.strictEqual(got, expected)
})

console.log("\n=== isBinary ===")

await test("returns true for a PNG fixture (has null bytes)", async () => {
	// PNG header: starts with \x89PNG\r\n\x1a\n — contains \x89 which is
	// not valid UTF-8 leading byte in isolation, and PNG data often has nulls.
	// Simplest approach: create a buffer with null bytes.
	const fixturePath = join(tmp, "fixture.png")
	const buf = Buffer.alloc(16, 0) // 16 null bytes — definitely binary
	buf[0] = 0x89 // PNG magic
	buf[1] = 0x50 // 'P'
	buf[2] = 0x4e // 'N'
	buf[3] = 0x47 // 'G'
	writeFileSync(fixturePath, buf)
	const result = await isBinary(fixturePath)
	assert.strictEqual(result, true)
})

await test("returns false for a markdown fixture", async () => {
	const fixturePath = join(tmp, "fixture.md")
	writeFileSync(
		fixturePath,
		"# Heading\n\nThis is plain text content without any null bytes.\n",
	)
	const result = await isBinary(fixturePath)
	assert.strictEqual(result, false)
})

console.log("\n=== enumerateTrackedSurface ===")

test("includes artifacts/, knowledge/, discovery/, intent-scope knowledge/", () => {
	const { intentDir, stage, stageDir } = makeIntentDir("enum-surface")

	// Create tracked files.
	mkdirSync(join(stageDir, "artifacts"), { recursive: true })
	mkdirSync(join(stageDir, "knowledge"), { recursive: true })
	mkdirSync(join(stageDir, "discovery"), { recursive: true })
	mkdirSync(join(intentDir, "knowledge"), { recursive: true })
	writeFileSync(join(stageDir, "artifacts", "output.html"), "<html/>")
	writeFileSync(join(stageDir, "knowledge", "notes.md"), "# notes")
	writeFileSync(join(stageDir, "discovery", "ARCH.md"), "# arch")
	writeFileSync(join(intentDir, "knowledge", "global.md"), "# global")

	const entries = enumerateTrackedSurface(intentDir, stage)
	const paths = entries.map((e) => e.pathRel)

	assert.ok(
		paths.some((p) => p.includes("artifacts/output.html")),
		"should include artifacts/",
	)
	assert.ok(
		paths.some(
			(p) => p.includes("knowledge/notes.md") && p.startsWith("stages/"),
		),
		"should include stage knowledge/",
	)
	assert.ok(
		paths.some((p) => p.includes("discovery/ARCH.md")),
		"should include discovery/",
	)
	assert.ok(
		paths.some((p) => p === "knowledge/global.md"),
		"should include intent-scope knowledge/",
	)
})

test("excludes units/, feedback/, intent.md, state.json", () => {
	const { intentDir, stage, stageDir } = makeIntentDir("enum-exclude-managed")

	mkdirSync(join(stageDir, "units"), { recursive: true })
	mkdirSync(join(stageDir, "feedback"), { recursive: true })
	mkdirSync(join(stageDir, "artifacts"), { recursive: true })
	writeFileSync(join(stageDir, "units", "unit-01-foo.md"), "---\n---\n")
	writeFileSync(join(stageDir, "feedback", "FB-001.md"), "---\n---\n")
	writeFileSync(join(intentDir, "intent.md"), "---\n---\n")
	writeFileSync(join(stageDir, "state.json"), "{}")
	writeFileSync(join(stageDir, "artifacts", "real.md"), "content")

	const entries = enumerateTrackedSurface(intentDir, stage)
	const paths = entries.map((e) => e.pathRel)

	assert.ok(!paths.some((p) => p.includes("units/")), "should exclude units/")
	assert.ok(
		!paths.some((p) => p.includes("feedback/")),
		"should exclude feedback/",
	)
	assert.ok(!paths.includes("intent.md"), "should exclude intent.md")
	assert.ok(
		!paths.some((p) => p.includes("state.json")),
		"should exclude state.json",
	)
	assert.ok(
		paths.some((p) => p.includes("artifacts/real.md")),
		"real file included",
	)
})

test("excludes baseline.json, drift-markers.json, write-audit.jsonl", () => {
	const { intentDir, stage, stageDir } = makeIntentDir("enum-exclude-drift")

	mkdirSync(join(stageDir, "artifacts"), { recursive: true })
	writeFileSync(join(stageDir, "baseline.json"), "{}")
	writeFileSync(join(intentDir, "drift-markers.json"), "{}")
	writeFileSync(join(intentDir, "write-audit.jsonl"), "")
	writeFileSync(join(stageDir, "artifacts", "real.txt"), "real content")

	const entries = enumerateTrackedSurface(intentDir, stage)
	const paths = entries.map((e) => e.pathRel)

	assert.ok(
		!paths.some((p) => p.includes("baseline.json")),
		"should exclude baseline.json",
	)
	assert.ok(
		!paths.some((p) => p.includes("drift-markers.json")),
		"should exclude drift-markers.json",
	)
	assert.ok(
		!paths.some((p) => p.includes("write-audit.jsonl")),
		"should exclude write-audit.jsonl",
	)
	assert.ok(
		paths.some((p) => p.includes("real.txt")),
		"real file included",
	)
})

test("outputs/ alias: pathRel is canonicalised (artifacts/) but absPath points to the real outputs/ file on disk", () => {
	const { intentDir, stage, stageDir } = makeIntentDir("enum-outputs-alias")

	// Place a file under the legacy outputs/ alias on disk — NOT in artifacts/.
	mkdirSync(join(stageDir, "outputs"), { recursive: true })
	writeFileSync(join(stageDir, "outputs", "hero.html"), "<html/>")

	const entries = enumerateTrackedSurface(intentDir, stage)
	const aliasEntry = entries.find(
		(e) => e.pathRel === `stages/${stage}/artifacts/hero.html`,
	)

	assert.ok(
		aliasEntry !== undefined,
		"pathRel should be canonicalised to artifacts/",
	)
	assert.ok(
		existsSync(aliasEntry.absPath),
		`absPath must point at the real on-disk location (outputs/) — got ${aliasEntry.absPath}`,
	)
	assert.ok(
		aliasEntry.absPath.includes("/outputs/"),
		`absPath should include /outputs/ for alias files — got ${aliasEntry.absPath}`,
	)
})

test("excludes editor temp files matching ^.#, ~$, .swp$, .swo$, ^4913$", () => {
	const { intentDir, stage, stageDir } = makeIntentDir("enum-exclude-editor")

	mkdirSync(join(stageDir, "artifacts"), { recursive: true })
	writeFileSync(join(stageDir, "artifacts", ".#foo.md"), "emacs lock")
	writeFileSync(join(stageDir, "artifacts", "bar.md~"), "backup")
	writeFileSync(join(stageDir, "artifacts", "baz.md.swp"), "vim swap")
	writeFileSync(join(stageDir, "artifacts", "qux.md.swo"), "vim swo")
	writeFileSync(join(stageDir, "artifacts", "4913"), "vim test")
	writeFileSync(join(stageDir, "artifacts", "real.md"), "real content")

	const entries = enumerateTrackedSurface(intentDir, stage)
	const paths = entries.map((e) => e.pathRel)

	assert.ok(!paths.some((p) => p.includes(".#foo")), "exclude emacs lock")
	assert.ok(!paths.some((p) => p.endsWith("~")), "exclude backup ~")
	assert.ok(!paths.some((p) => p.endsWith(".swp")), "exclude .swp")
	assert.ok(!paths.some((p) => p.endsWith(".swo")), "exclude .swo")
	assert.ok(!paths.some((p) => p.endsWith("/4913")), "exclude 4913")
	assert.ok(
		paths.some((p) => p.includes("real.md")),
		"real file included",
	)
})

console.log("\n=== canonicalisePath ===")

test("rewrites stages/{stage}/outputs/ → stages/{stage}/artifacts/", () => {
	assert.strictEqual(
		canonicalisePath("stages/design/outputs/hero.html"),
		"stages/design/artifacts/hero.html",
	)
	assert.strictEqual(
		canonicalisePath("stages/development/outputs/bundle.js"),
		"stages/development/artifacts/bundle.js",
	)
})

test("leaves canonical artifacts/ paths untouched", () => {
	assert.strictEqual(
		canonicalisePath("stages/design/artifacts/hero.html"),
		"stages/design/artifacts/hero.html",
	)
})

test("leaves knowledge/ and discovery/ paths untouched", () => {
	assert.strictEqual(
		canonicalisePath("stages/design/knowledge/notes.md"),
		"stages/design/knowledge/notes.md",
	)
	assert.strictEqual(
		canonicalisePath("knowledge/global.md"),
		"knowledge/global.md",
	)
})

console.log("\n=== writeBaseline canonical output ===")

await test("writeBaseline emits keys in sorted order regardless of Map insertion order", async () => {
	const { intentDir, stage, stageDir } = makeIntentDir("sorted-keys")

	// Insert keys in deliberately-unsorted order.
	const entryZ = makeEntry({
		path: "stages/development/artifacts/zzz.md",
	})
	const entryA = makeEntry({
		path: "stages/development/artifacts/aaa.md",
	})
	const entryM = makeEntry({
		path: "stages/development/artifacts/mmm.md",
	})
	const baseline = {
		entries: new Map([
			[entryZ.path, entryZ],
			[entryA.path, entryA],
			[entryM.path, entryM],
		]),
	}

	await writeBaseline(intentDir, stage, baseline)
	const json = readFileSync(join(stageDir, "baseline.json"), "utf-8")

	// JSON.stringify preserves insertion order — if we did NOT sort, zzz
	// would appear first. Verify the keys appear in alphabetical order.
	const idxA = json.indexOf("aaa.md")
	const idxM = json.indexOf("mmm.md")
	const idxZ = json.indexOf("zzz.md")
	assert.ok(idxA > 0, "aaa key should be present")
	assert.ok(idxA < idxM, "aaa should appear before mmm")
	assert.ok(idxM < idxZ, "mmm should appear before zzz")
})

await test("writeBaseline output ends with a trailing newline (canonical form)", async () => {
	const { intentDir, stage, stageDir } = makeIntentDir("trailing-newline")
	const entry = makeEntry({ path: "stages/development/artifacts/x.md" })
	await writeBaseline(intentDir, stage, {
		entries: new Map([[entry.path, entry]]),
	})
	const raw = readFileSync(join(stageDir, "baseline.json"), "utf-8")
	assert.ok(
		raw.endsWith("\n"),
		"baseline.json must end with a trailing newline",
	)
})

console.log("\n=== Atomic write safety ===")

await test("crash mid-write (tempfile written, rename skipped) leaves prior baseline.json intact", async () => {
	const { intentDir, stage, stageDir } = makeIntentDir("atomic-crash")

	// Write an initial baseline.
	const originalEntry = makeEntry({
		path: "stages/development/artifacts/original.md",
	})
	const originalBaseline = {
		entries: new Map([[originalEntry.path, originalEntry]]),
	}
	await writeBaseline(intentDir, stage, originalBaseline)

	// Verify the initial baseline exists.
	const before = readBaseline(intentDir, stage)
	assert.ok(before !== null)
	assert.strictEqual(before.entries.size, 1)

	// Simulate crash by writing a tempfile but NOT renaming it.
	const { join: pathJoin } = await import("node:path")
	const { writeFile: fsWriteFile } = await import("node:fs/promises")
	const crashTmpPath = pathJoin(stageDir, "baseline-crash.json.tmp")
	await fsWriteFile(crashTmpPath, '{ "incomplete": true }')
	// (No rename — simulates crash mid-write)

	// The prior baseline.json should still be intact.
	const after = readBaseline(intentDir, stage)
	assert.ok(after !== null, "baseline.json should still be readable")
	assert.strictEqual(
		after.entries.size,
		1,
		"original content should be preserved",
	)
	assert.ok(
		after.entries.has(originalEntry.path),
		"original entry should still be present",
	)
})

console.log("\n=== updateBaselineEntry ===")

test("returns new map with entry inserted; does not mutate input", () => {
	const existing = makeEntry({ path: "stages/development/artifacts/a.md" })
	const baseline = { entries: new Map([[existing.path, existing]]) }
	const newEntry = makeEntry({ path: "stages/development/artifacts/b.md" })

	const updated = updateBaselineEntry(baseline, newEntry)

	// New baseline has both entries.
	assert.strictEqual(updated.entries.size, 2)
	assert.ok(updated.entries.has(existing.path))
	assert.ok(updated.entries.has(newEntry.path))

	// Original is unchanged.
	assert.strictEqual(baseline.entries.size, 1)
	assert.ok(!baseline.entries.has(newEntry.path))
})

test("returns new map with existing entry updated; does not mutate input", () => {
	const original = makeEntry({ sha256: "a".repeat(64) })
	const baseline = { entries: new Map([[original.path, original]]) }

	const updated = makeEntry({ sha256: "b".repeat(64) })
	const result = updateBaselineEntry(baseline, updated)

	assert.strictEqual(result.entries.size, 1)
	assert.strictEqual(result.entries.get(original.path)?.sha256, "b".repeat(64))
	// Original not mutated.
	assert.strictEqual(
		baseline.entries.get(original.path)?.sha256,
		"a".repeat(64),
	)
})

test("computeFileSha256Sync streams large files in fixed-size chunks; matches whole-file digest", async () => {
	// Build a payload larger than the 64 KiB chunk size to verify the
	// streaming loop concatenates chunks correctly. Use a deterministic
	// repeating pattern so the expected digest is stable.
	const chunkBytes = 64 * 1024
	const payloadSize = chunkBytes * 3 + 137 // 3 full chunks + a partial tail
	const pattern = Buffer.from(
		"the quick brown fox jumps over the lazy dog\n",
		"utf-8",
	)
	const payload = Buffer.alloc(payloadSize)
	for (let i = 0; i < payloadSize; i++) {
		payload[i] = pattern[i % pattern.length]
	}

	const filePath = join(tmp, "sha256-stream-fixture.bin")
	writeFileSync(filePath, payload)

	const expected = createHash("sha256").update(payload).digest("hex")
	const actual = computeFileSha256Sync(filePath)
	assert.strictEqual(
		actual,
		expected,
		"sync streaming digest must match whole-file digest",
	)

	// Cross-check: the async streaming counterpart returns the same value
	// for the same payload (round-trip equivalence).
	const asyncDigest = await computeFileSha256(filePath)
	assert.strictEqual(asyncDigest, expected, "async/sync digests must agree")
})

test("computeFileSha256Sync handles empty files", () => {
	const filePath = join(tmp, "sha256-empty.bin")
	writeFileSync(filePath, Buffer.alloc(0))
	const expected = createHash("sha256").update(Buffer.alloc(0)).digest("hex")
	assert.strictEqual(computeFileSha256Sync(filePath), expected)
})

// ── Cleanup + summary ──────────────────────────────────────────────────────

// Allow async tests to settle.
await new Promise((r) => setTimeout(r, 50))

try {
	rmSync(tmp, { recursive: true, force: true })
} catch {}

console.log("")
console.log(`  ${passed + failed} tests: ${passed} passed, ${failed} failed`)
console.log("")

process.exit(failed > 0 ? 1 : 0)

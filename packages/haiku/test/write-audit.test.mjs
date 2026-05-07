#!/usr/bin/env npx tsx
// Tests for write-audit.ts and action-log.ts
//
// Coverage:
//   1. Append-only invariant: write three records, read back in order.
//   2. Each record is one complete JSON object per line (round-trip via
//      JSON.parse after split('\n')).
//   3. Failed disk write surfaces { ok: false, reason } instead of throwing.
//   4. Concurrent appends from two async tasks produce two distinct lines
//      (no interleaved bytes).
//   5. nextEntryId(42, 1)  → "HWM-42-01";
//      nextEntryId(42, 12) → "HWM-42-12".
//   6. appendActionLogEntry round-trips through readActionLogForTick.
//   7. findActionLogEntryForPath returns the newest entry when multiple
//      entries reference the same path.
//   8. truncateInstruction("a".repeat(250)) returns 203 chars (200 + "...").
//   9. Audit-log append failure (read-only path) returns { ok: false, reason }
//      and does not throw.

import assert from "node:assert"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const tmp = mkdtempSync(join(tmpdir(), "haiku-write-audit-test-"))

const {
	appendWriteAudit,
	nextEntryId,
	truncateInstruction,
	writeAuditPath,
	validateAndCapAuditRecord,
	MAX_AUDIT_RATIONALE_BYTES,
	MAX_AUDIT_AUTHOR_ID_BYTES,
	MAX_AUDIT_DIRS_CREATED_COUNT,
	MAX_AUDIT_DIR_PATH_BYTES,
	MAX_AUDIT_PATH_BYTES,
} = await import("../src/orchestrator/workflow/write-audit.ts")

const {
	appendActionLogEntry,
	findActionLogEntryForPath,
	readActionLogForTick,
} = await import("../src/orchestrator/workflow/action-log.ts")

let passed = 0
let failed = 0

function ok(label, fn) {
	try {
		const r = fn()
		if (r && typeof r.then === "function") {
			return r.then(
				() => {
					console.log(`  ✓ ${label}`)
					passed++
				},
				(err) => {
					console.error(`  ✗ ${label}: ${err.message ?? err}`)
					failed++
				},
			)
		}
		console.log(`  ✓ ${label}`)
		passed++
	} catch (err) {
		console.error(`  ✗ ${label}: ${err.message ?? err}`)
		failed++
	}
}

/** Build a minimal WriteAuditRecord fixture. */
function makeRecord(overrides = {}) {
	return {
		timestamp: new Date().toISOString(),
		entry_id: "HWM-1-01",
		path: "knowledge/test.md",
		sha: "a".repeat(64),
		author_class: "human-via-mcp",
		// V-03: both author keys present (canonical + legacy alias).
		claimed_author_id: null,
		human_author_id: null,
		rationale: null,
		user_instruction_excerpt: null,
		tick_counter: 1,
		session_id: null,
		overwrite: true,
		dirs_created: [],
		audit_log_appended: true,
		...overrides,
	}
}

/** Build a minimal ActionLogEntry fixture. */
function makeEntry(overrides = {}) {
	return {
		entry_type: "human_write",
		path: "knowledge/file.md",
		sha: "b".repeat(64),
		author_class: "human-via-mcp",
		timestamp: new Date().toISOString(),
		human_author_id: null,
		entry_id: "HWM-1-01",
		tick_counter: 1,
		...overrides,
	}
}

// ── Test 1: Append-only invariant ──────────────────────────────────────────

await ok(
	"Append-only invariant: three records round-trip in order",
	async () => {
		const dir = mkdtempSync(join(tmp, "t1-"))
		const rec1 = makeRecord({ entry_id: "HWM-1-01", path: "k/a.md" })
		const rec2 = makeRecord({ entry_id: "HWM-1-02", path: "k/b.md" })
		const rec3 = makeRecord({ entry_id: "HWM-1-03", path: "k/c.md" })

		await appendWriteAudit(dir, rec1)
		await appendWriteAudit(dir, rec2)
		await appendWriteAudit(dir, rec3)

		const raw = readFileSync(writeAuditPath(dir), "utf-8")
		const lines = raw.split("\n").filter((l) => l.trim() !== "")
		assert.strictEqual(lines.length, 3, `expected 3 lines, got ${lines.length}`)
		const parsed = lines.map((l) => JSON.parse(l))
		assert.strictEqual(parsed[0].entry_id, "HWM-1-01")
		assert.strictEqual(parsed[1].entry_id, "HWM-1-02")
		assert.strictEqual(parsed[2].entry_id, "HWM-1-03")
		// No exported truncate/clear → the only public mutation is append.
		// Verify by checking the module exports do NOT include anything that
		// would reset the file.
		const mod = await import("../src/orchestrator/workflow/write-audit.ts")
		assert.ok(!("clearWriteAudit" in mod), "no clearWriteAudit export")
		assert.ok(!("truncateAuditLog" in mod), "no truncateAuditLog export")
	},
)

// ── Test 2: One JSON object per line ──────────────────────────────────────

await ok("Each record is one complete JSON object per line", async () => {
	const dir = mkdtempSync(join(tmp, "t2-"))
	const rec = makeRecord({ entry_id: "HWM-2-01", path: "k/x.md" })
	await appendWriteAudit(dir, rec)
	const raw = readFileSync(writeAuditPath(dir), "utf-8")
	const lines = raw.split("\n").filter((l) => l.trim() !== "")
	assert.strictEqual(lines.length, 1)
	const parsed = JSON.parse(lines[0])
	assert.strictEqual(parsed.entry_id, rec.entry_id)
	assert.strictEqual(parsed.path, rec.path)
	assert.strictEqual(parsed.author_class, "human-via-mcp")
})

// ── Test 3: Failed disk write surfaces { ok: false, reason } ──────────────

await ok(
	"Failed disk write returns { ok: false, reason } without throwing",
	async () => {
		// Use a path whose parent is an existing FILE (not a directory) so
		// mkdirSync will fail trying to create a directory at that path.
		const dir = mkdtempSync(join(tmp, "t3-"))
		// Write a file where we want a directory — then try to append inside it.
		const { writeFileSync } = await import("node:fs")
		writeFileSync(join(dir, "write-audit.jsonl"), "blocked")
		// Re-point intentDir to a child of the existing file (impossible dir).
		const badDir = join(dir, "write-audit.jsonl", "nested")
		const rec = makeRecord()
		const result = await appendWriteAudit(badDir, rec)
		assert.strictEqual(result.ok, false, "expected ok: false")
		assert.ok("reason" in result, "expected reason field")
		assert.ok(typeof result.reason === "string", "reason must be a string")
	},
)

// ── Test 4: Concurrent appends produce two distinct lines ─────────────────

await ok(
	"Concurrent appends produce two distinct lines (no interleaved bytes)",
	async () => {
		const dir = mkdtempSync(join(tmp, "t4-"))
		const rec1 = makeRecord({ entry_id: "HWM-4-01", path: "k/concurrent-a.md" })
		const rec2 = makeRecord({ entry_id: "HWM-4-02", path: "k/concurrent-b.md" })

		// Fire both appends concurrently.
		const [r1, r2] = await Promise.all([
			appendWriteAudit(dir, rec1),
			appendWriteAudit(dir, rec2),
		])
		assert.ok(r1.ok, `first append failed: ${r1.ok === false ? r1.reason : ""}`)
		assert.ok(
			r2.ok,
			`second append failed: ${r2.ok === false ? r2.reason : ""}`,
		)

		const raw = readFileSync(writeAuditPath(dir), "utf-8")
		const lines = raw.split("\n").filter((l) => l.trim() !== "")
		assert.strictEqual(lines.length, 2, `expected 2 lines, got ${lines.length}`)

		// Each line must be valid JSON independently (no interleaving).
		const a = JSON.parse(lines[0])
		const b = JSON.parse(lines[1])
		const ids = new Set([a.entry_id, b.entry_id])
		assert.ok(ids.has("HWM-4-01"), "HWM-4-01 must appear")
		assert.ok(ids.has("HWM-4-02"), "HWM-4-02 must appear")
	},
)

// ── Test 5: nextEntryId formatting ────────────────────────────────────────

ok("nextEntryId(42, 1) → HWM-42-01", () => {
	assert.strictEqual(nextEntryId(42, 1), "HWM-42-01")
})

ok("nextEntryId(42, 12) → HWM-42-12", () => {
	assert.strictEqual(nextEntryId(42, 12), "HWM-42-12")
})

ok("nextEntryId(0, 0) → HWM-0-00", () => {
	assert.strictEqual(nextEntryId(0, 0), "HWM-0-00")
})

// ── Test 6: appendActionLogEntry → readActionLogForTick round-trip ─────────

await ok(
	"appendActionLogEntry round-trips through readActionLogForTick",
	async () => {
		const dir = mkdtempSync(join(tmp, "t6-"))
		const entry = makeEntry({
			tick_counter: 7,
			entry_id: "HWM-7-01",
			path: "k/rt.md",
		})
		const result = await appendActionLogEntry(dir, 7, entry)
		assert.ok(
			result.ok,
			`append failed: ${result.ok === false ? result.reason : ""}`,
		)

		const result7 = await readActionLogForTick(dir, 7)
		assert.strictEqual(result7.entries.length, 1)
		assert.strictEqual(result7.entries[0].entry_id, "HWM-7-01")
		assert.strictEqual(result7.entries[0].path, "k/rt.md")
		assert.strictEqual(result7.entries[0].tick_counter, 7)
		// FB-028: clean log → no malformed lines.
		assert.strictEqual(result7.malformedCount, 0)
		assert.strictEqual(result7.malformedSamples.length, 0)

		// Different tick — should return empty.
		const other = await readActionLogForTick(dir, 99)
		assert.strictEqual(other.entries.length, 0)
		assert.strictEqual(other.malformedCount, 0)
	},
)

// ── Test 6b (FB-028): malformed lines are counted, not silently dropped ────

await ok(
	"FB-028: readActionLogForTick surfaces malformedCount instead of swallowing JSON-parse errors",
	async () => {
		const dir = mkdtempSync(join(tmp, "t6b-"))
		const entry = makeEntry({
			tick_counter: 11,
			entry_id: "HWM-11-01",
			path: "k/clean.md",
		})
		const r = await appendActionLogEntry(dir, 11, entry)
		assert.ok(r.ok, "first append must succeed")

		// Inject a malformed line directly to simulate tampering or
		// concurrent-writer interleaving (the very thing FB-028 calls out).
		const { appendFileSync } = await import("node:fs")
		appendFileSync(
			join(dir, "action-log.jsonl"),
			"{not valid json — interleaved bytes from a concurrent writer}\n",
		)

		const result = await readActionLogForTick(dir, 11)
		assert.strictEqual(
			result.entries.length,
			1,
			"clean entries must still parse",
		)
		assert.strictEqual(
			result.malformedCount,
			1,
			"malformed line MUST be counted, not silently dropped (FB-028)",
		)
		assert.strictEqual(
			result.malformedSamples.length,
			1,
			"caller gets a sample so it can fail closed with diagnostics",
		)
	},
)

// ── Test 7: findActionLogEntryForPath returns newest entry ────────────────

ok("findActionLogEntryForPath returns the newest entry for a path", () => {
	const e1 = makeEntry({
		path: "k/shared.md",
		entry_id: "HWM-1-01",
		timestamp: "2026-01-01T00:00:00Z",
	})
	const e2 = makeEntry({
		path: "k/other.md",
		entry_id: "HWM-1-02",
		timestamp: "2026-01-01T00:00:01Z",
	})
	const e3 = makeEntry({
		path: "k/shared.md",
		entry_id: "HWM-1-03",
		timestamp: "2026-01-01T00:00:02Z",
	})

	const result = findActionLogEntryForPath([e1, e2, e3], "k/shared.md")
	assert.ok(result !== null, "expected a match")
	assert.strictEqual(
		result.entry_id,
		"HWM-1-03",
		"expected the last entry to win",
	)
})

ok("findActionLogEntryForPath returns null when no entry matches", () => {
	const entries = [makeEntry({ path: "k/a.md" }), makeEntry({ path: "k/b.md" })]
	const result = findActionLogEntryForPath(entries, "k/missing.md")
	assert.strictEqual(result, null)
})

// ── Test 8: truncateInstruction ───────────────────────────────────────────

ok(
	"truncateInstruction('a'.repeat(250)) returns 203 chars (200 + '...')",
	() => {
		const result = truncateInstruction("a".repeat(250))
		assert.strictEqual(result.length, 203)
		assert.ok(result.endsWith("..."), "must end with '...'")
		assert.ok(result.startsWith("a".repeat(200)), "must keep first 200 chars")
	},
)

ok("truncateInstruction does not truncate strings ≤ 200 chars", () => {
	const s = "a".repeat(200)
	assert.strictEqual(truncateInstruction(s), s)
})

ok("truncateInstruction respects custom max", () => {
	const result = truncateInstruction("hello world", 5)
	assert.strictEqual(result, "hello...")
	assert.strictEqual(result.length, 8)
})

// ── Test 9: Audit-log append failure does not throw ───────────────────────

await ok(
	"appendWriteAudit on a bad path returns { ok: false } and does not throw",
	async () => {
		// Simulate a read-only / unwritable path by using a path whose
		// directory component is an existing FILE (so mkdir will fail).
		const dir = mkdtempSync(join(tmp, "t9-"))
		const { writeFileSync } = await import("node:fs")
		// Block directory creation by placing a file where the dir would be.
		writeFileSync(join(dir, "write-audit.jsonl"), "cannot-be-dir")
		const badIntentDir = join(dir, "write-audit.jsonl", "fake-intent")
		const rec = makeRecord({ entry_id: "HWM-9-01" })

		let threw = false
		let result
		try {
			result = await appendWriteAudit(badIntentDir, rec)
		} catch {
			threw = true
		}
		assert.ok(!threw, "appendWriteAudit must not throw")
		assert.ok(result !== undefined, "must return a result")
		assert.strictEqual(result.ok, false, "expected ok: false")
		assert.ok("reason" in result, "expected reason field")
	},
)

// ── FB-028: per-field caps + record-size cap ──────────────────────────────

ok("FB-028: validateAndCapAuditRecord truncates oversized rationale", () => {
	const huge = "r".repeat(MAX_AUDIT_RATIONALE_BYTES + 5000)
	const rec = makeRecord({ rationale: huge })
	const result = validateAndCapAuditRecord(rec)
	assert.strictEqual(result.ok, true)
	assert.ok(
		Buffer.byteLength(result.record.rationale, "utf-8") <=
			MAX_AUDIT_RATIONALE_BYTES,
		"rationale must be capped to MAX_AUDIT_RATIONALE_BYTES",
	)
	assert.ok(
		result.record.rationale.endsWith("...[truncated]"),
		"truncated rationale carries the marker",
	)
})

ok(
	"FB-028: validateAndCapAuditRecord truncates oversized claimed_author_id",
	() => {
		const huge = "c".repeat(MAX_AUDIT_AUTHOR_ID_BYTES + 500)
		const rec = makeRecord({
			claimed_author_id: huge,
			human_author_id: huge,
		})
		const result = validateAndCapAuditRecord(rec)
		assert.strictEqual(result.ok, true)
		assert.ok(
			Buffer.byteLength(result.record.claimed_author_id, "utf-8") <=
				MAX_AUDIT_AUTHOR_ID_BYTES,
		)
		assert.ok(
			Buffer.byteLength(result.record.human_author_id, "utf-8") <=
				MAX_AUDIT_AUTHOR_ID_BYTES,
		)
	},
)

ok(
	"FB-028: validateAndCapAuditRecord caps dirs_created length and per-element size",
	() => {
		const longDir = "d".repeat(MAX_AUDIT_DIR_PATH_BYTES + 100)
		const dirs = Array.from(
			{ length: MAX_AUDIT_DIRS_CREATED_COUNT + 50 },
			(_, i) => `${longDir}-${i}`,
		)
		const rec = makeRecord({ dirs_created: dirs })
		const result = validateAndCapAuditRecord(rec)
		assert.strictEqual(result.ok, true)
		assert.strictEqual(
			result.record.dirs_created.length,
			MAX_AUDIT_DIRS_CREATED_COUNT,
			"array length capped to MAX_AUDIT_DIRS_CREATED_COUNT",
		)
		for (const d of result.record.dirs_created) {
			assert.ok(
				Buffer.byteLength(d, "utf-8") <= MAX_AUDIT_DIR_PATH_BYTES,
				"each dir entry capped to MAX_AUDIT_DIR_PATH_BYTES",
			)
		}
	},
)

ok("FB-028: validateAndCapAuditRecord caps oversized path", () => {
	const longPath = "p".repeat(MAX_AUDIT_PATH_BYTES + 1000)
	const rec = makeRecord({ path: longPath })
	const result = validateAndCapAuditRecord(rec)
	assert.strictEqual(result.ok, true)
	assert.ok(
		Buffer.byteLength(result.record.path, "utf-8") <= MAX_AUDIT_PATH_BYTES,
	)
})

await ok(
	"FB-028: appendWriteAudit caps unbounded rationale instead of relying on PIPE_BUF",
	async () => {
		const dir = mkdtempSync(join(tmp, "fb28-rationale-"))
		const huge = "x".repeat(MAX_AUDIT_RATIONALE_BYTES * 4) // 16 KB rationale
		const rec = makeRecord({ rationale: huge, path: "k/big-rationale.md" })
		const result = await appendWriteAudit(dir, rec)
		assert.strictEqual(
			result.ok,
			true,
			"huge rationale capped, append succeeds",
		)
		const raw = readFileSync(writeAuditPath(dir), "utf-8")
		const lines = raw.split("\n").filter((l) => l.trim() !== "")
		assert.strictEqual(lines.length, 1, "exactly one line written")
		// The serialised line must be within the per-record cap. Atomicity
		// no longer depends on this bound (the mutex serialises writers),
		// but the bound exists to block disk-fill / OOM amplification.
		assert.ok(
			Buffer.byteLength(lines[0], "utf-8") <= 16 * 1024,
			"serialised line ≤ MAX_AUDIT_RECORD_BYTES",
		)
		const parsed = JSON.parse(lines[0])
		assert.ok(parsed.rationale.endsWith("...[truncated]"))
	},
)

await ok(
	"FB-028: 50 concurrent appends produce 50 distinct, individually-parseable lines",
	async () => {
		// Stress the mutex with more concurrency than the prior test (which
		// did 2). The FB-028 atomicity model relies on the per-file mutex,
		// not PIPE_BUF — so this MUST hold even with records that exceed
		// the macOS PIPE_BUF=512 byte limit.
		const dir = mkdtempSync(join(tmp, "fb28-concurrent-"))
		const N = 50
		// Each record carries a 1 KB rationale → serialised line > 1 KB,
		// well above macOS PIPE_BUF (512). Pre-FB-028 this would interleave.
		const rationale = "y".repeat(1024)
		const promises = []
		for (let i = 0; i < N; i++) {
			const rec = makeRecord({
				entry_id: `HWM-99-${String(i).padStart(2, "0")}`,
				path: `k/concurrent-${i}.md`,
				rationale,
			})
			promises.push(appendWriteAudit(dir, rec))
		}
		const results = await Promise.all(promises)
		for (const r of results) {
			assert.ok(r.ok, `append must succeed, got: ${JSON.stringify(r)}`)
		}
		const raw = readFileSync(writeAuditPath(dir), "utf-8")
		const lines = raw.split("\n").filter((l) => l.trim() !== "")
		assert.strictEqual(
			lines.length,
			N,
			`expected ${N} lines, got ${lines.length}`,
		)
		const ids = new Set()
		for (const line of lines) {
			const parsed = JSON.parse(line) // throws if interleaved
			ids.add(parsed.entry_id)
		}
		assert.strictEqual(ids.size, N, "all entry_ids distinct, no duplicates")
	},
)

// ── Cleanup ────────────────────────────────────────────────────────────────

rmSync(tmp, { recursive: true, force: true })

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)

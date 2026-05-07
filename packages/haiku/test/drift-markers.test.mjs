#!/usr/bin/env npx tsx
// Tests for drift-markers.ts — pending-assessment marker store.
//
// Coverage:
//   1. Round-trip: writeMarkers → readMarkers returns identical marker list.
//   2. Missing file returns empty array (no error).
//   3. Corrupted file returns empty array AND emits a warning to captured
//      logger (no throw).
//   4. appendMarker rejects records that violate the FB/revisit mutual-
//      exclusion invariant (both null → error; both non-null → error).
//   5. findOpenMarker returns the newest open marker when multiple closed
//      markers exist for the same path.
//   6. clearMarker sets cleared_at and resolved_sha together; reads back
//      identical values.
//   7. clearMarker rejects (surface-as-feedback, revisit-complete) with
//      TriggerOutcomeMismatchError.
//   8. clearMarker rejects (trigger-revisit, feedback-closed) with
//      TriggerOutcomeMismatchError.
//   9. clearMarker returns { cleared: false, reason: 'no_open_marker' } when
//      no open marker exists (idempotent retry safe).
//  10. isStaleMarker returns true on double-edit, false when SHA matches.

import assert from "node:assert"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const tmp = mkdtempSync(join(tmpdir(), "haiku-drift-markers-test-"))

const {
	MarkerInvariantError,
	TriggerOutcomeMismatchError,
	appendMarker,
	clearMarker,
	findOpenMarker,
	isStaleMarker,
	readMarkers,
	removeMarker,
	removeMarkersSync,
	writeMarkers,
	writeMarkersSync,
} = await import("../src/orchestrator/workflow/drift-markers.ts")

let passed = 0
let failed = 0
let dirCounter = 0

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

function makeDir(label) {
	const d = join(tmp, `${label}-${++dirCounter}`)
	mkdirSync(d, { recursive: true })
	return d
}

function makeMarker(overrides = {}) {
	return {
		path: "stages/design/artifacts/hero.html",
		created_at: "2026-04-28T14:35:12Z",
		created_by_assessment_id: "AS-01",
		outcome: "surface-as-feedback",
		linked_feedback_id: "FB-001",
		linked_revisit_target_stage: null,
		cleared_at: null,
		resolved_sha: null,
		baseline_sha_at_creation: "a".repeat(64),
		...overrides,
	}
}

// ── Tests ──────────────────────────────────────────────────────────────────

console.log("\n=== readMarkers / writeMarkers (round-trip) ===")

await test("round-trip: writeMarkers then readMarkers returns identical list", async () => {
	const intentDir = makeDir("round-trip")
	const markers = [
		makeMarker({ created_by_assessment_id: "AS-01" }),
		makeMarker({
			path: "stages/design/artifacts/layout.html",
			created_by_assessment_id: "AS-02",
			outcome: "trigger-revisit",
			linked_feedback_id: null,
			linked_revisit_target_stage: "design",
		}),
	]
	await writeMarkers(intentDir, { markers })
	const got = readMarkers(intentDir)
	assert.strictEqual(got.markers.length, 2)
	assert.deepStrictEqual(got.markers[0], markers[0])
	assert.deepStrictEqual(got.markers[1], markers[1])
})

console.log("\n=== readMarkers — missing file ===")

test("missing drift-markers.json returns empty array (no error)", () => {
	// Use a path that doesn't have a drift-markers.json.
	const intentDir = join(tmp, `missing-${++dirCounter}`)
	// Intentionally NOT creating the directory — readMarkers handles absent file.
	const store = readMarkers(intentDir)
	assert.ok(Array.isArray(store.markers), "markers should be an array")
	assert.strictEqual(store.markers.length, 0)
})

console.log("\n=== readMarkers — corrupt file ===")

await test("corrupt file returns empty array AND emits warning to captured logger (no throw)", async () => {
	const intentDir = makeDir("corrupt")
	writeFileSync(join(intentDir, "drift-markers.json"), "{ not valid json }")

	const warnings = []
	const logger = { warn: (msg) => warnings.push(msg) }

	let threw = false
	let store
	try {
		store = readMarkers(intentDir, logger)
	} catch {
		threw = true
	}

	assert.strictEqual(
		threw,
		false,
		"readMarkers should not throw on corrupt file",
	)
	assert.ok(store !== undefined, "should return a store")
	assert.strictEqual(store.markers.length, 0, "should return empty markers")
	assert.strictEqual(warnings.length, 1, "should emit exactly one warning")
	assert.ok(
		warnings[0].includes("drift-markers.json"),
		`warning should mention the file — got: ${warnings[0]}`,
	)
})

await test("schema-violating JSON returns empty array AND emits warning (no throw)", async () => {
	const intentDir = makeDir("schema-violation")
	// Valid JSON, but wrong shape (missing required fields).
	writeFileSync(
		join(intentDir, "drift-markers.json"),
		JSON.stringify({ markers: [{ path: "foo", bad_field: true }] }),
	)

	const warnings = []
	const logger = { warn: (msg) => warnings.push(msg) }

	let threw = false
	let store
	try {
		store = readMarkers(intentDir, logger)
	} catch {
		threw = true
	}

	assert.strictEqual(threw, false, "should not throw on schema violation")
	assert.strictEqual(store.markers.length, 0, "should return empty markers")
	assert.strictEqual(warnings.length, 1, "should emit one warning")
})

console.log("\n=== appendMarker — mutual-exclusion invariant ===")

await test("rejects marker where both linked_feedback_id and linked_revisit_target_stage are null", async () => {
	const intentDir = makeDir("append-both-null")
	const marker = makeMarker({
		linked_feedback_id: null,
		linked_revisit_target_stage: null,
	})

	let caught
	try {
		await appendMarker(intentDir, marker)
	} catch (e) {
		caught = e
	}

	assert.ok(
		caught instanceof MarkerInvariantError,
		`should throw MarkerInvariantError — got ${caught?.constructor?.name}: ${caught?.message}`,
	)
	assert.ok(
		caught.message.includes("mutual-exclusion"),
		"message should mention invariant",
	)
})

await test("rejects marker where both linked_feedback_id and linked_revisit_target_stage are non-null", async () => {
	const intentDir = makeDir("append-both-non-null")
	const marker = makeMarker({
		linked_feedback_id: "FB-001",
		linked_revisit_target_stage: "design",
	})

	let caught
	try {
		await appendMarker(intentDir, marker)
	} catch (e) {
		caught = e
	}

	assert.ok(
		caught instanceof MarkerInvariantError,
		`should throw MarkerInvariantError — got ${caught?.constructor?.name}: ${caught?.message}`,
	)
})

await test("accepts valid surface-as-feedback marker (only linked_feedback_id set)", async () => {
	const intentDir = makeDir("append-valid-fb")
	const marker = makeMarker({
		outcome: "surface-as-feedback",
		linked_feedback_id: "FB-001",
		linked_revisit_target_stage: null,
	})

	let threw = false
	try {
		await appendMarker(intentDir, marker)
	} catch {
		threw = true
	}
	assert.strictEqual(
		threw,
		false,
		"should not throw for valid surface-as-feedback marker",
	)

	const store = readMarkers(intentDir)
	assert.strictEqual(store.markers.length, 1)
})

await test("accepts valid trigger-revisit marker (only linked_revisit_target_stage set)", async () => {
	const intentDir = makeDir("append-valid-revisit")
	const marker = makeMarker({
		outcome: "trigger-revisit",
		linked_feedback_id: null,
		linked_revisit_target_stage: "design",
	})

	let threw = false
	try {
		await appendMarker(intentDir, marker)
	} catch {
		threw = true
	}
	assert.strictEqual(
		threw,
		false,
		"should not throw for valid trigger-revisit marker",
	)
})

console.log("\n=== findOpenMarker ===")

test("returns newest open marker when multiple closed markers exist for the same path", () => {
	const olderClosed = makeMarker({
		created_at: "2026-04-28T10:00:00Z",
		created_by_assessment_id: "AS-01",
		cleared_at: "2026-04-28T11:00:00Z",
		resolved_sha: "b".repeat(64),
	})
	const newerClosed = makeMarker({
		created_at: "2026-04-28T12:00:00Z",
		created_by_assessment_id: "AS-02",
		cleared_at: "2026-04-28T13:00:00Z",
		resolved_sha: "c".repeat(64),
	})
	const newerOpen = makeMarker({
		created_at: "2026-04-28T14:00:00Z",
		created_by_assessment_id: "AS-03",
		cleared_at: null,
	})
	const oldestOpen = makeMarker({
		created_at: "2026-04-28T09:00:00Z",
		created_by_assessment_id: "AS-04",
		cleared_at: null,
	})

	const store = { markers: [olderClosed, newerClosed, oldestOpen, newerOpen] }
	const found = findOpenMarker(store, "stages/design/artifacts/hero.html")

	assert.ok(found !== null, "should find an open marker")
	assert.strictEqual(
		found.created_by_assessment_id,
		"AS-03",
		"should return the newest open marker (AS-03 at 14:00)",
	)
})

test("returns null when no open markers exist for the path", () => {
	const closedMarker = makeMarker({
		cleared_at: "2026-04-28T11:00:00Z",
		resolved_sha: "d".repeat(64),
	})
	const store = { markers: [closedMarker] }
	const found = findOpenMarker(store, "stages/design/artifacts/hero.html")
	assert.strictEqual(found, null)
})

test("returns null for an entirely different path", () => {
	const marker = makeMarker({ cleared_at: null })
	const store = { markers: [marker] }
	const found = findOpenMarker(store, "stages/design/artifacts/other.html")
	assert.strictEqual(found, null)
})

console.log("\n=== clearMarker ===")

await test("sets cleared_at and resolved_sha together; reads back identical values", async () => {
	const intentDir = makeDir("clear-success")
	const marker = makeMarker({
		outcome: "surface-as-feedback",
		linked_feedback_id: "FB-001",
		linked_revisit_target_stage: null,
	})
	await writeMarkers(intentDir, { markers: [marker] })

	const resolvedSha = "e".repeat(64)
	const result = await clearMarker(
		intentDir,
		marker.path,
		resolvedSha,
		"feedback-closed",
	)

	assert.strictEqual(result.cleared, true, "should return cleared: true")
	assert.ok(result.marker.cleared_at !== null, "cleared_at must be set")
	assert.strictEqual(result.marker.resolved_sha, resolvedSha)

	// Read back and verify.
	const store = readMarkers(intentDir)
	const persisted = store.markers.find((m) => m.path === marker.path)
	assert.ok(persisted !== undefined, "marker should be persisted")
	assert.strictEqual(persisted.cleared_at, result.marker.cleared_at)
	assert.strictEqual(persisted.resolved_sha, resolvedSha)
})

await test("clearMarker with trigger feedback-rejected also works for surface-as-feedback", async () => {
	const intentDir = makeDir("clear-fb-rejected")
	const marker = makeMarker({
		outcome: "surface-as-feedback",
		linked_feedback_id: "FB-002",
		linked_revisit_target_stage: null,
	})
	await writeMarkers(intentDir, { markers: [marker] })

	const result = await clearMarker(
		intentDir,
		marker.path,
		"f".repeat(64),
		"feedback-rejected",
	)
	assert.strictEqual(result.cleared, true)
	assert.strictEqual(result.marker.resolved_sha, "f".repeat(64))
})

await test("clearMarker rejects (surface-as-feedback, revisit-complete) with TriggerOutcomeMismatchError", async () => {
	const intentDir = makeDir("clear-mismatch-sf")
	const marker = makeMarker({
		outcome: "surface-as-feedback",
		linked_feedback_id: "FB-003",
		linked_revisit_target_stage: null,
	})
	await writeMarkers(intentDir, { markers: [marker] })

	let caught
	try {
		await clearMarker(
			intentDir,
			marker.path,
			"g".repeat(64),
			"revisit-complete",
		)
	} catch (e) {
		caught = e
	}

	assert.ok(
		caught instanceof TriggerOutcomeMismatchError,
		`should throw TriggerOutcomeMismatchError — got ${caught?.constructor?.name}: ${caught?.message}`,
	)
	assert.strictEqual(caught.outcome, "surface-as-feedback")
	assert.strictEqual(caught.trigger, "revisit-complete")
})

await test("clearMarker rejects (trigger-revisit, feedback-closed) with TriggerOutcomeMismatchError", async () => {
	const intentDir = makeDir("clear-mismatch-tr-fb")
	const marker = makeMarker({
		outcome: "trigger-revisit",
		linked_feedback_id: null,
		linked_revisit_target_stage: "design",
	})
	await writeMarkers(intentDir, { markers: [marker] })

	let caught
	try {
		await clearMarker(intentDir, marker.path, "h".repeat(64), "feedback-closed")
	} catch (e) {
		caught = e
	}

	assert.ok(
		caught instanceof TriggerOutcomeMismatchError,
		`should throw TriggerOutcomeMismatchError — got ${caught?.constructor?.name}`,
	)
	assert.strictEqual(caught.outcome, "trigger-revisit")
	assert.strictEqual(caught.trigger, "feedback-closed")
})

await test("clearMarker rejects (trigger-revisit, feedback-rejected) with TriggerOutcomeMismatchError", async () => {
	const intentDir = makeDir("clear-mismatch-tr-rej")
	const marker = makeMarker({
		outcome: "trigger-revisit",
		linked_feedback_id: null,
		linked_revisit_target_stage: "design",
	})
	await writeMarkers(intentDir, { markers: [marker] })

	let caught
	try {
		await clearMarker(
			intentDir,
			marker.path,
			"i".repeat(64),
			"feedback-rejected",
		)
	} catch (e) {
		caught = e
	}

	assert.ok(
		caught instanceof TriggerOutcomeMismatchError,
		`should throw TriggerOutcomeMismatchError — got ${caught?.constructor?.name}`,
	)
})

await test("clearMarker returns { cleared: false, reason: 'no_open_marker' } when no open marker exists", async () => {
	const intentDir = makeDir("clear-no-marker")
	const marker = makeMarker({
		cleared_at: "2026-04-28T11:00:00Z",
		resolved_sha: "j".repeat(64),
	})
	await writeMarkers(intentDir, { markers: [marker] })

	const result = await clearMarker(
		intentDir,
		marker.path,
		"k".repeat(64),
		"feedback-closed",
	)

	assert.strictEqual(result.cleared, false)
	assert.strictEqual(result.reason, "no_open_marker")
})

await test("clearMarker on empty (no file) store returns { cleared: false, reason: 'no_open_marker' }", async () => {
	const intentDir = join(tmp, `clear-empty-${++dirCounter}`)
	// No drift-markers.json — readMarkers returns empty.

	const result = await clearMarker(
		intentDir,
		"stages/design/artifacts/hero.html",
		"l".repeat(64),
		"feedback-closed",
	)

	assert.strictEqual(result.cleared, false)
	assert.strictEqual(result.reason, "no_open_marker")
})

console.log("\n=== isStaleMarker ===")

test("returns true when currentSha differs from baseline_sha_at_creation (double-edit)", () => {
	const marker = makeMarker({ baseline_sha_at_creation: "a".repeat(64) })
	assert.strictEqual(isStaleMarker(marker, "b".repeat(64)), true)
})

test("returns false when currentSha matches baseline_sha_at_creation", () => {
	const marker = makeMarker({ baseline_sha_at_creation: "a".repeat(64) })
	assert.strictEqual(isStaleMarker(marker, "a".repeat(64)), false)
})

console.log("\n=== removeMarker ===")

await test("removeMarker deletes open markers for a path; preserves closed markers and other paths", async () => {
	const intentDir = makeDir("remove-selective")
	const openMarker = makeMarker({
		path: "stages/design/artifacts/hero.html",
		cleared_at: null,
		created_by_assessment_id: "AS-10",
	})
	const closedMarker = makeMarker({
		path: "stages/design/artifacts/hero.html",
		cleared_at: "2026-04-28T11:00:00Z",
		resolved_sha: "m".repeat(64),
		created_by_assessment_id: "AS-09",
	})
	const otherMarker = makeMarker({
		path: "stages/design/artifacts/other.html",
		cleared_at: null,
		created_by_assessment_id: "AS-11",
	})

	await writeMarkers(intentDir, {
		markers: [openMarker, closedMarker, otherMarker],
	})
	await removeMarker(intentDir, "stages/design/artifacts/hero.html")

	const store = readMarkers(intentDir)
	const openHero = store.markers.filter(
		(m) =>
			m.path === "stages/design/artifacts/hero.html" && m.cleared_at === null,
	)
	assert.strictEqual(
		openHero.length,
		0,
		"open marker for hero.html should be removed",
	)

	const closedHero = store.markers.filter(
		(m) =>
			m.path === "stages/design/artifacts/hero.html" && m.cleared_at !== null,
	)
	assert.strictEqual(
		closedHero.length,
		1,
		"closed marker for hero.html should be preserved",
	)

	const other = store.markers.filter(
		(m) => m.path === "stages/design/artifacts/other.html",
	)
	assert.strictEqual(other.length, 1, "other path marker should be preserved")
})

await test("removeMarker is a no-op when no open marker exists for the path", async () => {
	const intentDir = makeDir("remove-noop")
	const closedMarker = makeMarker({
		cleared_at: "2026-04-28T11:00:00Z",
		resolved_sha: "n".repeat(64),
	})
	await writeMarkers(intentDir, { markers: [closedMarker] })

	let threw = false
	try {
		await removeMarker(intentDir, closedMarker.path)
	} catch {
		threw = true
	}

	assert.strictEqual(threw, false, "removeMarker should not throw")
	const store = readMarkers(intentDir)
	assert.strictEqual(store.markers.length, 1, "closed marker should remain")
})

console.log("\n=== removeMarkersSync ===")

await test("removeMarkersSync batch-removes open markers for multiple paths in one write", async () => {
	const intentDir = makeDir("remove-sync-batch")
	const openA = makeMarker({
		path: "stages/design/artifacts/a.html",
		cleared_at: null,
		created_by_assessment_id: "AS-A1",
	})
	const openB = makeMarker({
		path: "stages/design/artifacts/b.html",
		cleared_at: null,
		created_by_assessment_id: "AS-B1",
	})
	const openC = makeMarker({
		path: "stages/design/artifacts/c.html",
		cleared_at: null,
		created_by_assessment_id: "AS-C1",
	})
	await writeMarkers(intentDir, { markers: [openA, openB, openC] })

	removeMarkersSync(intentDir, [
		"stages/design/artifacts/a.html",
		"stages/design/artifacts/c.html",
	])

	const store = readMarkers(intentDir)
	const remaining = store.markers.map((m) => m.path)
	assert.deepStrictEqual(
		remaining.sort(),
		["stages/design/artifacts/b.html"],
		"only path B should remain open after batch removal",
	)
})

await test("removeMarkersSync no-op for empty input", () => {
	const intentDir = makeDir("remove-sync-empty")
	const open = makeMarker({
		cleared_at: null,
		created_by_assessment_id: "AS-X",
	})
	writeMarkersSync(intentDir, { markers: [open] })

	removeMarkersSync(intentDir, [])

	const store = readMarkers(intentDir)
	assert.strictEqual(
		store.markers.length,
		1,
		"no markers should be removed on empty input",
	)
})

await test("removeMarkersSync no-op when no path matches", () => {
	const intentDir = makeDir("remove-sync-nomatch")
	const open = makeMarker({
		path: "stages/design/artifacts/exists.html",
		cleared_at: null,
		created_by_assessment_id: "AS-Y",
	})
	writeMarkersSync(intentDir, { markers: [open] })

	removeMarkersSync(intentDir, ["stages/design/artifacts/missing.html"])

	const store = readMarkers(intentDir)
	assert.strictEqual(
		store.markers.length,
		1,
		"non-matching path should leave store unchanged",
	)
})

await test("removeMarkersSync preserves closed markers for the same path", () => {
	const intentDir = makeDir("remove-sync-closed")
	const path = "stages/design/artifacts/hero.html"
	const openM = makeMarker({
		path,
		cleared_at: null,
		created_by_assessment_id: "AS-OPEN",
	})
	const closedM = makeMarker({
		path,
		cleared_at: "2026-04-28T11:00:00Z",
		resolved_sha: "m".repeat(64),
		created_by_assessment_id: "AS-CLOSED",
	})
	writeMarkersSync(intentDir, { markers: [openM, closedM] })

	removeMarkersSync(intentDir, [path])

	const store = readMarkers(intentDir)
	const open = store.markers.filter((m) => m.cleared_at === null)
	const closed = store.markers.filter((m) => m.cleared_at !== null)
	assert.strictEqual(open.length, 0, "open marker should be removed")
	assert.strictEqual(closed.length, 1, "closed marker should be preserved")
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

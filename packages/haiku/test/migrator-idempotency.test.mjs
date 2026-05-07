#!/usr/bin/env npx tsx
// migrator-idempotency.test.mjs — The v0→v4 migrator must be safe to
// re-run. The forward migration is covered by
// `v0-to-v4-migrator.test.mjs`; this file verifies that re-running the
// migrator never re-stamps timestamps, never adds fields, never toggles
// values, and that already-v4 intents are left untouched even when they
// sit alongside legacy ones in the same `.haiku/intents/` dir.
//
// Coverage:
//   1. legacy intent migrated twice → byte-identical files on second run
//   2. fresh v4 intent run through migrator → no changes
//   3. mixed-version intent dir → only legacy intents touched

import assert from "node:assert"
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import matter from "gray-matter"

// ── Fixture builders ─────────────────────────────────────────────────

function makeV3IntentDir(root, slug = "legacy-intent") {
	const intentDir = join(root, ".haiku", "intents", slug)
	mkdirSync(intentDir, { recursive: true })
	mkdirSync(join(intentDir, "stages", "design", "units"), { recursive: true })
	mkdirSync(join(intentDir, "stages", "design", "feedback"), {
		recursive: true,
	})

	writeFileSync(
		join(intentDir, "intent.md"),
		matter.stringify("# legacy\n", {
			title: "legacy",
			studio: "software",
			mode: "continuous",
			active_stage: "design",
			phase: "execute",
			status: "active",
			composite: false,
			intent_reviewed: true,
			gate_review_session_id: "abc123",
		}),
	)

	writeFileSync(
		join(intentDir, "stages", "design", "units", "unit-01-foo.md"),
		matter.stringify("# unit-01-foo\n", {
			title: "foo",
			status: "completed",
			hat: "verifier",
			bolt: 2,
			hat_started_at: "2026-04-01T00:00:00Z",
			completed_at: "2026-04-01T01:00:00Z",
			scope_reject_attempts: 0,
			outputs: ["stages/design/foo.md"],
			iterations: [
				{
					hat: "researcher",
					started_at: "2026-04-01T00:00:00Z",
					completed_at: "2026-04-01T00:10:00Z",
					result: "advance",
				},
			],
		}),
	)

	writeFileSync(
		join(intentDir, "stages", "design", "feedback", "01-test-fb.md"),
		matter.stringify("test fb body\n", {
			title: "test fb",
			origin: "user-chat",
			author: "user",
			status: "closed",
			bolt: 1,
			triaged_at: "2026-04-01T00:30:00Z",
			closed_by: "unit-01-foo",
			resolution: "inline_fix",
			created_at: "2026-04-01T00:00:00Z",
		}),
	)

	return intentDir
}

function makeV4IntentDir(root, slug = "v4-native") {
	const intentDir = join(root, ".haiku", "intents", slug)
	mkdirSync(intentDir, { recursive: true })
	mkdirSync(join(intentDir, "stages", "design", "units"), { recursive: true })
	mkdirSync(join(intentDir, "stages", "design", "feedback"), {
		recursive: true,
	})

	writeFileSync(
		join(intentDir, "intent.md"),
		matter.stringify("# v4 native\n", {
			title: "v4 native",
			studio: "software",
			mode: "continuous",
			plugin_version: "4.0.0",
			started_at: "2026-05-01T00:00:00Z",
			approvals: {},
			sealed_at: null,
		}),
	)

	writeFileSync(
		join(intentDir, "stages", "design", "units", "unit-01-bar.md"),
		matter.stringify("# unit-01-bar\n", {
			title: "bar",
			started_at: "2026-05-01T00:00:00Z",
			depends_on: [],
			iterations: [
				{
					hat: "planner",
					started_at: "2026-05-01T00:00:00Z",
					completed_at: "2026-05-01T00:05:00Z",
					result: "advance",
				},
			],
			reviews: { spec: { at: "2026-05-01T00:10:00Z" } },
			approvals: { user: { at: "2026-05-01T00:20:00Z" } },
			discovery: {},
		}),
	)

	writeFileSync(
		join(intentDir, "stages", "design", "feedback", "01-v4-fb.md"),
		matter.stringify("v4 fb body\n", {
			title: "v4 fb",
			origin: "user-chat",
			author: "user",
			author_type: "human",
			created_at: "2026-05-01T00:30:00Z",
			source_ref: null,
			targets: { unit: null, invalidates: [] },
			iterations: [],
			closed_at: null,
		}),
	)

	return intentDir
}

// ── Snapshot helpers ─────────────────────────────────────────────────

/**
 * Walk an intent dir and return a sorted list of [relative-path,
 * file-content] pairs. Used to compare two migration runs byte-for-byte
 * — if any file's content (or its presence in the dir tree) differs,
 * the snapshot diverges.
 */
function snapshotIntent(intentDir) {
	const entries = []
	function walk(dir, rel) {
		for (const name of readdirSync(dir).sort()) {
			const abs = join(dir, name)
			const next = rel ? `${rel}/${name}` : name
			const st = statSync(abs)
			if (st.isDirectory()) {
				walk(abs, next)
			} else {
				entries.push([next, readFileSync(abs, "utf8")])
			}
		}
	}
	walk(intentDir, "")
	return entries
}

function assertSnapshotsEqual(a, b, msg) {
	const aMap = new Map(a)
	const bMap = new Map(b)
	const aKeys = [...aMap.keys()].sort()
	const bKeys = [...bMap.keys()].sort()
	assert.deepStrictEqual(
		aKeys,
		bKeys,
		`${msg}: file set diverged (a=${JSON.stringify(aKeys)}, b=${JSON.stringify(bKeys)})`,
	)
	for (const k of aKeys) {
		assert.strictEqual(
			aMap.get(k),
			bMap.get(k),
			`${msg}: file '${k}' content differs after re-run`,
		)
	}
}

// ── Tests ────────────────────────────────────────────────────────────

test("migrator: re-running on already-migrated v3 intent is a no-op (byte-identical)", async () => {
	const root = mkdtempSync(join(tmpdir(), "haiku-mig-idem-"))
	try {
		const intentDir = makeV3IntentDir(root)
		const { __testOnly } = await import(
			"../src/orchestrator/migrations/v0-to-v4.js"
		)
		// First run — performs the actual migration.
		__testOnly.v0ToV4({ intentDir, repoRoot: root })
		const afterFirst = snapshotIntent(intentDir)
		// Second run — must be a no-op. No re-stamped timestamps, no
		// fields toggled, no fields added.
		__testOnly.v0ToV4({ intentDir, repoRoot: root })
		const afterSecond = snapshotIntent(intentDir)
		assertSnapshotsEqual(afterFirst, afterSecond, "second run drift")
		// And a third run, just to be sure.
		__testOnly.v0ToV4({ intentDir, repoRoot: root })
		const afterThird = snapshotIntent(intentDir)
		assertSnapshotsEqual(afterFirst, afterThird, "third run drift")
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

test("migrator: re-running on a fresh v4-native intent leaves every file untouched", async () => {
	const root = mkdtempSync(join(tmpdir(), "haiku-mig-v4-"))
	try {
		const intentDir = makeV4IntentDir(root)
		const before = snapshotIntent(intentDir)
		const { __testOnly } = await import(
			"../src/orchestrator/migrations/v0-to-v4.js"
		)
		__testOnly.v0ToV4({ intentDir, repoRoot: root })
		const after = snapshotIntent(intentDir)
		assertSnapshotsEqual(before, after, "v4-native should be untouched")
		// Sanity: plugin_version is still 4.0.0 and the FB still has its
		// v4 shape (closed_at, targets present).
		const intentFm = matter(
			readFileSync(join(intentDir, "intent.md"), "utf8"),
		).data
		assert.strictEqual(intentFm.plugin_version, "4.0.0")
		assert.strictEqual(intentFm.sealed_at, null)
		const fbFm = matter(
			readFileSync(
				join(intentDir, "stages", "design", "feedback", "01-v4-fb.md"),
				"utf8",
			),
		).data
		assert.deepStrictEqual(fbFm.targets, { unit: null, invalidates: [] })
		assert.strictEqual(fbFm.closed_at, null)
		assert.strictEqual(fbFm.status, undefined)
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

test("migrator: mixed-version intents — legacy migrates, v4 untouched in same .haiku/intents/", async () => {
	const root = mkdtempSync(join(tmpdir(), "haiku-mig-mixed-"))
	try {
		const legacyDir = makeV3IntentDir(root, "legacy-one")
		const v4Dir = makeV4IntentDir(root, "v4-one")

		const { __testOnly } = await import(
			"../src/orchestrator/migrations/v0-to-v4.js"
		)

		// Snapshot the v4 intent BEFORE we touch anything.
		const v4Before = snapshotIntent(v4Dir)

		// Migrate ONLY the legacy intent. The migrator is per-intent
		// (callers walk `.haiku/intents/` themselves and invoke
		// migrateIntent slug-by-slug). Running it on the legacy intent
		// must not reach into the v4 intent's directory tree.
		__testOnly.v0ToV4({ intentDir: legacyDir, repoRoot: root })

		// v4 intent is byte-identical post-migration.
		const v4After = snapshotIntent(v4Dir)
		assertSnapshotsEqual(
			v4Before,
			v4After,
			"v4 intent must be untouched when its sibling migrates",
		)

		// Legacy intent is now in v4 shape.
		const legacyFm = matter(
			readFileSync(join(legacyDir, "intent.md"), "utf8"),
		).data
		assert.strictEqual(legacyFm.plugin_version, "4.0.0")
		assert.strictEqual(legacyFm.active_stage, undefined)
		assert.strictEqual(legacyFm.phase, undefined)
		assert.strictEqual(legacyFm.status, undefined)

		// Now run the migrator a second time on the legacy intent —
		// re-runs are a no-op even when v4 intents share the dir.
		const legacyAfterFirst = snapshotIntent(legacyDir)
		__testOnly.v0ToV4({ intentDir: legacyDir, repoRoot: root })
		const legacyAfterSecond = snapshotIntent(legacyDir)
		assertSnapshotsEqual(
			legacyAfterFirst,
			legacyAfterSecond,
			"legacy re-run must be a no-op even with v4 sibling",
		)

		// And explicitly running the migrator on the v4 intent itself
		// is still a no-op.
		__testOnly.v0ToV4({ intentDir: v4Dir, repoRoot: root })
		const v4AfterDirectRun = snapshotIntent(v4Dir)
		assertSnapshotsEqual(
			v4Before,
			v4AfterDirectRun,
			"direct-run on v4 intent must be a no-op",
		)
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

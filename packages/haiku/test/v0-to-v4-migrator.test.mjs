#!/usr/bin/env npx tsx
// v0-to-v4-migrator.test.mjs — Verify the soft-scrub migrator
// transforms a pre-v4 intent's frontmatter into the v4 shape.
//
// Coverage:
//   1. intent.md: deprecated fields stripped, plugin_version stamped,
//      approvals seeded, sealed_at initialized
//   2. unit.md: status/hat/bolt/hat_started_at/scope_reject_attempts
//      stripped; iterations[] preserved if present; approvals.user
//      synthesized when old `status: completed` was set, with
//      `migrated: true` breadcrumb
//   3. feedback.md: status/bolt/triaged_at/closed_by/resolution
//      stripped; closed_at synthesized for terminal-status FBs;
//      targets default to { unit: null, invalidates: [] }
//   4. state.json files deleted

import assert from "node:assert"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import matter from "gray-matter"

function makeV3IntentDir() {
	const root = mkdtempSync(join(tmpdir(), "haiku-v0-to-v4-"))
	const intentDir = join(root, ".haiku", "intents", "test-intent")
	mkdirSync(intentDir, { recursive: true })
	mkdirSync(join(intentDir, "stages", "design", "units"), { recursive: true })
	mkdirSync(join(intentDir, "stages", "design", "feedback"), { recursive: true })

	// Pre-v4 intent.md
	writeFileSync(
		join(intentDir, "intent.md"),
		matter.stringify("# test\n", {
			title: "test",
			studio: "software",
			mode: "continuous",
			active_stage: "design",
			phase: "execute",
			status: "active",
			completion_review_dispatched: false,
			composite: false,
			intent_reviewed: true,
			gate_review_session_id: "abc123",
		}),
	)

	// Pre-v4 completed unit
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
				{ hat: "researcher", started_at: "2026-04-01T00:00:00Z", completed_at: "2026-04-01T00:10:00Z", result: "advance" },
				{ hat: "distiller", started_at: "2026-04-01T00:10:00Z", completed_at: "2026-04-01T00:20:00Z", result: "advance" },
				{ hat: "verifier", started_at: "2026-04-01T00:20:00Z", completed_at: "2026-04-01T01:00:00Z", result: "advance" },
			],
		}),
	)

	// Pre-v4 closed feedback
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

	// Pre-v4 stage state.json (should be deleted post-migration)
	writeFileSync(
		join(intentDir, "stages", "design", "state.json"),
		JSON.stringify({ phase: "execute", status: "active" }),
	)

	return { root, intentDir }
}

function readFm(path) {
	return matter(readFileSync(path, "utf8")).data
}

test("migrator strips deprecated intent.md fields and stamps plugin_version", async () => {
	const { root, intentDir } = makeV3IntentDir()
	try {
		const { __testOnly } = await import(
			"../src/orchestrator/migrations/v0-to-v4.js"
		)
		__testOnly.v0ToV4({ intentDir, repoRoot: root })

		const fm = readFm(join(intentDir, "intent.md"))
		assert.strictEqual(fm.plugin_version, "4.0.0")
		assert.strictEqual(fm.active_stage, undefined)
		assert.strictEqual(fm.phase, undefined)
		assert.strictEqual(fm.status, undefined)
		assert.strictEqual(fm.composite, undefined)
		assert.strictEqual(fm.intent_reviewed, undefined)
		assert.strictEqual(fm.gate_review_session_id, undefined)
		assert.strictEqual(fm.completion_review_dispatched, undefined)
		assert.deepStrictEqual(fm.approvals, {})
		assert.strictEqual(fm.sealed_at, null)
		// Preserved
		assert.strictEqual(fm.title, "test")
		assert.strictEqual(fm.studio, "software")
		assert.strictEqual(fm.mode, "continuous")
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

test("migrator synthesizes approvals.user with migrated:true on old completed units", async () => {
	const { root, intentDir } = makeV3IntentDir()
	try {
		const { __testOnly } = await import(
			"../src/orchestrator/migrations/v0-to-v4.js"
		)
		__testOnly.v0ToV4({ intentDir, repoRoot: root })

		const fm = readFm(
			join(intentDir, "stages", "design", "units", "unit-01-foo.md"),
		)
		assert.strictEqual(fm.status, undefined)
		assert.strictEqual(fm.hat, undefined)
		assert.strictEqual(fm.bolt, undefined)
		assert.strictEqual(fm.hat_started_at, undefined)
		assert.strictEqual(fm.completed_at, undefined)
		assert.strictEqual(fm.scope_reject_attempts, undefined)
		// iterations[] preserved
		assert.strictEqual(Array.isArray(fm.iterations), true)
		assert.strictEqual(fm.iterations.length, 3)
		// approvals.user synthesized with migrated:true
		assert.ok(fm.approvals?.user)
		assert.strictEqual(fm.approvals.user.migrated, true)
		assert.ok(typeof fm.approvals.user.at === "string")
		// outputs preserved
		assert.deepStrictEqual(fm.outputs, ["stages/design/foo.md"])
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

test("migrator synthesizes closed_at on terminal-status FBs and clears v3 fields", async () => {
	const { root, intentDir } = makeV3IntentDir()
	try {
		const { __testOnly } = await import(
			"../src/orchestrator/migrations/v0-to-v4.js"
		)
		__testOnly.v0ToV4({ intentDir, repoRoot: root })

		const fm = readFm(
			join(intentDir, "stages", "design", "feedback", "01-test-fb.md"),
		)
		assert.strictEqual(fm.status, undefined)
		assert.strictEqual(fm.bolt, undefined)
		assert.strictEqual(fm.triaged_at, undefined)
		assert.strictEqual(fm.closed_by, undefined)
		assert.strictEqual(fm.resolution, undefined)
		// closed_at synthesized
		assert.ok(typeof fm.closed_at === "string")
		// targets default
		assert.deepStrictEqual(fm.targets, { unit: null, invalidates: [] })
		// preserved
		assert.strictEqual(fm.title, "test fb")
		assert.strictEqual(fm.origin, "user-chat")
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

test("migrator deletes per-stage state.json files", async () => {
	const { root, intentDir } = makeV3IntentDir()
	try {
		const stateJsonPath = join(intentDir, "stages", "design", "state.json")
		assert.strictEqual(existsSync(stateJsonPath), true)
		const { __testOnly } = await import(
			"../src/orchestrator/migrations/v0-to-v4.js"
		)
		__testOnly.v0ToV4({ intentDir, repoRoot: root })
		assert.strictEqual(existsSync(stateJsonPath), false)
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

test("migrator deletes pre-v4 baseline noise (baseline.json, drift-markers.json, baseline-content/) at every scope", async () => {
	const { root, intentDir } = makeV3IntentDir()
	try {
		// Seed legacy artifacts at intent scope.
		writeFileSync(
			join(intentDir, "baseline.json"),
			JSON.stringify({ entries: [] }),
		)
		writeFileSync(
			join(intentDir, "drift-markers.json"),
			JSON.stringify({ pending: [] }),
		)
		mkdirSync(join(intentDir, "baseline-content"), { recursive: true })
		writeFileSync(
			join(intentDir, "baseline-content", "snap.txt"),
			"old snapshot",
		)

		// And at stage scope.
		writeFileSync(
			join(intentDir, "stages", "design", "baseline.json"),
			JSON.stringify({ entries: [] }),
		)
		writeFileSync(
			join(intentDir, "stages", "design", "drift-markers.json"),
			JSON.stringify({ pending: [] }),
		)
		mkdirSync(join(intentDir, "stages", "design", "baseline-content"), {
			recursive: true,
		})
		writeFileSync(
			join(intentDir, "stages", "design", "baseline-content", "snap.txt"),
			"old stage snapshot",
		)

		const { __testOnly } = await import(
			"../src/orchestrator/migrations/v0-to-v4.js"
		)
		__testOnly.v0ToV4({ intentDir, repoRoot: root })

		// Intent scope.
		assert.strictEqual(existsSync(join(intentDir, "baseline.json")), false)
		assert.strictEqual(
			existsSync(join(intentDir, "drift-markers.json")),
			false,
		)
		assert.strictEqual(
			existsSync(join(intentDir, "baseline-content")),
			false,
		)

		// Stage scope.
		assert.strictEqual(
			existsSync(join(intentDir, "stages", "design", "baseline.json")),
			false,
		)
		assert.strictEqual(
			existsSync(join(intentDir, "stages", "design", "drift-markers.json")),
			false,
		)
		assert.strictEqual(
			existsSync(join(intentDir, "stages", "design", "baseline-content")),
			false,
		)
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

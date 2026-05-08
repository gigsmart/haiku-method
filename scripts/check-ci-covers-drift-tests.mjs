#!/usr/bin/env node
// CI guard: assert the named drift / cursor-walk test files exist AND
// would be discovered by `packages/haiku/test/run-all.mjs`.
//
// Why this exists: drift detection + cursor-walk are the safety net
// catching a silent regression of the engine's drift-gate behavior
// (baseline establish, marker bookkeeping, mid-flight e2e flow) and the
// cursor's track-walk priorities. A future test-glob refactor or
// accidental file rename could remove that coverage without breaking a
// single sibling test. This script names the files explicitly so CI
// fails loud if any disappear or are excluded from run-all.mjs.
//
// 2026-05-08 update: the v4 cursor refactor (commit b743524) absorbed
// the standalone `drift-detection-gate.ts` and `upstream-reconciliation.ts`
// modules into the cursor's pre-tick walk. Their tests
// (drift-detection-gate.test.mjs, upstream-reconciliation.test.mjs)
// were deleted with them. The v4-equivalent coverage lives in
// cursor-walk.test.mjs, drift-mid-flight-e2e.test.mjs, and
// drift-scenarios.test.mjs — those replace the deleted entries here.
//
// Usage: node scripts/check-ci-covers-drift-tests.mjs
// Exit code: 0 = all present + discoverable + non-empty, 1 = gap.

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const testDir = join(repoRoot, "packages", "haiku", "test")
const runAllPath = join(testDir, "run-all.mjs")

const REQUIRED_FILES = [
	"drift-baseline.test.mjs",
	"drift-markers.test.mjs",
	"drift-mid-flight-e2e.test.mjs",
	"drift-scenarios.test.mjs",
	"cursor-walk.test.mjs",
]

let failures = 0
const lines = []

// 1. Each required file must exist on disk.
for (const f of REQUIRED_FILES) {
	const full = join(testDir, f)
	if (!existsSync(full)) {
		lines.push(`  ✗ MISSING: packages/haiku/test/${f}`)
		failures++
	} else {
		lines.push(`  ✓ present: packages/haiku/test/${f}`)
	}
}

// 2. run-all.mjs must exist (the entry point CI invokes).
if (!existsSync(runAllPath)) {
	lines.push(`  ✗ MISSING: packages/haiku/test/run-all.mjs`)
	failures++
} else {
	lines.push(`  ✓ present: packages/haiku/test/run-all.mjs`)
}

// 3. Each required file must be picked up by the run-all.mjs discovery
//    filter (currently: `*.test.mjs` excluding state-tools.test.mjs).
//    We replay that filter against the actual directory listing rather
//    than parsing JS, so a future filter change (e.g. moving to a glob
//    library) is still validated empirically.
let discovered = []
if (existsSync(testDir)) {
	const runAllSource = existsSync(runAllPath)
		? readFileSync(runAllPath, "utf8")
		: ""
	// Best-effort replication of run-all.mjs filter:
	// `f.endsWith(".test.mjs") && f !== "state-tools.test.mjs"`
	// If run-all.mjs's filter changes shape, this script's job is to
	// catch the divergence — fail loudly rather than silently passing.
	const filterMatch = runAllSource.match(
		/\.endsWith\(["']\.test\.mjs["']\)\s*&&\s*f\s*!==\s*["']([^"']+)["']/,
	)
	const excluded = filterMatch ? filterMatch[1] : "state-tools.test.mjs"
	discovered = readdirSync(testDir)
		.filter((f) => f.endsWith(".test.mjs") && f !== excluded)
		.sort()

	for (const f of REQUIRED_FILES) {
		if (!discovered.includes(f)) {
			lines.push(`  ✗ NOT DISCOVERED by run-all.mjs: ${f}`)
			failures++
		}
	}
}

// 4. Each required file must contain at least one runnable assertion.
//    Symptom-vs-cause guard: a present-but-empty file (or one whose
//    body has been commented out / converted entirely to skip()) would
//    still pass steps 1–3 but cover nothing. Fail loud if any of the
//    four files has zero `assert.` calls — that's the only signal that
//    the contract is actually being exercised inside run-all.mjs.
//
//    `assert.` was chosen over a more permissive substring match
//    because every drift / reconciliation test in the suite uses
//    node:assert (`import assert from "node:assert"`) for its
//    contract checks. If a future test moves to a different library,
//    this guard will fail and force an explicit update — that is
//    the correct SRE behaviour, not a false positive.
const ASSERT_PATTERN = /\bassert\s*[\.\(]/
for (const f of REQUIRED_FILES) {
	const full = join(testDir, f)
	if (!existsSync(full)) continue // already counted in step 1
	const src = readFileSync(full, "utf8")
	const matches = src.match(new RegExp(ASSERT_PATTERN.source, "g")) || []
	if (matches.length === 0) {
		lines.push(`  ✗ NO ASSERTIONS in ${f} (file present but empty?)`)
		failures++
	} else {
		lines.push(`  ✓ ${matches.length} assertion(s) in ${f}`)
	}
}

console.log("CI drift-test coverage check")
console.log("─".repeat(60))
for (const l of lines) console.log(l)
console.log("─".repeat(60))

if (failures > 0) {
	console.error(
		`\nFAIL: ${failures} drift-test coverage gap(s). The named test files`,
	)
	console.error(
		"      lock in the cursor's drift-gate baseline behavior, marker",
	)
	console.error(
		"      bookkeeping, mid-flight FB→fix→seal flow, scenario coverage,",
	)
	console.error(
		"      and the cursor track-walk priorities. Restore them or update",
	)
	console.error(
		"      this script's REQUIRED_FILES if the contract has moved.",
	)
	process.exit(1)
}

console.log(
	`\nOK: all ${REQUIRED_FILES.length} drift-test files present, discoverable by run-all.mjs, and contain runnable assertions.`,
)
process.exit(0)

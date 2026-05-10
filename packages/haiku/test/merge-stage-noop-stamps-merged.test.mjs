#!/usr/bin/env npx tsx
// merge-stage-noop-stamps-merged.test.mjs — Regression for the
// while-loop spin called out in the PR #332 review.
//
// Scenario: `mergeStageBranchIntoMain` returns a no-op success when
// the source branch is missing locally and on origin (Bug D's recovery
// path). Without this test's contract, the haiku_run_next while-loop
// would re-call `dispatchOrchestratorAction`, get the same `merge_stage`
// action back, call the merge function again, etc — spinning forever
// within a single tool invocation.
//
// The contract this test pins:
//   1. The merge function flags no-op success with `noop: true` so
//      callers can detect the case without string-matching the message.
//   2. Calling code (haiku_run_next) re-ticks after a no-op; the
//      cursor walks past via unit files already on intent main from
//      the original v3 merge (or, in fs mode, via per-unit signature
//      state). No `stages_merged` stamp needed — the field is dead in
//      v4. Tested via a direct cursor walk after writing the units to
//      intent main's view.

import assert from "node:assert"
import { execFileSync } from "node:child_process"
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { test } from "node:test"
import matter from "gray-matter"

import { mergeStageBranchIntoMain } from "../src/git-worktree.ts"
import { firstUnmergedStage } from "../src/orchestrator/workflow/cursor.ts"
import { _resetIsGitRepoForTests } from "../src/state-tools.ts"

const COMMITTER_DATE = "2026-05-08T12:00:00+00:00"
const GIT_ENV = {
	...process.env,
	GIT_COMMITTER_DATE: COMMITTER_DATE,
	GIT_AUTHOR_DATE: COMMITTER_DATE,
}

function git(cwd, ...args) {
	return execFileSync("git", args, {
		cwd,
		encoding: "utf8",
		env: GIT_ENV,
		stdio: ["ignore", "pipe", "pipe"],
	}).trim()
}

function findRepoRoot() {
	let dir = resolve(import.meta.dirname ?? __dirname)
	while (dir !== "/") {
		if (existsSync(join(dir, "plugin", "studios", "software"))) return dir
		dir = resolve(dir, "..")
	}
	throw new Error("could not find repo root")
}
const PLUGIN_ROOT = join(findRepoRoot(), "plugin")

/**
 * Build a repo where:
 *   - intent main exists (haiku/<slug>/main)
 *   - stage branches DO NOT exist (v3 merged-and-deleted them)
 *   - intent.md has plugin_version=4.0.0 but NO stages_merged stamp
 *     (the migrator's step 5 failed silently, or the intent was never
 *     v3 in the first place but the user pointed at a missing branch
 *     manually)
 *
 * Without the no-op stamping in haiku_run_next:
 *   - mergeStageBranchIntoMain returns success (noop)
 *   - dispatchOrchestratorAction re-derives position
 *   - firstUnmergedStage sees: no unit files on intent main for this
 *     stage (neither the v3 stages_merged stamp nor a stage branch
 *     exists) → returns the same stage
 *   - while-loop calls merge again → spin
 */
function setupSpinTrap(slug) {
	const tmp = mkdtempSync(join(tmpdir(), "haiku-spin-"))
	git(tmp, "init", "--initial-branch=main")
	git(tmp, "config", "user.email", "test@haiku")
	git(tmp, "config", "user.name", "haiku-test")
	git(tmp, "config", "commit.gpgsign", "false")
	git(tmp, "config", "tag.gpgsign", "false")
	writeFileSync(join(tmp, "README.md"), "# spin trap\n")
	git(tmp, "add", "-A")
	git(tmp, "commit", "-m", "initial")
	git(tmp, "branch", `haiku/${slug}/main`, "main")

	// intent.md: v4-stamped, but NO stages_merged.
	const intentDir = join(tmp, ".haiku", "intents", slug)
	mkdirSync(intentDir, { recursive: true })
	writeFileSync(
		join(intentDir, "intent.md"),
		matter.stringify("# spin trap\n", {
			title: "spin trap",
			studio: "software",
			mode: "continuous",
			plugin_version: "4.0.0",
		}),
	)

	return { tmp, intentDir }
}

const origCwd = process.cwd()
function restoreCwd() {
	try {
		process.chdir(origCwd)
	} catch {
		process.chdir(tmpdir())
	}
	_resetIsGitRepoForTests()
}

// ── Tests ─────────────────────────────────────────────────────────────────

test("missing-source-branch merge returns noop=true (caller signal)", () => {
	_resetIsGitRepoForTests()
	const slug = "spin-noop-flag"
	const { tmp } = setupSpinTrap(slug)
	const origPluginRoot = process.env.CLAUDE_PLUGIN_ROOT
	process.env.CLAUDE_PLUGIN_ROOT = PLUGIN_ROOT
	try {
		process.chdir(tmp)
		const result = mergeStageBranchIntoMain(slug, "inception")
		assert.strictEqual(result.success, true)
		assert.strictEqual(
			result.noop,
			true,
			"missing-branch path must signal noop=true so callers can advance the cursor (write the stage's unit files onto intent main under the disk-state model)",
		)
	} finally {
		restoreCwd()
		if (origPluginRoot === undefined) {
			delete process.env.CLAUDE_PLUGIN_ROOT
		} else {
			process.env.CLAUDE_PLUGIN_ROOT = origPluginRoot
		}
		rmSync(tmp, { recursive: true, force: true })
	}
})

test("after the noop'd stage's unit files land on intent main, firstUnmergedStage advances past it", () => {
	_resetIsGitRepoForTests()
	const slug = "spin-after-stamp"
	const { tmp, intentDir } = setupSpinTrap(slug)
	const origPluginRoot = process.env.CLAUDE_PLUGIN_ROOT
	process.env.CLAUDE_PLUGIN_ROOT = PLUGIN_ROOT
	try {
		process.chdir(tmp)
		// Pre-condition: cursor sees inception as unmerged (branch missing,
		// no unit files on intent main for this stage) — this is what
		// the spin would loop on.
		const before = firstUnmergedStage(slug, "software")
		assert.strictEqual(
			before,
			"inception",
			`pre-stamp the cursor must pin to inception (the spin trap), got: ${before}`,
		)

		// Simulate haiku_run_next's noop-handling under the new
		// disk-state cursor model: instead of stamping `stages_merged`
		// (deprecated), write the inception stage's content onto
		// intent main. The disk presence of the stage's units IS the
		// "merged" signal.
		const inceptionUnits = join(intentDir, "stages", "inception", "units")
		mkdirSync(inceptionUnits, { recursive: true })
		writeFileSync(
			join(inceptionUnits, "unit-01-merged.md"),
			matter.stringify("# merged\n", {
				title: "merged",
				started_at: new Date().toISOString(),
			}),
		)

		// Post-write: cursor must advance to the next unmerged stage.
		const after = firstUnmergedStage(slug, "software")
		assert.notStrictEqual(
			after,
			"inception",
			`post-stamp the cursor must advance past inception (or the loop spins), got: ${after}`,
		)
	} finally {
		restoreCwd()
		if (origPluginRoot === undefined) {
			delete process.env.CLAUDE_PLUGIN_ROOT
		} else {
			process.env.CLAUDE_PLUGIN_ROOT = origPluginRoot
		}
		rmSync(tmp, { recursive: true, force: true })
	}
})

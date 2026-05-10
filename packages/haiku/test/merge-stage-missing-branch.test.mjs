#!/usr/bin/env npx tsx
// merge-stage-missing-branch.test.mjs — Coverage for the "v3
// merged-and-deleted stage branch" recovery in `firstUnmergedStage`
// (cursor.ts) and `mergeStageBranchIntoMain` (git-worktree.ts).
//
// In v3, the workflow merged stage branches into intent main and
// deleted them. Migrated v3→v4 intents reach v4 with branch names that
// no longer exist locally or on origin. The v4 cursor reads unit files
// on intent main as the merged signal — when the migrator landed those
// units on main during v3, `firstUnmergedStage` walks past the stage
// naturally. The risk path: a caller dispatches `merge_stage` directly
// against the missing branch — without the recovery, merge fails and
// the engine loops on `merge_stage` every tick.
//
// Two tests:
//   1. `firstUnmergedStage` skips stages whose branch is missing.
//   2. `mergeStageBranchIntoMain` returns success (not throw) when the
//      source stage branch is missing locally and on origin.

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

// `firstUnmergedStage` reads the studio config to know the stage
// order. The lookup walks `process.cwd()/.haiku/studios/` first, then
// `<plugin-root>/studios/` (via CLAUDE_PLUGIN_ROOT). Tests run in a
// tmp dir, so we point the plugin-root resolver at the real plugin/
// directory in this repo.
function findRepoRoot() {
	let dir = resolve(import.meta.dirname ?? __dirname)
	while (dir !== "/") {
		if (existsSync(join(dir, "plugin", "studios", "software"))) return dir
		dir = resolve(dir, "..")
	}
	throw new Error("could not find repo root with plugin/studios/software/")
}
const REPO_ROOT = findRepoRoot()
const PLUGIN_ROOT = join(REPO_ROOT, "plugin")

// ── Pinned dates so commit shas are stable across runs ────────────────────

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

/**
 * Build a repo simulating a v3-migrated intent on the `software`
 * studio. Inception and design were merged-and-deleted in v3 (their
 * branches don't exist); product is the active stage with its branch.
 *
 * Layout:
 *   - intent main: contains every prior stage's work (squash-merged)
 *   - haiku/<slug>/inception: DELETED
 *   - haiku/<slug>/design: DELETED
 *   - haiku/<slug>/product: exists, ahead of main
 */
function setupMigratedRepo(slug) {
	const tmp = mkdtempSync(join(tmpdir(), "haiku-mig-"))
	git(tmp, "init", "--initial-branch=main")
	git(tmp, "config", "user.email", "test@haiku")
	git(tmp, "config", "user.name", "haiku-test")
	git(tmp, "config", "commit.gpgsign", "false")
	git(tmp, "config", "tag.gpgsign", "false")
	writeFileSync(join(tmp, "README.md"), "# migrated v3\n")
	git(tmp, "add", "-A")
	git(tmp, "commit", "-m", "initial")

	// Intent main carries v3's collected work.
	git(tmp, "branch", `haiku/${slug}/main`, "main")
	git(tmp, "checkout", `haiku/${slug}/main`)
	writeFileSync(join(tmp, "inception-output.md"), "inception work\n")
	git(tmp, "add", "-A")
	git(tmp, "commit", "-m", "v3: merged inception into main, deleted branch")
	writeFileSync(join(tmp, "design-output.md"), "design work\n")
	git(tmp, "add", "-A")
	git(tmp, "commit", "-m", "v3: merged design into main, deleted branch")

	// Product is the active stage in v3, branch survived migration.
	git(tmp, "branch", `haiku/${slug}/product`, `haiku/${slug}/main`)
	git(tmp, "checkout", `haiku/${slug}/product`)
	writeFileSync(join(tmp, "product-wip.md"), "in-progress product work\n")
	git(tmp, "add", "-A")
	git(tmp, "commit", "-m", "wip: product stage")

	// Confirm the deleted-branch shape.
	const inceptionExists = (() => {
		try {
			git(tmp, "rev-parse", "--verify", `haiku/${slug}/inception`)
			return true
		} catch {
			return false
		}
	})()
	assert.strictEqual(
		inceptionExists,
		false,
		"precondition: haiku/<slug>/inception should not exist",
	)

	// Write intent.md + simulate "merged" stages by writing per-stage
	// unit files into the intent dir on intent main. Under the new
	// disk-state cursor model, intent main's filesystem IS the
	// "merged stages" signal — `firstUnmergedStage` walks
	// `stages/<X>/units/` and returns the first stage with no units.
	// Inception and design get unit files (they're merged); product
	// stays empty (the cursor should pin there).
	git(tmp, "checkout", `haiku/${slug}/main`)
	const intentDir = join(tmp, ".haiku", "intents", slug)
	mkdirSync(intentDir, { recursive: true })
	writeFileSync(
		join(intentDir, "intent.md"),
		matter.stringify("# migrated v3 intent\n", {
			title: "test migrated",
			studio: "software",
			mode: "continuous",
			plugin_version: "4.0.0",
		}),
	)
	for (const stage of ["inception", "design"]) {
		const unitsDir = join(intentDir, "stages", stage, "units")
		mkdirSync(unitsDir, { recursive: true })
		writeFileSync(
			join(unitsDir, "unit-01-merged.md"),
			matter.stringify("# merged unit\n", {
				title: "merged",
				started_at: new Date().toISOString(),
			}),
		)
	}
	git(tmp, "add", "-A")
	git(
		tmp,
		"commit",
		"-m",
		"v3 migrated: inception+design content on intent main",
	)

	return tmp
}

// ── Test cleanup helper ───────────────────────────────────────────────────

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

test("firstUnmergedStage: missing branches treated as merged (v3 cleanup)", () => {
	_resetIsGitRepoForTests()
	const slug = "mig-test"
	const tmp = setupMigratedRepo(slug)
	const origPluginRoot = process.env.CLAUDE_PLUGIN_ROOT
	process.env.CLAUDE_PLUGIN_ROOT = PLUGIN_ROOT
	try {
		process.chdir(tmp)
		// `software` studio's first stages are inception → design →
		// product (per studios/software/STUDIO.md). Inception and
		// design have no branches; product does. The cursor must
		// skip past the missing branches and pin to product.
		const result = firstUnmergedStage(slug, "software")
		assert.strictEqual(
			result,
			"product",
			`firstUnmergedStage should skip merged-and-deleted branches and return 'product', got: ${result}`,
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

test("mergeStageBranchIntoMain: missing source branch returns success", () => {
	_resetIsGitRepoForTests()
	const slug = "mig-merge"
	const tmp = setupMigratedRepo(slug)
	try {
		process.chdir(tmp)
		// Try to merge inception (which v3 already merged-and-deleted).
		// Pre-fix this would throw on `rev-parse --verify` and bubble
		// up as { success: false, message: <err> }, which the cursor
		// would interpret as "merge still pending" → infinite loop.
		// Post-fix: returns { success: true, message: "...presumed
		// merged-and-deleted..." } so the cursor advances.
		const result = mergeStageBranchIntoMain(slug, "inception")
		assert.strictEqual(
			result.success,
			true,
			`mergeStageBranchIntoMain should succeed when source branch is missing, got: ${JSON.stringify(result)}`,
		)
		assert.match(
			result.message,
			/missing|merged-and-deleted|presumed/,
			"message should explain the recovery path",
		)
	} finally {
		restoreCwd()
		rmSync(tmp, { recursive: true, force: true })
	}
})

#!/usr/bin/env npx tsx
// worktree-lock-guard.test.mjs — P9 (2026-05-06).
//
// Locks in the contract: ensureOnStageBranch refuses to checkout
// branches on a locked worktree. The hijack incident on 2026-05-06
// happened because the worktree wasn't locked AND the engine's branch
// enforcement didn't check; a stray run_next for a different intent
// switched the tree to that intent's branch and overwrote uncommitted
// edits. This test proves the new guard fires.

import assert from "node:assert"
import { execFileSync } from "node:child_process"
import {
	existsSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

const HAS_GIT = (() => {
	try {
		execFileSync("git", ["--version"], { stdio: "ignore" })
		return true
	} catch {
		return false
	}
})()

function git(cwd, ...args) {
	return execFileSync("git", args, {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim()
}

async function withLockedWorktree(fn) {
	const root = mkdtempSync(join(tmpdir(), "haiku-lock-guard-"))
	const orig = process.cwd()
	try {
		git(root, "init", "-q")
		git(root, "config", "user.email", "test@haiku.test")
		git(root, "config", "user.name", "haiku test")
		git(root, "commit", "--allow-empty", "-q", "-m", "init")
		git(root, "checkout", "-q", "-b", "haiku/test-intent/main")
		// Mark the primary worktree as locked. The lock file path is
		// <git-dir>/locked for the primary repo (vs added worktrees
		// where it's <git-dir>/worktrees/<name>/locked).
		const gitDir = git(root, "rev-parse", "--git-dir")
		const lockedPath = join(
			gitDir.startsWith("/") ? gitDir : join(root, gitDir),
			"locked",
		)
		writeFileSync(lockedPath, "v4-engine-refactor in flight\n")
		process.chdir(root)
		await fn(root)
	} finally {
		try {
			process.chdir(orig)
		} catch {
			process.chdir(tmpdir())
		}
		rmSync(root, { recursive: true, force: true })
	}
}

test("isCurrentWorktreeLocked reads the lock file", async () => {
	if (!HAS_GIT) return
	await withLockedWorktree(async () => {
		const { isCurrentWorktreeLocked } = await import(
			"../src/git-worktree.ts"
		)
		assert.strictEqual(isCurrentWorktreeLocked(), true)
	})
})

test("ensureOnStageBranch refuses checkout when worktree is locked + branch differs", async () => {
	if (!HAS_GIT) return
	await withLockedWorktree(async (root) => {
		// Create a different intent's branch the engine might try to
		// checkout. Without the lock guard, ensureOnStageBranch would
		// switch onto it (this is the hijack).
		git(root, "branch", "haiku/foreign-intent/main")
		const { ensureOnStageBranch } = await import("../src/git-worktree.ts")
		const result = ensureOnStageBranch("foreign-intent", undefined)
		assert.strictEqual(result.ok, false)
		assert.strictEqual(result.block, "worktree_locked")
		assert.strictEqual(result.target_branch, "haiku/foreign-intent/main")
		// Branch should NOT have been switched.
		const cur = git(root, "rev-parse", "--abbrev-ref", "HEAD")
		assert.strictEqual(cur, "haiku/test-intent/main")
	})
})

test("ensureOnStageBranch on locked worktree but already on target branch is a no-op success", async () => {
	if (!HAS_GIT) return
	await withLockedWorktree(async () => {
		const { ensureOnStageBranch } = await import("../src/git-worktree.ts")
		// Current branch IS haiku/test-intent/main. Asking for that
		// same branch should succeed (no checkout needed).
		const result = ensureOnStageBranch("test-intent", undefined)
		assert.strictEqual(result.ok, true)
		assert.strictEqual(result.switched, false)
	})
})

test("ensureOnStageBranch on UNLOCKED worktree allows checkout (sanity baseline)", async () => {
	if (!HAS_GIT) return
	const root = mkdtempSync(join(tmpdir(), "haiku-unlocked-"))
	const orig = process.cwd()
	try {
		git(root, "init", "-q")
		git(root, "config", "user.email", "test@haiku.test")
		git(root, "config", "user.name", "haiku test")
		git(root, "commit", "--allow-empty", "-q", "-m", "init")
		git(root, "checkout", "-q", "-b", "haiku/foreign/main")
		git(root, "branch", "haiku/test-intent/main")
		process.chdir(root)
		const { ensureOnStageBranch } = await import("../src/git-worktree.ts")
		const result = ensureOnStageBranch("test-intent", undefined)
		// Either ok: true switched or ok: false with a non-locked block.
		// What we're proving is: if it failed, it's NOT because of the
		// lock guard.
		if (!result.ok) {
			assert.notStrictEqual(result.block, "worktree_locked")
		}
	} finally {
		try {
			process.chdir(orig)
		} catch {
			process.chdir(tmpdir())
		}
		rmSync(root, { recursive: true, force: true })
	}
})

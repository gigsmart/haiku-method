#!/usr/bin/env npx tsx
// Worktree-lifecycle tests for fix-chain and discovery isolation worktrees.
// Uses a REAL git repo in a temp dir (not a fake-binary stub) because the
// helpers under test shell out to `git worktree` / `git merge` and need
// actual git semantics — including conflict detection, MERGE_HEAD, and
// branch cleanup.

import assert from "node:assert"
import { execFileSync } from "node:child_process"
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

import {
	cleanupDiscoveryWorktree,
	cleanupFixChainWorktree,
	createDiscoveryWorktree,
	createFixChainWorktree,
	discoveryBranchName,
	discoveryWorktreePath,
	fixChainBranchName,
	fixChainWorktreePath,
	mergeDiscoveryWorktree,
	mergeFixChainWorktree,
} from "../src/git-worktree.ts"
import { _resetIsGitRepoForTests } from "../src/state-tools.ts"

// ── Helpers ────────────────────────────────────────────────────────────────

function git(cwd, ...args) {
	return execFileSync("git", args, { cwd, encoding: "utf8" }).trim()
}

function branchExists(cwd, branch) {
	try {
		git(cwd, "rev-parse", "--verify", "-q", branch)
		return true
	} catch {
		return false
	}
}

function setupRepo(opts = {}) {
	const tmp = mkdtempSync(join(tmpdir(), "haiku-wt-test-"))
	git(tmp, "init", "--initial-branch=main")
	git(tmp, "config", "user.email", "test@haiku")
	git(tmp, "config", "user.name", "haiku-test")
	writeFileSync(join(tmp, "README.md"), "# test\n")
	git(tmp, "add", "-A")
	git(tmp, "commit", "-m", "initial")

	const slug = opts.slug || "test-intent"
	// Branch topology expected by the helpers:
	// haiku/{slug}/main off the repo's initial branch, then stage branches off that.
	git(tmp, "branch", `haiku/${slug}/main`, "main")
	git(tmp, "checkout", `haiku/${slug}/main`)

	// Seed a fake stage-scoped file so merges have something to inspect.
	const intentDir = join(
		tmp,
		".haiku",
		"intents",
		slug,
		"stages",
		opts.stage || "development",
		"artifacts",
	)
	mkdirSync(intentDir, { recursive: true })
	writeFileSync(join(intentDir, "base.md"), "base content\n")
	git(tmp, "add", "-A")
	git(tmp, "commit", "-m", "seed stage artifact")

	return { tmp, slug, stage: opts.stage || "development" }
}

function cleanupRepo(tmp) {
	rmSync(tmp, { recursive: true, force: true })
}

let passed = 0
let failed = 0

async function test(name, fn) {
	const origCwd = process.cwd()
	// Reset isGitRepo cache so each test re-detects based on its cwd.
	// Without this, the first test's result sticks (the cache is global),
	// causing non-git tests to spuriously see a git repo and vice versa.
	_resetIsGitRepoForTests()
	try {
		await fn()
		passed++
		console.log(`  ✓ ${name}`)
	} catch (e) {
		failed++
		console.log(`  ✗ ${name}: ${e.message}`)
		if (process.env.VERBOSE) console.error(e)
	} finally {
		process.chdir(origCwd)
		_resetIsGitRepoForTests()
	}
}

// ── Fix-chain tests ────────────────────────────────────────────────────────

// isGitRepo() caches on first call, so run the non-git test FIRST before
// any git repo is set up — otherwise the cached `true` makes this false
// positive.
console.log("\n=== fix-chain: non-git fallback ===")

await test("returns null in non-git environment", () => {
	const tmp = mkdtempSync(join(tmpdir(), "haiku-wt-nogit-"))
	const origCwd = process.cwd()
	try {
		process.chdir(tmp)
		const wt = createFixChainWorktree("slug", "stage", "FB-01")
		assert.strictEqual(wt, null)
	} finally {
		process.chdir(origCwd)
		rmSync(tmp, { recursive: true, force: true })
	}
})

console.log("\n=== fix-chain: create ===")

await test("creates worktree + branch off stage", () => {
	const { tmp, slug, stage } = setupRepo()
	try {
		process.chdir(tmp)
		// Create stage branch first (createFixChainWorktree expects it via
		// ensureStageBranch but in filesystem setup we branch manually).
		git(tmp, "branch", `haiku/${slug}/${stage}`, `haiku/${slug}/main`)

		const wt = createFixChainWorktree(slug, stage, "FB-01")
		assert.ok(wt, "worktree path returned")
		assert.ok(existsSync(wt), "worktree dir exists on disk")
		assert.ok(
			branchExists(tmp, fixChainBranchName(slug, stage, "FB-01")),
			"fix-chain branch exists",
		)
	} finally {
		cleanupRepo(tmp)
	}
})

await test("create is idempotent for same slug/stage/FB", () => {
	const { tmp, slug, stage } = setupRepo()
	try {
		process.chdir(tmp)
		git(tmp, "branch", `haiku/${slug}/${stage}`, `haiku/${slug}/main`)

		const wt1 = createFixChainWorktree(slug, stage, "FB-01")
		const wt2 = createFixChainWorktree(slug, stage, "FB-01")
		assert.strictEqual(wt1, wt2, "returns same path")
	} finally {
		cleanupRepo(tmp)
	}
})

console.log("\n=== fix-chain: merge (clean) ===")

await test("merges worktree back when no conflicts", () => {
	const { tmp, slug, stage } = setupRepo()
	try {
		process.chdir(tmp)
		git(tmp, "branch", `haiku/${slug}/${stage}`, `haiku/${slug}/main`)
		git(tmp, "checkout", `haiku/${slug}/${stage}`)

		const wt = createFixChainWorktree(slug, stage, "FB-01")
		assert.ok(wt)

		// Make a change in the fix-chain worktree.
		const artifact = join(wt, "fixed.md")
		writeFileSync(artifact, "fix content\n")
		git(wt, "add", "-A")
		git(wt, "commit", "-m", "fix change")

		const res = mergeFixChainWorktree(slug, stage, "FB-01")
		assert.ok(res.success, `merge succeeded: ${res.message}`)
		assert.ok(!existsSync(wt), "worktree dir reaped")
		assert.ok(
			!branchExists(tmp, fixChainBranchName(slug, stage, "FB-01")),
			"fix-chain branch deleted",
		)
		// The fix should now be visible on the stage branch.
		assert.ok(
			existsSync(join(tmp, "fixed.md")),
			"fix artifact landed on stage branch",
		)
	} finally {
		cleanupRepo(tmp)
	}
})

console.log("\n=== fix-chain: merge (conflict) ===")

await test("returns isConflict when stage + fix-chain diverge on same file", () => {
	const { tmp, slug, stage } = setupRepo()
	try {
		process.chdir(tmp)
		git(tmp, "branch", `haiku/${slug}/${stage}`, `haiku/${slug}/main`)
		git(tmp, "checkout", `haiku/${slug}/${stage}`)

		// Create a file on the stage branch that the fix-chain will diverge from.
		const sharedFile = join(tmp, "shared.md")
		writeFileSync(sharedFile, "baseline\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "baseline shared.md on stage")

		// Fix-chain worktree forks off the current stage HEAD.
		const wt = createFixChainWorktree(slug, stage, "FB-02")
		assert.ok(wt)

		// Both trees edit the same file in conflicting ways.
		writeFileSync(join(wt, "shared.md"), "fix-chain edit\n")
		git(wt, "add", "-A")
		git(wt, "commit", "-m", "fix-chain change shared.md")

		writeFileSync(sharedFile, "stage advanced edit\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "stage advanced shared.md")

		const res = mergeFixChainWorktree(slug, stage, "FB-02")
		assert.strictEqual(res.success, false, "merge reports failure")
		assert.strictEqual(res.isConflict, true, "isConflict flag set")
		assert.ok(
			Array.isArray(res.conflictFiles) && res.conflictFiles.length > 0,
			"conflict files listed",
		)
		assert.ok(
			res.conflictFiles.some((f) => f.endsWith("shared.md")),
			"shared.md is in conflict list",
		)
		// Worktree should remain — integrator works in it next.
		assert.ok(existsSync(wt), "worktree preserved for integrator")
	} finally {
		cleanupRepo(tmp)
	}
})

await test("completes merge after integrator resolves conflict markers", () => {
	const { tmp, slug, stage } = setupRepo()
	try {
		process.chdir(tmp)
		git(tmp, "branch", `haiku/${slug}/${stage}`, `haiku/${slug}/main`)
		git(tmp, "checkout", `haiku/${slug}/${stage}`)

		writeFileSync(join(tmp, "shared.md"), "baseline\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "baseline")

		const wt = createFixChainWorktree(slug, stage, "FB-03")
		writeFileSync(join(wt, "shared.md"), "fix-chain edit\n")
		git(wt, "add", "-A")
		git(wt, "commit", "-m", "fix")
		writeFileSync(join(tmp, "shared.md"), "stage edit\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "stage")

		// First attempt returns isConflict.
		const conflictRes = mergeFixChainWorktree(slug, stage, "FB-03")
		assert.strictEqual(conflictRes.isConflict, true)

		// Simulate integrator: resolve markers, git add.
		writeFileSync(join(wt, "shared.md"), "resolved combined\n")
		git(wt, "add", "shared.md")

		// Retry — should detect MERGE_HEAD + clean resolution, commit, merge.
		const retryRes = mergeFixChainWorktree(slug, stage, "FB-03")
		assert.ok(
			retryRes.success,
			`retry after integrator resolution succeeded: ${retryRes.message}`,
		)
		assert.ok(!existsSync(wt), "worktree cleaned up after success")
		assert.strictEqual(
			readFileSync(join(tmp, "shared.md"), "utf8").trim(),
			"resolved combined",
			"stage branch has integrator's resolution",
		)
	} finally {
		cleanupRepo(tmp)
	}
})

await test("returns isConflict if integrator leaves files unresolved", () => {
	const { tmp, slug, stage } = setupRepo()
	try {
		process.chdir(tmp)
		git(tmp, "branch", `haiku/${slug}/${stage}`, `haiku/${slug}/main`)
		git(tmp, "checkout", `haiku/${slug}/${stage}`)

		writeFileSync(join(tmp, "shared.md"), "baseline\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "baseline")

		const wt = createFixChainWorktree(slug, stage, "FB-04")
		writeFileSync(join(wt, "shared.md"), "fix-chain\n")
		git(wt, "add", "-A")
		git(wt, "commit", "-m", "fix")
		writeFileSync(join(tmp, "shared.md"), "stage\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "stage")

		// First attempt — conflict.
		mergeFixChainWorktree(slug, stage, "FB-04")

		// "Integrator" that doesn't actually resolve — leaves markers in place.
		// Retry should still report isConflict.
		const retryRes = mergeFixChainWorktree(slug, stage, "FB-04")
		assert.strictEqual(retryRes.isConflict, true, "still reports conflict")
		assert.ok(
			retryRes.conflictFiles && retryRes.conflictFiles.length > 0,
			"lists unresolved files",
		)
	} finally {
		cleanupRepo(tmp)
	}
})

console.log("\n=== fix-chain: cleanup ===")

await test("cleanup removes worktree + branch without merging", () => {
	const { tmp, slug, stage } = setupRepo()
	try {
		process.chdir(tmp)
		git(tmp, "branch", `haiku/${slug}/${stage}`, `haiku/${slug}/main`)

		const wt = createFixChainWorktree(slug, stage, "FB-05")
		assert.ok(wt && existsSync(wt))
		const branch = fixChainBranchName(slug, stage, "FB-05")
		assert.ok(branchExists(tmp, branch))

		writeFileSync(join(wt, "wip.md"), "wip that should be discarded\n")
		git(wt, "add", "-A")
		git(wt, "commit", "-m", "wip")

		const res = cleanupFixChainWorktree(slug, stage, "FB-05")
		assert.ok(res.success)
		assert.ok(!existsSync(wt), "worktree dir gone")
		assert.ok(!branchExists(tmp, branch), "branch gone")
		// Stage branch should NOT have the wip.
		assert.ok(
			!existsSync(join(tmp, "wip.md")),
			"wip commit was NOT merged to stage",
		)
	} finally {
		cleanupRepo(tmp)
	}
})

await test("cleanup is a no-op when worktree doesn't exist", () => {
	const { tmp, slug, stage } = setupRepo()
	try {
		process.chdir(tmp)
		git(tmp, "branch", `haiku/${slug}/${stage}`, `haiku/${slug}/main`)

		const res = cleanupFixChainWorktree(slug, stage, "FB-nope")
		assert.ok(res.success, "reports success even when nothing to clean")
	} finally {
		cleanupRepo(tmp)
	}
})

// ── Intent-scope fix-chain (scope="intent") ────────────────────────────────

console.log("\n=== fix-chain: intent scope ===")

await test("intent-scope chain forks off intent main", () => {
	const { tmp, slug } = setupRepo()
	try {
		process.chdir(tmp)
		const wt = createFixChainWorktree(slug, "intent", "FB-01")
		assert.ok(wt, "intent-scope worktree created")
		const branch = fixChainBranchName(slug, "intent", "FB-01")
		assert.ok(branchExists(tmp, branch))

		// The base it forked from should be haiku/{slug}/main.
		const mergeBase = git(tmp, "merge-base", branch, `haiku/${slug}/main`)
		const mainHead = git(tmp, "rev-parse", `haiku/${slug}/main`)
		assert.strictEqual(
			mergeBase,
			mainHead,
			"fix-chain branch shares HEAD with intent main at creation",
		)
	} finally {
		cleanupRepo(tmp)
	}
})

// ── Discovery worktrees ────────────────────────────────────────────────────

console.log("\n=== discovery: create + merge ===")

await test("creates discovery worktree off stage branch", () => {
	const { tmp, slug, stage } = setupRepo()
	try {
		process.chdir(tmp)
		git(tmp, "branch", `haiku/${slug}/${stage}`, `haiku/${slug}/main`)

		const wt = createDiscoveryWorktree(slug, stage, "architecture")
		assert.ok(wt)
		assert.ok(existsSync(wt))
		assert.ok(
			branchExists(tmp, discoveryBranchName(slug, stage, "architecture")),
		)
	} finally {
		cleanupRepo(tmp)
	}
})

await test("merges discovery worktree into stage branch", () => {
	const { tmp, slug, stage } = setupRepo()
	try {
		process.chdir(tmp)
		git(tmp, "branch", `haiku/${slug}/${stage}`, `haiku/${slug}/main`)
		git(tmp, "checkout", `haiku/${slug}/${stage}`)

		const wt = createDiscoveryWorktree(slug, stage, "architecture")
		const artifactPath = join(
			wt,
			".haiku",
			"intents",
			slug,
			"knowledge",
			"ARCHITECTURE.md",
		)
		mkdirSync(join(artifactPath, ".."), { recursive: true })
		writeFileSync(artifactPath, "# architecture\n")
		git(wt, "add", "-A")
		git(wt, "commit", "-m", "architecture discovery")

		const res = mergeDiscoveryWorktree(slug, stage, "architecture")
		assert.ok(res.success, res.message)
		assert.ok(!existsSync(wt), "worktree reaped")
		const stageCopy = join(
			tmp,
			".haiku",
			"intents",
			slug,
			"knowledge",
			"ARCHITECTURE.md",
		)
		assert.ok(existsSync(stageCopy), "artifact landed on stage branch")
	} finally {
		cleanupRepo(tmp)
	}
})

await test("discovery cleanup discards worktree without merging", () => {
	const { tmp, slug, stage } = setupRepo()
	try {
		process.chdir(tmp)
		git(tmp, "branch", `haiku/${slug}/${stage}`, `haiku/${slug}/main`)

		const wt = createDiscoveryWorktree(slug, stage, "data-contracts")
		const res = cleanupDiscoveryWorktree(slug, stage, "data-contracts")
		assert.ok(res.success)
		assert.ok(!existsSync(wt))
		assert.ok(
			!branchExists(tmp, discoveryBranchName(slug, stage, "data-contracts")),
		)
	} finally {
		cleanupRepo(tmp)
	}
})

// ── Path + name helpers ────────────────────────────────────────────────────

console.log("\n=== path + branch name conventions ===")

await test("fixChainWorktreePath conventions", () => {
	const p = fixChainWorktreePath("my-intent", "development", "FB-07")
	assert.ok(p.endsWith(".haiku/worktrees/my-intent/fix-development-FB-07"), p)
})

await test("fixChainBranchName for stage scope", () => {
	assert.strictEqual(
		fixChainBranchName("my-intent", "development", "FB-07"),
		"haiku/my-intent/fix-development-FB-07",
	)
})

await test("fixChainBranchName for intent scope", () => {
	assert.strictEqual(
		fixChainBranchName("my-intent", "intent", "FB-01"),
		"haiku/my-intent/fix-intent-FB-01",
	)
})

await test("discoveryWorktreePath conventions", () => {
	const p = discoveryWorktreePath("my-intent", "development", "architecture")
	assert.ok(
		p.endsWith(".haiku/worktrees/my-intent/discovery-development-architecture"),
		p,
	)
})

await test("discoveryBranchName conventions", () => {
	assert.strictEqual(
		discoveryBranchName("my-intent", "development", "architecture"),
		"haiku/my-intent/discovery-development-architecture",
	)
})

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)

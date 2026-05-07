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
	consolidateStageBranches,
	createDiscoveryWorktree,
	createFixChainWorktree,
	discoveryBranchName,
	discoveryWorktreePath,
	fixChainBranchName,
	fixChainWorktreePath,
	mergeDiscoveryWorktree,
	mergeFixChainWorktree,
	mergeStageBranchForward,
} from "../src/git-worktree.ts"
import {
	_resetIsGitRepoForTests,
	migrateMisplacedWorktrees,
} from "../src/state-tools.ts"

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
	// Disable commit signing in the test repo so the suite runs in
	// environments without a GPG/SSH agent (e.g. the MCP server's gate
	// runner). The user's global `commit.gpgsign = true` would otherwise
	// make every test commit try to talk to an absent agent socket.
	git(tmp, "config", "commit.gpgsign", "false")
	git(tmp, "config", "tag.gpgsign", "false")
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
		const wt = createFixChainWorktree("slug", "stage", "FB-001")
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

		const wt = createFixChainWorktree(slug, stage, "FB-001")
		assert.ok(wt, "worktree path returned")
		assert.ok(existsSync(wt), "worktree dir exists on disk")
		assert.ok(
			branchExists(tmp, fixChainBranchName(slug, stage, "FB-001")),
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

		const wt1 = createFixChainWorktree(slug, stage, "FB-001")
		const wt2 = createFixChainWorktree(slug, stage, "FB-001")
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

		const wt = createFixChainWorktree(slug, stage, "FB-001")
		assert.ok(wt)

		// Make a change in the fix-chain worktree.
		const artifact = join(wt, "fixed.md")
		writeFileSync(artifact, "fix content\n")
		git(wt, "add", "-A")
		git(wt, "commit", "-m", "fix change")

		const res = mergeFixChainWorktree(slug, stage, "FB-001")
		assert.ok(res.success, `merge succeeded: ${res.message}`)
		assert.ok(!existsSync(wt), "worktree dir reaped")
		assert.ok(
			!branchExists(tmp, fixChainBranchName(slug, stage, "FB-001")),
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
		const wt = createFixChainWorktree(slug, stage, "FB-002")
		assert.ok(wt)

		// Both trees edit the same file in conflicting ways.
		writeFileSync(join(wt, "shared.md"), "fix-chain edit\n")
		git(wt, "add", "-A")
		git(wt, "commit", "-m", "fix-chain change shared.md")

		writeFileSync(sharedFile, "stage advanced edit\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "stage advanced shared.md")

		const res = mergeFixChainWorktree(slug, stage, "FB-002")
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

		const wt = createFixChainWorktree(slug, stage, "FB-003")
		writeFileSync(join(wt, "shared.md"), "fix-chain edit\n")
		git(wt, "add", "-A")
		git(wt, "commit", "-m", "fix")
		writeFileSync(join(tmp, "shared.md"), "stage edit\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "stage")

		// First attempt returns isConflict.
		const conflictRes = mergeFixChainWorktree(slug, stage, "FB-003")
		assert.strictEqual(conflictRes.isConflict, true)

		// Simulate integrator: resolve markers, git add.
		writeFileSync(join(wt, "shared.md"), "resolved combined\n")
		git(wt, "add", "shared.md")

		// Retry — should detect MERGE_HEAD + clean resolution, commit, merge.
		const retryRes = mergeFixChainWorktree(slug, stage, "FB-003")
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

// Regression: integrator caps were tripping on action-log.jsonl /
// write-audit.jsonl conflicts during fix-chain merges. Both files are
// pure append-only event streams the engine writes from every branch
// it touches; without `merge=union` in `.gitattributes`, every
// fix-chain that ran a workflow tick produced a conflict the
// integrator had to hand-resolve, eventually exhausting the
// 3-attempt cap and stranding the chain's real content on a dead
// worktree. The fix seeds `.gitattributes` (idempotently, on legacy
// intents too) so the JSONL appends auto-resolve.
await test("merges fix-chain when both sides appended to action-log.jsonl (regression: integrator cap stranding chains)", () => {
	const { tmp, slug, stage } = setupRepo()
	try {
		process.chdir(tmp)
		git(tmp, "branch", `haiku/${slug}/${stage}`, `haiku/${slug}/main`)
		git(tmp, "checkout", `haiku/${slug}/${stage}`)

		// Seed the intent dir + a baseline action-log.jsonl on the
		// stage branch.
		const intentDir = join(tmp, ".haiku", "intents", slug)
		mkdirSync(intentDir, { recursive: true })
		writeFileSync(
			join(intentDir, "action-log.jsonl"),
			`{"event":"baseline","ts":"2026-05-04T00:00:00Z"}\n`,
		)
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "seed action-log")

		// Start the fix-chain off the stage branch (engine seeds
		// .gitattributes on first call to mergeFixChainWorktree).
		const wt = createFixChainWorktree(slug, stage, "FB-LOG")
		// Fix-chain appends an event.
		writeFileSync(
			join(wt, ".haiku", "intents", slug, "action-log.jsonl"),
			`{"event":"baseline","ts":"2026-05-04T00:00:00Z"}\n{"event":"fix-chain-side","ts":"2026-05-04T01:00:00Z"}\n`,
		)
		git(wt, "add", "-A")
		git(wt, "commit", "-m", "fix-chain side append")
		// Stage branch appends a different event (e.g. an engine
		// tick that ran while the fix-chain was working).
		writeFileSync(
			join(intentDir, "action-log.jsonl"),
			`{"event":"baseline","ts":"2026-05-04T00:00:00Z"}\n{"event":"stage-side","ts":"2026-05-04T02:00:00Z"}\n`,
		)
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "stage side append")

		// Pre-fix: this would have returned isConflict and
		// dispatched the integrator. With `merge=union` seeded
		// on .gitattributes, git auto-concatenates and the merge
		// succeeds.
		const res = mergeFixChainWorktree(slug, stage, "FB-LOG")
		assert.ok(
			res.success,
			`expected union merge of action-log.jsonl to succeed; got: ${res.message}`,
		)

		// Both events are present in the merged file.
		const merged = readFileSync(join(intentDir, "action-log.jsonl"), "utf-8")
		assert.ok(
			merged.includes("fix-chain-side"),
			"fix-chain's appended event survived the union merge",
		)
		assert.ok(
			merged.includes("stage-side"),
			"stage's appended event survived the union merge",
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

		const wt = createFixChainWorktree(slug, stage, "FB-004")
		writeFileSync(join(wt, "shared.md"), "fix-chain\n")
		git(wt, "add", "-A")
		git(wt, "commit", "-m", "fix")
		writeFileSync(join(tmp, "shared.md"), "stage\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "stage")

		// First attempt — conflict.
		mergeFixChainWorktree(slug, stage, "FB-004")

		// "Integrator" that doesn't actually resolve — leaves markers in place.
		// Retry should still report isConflict.
		const retryRes = mergeFixChainWorktree(slug, stage, "FB-004")
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

		const wt = createFixChainWorktree(slug, stage, "FB-005")
		assert.ok(wt && existsSync(wt))
		const branch = fixChainBranchName(slug, stage, "FB-005")
		assert.ok(branchExists(tmp, branch))

		writeFileSync(join(wt, "wip.md"), "wip that should be discarded\n")
		git(wt, "add", "-A")
		git(wt, "commit", "-m", "wip")

		const res = cleanupFixChainWorktree(slug, stage, "FB-005")
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
		const wt = createFixChainWorktree(slug, "intent", "FB-001")
		assert.ok(wt, "intent-scope worktree created")
		const branch = fixChainBranchName(slug, "intent", "FB-001")
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

// Regression: a user (or sibling clone / sandbox) has the stage branch
// checked out in their own worktree. The pre-fix engine called
// `withTempWorktree(stageBranch, …)` which fails — `git worktree add`
// refuses to attach a second worktree to a branch already in use —
// so the discovery merge silently failed every tick and the elaborate
// prompt re-fanned-out the same discovery subagents on each run_next.
// The fix routes the merge through `withWorktreeOnBranch`, which
// detects the existing checkout and lands the merge there.
await test("merges discovery into stage branch when stage branch is held by a foreign worktree (regression: stuck elaboration)", () => {
	const { tmp, slug, stage } = setupRepo()
	try {
		process.chdir(tmp)
		git(tmp, "branch", `haiku/${slug}/${stage}`, `haiku/${slug}/main`)

		// Simulate the user's monorepo-3: a separate worktree of the
		// same repo, parked on the stage branch. The MCP cwd (tmp)
		// stays on `haiku/{slug}/main`.
		const userWorktree = mkdtempSync(join(tmpdir(), "haiku-user-checkout-"))
		rmSync(userWorktree, { recursive: true, force: true })
		git(tmp, "worktree", "add", userWorktree, `haiku/${slug}/${stage}`)
		try {
			// Discovery subagent does its work in its own worktree.
			const wt = createDiscoveryWorktree(slug, stage, "competitive")
			const artifactPath = join(
				wt,
				".haiku",
				"intents",
				slug,
				"knowledge",
				"COMPETITIVE.md",
			)
			mkdirSync(join(artifactPath, ".."), { recursive: true })
			writeFileSync(artifactPath, "# competitive landscape\n")
			git(wt, "add", "-A")
			git(wt, "commit", "-m", "competitive discovery")

			// MCP cwd is on intent main (NOT the stage branch). The
			// merge function falls through to its temp-worktree path,
			// which now finds the user's existing worktree on the
			// stage branch and uses it instead of throwing.
			const res = mergeDiscoveryWorktree(slug, stage, "competitive")
			assert.ok(
				res.success,
				`expected merge success when stage branch is held by foreign worktree; got: ${res.message}`,
			)

			// The merge landed on the stage branch — visible in the
			// foreign worktree's tree.
			const userArtifact = join(
				userWorktree,
				".haiku",
				"intents",
				slug,
				"knowledge",
				"COMPETITIVE.md",
			)
			assert.ok(
				existsSync(userArtifact),
				"discovery artifact should appear on the stage branch via the foreign worktree",
			)

			// Discovery worktree + branch reaped.
			assert.ok(!existsSync(wt), "discovery worktree reaped")
			assert.ok(
				!branchExists(tmp, discoveryBranchName(slug, stage, "competitive")),
				"discovery branch reaped",
			)
		} finally {
			// Clean up the user's worktree before tearing down the
			// repo so `git worktree remove` doesn't leave dangling
			// metadata in the parent.
			try {
				git(tmp, "worktree", "remove", "--force", userWorktree)
			} catch {
				/* best-effort */
			}
			rmSync(userWorktree, { recursive: true, force: true })
		}
	} finally {
		cleanupRepo(tmp)
	}
})

// Companion: when the foreign worktree is dirty, the merge surfaces a
// clear error instead of silently looping. Without this, a user with
// uncommitted changes on the stage branch would see the elaborate
// prompt re-fanning-out indefinitely with no diagnostic.
await test("surfaces a structured error when the stage branch is held by a dirty foreign worktree", () => {
	const { tmp, slug, stage } = setupRepo()
	try {
		process.chdir(tmp)
		git(tmp, "branch", `haiku/${slug}/${stage}`, `haiku/${slug}/main`)

		const userWorktree = mkdtempSync(join(tmpdir(), "haiku-user-dirty-"))
		rmSync(userWorktree, { recursive: true, force: true })
		git(tmp, "worktree", "add", userWorktree, `haiku/${slug}/${stage}`)
		try {
			// Leave a tracked-but-uncommitted edit in the foreign
			// worktree (commit a file first, then modify it). Tests
			// the "tracked changes" branch of the dirty-state
			// reporter — distinct from untracked-only state, which
			// has different remediation guidance.
			writeFileSync(join(userWorktree, "TRACKED.txt"), "v1\n")
			git(userWorktree, "add", "-A")
			git(userWorktree, "commit", "-m", "tracked file v1")
			writeFileSync(join(userWorktree, "TRACKED.txt"), "v2 (user edit)\n")

			const wt = createDiscoveryWorktree(slug, stage, "risks")
			const artifactPath = join(
				wt,
				".haiku",
				"intents",
				slug,
				"knowledge",
				"RISKS.md",
			)
			mkdirSync(join(artifactPath, ".."), { recursive: true })
			writeFileSync(artifactPath, "# risks\n")
			git(wt, "add", "-A")
			git(wt, "commit", "-m", "risks discovery")

			const res = mergeDiscoveryWorktree(slug, stage, "risks")
			assert.ok(!res.success, "expected failure on dirty foreign worktree")
			assert.ok(
				/uncommitted changes/i.test(res.message),
				`expected the message to surface tracked-changes hint; got: ${res.message}`,
			)
			assert.ok(
				/commit or stash/i.test(res.message),
				`expected actionable remediation hint; got: ${res.message}`,
			)
		} finally {
			try {
				git(tmp, "worktree", "remove", "--force", userWorktree)
			} catch {
				/* best-effort */
			}
			rmSync(userWorktree, { recursive: true, force: true })
		}
	} finally {
		cleanupRepo(tmp)
	}
})

// Companion: untracked-only state gets a different remediation hint
// (`git stash` doesn't help untracked files). The reviewer flagged
// the original "commit or stash" message as a footgun for users with
// only untracked files in their checkout — make sure the message
// names what the user actually needs to do.
await test("surfaces untracked-files-specific remediation when foreign worktree only has untracked files", () => {
	const { tmp, slug, stage } = setupRepo()
	try {
		process.chdir(tmp)
		git(tmp, "branch", `haiku/${slug}/${stage}`, `haiku/${slug}/main`)

		const userWorktree = mkdtempSync(join(tmpdir(), "haiku-user-untracked-"))
		rmSync(userWorktree, { recursive: true, force: true })
		git(tmp, "worktree", "add", userWorktree, `haiku/${slug}/${stage}`)
		try {
			// New file the user hasn't staged or committed —
			// purely untracked. `git stash` won't pick this up;
			// the message must call that out.
			writeFileSync(
				join(userWorktree, "DOWNLOADED.bin"),
				"new untracked file\n",
			)

			const wt = createDiscoveryWorktree(slug, stage, "untracked-test")
			const artifactPath = join(
				wt,
				".haiku",
				"intents",
				slug,
				"knowledge",
				"UT.md",
			)
			mkdirSync(join(artifactPath, ".."), { recursive: true })
			writeFileSync(artifactPath, "# ut\n")
			git(wt, "add", "-A")
			git(wt, "commit", "-m", "ut")

			const res = mergeDiscoveryWorktree(slug, stage, "untracked-test")
			assert.ok(!res.success, "expected failure on untracked-files state")
			assert.ok(
				/untracked files/i.test(res.message),
				`expected message to name untracked files; got: ${res.message}`,
			)
			assert.ok(
				/clean/i.test(res.message),
				`expected message to mention git clean as remediation; got: ${res.message}`,
			)
			assert.ok(
				!/^.*commit or stash them.*$/i.test(res.message),
				`expected message NOT to suggest 'commit or stash them' on a purely-untracked worktree; got: ${res.message}`,
			)
		} finally {
			try {
				git(tmp, "worktree", "remove", "--force", userWorktree)
			} catch {
				/* best-effort */
			}
			rmSync(userWorktree, { recursive: true, force: true })
		}
	} finally {
		cleanupRepo(tmp)
	}
})

// ── Path + name helpers ────────────────────────────────────────────────────

console.log("\n=== path + branch name conventions ===")

await test("fixChainWorktreePath conventions", () => {
	const p = fixChainWorktreePath("my-intent", "development", "FB-007")
	assert.ok(p.endsWith(".haiku/worktrees/my-intent/fix-development-FB-007"), p)
})

await test("fixChainBranchName for stage scope", () => {
	assert.strictEqual(
		fixChainBranchName("my-intent", "development", "FB-007"),
		"haiku/my-intent/fix-development-FB-007",
	)
})

await test("fixChainBranchName for intent scope", () => {
	assert.strictEqual(
		fixChainBranchName("my-intent", "intent", "FB-001"),
		"haiku/my-intent/fix-intent-FB-001",
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

// ── migrateMisplacedWorktrees ──────────────────────────────────────────────
//
// Pre-fix code created `.haiku/worktrees/...` relative to `process.cwd()`,
// so running haiku from a sub-worktree (e.g. Claude's `.claude/worktrees/`)
// scattered state. The migration helper relocates registered worktrees
// back under primary and sweeps empty skeleton dirs.

console.log("\n=== migrateMisplacedWorktrees ===")

await test("relocates clean worktree from sub to primary", () => {
	const { tmp, slug } = setupRepo()
	try {
		// Stand up a sub-worktree of the primary at /tmp/sub
		const sub = join(tmp, ".claude", "worktrees", "sub")
		mkdirSync(join(tmp, ".claude", "worktrees"), { recursive: true })
		git(tmp, "worktree", "add", sub, "main")

		// Manually create a misplaced unit worktree at sub/.haiku/worktrees/...
		// (this is what the buggy code would have produced).
		const unitBranch = `haiku/${slug}/unit-99-misplaced`
		git(tmp, "branch", unitBranch, "main")
		const oldPath = join(sub, ".haiku", "worktrees", slug, "unit-99-misplaced")
		git(tmp, "worktree", "add", oldPath, unitBranch)

		// Run migration from primary's cwd.
		process.chdir(tmp)
		const result = migrateMisplacedWorktrees()

		const expectedTail = join(".haiku", "worktrees", slug, "unit-99-misplaced")
		assert.strictEqual(result.moved.length, 1, "one worktree moved")
		// macOS resolves /var → /private/var via symlink in git output, so
		// compare by tail rather than absolute prefix.
		assert.ok(
			result.moved[0].new.endsWith(expectedTail),
			`moved path should end with ${expectedTail}, got ${result.moved[0].new}`,
		)
		assert.ok(existsSync(result.moved[0].new), "new path exists on disk")
		assert.ok(!existsSync(oldPath), "old path is gone")

		// git worktree list should reflect the move.
		const wtList = git(tmp, "worktree", "list", "--porcelain")
		assert.ok(wtList.includes(expectedTail), "git knows the new path")
		assert.ok(!wtList.includes(oldPath), "git no longer references old path")
	} finally {
		cleanupRepo(tmp)
	}
})

await test("skips worktree with uncommitted changes", () => {
	const { tmp, slug } = setupRepo()
	try {
		const sub = join(tmp, ".claude", "worktrees", "sub")
		mkdirSync(join(tmp, ".claude", "worktrees"), { recursive: true })
		git(tmp, "worktree", "add", sub, "main")

		const unitBranch = `haiku/${slug}/unit-99-dirty`
		git(tmp, "branch", unitBranch, "main")
		const oldPath = join(sub, ".haiku", "worktrees", slug, "unit-99-dirty")
		git(tmp, "worktree", "add", oldPath, unitBranch)
		writeFileSync(join(oldPath, "wip.md"), "uncommitted\n")

		process.chdir(tmp)
		const result = migrateMisplacedWorktrees()

		assert.strictEqual(result.moved.length, 0, "nothing moved")
		assert.strictEqual(result.skipped.length, 1, "one skipped")
		assert.match(result.skipped[0].reason, /uncommitted/)
		assert.ok(existsSync(oldPath), "dirty worktree left in place")
	} finally {
		cleanupRepo(tmp)
	}
})

await test("removes empty skeleton dirs from sub-worktrees", () => {
	const { tmp } = setupRepo()
	try {
		const sub = join(tmp, ".claude", "worktrees", "sub")
		mkdirSync(join(tmp, ".claude", "worktrees"), { recursive: true })
		git(tmp, "worktree", "add", sub, "main")

		// Pure-empty skeleton (no .git pointer, no files).
		const skel = join(sub, ".haiku", "worktrees", "ghost-intent", "ghost-unit")
		mkdirSync(skel, { recursive: true })

		process.chdir(tmp)
		const result = migrateMisplacedWorktrees()

		assert.strictEqual(result.cleanedSkeletons.length, 1)
		assert.ok(!existsSync(join(sub, ".haiku", "worktrees")))
	} finally {
		cleanupRepo(tmp)
	}
})

await test("leaves correctly-placed worktrees alone", () => {
	const { tmp, slug, stage } = setupRepo()
	try {
		process.chdir(tmp)
		git(tmp, "branch", `haiku/${slug}/${stage}`, `haiku/${slug}/main`)
		const wt = createFixChainWorktree(slug, stage, "FB-099")
		assert.ok(wt && existsSync(wt), "fix-chain worktree created at primary")

		const result = migrateMisplacedWorktrees()
		assert.strictEqual(
			result.moved.length,
			0,
			"correctly-placed worktree not touched",
		)
		assert.ok(existsSync(wt), "still in place")
	} finally {
		cleanupRepo(tmp)
	}
})

// ── mergeStageBranchForward foreign-checkout regression ──────────────────
//
// Audit follow-up to PR #304: `mergeStageBranchForward` previously did
// `git checkout toBranch` on the primary, then `git merge fromBranch`.
// If the user had `toBranch` checked out at another worktree, the
// direct checkout failed and the forward-merge was lost. Same family
// as the discovery / fix-chain merge bugs the previous commits fixed.
// Routed through `withWorktreeOnBranch`; this test confirms the merge
// lands when toBranch is held by a foreign worktree.

console.log("\n=== mergeStageBranchForward (audit follow-up) ===")

await test("merges from→to stage branch when toBranch is held by a foreign worktree", () => {
	const { tmp, slug } = setupRepo({ stage: "design" })
	try {
		process.chdir(tmp)
		git(tmp, "branch", `haiku/${slug}/design`, `haiku/${slug}/main`)
		git(tmp, "branch", `haiku/${slug}/development`, `haiku/${slug}/main`)

		// Land a commit on `design` (the from-branch).
		git(tmp, "checkout", `haiku/${slug}/design`)
		writeFileSync(join(tmp, "fix-from-design.md"), "design fix\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "design fix")

		// Park `development` (the to-branch) at a foreign worktree to
		// simulate the user inspecting it. Forward-merge should still
		// land (engine reuses that worktree for the merge).
		git(tmp, "checkout", `haiku/${slug}/main`)
		const userWt = mkdtempSync(join(tmpdir(), "haiku-fwd-foreign-"))
		rmSync(userWt, { recursive: true, force: true })
		git(tmp, "worktree", "add", userWt, `haiku/${slug}/development`)
		try {
			const res = mergeStageBranchForward(slug, "design", "development")
			assert.ok(
				res.success,
				`expected forward merge to succeed when toBranch is held by foreign worktree; got: ${res.message}`,
			)
			// Commit landed on `development` — visible via the foreign
			// worktree's tree.
			assert.ok(
				existsSync(join(userWt, "fix-from-design.md")),
				"merged commit should appear on the development branch via the foreign worktree",
			)
		} finally {
			try {
				git(tmp, "worktree", "remove", "--force", userWt)
			} catch {
				/* best-effort */
			}
			rmSync(userWt, { recursive: true, force: true })
		}
	} finally {
		cleanupRepo(tmp)
	}
})

// ── consolidateStageBranches conflict pattern ───────────────────────────
//
// `consolidateStageBranches` is the orphan-discrete-intent recovery
// merge — used by /haiku:repair on intents that have stage branches
// but no haiku/{slug}/main. Originally it caught merge errors and
// returned a generic `{success: false, message}`. Audit follow-up
// upgraded it to the standard pattern: detect conflicts via
// `git diff --name-only --diff-filter=U` and return
// `{success: false, isConflict: true, conflictFiles}` so callers can
// surface the file list to the operator (or dispatch a resolver).
// These tests lock the new contract in.

console.log("\n=== consolidateStageBranches (audit follow-up) ===")

await test("creates main from stages when no conflict", () => {
	const { tmp, slug } = setupRepo({ stage: "design" })
	try {
		process.chdir(tmp)
		// Two stage branches, no main yet — the orphan-discrete state.
		git(tmp, "checkout", `haiku/${slug}/main`)
		git(tmp, "checkout", "-b", `haiku/${slug}/development`)
		writeFileSync(join(tmp, "dev-output.md"), "from development\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "dev work")
		// Delete the auto-created main branch so we exercise the
		// "main doesn't exist yet" code path.
		git(tmp, "checkout", `haiku/${slug}/development`)
		git(tmp, "branch", "-D", `haiku/${slug}/main`)

		const res = consolidateStageBranches(slug, ["design", "development"])
		assert.ok(
			res.success,
			`expected consolidate to succeed; got: ${res.message}`,
		)
		assert.strictEqual(res.branch, `haiku/${slug}/main`)
		assert.ok(branchExists(tmp, `haiku/${slug}/main`), "main branch created")
	} finally {
		cleanupRepo(tmp)
	}
})

await test("returns isConflict + conflictFiles when consolidation hits a merge conflict", () => {
	const { tmp, slug } = setupRepo({ stage: "design" })
	try {
		process.chdir(tmp)
		// Setup: main and a stage branch that diverged on the same
		// file. Consolidate (= merge stage into main) must hit a
		// conflict and report it via the new structured shape.
		git(tmp, "checkout", `haiku/${slug}/main`)
		writeFileSync(join(tmp, "shared.md"), "main side\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "main side")

		git(
			tmp,
			"checkout",
			"-b",
			`haiku/${slug}/development`,
			`haiku/${slug}/main~1`,
		)
		writeFileSync(join(tmp, "shared.md"), "development side\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "development side")

		const res = consolidateStageBranches(slug, ["design", "development"])
		assert.ok(!res.success, "expected conflict to surface as failure")
		assert.strictEqual(
			res.isConflict,
			true,
			`expected isConflict=true; got: ${JSON.stringify(res)}`,
		)
		assert.ok(
			res.conflictFiles && res.conflictFiles.length > 0,
			`expected conflictFiles list; got: ${JSON.stringify(res)}`,
		)
		assert.ok(
			res.conflictFiles?.includes("shared.md"),
			`expected shared.md in conflict list; got: ${JSON.stringify(res.conflictFiles)}`,
		)
		assert.ok(
			/shared\.md/.test(res.message),
			`expected message to name the conflict file; got: ${res.message}`,
		)
		assert.ok(
			/Resolve the conflicts/i.test(res.message),
			`expected actionable remediation hint; got: ${res.message}`,
		)
	} finally {
		cleanupRepo(tmp)
	}
})

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)

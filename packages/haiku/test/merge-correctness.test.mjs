#!/usr/bin/env npx tsx
// merge-correctness.test.mjs — Two engine-merge invariants every site in
// `git-worktree.ts` must hold:
//
//   1. No squash. Every merge produces a real merge commit (a commit with
//      exactly two parents). The engine recently switched every merge to
//      `--no-ff`, so even non-divergent merges get a merge commit. Squash
//      and fast-forward are both invalid: they collapse history and erase
//      the "merge happened here" signal callers rely on for stage-branch
//      provenance.
//
//   2. Conflict prompts are adequate. When a merge is forced into a
//      conflict, the function returns `{ success: false, isConflict: true,
//      conflictFiles: string[], message: string }`, and `message` carries
//      both the conflicted file names AND the literal substrings `git add`
//      and `git commit` so the receiving agent can act on the prompt
//      without rereading the engine source.
//
// One scenario per merge call site, scoped to its narrowest viable repo
// (just the haiku/{slug}/main + haiku/{slug}/{stage} branch topology each
// function expects). Studio config is not loaded.

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
import { join } from "node:path"

import {
	consolidateStageBranches,
	createDiscoveryWorktree,
	createFixChainWorktree,
	createUnitWorktree,
	mergeDiscoveryWorktree,
	mergeFixChainWorktree,
	mergeStageBranchForward,
	mergeStageBranchIntoMain,
	mergeUnitWorktree,
} from "../src/git-worktree.ts"
import { _resetIsGitRepoForTests } from "../src/state-tools.ts"

// ── Test harness ──────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const origCwd = process.cwd()

async function test(name, fn) {
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
		try {
			process.chdir(origCwd)
		} catch {
			process.chdir(tmpdir())
		}
		_resetIsGitRepoForTests()
	}
}

// ── Git helpers ───────────────────────────────────────────────────────────

const COMMITTER_DATE = "2026-05-06T12:00:00+00:00"
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
	}).trim()
}

/** Set up a real git repo + the `haiku/{slug}/main` + `haiku/{slug}/{stage}`
 *  branch topology every helper-under-test expects. Returns `{ tmp, slug, stage }`. */
function setupRepo({ slug = "merge-correctness", stage = "development" } = {}) {
	const tmp = mkdtempSync(join(tmpdir(), "haiku-merge-corr-"))
	git(tmp, "init", "--initial-branch=main")
	git(tmp, "config", "user.email", "test@haiku")
	git(tmp, "config", "user.name", "haiku-test")
	// Disable signing — CI / sandboxed runners have no GPG agent.
	git(tmp, "config", "commit.gpgsign", "false")
	git(tmp, "config", "tag.gpgsign", "false")
	writeFileSync(join(tmp, "README.md"), "# test\n")
	git(tmp, "add", "-A")
	git(tmp, "commit", "-m", "initial")

	git(tmp, "branch", `haiku/${slug}/main`, "main")
	git(tmp, "checkout", `haiku/${slug}/main`)
	return { tmp, slug, stage }
}

/** Forks the named stage branch off intent-main and checks it out. */
function makeStageBranch(tmp, slug, stage) {
	git(tmp, "branch", `haiku/${slug}/${stage}`, `haiku/${slug}/main`)
	git(tmp, "checkout", `haiku/${slug}/${stage}`)
}

/** Asserts the tip of `branch` (run from `cwd`) is a merge commit with
 *  exactly two parents — i.e. neither a squash (1 parent) nor a fast-forward
 *  (1 parent). This is the no-squash invariant for divergent merges. */
function assertTwoParentMergeCommit(cwd, branch, label) {
	const parentLine = git(cwd, "log", "-1", "--pretty=%P", branch)
	const parents = parentLine.split(/\s+/).filter(Boolean)
	assert.strictEqual(
		parents.length,
		2,
		`${label}: expected merge commit with 2 parents on ${branch}, got ${parents.length} (parents: '${parentLine}')`,
	)
	// Sanity: rev-list --parents -1 returns "<sha> <p1> <p2>" — three tokens.
	const revLine = git(cwd, "rev-list", "--parents", "-1", branch)
	const tokens = revLine.split(/\s+/).filter(Boolean)
	assert.strictEqual(
		tokens.length,
		3,
		`${label}: rev-list --parents -1 should yield 3 tokens (commit + 2 parents), got ${tokens.length}: '${revLine}'`,
	)
}

/** Asserts a conflict-result envelope is well-formed AND its `message`
 *  carries both the conflicted file path and the actionable resolution
 *  substrings (`git add`, `git commit`) so the receiving agent can act
 *  on the prompt without rereading engine source. */
function assertConflictPromptAdequate(res, expectedFile, label) {
	assert.strictEqual(
		res.success,
		false,
		`${label}: expected success=false on conflict, got ${res.success}`,
	)
	assert.strictEqual(
		res.isConflict,
		true,
		`${label}: expected isConflict=true; got ${JSON.stringify(res)}`,
	)
	assert.ok(
		Array.isArray(res.conflictFiles) && res.conflictFiles.length > 0,
		`${label}: expected non-empty conflictFiles array; got ${JSON.stringify(res.conflictFiles)}`,
	)
	assert.ok(
		res.conflictFiles.some((f) => f.endsWith(expectedFile)),
		`${label}: expected ${expectedFile} in conflictFiles=${JSON.stringify(res.conflictFiles)}`,
	)
	assert.ok(
		typeof res.message === "string" && res.message.length > 0,
		`${label}: expected non-empty message`,
	)
	assert.ok(
		res.message.includes(expectedFile),
		`${label}: expected message to name ${expectedFile}; got: ${res.message}`,
	)
	assert.ok(
		res.message.includes("git add"),
		`${label}: expected message to include 'git add' instruction; got: ${res.message}`,
	)
	assert.ok(
		res.message.includes("git commit"),
		`${label}: expected message to include 'git commit' instruction; got: ${res.message}`,
	)
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. mergeStageBranchForward — intent-main → stage on revisit
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n=== mergeStageBranchForward ===")

await test("happy path: forward merge yields a 2-parent merge commit", () => {
	const { tmp, slug } = setupRepo()
	try {
		process.chdir(tmp)
		// Two divergent stage branches off main: design and development.
		git(tmp, "branch", `haiku/${slug}/design`, `haiku/${slug}/main`)
		git(tmp, "branch", `haiku/${slug}/development`, `haiku/${slug}/main`)

		git(tmp, "checkout", `haiku/${slug}/design`)
		writeFileSync(join(tmp, "design.md"), "design output\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "design work")

		git(tmp, "checkout", `haiku/${slug}/development`)
		writeFileSync(join(tmp, "dev.md"), "dev output\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "dev work")

		const res = mergeStageBranchForward(slug, "design", "development")
		assert.ok(res.success, `expected success; got: ${res.message}`)
		assertTwoParentMergeCommit(
			tmp,
			`haiku/${slug}/development`,
			"forward merge",
		)
	} finally {
		rmSync(tmp, { recursive: true, force: true })
	}
})

await test("conflict path: prompt names file + says git add / git commit", () => {
	const { tmp, slug } = setupRepo()
	try {
		process.chdir(tmp)
		// Same baseline shared.md on main, then two divergent edits on
		// design and development that touch the same line.
		writeFileSync(join(tmp, "shared.md"), "baseline\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "baseline")

		git(tmp, "branch", `haiku/${slug}/design`, `haiku/${slug}/main`)
		git(tmp, "branch", `haiku/${slug}/development`, `haiku/${slug}/main`)

		git(tmp, "checkout", `haiku/${slug}/design`)
		writeFileSync(join(tmp, "shared.md"), "design edit\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "design diverge")

		git(tmp, "checkout", `haiku/${slug}/development`)
		writeFileSync(join(tmp, "shared.md"), "development edit\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "development diverge")

		const res = mergeStageBranchForward(slug, "design", "development")
		assertConflictPromptAdequate(res, "shared.md", "forward conflict")
	} finally {
		rmSync(tmp, { recursive: true, force: true })
	}
})

// ═══════════════════════════════════════════════════════════════════════════
// 2. mergeStageBranchIntoMain — stage → intent main
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n=== mergeStageBranchIntoMain ===")

await test("happy path: stage→main yields a 2-parent merge commit", () => {
	const { tmp, slug, stage } = setupRepo()
	try {
		process.chdir(tmp)
		makeStageBranch(tmp, slug, stage)
		writeFileSync(join(tmp, "stage-output.md"), "stage output\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "stage work")
		// Diverge main too so the merge has a real two-parent shape.
		git(tmp, "checkout", `haiku/${slug}/main`)
		writeFileSync(join(tmp, "main-side.md"), "main side\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "main diverge")

		const res = mergeStageBranchIntoMain(slug, stage)
		assert.ok(res.success, `expected success; got: ${res.message}`)
		assertTwoParentMergeCommit(tmp, `haiku/${slug}/main`, "stage→main merge")
	} finally {
		rmSync(tmp, { recursive: true, force: true })
	}
})

await test("conflict path: prompt names file + says git add / git commit", () => {
	const { tmp, slug, stage } = setupRepo()
	try {
		process.chdir(tmp)
		writeFileSync(join(tmp, "shared.md"), "baseline\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "baseline")

		makeStageBranch(tmp, slug, stage)
		writeFileSync(join(tmp, "shared.md"), "stage edit\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "stage diverge")

		git(tmp, "checkout", `haiku/${slug}/main`)
		writeFileSync(join(tmp, "shared.md"), "main edit\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "main diverge")

		const res = mergeStageBranchIntoMain(slug, stage)
		assertConflictPromptAdequate(res, "shared.md", "stage→main conflict")
	} finally {
		rmSync(tmp, { recursive: true, force: true })
	}
})

// ═══════════════════════════════════════════════════════════════════════════
// 3. consolidateStageBranches — orphan-discrete recovery
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n=== consolidateStageBranches ===")

await test("happy path: existing main + divergent last stage → 2-parent merge commit", () => {
	const { tmp, slug } = setupRepo({ stage: "design" })
	try {
		process.chdir(tmp)
		// main has its own commit; the (last) stage diverges with another.
		git(tmp, "checkout", `haiku/${slug}/main`)
		writeFileSync(join(tmp, "main-side.md"), "from main\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "main side")

		git(tmp, "checkout", "-b", `haiku/${slug}/development`, `haiku/${slug}/main~1`)
		writeFileSync(join(tmp, "dev-side.md"), "from dev\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "dev side")

		const res = consolidateStageBranches(slug, ["design", "development"])
		assert.ok(res.success, `expected success; got: ${res.message}`)
		assert.strictEqual(res.branch, `haiku/${slug}/main`)
		assertTwoParentMergeCommit(tmp, `haiku/${slug}/main`, "consolidate merge")
	} finally {
		rmSync(tmp, { recursive: true, force: true })
	}
})

await test("conflict path: prompt names file + says git add / git commit", () => {
	const { tmp, slug } = setupRepo({ stage: "design" })
	try {
		process.chdir(tmp)
		git(tmp, "checkout", `haiku/${slug}/main`)
		writeFileSync(join(tmp, "shared.md"), "main side\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "main side")

		git(tmp, "checkout", "-b", `haiku/${slug}/development`, `haiku/${slug}/main~1`)
		writeFileSync(join(tmp, "shared.md"), "dev side\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "dev side")

		const res = consolidateStageBranches(slug, ["design", "development"])
		assertConflictPromptAdequate(res, "shared.md", "consolidate conflict")
	} finally {
		rmSync(tmp, { recursive: true, force: true })
	}
})

// ═══════════════════════════════════════════════════════════════════════════
// 4. mergeUnitWorktree — unit isolation worktree → stage branch
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n=== mergeUnitWorktree ===")

await test("happy path: unit→stage yields a 2-parent merge commit", () => {
	const { tmp, slug, stage } = setupRepo()
	try {
		process.chdir(tmp)
		makeStageBranch(tmp, slug, stage)
		// Diverge the stage branch so the merge has 2 real parents.
		writeFileSync(join(tmp, "stage-extra.md"), "stage extra\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "stage diverge")

		const wt = createUnitWorktree(slug, "unit-01-setup", stage)
		assert.ok(wt, "createUnitWorktree returned a path")
		writeFileSync(join(wt, "unit-output.md"), "unit output\n")
		git(wt, "add", "-A")
		git(wt, "commit", "-m", "unit work")

		const res = mergeUnitWorktree(slug, "unit-01-setup", stage)
		assert.ok(res.success, `expected success; got: ${res.message}`)
		assertTwoParentMergeCommit(
			tmp,
			`haiku/${slug}/${stage}`,
			"unit→stage merge",
		)
	} finally {
		rmSync(tmp, { recursive: true, force: true })
	}
})

await test("conflict path: unit→stage rejects without success, no merge commit lands", () => {
	const { tmp, slug, stage } = setupRepo()
	try {
		process.chdir(tmp)
		makeStageBranch(tmp, slug, stage)
		writeFileSync(join(tmp, "shared.md"), "baseline\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "baseline shared.md")

		const wt = createUnitWorktree(slug, "unit-02-conflict", stage)
		assert.ok(wt, "createUnitWorktree returned a path")
		writeFileSync(join(wt, "shared.md"), "unit edit\n")
		git(wt, "add", "-A")
		git(wt, "commit", "-m", "unit diverge")
		// Stage advances on the same file from a different angle.
		writeFileSync(join(tmp, "shared.md"), "stage edit\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "stage diverge")

		const res = mergeUnitWorktree(slug, "unit-02-conflict", stage)
		// 2026-05-06: mergeUnitWorktree was upgraded to return the same
		// structured envelope as the other 5 merge sites. Assert the
		// shared contract.
		assertConflictPromptAdequate(res, "shared.md", "unit→stage conflict")
	} finally {
		rmSync(tmp, { recursive: true, force: true })
	}
})

// ═══════════════════════════════════════════════════════════════════════════
// 5. mergeDiscoveryWorktree — discovery isolation worktree → stage branch
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n=== mergeDiscoveryWorktree ===")

await test("happy path: discovery→stage yields a 2-parent merge commit", () => {
	const { tmp, slug, stage } = setupRepo()
	try {
		process.chdir(tmp)
		makeStageBranch(tmp, slug, stage)
		writeFileSync(join(tmp, "stage-extra.md"), "stage extra\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "stage diverge")

		const wt = createDiscoveryWorktree(slug, stage, "architecture")
		assert.ok(wt, "createDiscoveryWorktree returned a path")
		const artPath = join(
			wt,
			".haiku",
			"intents",
			slug,
			"knowledge",
			"ARCHITECTURE.md",
		)
		mkdirSync(join(artPath, ".."), { recursive: true })
		writeFileSync(artPath, "# architecture\n")
		git(wt, "add", "-A")
		git(wt, "commit", "-m", "discovery work")

		const res = mergeDiscoveryWorktree(slug, stage, "architecture")
		assert.ok(res.success, `expected success; got: ${res.message}`)
		assertTwoParentMergeCommit(
			tmp,
			`haiku/${slug}/${stage}`,
			"discovery→stage merge",
		)
	} finally {
		rmSync(tmp, { recursive: true, force: true })
	}
})

await test("conflict path: prompt names file with full conflictFiles list", () => {
	const { tmp, slug, stage } = setupRepo()
	try {
		process.chdir(tmp)
		makeStageBranch(tmp, slug, stage)
		writeFileSync(join(tmp, "shared.md"), "baseline\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "baseline")

		const wt = createDiscoveryWorktree(slug, stage, "competitive")
		assert.ok(wt, "createDiscoveryWorktree returned a path")
		writeFileSync(join(wt, "shared.md"), "discovery edit\n")
		git(wt, "add", "-A")
		git(wt, "commit", "-m", "discovery diverge")

		writeFileSync(join(tmp, "shared.md"), "stage edit\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "stage diverge")

		const res = mergeDiscoveryWorktree(slug, stage, "competitive")
		assert.strictEqual(res.success, false)
		assert.strictEqual(
			res.isConflict,
			true,
			`expected isConflict=true; got ${JSON.stringify(res)}`,
		)
		assert.ok(
			Array.isArray(res.conflictFiles) && res.conflictFiles.length > 0,
			"conflictFiles populated",
		)
		assert.ok(
			res.conflictFiles.some((f) => f.endsWith("shared.md")),
			`expected shared.md in conflictFiles=${JSON.stringify(res.conflictFiles)}`,
		)
		assert.ok(
			res.message.includes("conflict"),
			`expected 'conflict' in message; got: ${res.message}`,
		)
	} finally {
		rmSync(tmp, { recursive: true, force: true })
	}
})

// ═══════════════════════════════════════════════════════════════════════════
// 6. mergeFixChainWorktree — fix-chain isolation worktree → stage branch
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n=== mergeFixChainWorktree ===")

await test("happy path: fix-chain→stage yields a 2-parent merge commit", () => {
	const { tmp, slug, stage } = setupRepo()
	try {
		process.chdir(tmp)
		makeStageBranch(tmp, slug, stage)
		writeFileSync(join(tmp, "stage-extra.md"), "stage extra\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "stage diverge")

		const wt = createFixChainWorktree(slug, stage, "FB-001")
		assert.ok(wt, "createFixChainWorktree returned a path")
		writeFileSync(join(wt, "fix.md"), "fix output\n")
		git(wt, "add", "-A")
		git(wt, "commit", "-m", "fix work")

		const res = mergeFixChainWorktree(slug, stage, "FB-001")
		assert.ok(res.success, `expected success; got: ${res.message}`)
		assertTwoParentMergeCommit(
			tmp,
			`haiku/${slug}/${stage}`,
			"fix-chain→stage merge",
		)
	} finally {
		rmSync(tmp, { recursive: true, force: true })
	}
})

await test("conflict path: prompt names file with full conflictFiles list", () => {
	const { tmp, slug, stage } = setupRepo()
	try {
		process.chdir(tmp)
		makeStageBranch(tmp, slug, stage)
		writeFileSync(join(tmp, "shared.md"), "baseline\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "baseline")

		const wt = createFixChainWorktree(slug, stage, "FB-002")
		assert.ok(wt, "createFixChainWorktree returned a path")
		writeFileSync(join(wt, "shared.md"), "fix-chain edit\n")
		git(wt, "add", "-A")
		git(wt, "commit", "-m", "fix-chain diverge")

		writeFileSync(join(tmp, "shared.md"), "stage edit\n")
		git(tmp, "add", "-A")
		git(tmp, "commit", "-m", "stage diverge")

		const res = mergeFixChainWorktree(slug, stage, "FB-002")
		assert.strictEqual(res.success, false)
		assert.strictEqual(
			res.isConflict,
			true,
			`expected isConflict=true; got ${JSON.stringify(res)}`,
		)
		assert.ok(
			Array.isArray(res.conflictFiles) && res.conflictFiles.length > 0,
			"conflictFiles populated",
		)
		assert.ok(
			res.conflictFiles.some((f) => f.endsWith("shared.md")),
			`expected shared.md in conflictFiles=${JSON.stringify(res.conflictFiles)}`,
		)
		assert.ok(
			res.message.includes("conflict"),
			`expected 'conflict' in message; got: ${res.message}`,
		)
		// Worktree is preserved for the integrator to resolve in.
		assert.ok(existsSync(wt), "worktree preserved for integrator")
	} finally {
		rmSync(tmp, { recursive: true, force: true })
	}
})

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)

#!/usr/bin/env npx tsx
// squash-merge-fallback.test.mjs — Coverage for the VCS-provider fallback
// path in `isBranchMerged()` (`packages/haiku/src/git-worktree.ts:194`).
//
// The primary path uses `git merge-base --is-ancestor`. When a stage branch
// has been **squash-merged** into intent main, that check returns false —
// the squash rewrites history into a single new commit and the original
// branch tip is no longer an ancestor of main. To detect this case the
// engine shells out to the VCS provider (`gh pr list ...` or `glab mr list
// ...`) and treats the branch as merged if the provider reports a merged
// PR/MR.
//
// That fallback path was previously uncovered. This file exercises it via
// a stubbed `gh` (and `glab`) on PATH so the test runs offline without any
// real VCS credentials.
//
// Stubbing strategy: detectPrTool() runs `which gh` / `which glab` to find
// a tool, then `gh pr list ...` to query merge state. We create a temp
// directory holding executable shell scripts named `gh` and `glab`, then
// prepend that directory to `process.env.PATH`. `execFileSync` with no
// explicit `env` option inherits `process.env` at spawn time, so the child
// process sees the stub. PATH is restored in cleanup.

import assert from "node:assert"
import { execFileSync } from "node:child_process"
import {
	chmodSync,
	existsSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import { isBranchMerged } from "../src/git-worktree.ts"
import { _resetIsGitRepoForTests } from "../src/state-tools.ts"

// ── Pinned dates so commit shas are stable across runs ────────────────────

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
		stdio: ["ignore", "pipe", "pipe"],
	}).trim()
}

// ── Repo + squash topology fixture ────────────────────────────────────────

/**
 * Build a repo where `haiku/sq/foo` was squash-merged into `haiku/sq/main`.
 * After this:
 *   - The branch ref `haiku/sq/foo` still exists (different sha than main).
 *   - `git merge-base --is-ancestor haiku/sq/foo haiku/sq/main` returns false.
 *   - In a real provider, `gh pr list --head haiku/sq/foo --base haiku/sq/main
 *     --state merged --limit 1 --json number` would show the merged PR.
 */
function setupSquashRepo() {
	const tmp = mkdtempSync(join(tmpdir(), "haiku-squash-"))
	git(tmp, "init", "--initial-branch=main")
	git(tmp, "config", "user.email", "test@haiku")
	git(tmp, "config", "user.name", "haiku-test")
	git(tmp, "config", "commit.gpgsign", "false")
	git(tmp, "config", "tag.gpgsign", "false")
	writeFileSync(join(tmp, "README.md"), "# squash test\n")
	git(tmp, "add", "-A")
	git(tmp, "commit", "-m", "initial")

	// haiku/sq/main (intent main) tracks "main" at start
	git(tmp, "branch", "haiku/sq/main", "main")
	git(tmp, "checkout", "haiku/sq/main")

	// haiku/sq/foo (stage branch) forks off intent main and adds a commit
	git(tmp, "branch", "haiku/sq/foo", "haiku/sq/main")
	git(tmp, "checkout", "haiku/sq/foo")
	writeFileSync(join(tmp, "foo.md"), "foo work\n")
	git(tmp, "add", "-A")
	git(tmp, "commit", "-m", "feat: foo")

	// Squash-merge foo into intent main: this rewrites history into one new
	// commit on main, so foo's tip is NOT an ancestor of main afterwards.
	git(tmp, "checkout", "haiku/sq/main")
	git(tmp, "merge", "--squash", "haiku/sq/foo")
	git(tmp, "commit", "-m", "squash: foo")

	return tmp
}

/** Sanity-check the squash topology — the test depends on this shape. */
function assertSquashTopology(tmp) {
	const fooSha = git(tmp, "rev-parse", "haiku/sq/foo")
	const mainSha = git(tmp, "rev-parse", "haiku/sq/main")
	assert.notStrictEqual(
		fooSha,
		mainSha,
		"foo and main shas should differ after squash",
	)
	let isAncestor = false
	try {
		execFileSync(
			"git",
			["-C", tmp, "merge-base", "--is-ancestor", fooSha, mainSha],
			{ stdio: "ignore", env: GIT_ENV },
		)
		isAncestor = true
	} catch {
		isAncestor = false
	}
	assert.strictEqual(
		isAncestor,
		false,
		"squash merge should make foo non-ancestor of main",
	)
}

// ── PATH stubbing ─────────────────────────────────────────────────────────

/**
 * Build a stub directory containing executable scripts. `tools` is a map
 * from name → script body. Each script is chmod 0o755 and placed in a
 * fresh tmp dir.
 *
 * The caller is responsible for prepending the dir to `process.env.PATH`
 * and cleaning up afterwards. We don't manage PATH inside this helper so
 * tests can compose multiple stub dirs (or none) deliberately.
 */
function makeStubDir(tools) {
	const dir = mkdtempSync(join(tmpdir(), "haiku-stub-"))
	for (const [name, body] of Object.entries(tools)) {
		const path = join(dir, name)
		writeFileSync(path, body)
		chmodSync(path, 0o755)
	}
	return dir
}

/**
 * Run `fn` with `dir` prepended to PATH. Restores PATH afterwards. We
 * mutate `process.env.PATH` directly (instead of passing env to spawned
 * children) because `git-worktree.ts`'s internal `run()` calls
 * `execFileSync` without a custom env — spawned processes inherit
 * `process.env` at spawn time.
 */
function withStubbedPath(dir, fn) {
	const origPath = process.env.PATH
	// Hide any real gh/glab on the system: prepend stub dir, then a
	// minimal PATH that still has the basics needed by the engine
	// (sh, git, which). /usr/bin and /bin cover macOS + Linux.
	//
	// CI hazard: GitHub Actions runners ship `gh` at `/usr/bin/gh`. The
	// engine's `detectPrTool` runs `which gh` first and prefers it
	// when present — so a real gh on PATH would override the test's
	// "only glab" intent. Inject a stub `which` script alongside the
	// other stubs that ONLY recognises tools the test deliberately
	// stubbed. With this, `which gh` returns nothing unless the test
	// explicitly stubbed gh, regardless of what's in /usr/bin.
	if (!existsSync(join(dir, "which"))) {
		writeFileSync(
			join(dir, "which"),
			[
				"#!/bin/sh",
				// Resolve only tools that exist in the test's stub dir.
				// $0 is `which` itself; the queried tool name is $1.
				`STUB_DIR="$(dirname "$0")"`,
				`if [ -x "$STUB_DIR/$1" ] && [ "$1" != "which" ]; then`,
				`  echo "$STUB_DIR/$1"`,
				`  exit 0`,
				`fi`,
				`exit 1`,
			].join("\n"),
			{ mode: 0o755 },
		)
	}
	process.env.PATH = `${dir}:/usr/bin:/bin`
	try {
		return fn()
	} finally {
		process.env.PATH = origPath
	}
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

test("squash topology: ancestor check fails (precondition)", () => {
	_resetIsGitRepoForTests()
	const tmp = setupSquashRepo()
	try {
		process.chdir(tmp)
		assertSquashTopology(tmp)
	} finally {
		restoreCwd()
		rmSync(tmp, { recursive: true, force: true })
	}
})

test("provider fallback success: gh reports merged PR → returns true", () => {
	_resetIsGitRepoForTests()
	const tmp = setupSquashRepo()
	const stub = makeStubDir({
		// Stub `gh`: any args produce one merged PR. The engine queries
		// `gh pr list --head <branch> --base <main> --state merged --json
		// number --limit 1`; we just need to return a non-`[]` JSON array.
		gh: "#!/bin/sh\necho '[{\"number\":1}]'\n",
		// `which` is a builtin in /usr/bin on macOS + Linux; we don't need
		// to stub it. But we DO need to make sure no real `glab` is
		// found before `gh` — `detectPrTool` checks gh first, so this is
		// already safe.
	})
	try {
		process.chdir(tmp)
		const result = withStubbedPath(stub, () =>
			isBranchMerged("haiku/sq/foo", "haiku/sq/main"),
		)
		assert.strictEqual(
			result,
			true,
			"isBranchMerged should fall back to gh and return true",
		)
	} finally {
		restoreCwd()
		rmSync(stub, { recursive: true, force: true })
		rmSync(tmp, { recursive: true, force: true })
	}
})

test("provider fallback empty: gh reports no merged PR → returns false", () => {
	_resetIsGitRepoForTests()
	const tmp = setupSquashRepo()
	const stub = makeStubDir({
		gh: "#!/bin/sh\necho '[]'\n",
	})
	try {
		process.chdir(tmp)
		const result = withStubbedPath(stub, () =>
			isBranchMerged("haiku/sq/foo", "haiku/sq/main"),
		)
		assert.strictEqual(
			result,
			false,
			"isBranchMerged should fall back to gh, see [], return false",
		)
	} finally {
		restoreCwd()
		rmSync(stub, { recursive: true, force: true })
		rmSync(tmp, { recursive: true, force: true })
	}
})

test("provider fallback success: glab reports merged MR → returns true", () => {
	_resetIsGitRepoForTests()
	const tmp = setupSquashRepo()
	// Stub ONLY glab. The engine's detectPrTool prefers gh when both are
	// present, but `withStubbedPath` injects a stub `which` script that
	// only finds tools in the stub dir — so on CI where /usr/bin/gh
	// exists, our `which gh` returns nothing and the engine falls
	// through to glab as expected.
	const stub = makeStubDir({
		glab: "#!/bin/sh\necho '!42  Some merged MR  haiku/sq/foo  merged'\n",
	})
	try {
		process.chdir(tmp)
		const result = withStubbedPath(stub, () =>
			isBranchMerged("haiku/sq/foo", "haiku/sq/main"),
		)
		assert.strictEqual(
			result,
			true,
			"isBranchMerged should fall back to glab and return true",
		)
	} finally {
		restoreCwd()
		rmSync(stub, { recursive: true, force: true })
		rmSync(tmp, { recursive: true, force: true })
	}
})

test("no provider on PATH: squash-merged branch reports as not merged", () => {
	_resetIsGitRepoForTests()
	const tmp = setupSquashRepo()
	// Empty stub dir — no gh, no glab. detectPrTool returns null and
	// isBranchMerged falls through to `return false`. This is the
	// engine's documented behavior: without a provider it has no way to
	// know a squash merge happened.
	const stub = makeStubDir({})
	try {
		process.chdir(tmp)
		const result = withStubbedPath(stub, () =>
			isBranchMerged("haiku/sq/foo", "haiku/sq/main"),
		)
		assert.strictEqual(
			result,
			false,
			"with no gh/glab on PATH, squash merge cannot be detected",
		)
	} finally {
		restoreCwd()
		rmSync(stub, { recursive: true, force: true })
		rmSync(tmp, { recursive: true, force: true })
	}
})

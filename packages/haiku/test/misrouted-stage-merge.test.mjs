#!/usr/bin/env npx tsx
// misrouted-stage-merge.test.mjs — Coverage for the "User A merged the
// stage PR into the repo default branch instead of `haiku/<slug>/main`"
// recovery path. The cursor's `firstUnmergedStage` checks against the
// intent main branch; if the merge landed on the wrong target the
// engine has to fast-forward intent main to recover. Without this
// reconciliation, User B's `/haiku:pickup` wedges forever — the stage
// stays "unmerged" from the cursor's perspective even though it's been
// merged on the real default branch.
//
// Tests:
//   1. happy path: stage merged into haiku/<slug>/main → no
//      reconciliation needed, returns misrouted: false.
//   2. misroute: stage merged into `main` (repo default), intent main
//      is FF-able to main → reconcileMisroutedStageMerges performs the
//      fast-forward and the cursor's firstUnmergedStage returns the
//      next stage (i.e. the misrouted stage is now correctly seen as
//      merged).
//   3. divergence: stage merged into `main` but intent main has
//      commits not on `main` → reconciliation refuses to fast-forward
//      and returns a structured error message.

import assert from "node:assert"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

const COMMITTER_DATE = "2026-05-07T12:00:00+00:00"
const GIT_ENV = {
	...process.env,
	GIT_COMMITTER_DATE: COMMITTER_DATE,
	GIT_AUTHOR_DATE: COMMITTER_DATE,
	GIT_COMMITTER_NAME: "test",
	GIT_COMMITTER_EMAIL: "t@t",
	GIT_AUTHOR_NAME: "test",
	GIT_AUTHOR_EMAIL: "t@t",
}

function git(cwd, ...args) {
	return execFileSync("git", args, {
		cwd,
		stdio: ["ignore", "pipe", "pipe"],
		env: GIT_ENV,
	})
		.toString("utf8")
		.trim()
}

function setupRepoWithIntent(slug) {
	const root = mkdtempSync(join(tmpdir(), "misrouted-merge-"))
	git(root, "init", "-q", "-b", "main")
	git(root, "config", "user.email", "t@t")
	git(root, "config", "user.name", "t")
	writeFileSync(join(root, "README.md"), "# fixture\n")
	git(root, "add", ".")
	git(root, "commit", "-q", "-m", "init")
	// Treat origin as a bare clone of main so origin/main resolves.
	const originPath = mkdtempSync(join(tmpdir(), "misrouted-origin-"))
	git(originPath, "init", "-q", "--bare")
	git(root, "remote", "add", "origin", originPath)
	git(root, "push", "-q", "-u", "origin", "main")
	// haiku/<slug>/main from main.
	const intentMain = `haiku/${slug}/main`
	git(root, "checkout", "-q", "-b", intentMain)
	mkdirSync(join(root, ".haiku", "intents", slug), { recursive: true })
	writeFileSync(
		join(root, ".haiku", "intents", slug, "intent.md"),
		`---\ntitle: t\nstudio: synth\nmode: continuous\nplugin_version: "4.0.0"\nstarted_at: "2026-05-07T00:00:00Z"\napprovals: {}\nsealed_at: null\n---\n# t\n`,
	)
	git(root, "add", ".")
	git(root, "commit", "-q", "-m", "create intent")
	git(root, "push", "-q", "-u", "origin", intentMain)
	return { root, originPath, intentMain }
}

function makeStageBranch(root, slug, stage, content) {
	const stageBranch = `haiku/${slug}/${stage}`
	git(root, "checkout", "-q", "-b", stageBranch)
	const file = join(root, `${stage}-output.txt`)
	writeFileSync(file, content)
	git(root, "add", ".")
	git(root, "commit", "-q", "-m", `${stage}: work`)
	git(root, "push", "-q", "-u", "origin", stageBranch)
	return stageBranch
}

test("misrouted-merge: stage merged into intent main → no reconciliation", async () => {
	const { root, intentMain } = setupRepoWithIntent("happy")
	const orig = process.cwd()
	process.chdir(root)
	try {
		const stageBranch = makeStageBranch(root, "happy", "stage-a", "work\n")
		// Merge into intent main (the right target).
		git(root, "checkout", "-q", intentMain)
		git(root, "merge", "--no-ff", "-q", "-m", "merge stage-a", stageBranch)
		git(root, "push", "-q", "origin", intentMain)
		git(root, "fetch", "-q", "origin")
		const { reconcileMisroutedStageMerges } = await import(
			"../src/git-worktree.ts"
		)
		const out = reconcileMisroutedStageMerges("happy", ["stage-a"])
		// Happy path: nothing reported. (The function only emits entries
		// for misrouted stages — clean stages produce no entry.)
		assert.equal(out.length, 0)
	} finally {
		process.chdir(orig)
		rmSync(root, { recursive: true, force: true })
	}
})

test("misrouted-merge: stage merged into repo default → reconciliation FFs intent main", async () => {
	const { root, intentMain } = setupRepoWithIntent("misroute")
	const orig = process.cwd()
	process.chdir(root)
	try {
		const stageBranch = makeStageBranch(root, "misroute", "stage-a", "work\n")
		// Misroute: User A merged the stage PR into repo `main`, NOT
		// haiku/misroute/main.
		git(root, "checkout", "-q", "main")
		git(root, "merge", "--no-ff", "-q", "-m", "merge stage-a", stageBranch)
		git(root, "push", "-q", "origin", "main")
		git(root, "fetch", "-q", "origin")
		// Switch off intent main so reconciliation can check it out.
		git(root, "checkout", "-q", "main")

		const { reconcileMisroutedStageMerges } = await import(
			"../src/git-worktree.ts"
		)
		const out = reconcileMisroutedStageMerges("misroute", ["stage-a"])
		assert.equal(out.length, 1, "one stage flagged as misrouted")
		const result = out[0]
		assert.equal(result.misrouted, true)
		assert.equal(result.reconciled, true, "FF should succeed")
		assert.ok(!result.error, `unexpected error: ${result.error}`)

		// Verify intent main now contains the stage's commits.
		git(root, "checkout", "-q", intentMain)
		const log = git(root, "log", "--oneline").split("\n")
		assert.ok(
			log.some((line) => line.includes("stage-a")),
			`intent main should now contain stage-a commit, got: ${log.join(" / ")}`,
		)
	} finally {
		process.chdir(orig)
		rmSync(root, { recursive: true, force: true })
	}
})

test("misrouted-merge: intent main has divergent commits → reconciliation refuses with structured error", async () => {
	const { root, intentMain } = setupRepoWithIntent("divergent")
	const orig = process.cwd()
	process.chdir(root)
	try {
		const stageBranch = makeStageBranch(root, "divergent", "stage-a", "work\n")
		// Misroute: merge stage into repo main.
		git(root, "checkout", "-q", "main")
		git(root, "merge", "--no-ff", "-q", "-m", "merge stage-a", stageBranch)
		git(root, "push", "-q", "origin", "main")
		// Add a divergent commit to intent main (so it's NOT an ancestor
		// of main).
		git(root, "checkout", "-q", intentMain)
		writeFileSync(join(root, "extra-on-intent-main.txt"), "extra\n")
		git(root, "add", ".")
		git(root, "commit", "-q", "-m", "extra commit on intent main")
		git(root, "push", "-q", "origin", intentMain)
		git(root, "fetch", "-q", "origin")
		git(root, "checkout", "-q", "main")

		const { reconcileMisroutedStageMerges } = await import(
			"../src/git-worktree.ts"
		)
		const out = reconcileMisroutedStageMerges("divergent", ["stage-a"])
		assert.equal(out.length, 1)
		const result = out[0]
		assert.equal(result.misrouted, true)
		assert.equal(result.reconciled, false, "should NOT auto-FF on divergence")
		assert.ok(result.error, "should surface a manual-resolution error")
		assert.match(
			result.error,
			/fast-forward isn't safe|merge.*main/i,
			`error message should mention manual reconciliation, got: ${result.error}`,
		)
	} finally {
		process.chdir(orig)
		rmSync(root, { recursive: true, force: true })
	}
})

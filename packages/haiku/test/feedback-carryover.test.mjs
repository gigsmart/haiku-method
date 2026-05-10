#!/usr/bin/env npx tsx
// feedback-carryover.test.mjs — Cursor revisit semantics for Track B.
//
// When feedback opens on stage A while the cursor sits on a later
// stage B/C, the cursor must rewind: the next tick surfaces a Track-B
// action targeting stage A, not whatever Track-A work would have run
// on the active stage. The fix loop then runs against A until the FB
// closes; only then does the cursor walk forward again.
//
// Setup pattern: 3-stage continuous studio (a, b, c). Stages A and B
// are "merged" — their branches are created from intent main with no
// divergent commits, so `merge-base --is-ancestor` reports merged.
// Stage C is "active" — its branch carries a divergent commit so
// firstUnmergedStage() returns "c". From there we plant feedback in
// various places and assert what the cursor surfaces.
//
// Findings on scenarios that the pure cursor cannot exercise:
//   - #4 "branch checkout on revisit": dispatchOrchestratorAction is
//     pure observation. Branch checkout lives in haiku_run_next.ts
//     (`ensureOnStageBranch(slug, activeStage || undefined)`) and uses
//     `firstUnmergedStage` — i.e. it checks out the Track-A active
//     stage, NOT the FB target stage. The cursor returning a Track-B
//     action with stage=A does NOT cause the runtime to switch to
//     stage A's branch. Surfaced as an explicit assertion below.
//   - #5 "FB content survives merge-forward": the cursor never moves
//     git refs. Merge-forward only happens inside `workflowStartStage`
//     (orchestrator/workflow/side-effects.ts) which is invoked by
//     `merge_stage` action handlers, not by the cursor itself. We
//     therefore can't drive a real revisit-induced merge through
//     `dispatchOrchestratorAction`. Marked as a finding below; would
//     require a wider integration harness that goes through
//     handleStateTool / haiku_run_next instead of the cursor entry.

import assert from "node:assert"
import { execFileSync } from "node:child_process"
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import matter from "gray-matter"
import {
	initTestRepo,
	makeFeedback,
	makeIntent,
	makeStudio,
} from "./_v4-fixtures.mjs"

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

async function withRepo(slug, fn) {
	const dir = mkdtempSync(join(tmpdir(), "haiku-fb-carryover-"))
	const orig = process.cwd()
	try {
		const repo = initTestRepo({ repoRoot: dir, slug })
		process.chdir(dir)
		return await fn(repo)
	} finally {
		try {
			process.chdir(orig)
		} catch {
			process.chdir(tmpdir())
		}
		rmSync(dir, { recursive: true, force: true })
	}
}

async function runTick(slug) {
	const { runTickWithBranchAlignment } = await import("./_v4-fixtures.mjs")
	return runTickWithBranchAlignment(slug)
}

/**
 * Build the canonical 3-stage continuous studio fixture for these
 * tests. Each stage has the minimal hat sequence + a fix-hat sequence
 * so Track-B feedback dispatch finds something to dispatch.
 */
function buildThreeStageStudio(repoRoot) {
	makeStudio({
		repoRoot,
		studio: "fb3",
		stages: ["a", "b", "c"].map((name) => ({
			name,
			hats: ["planner", "verifier"],
			fix_hats: ["planner", "feedback-assessor"],
			review: "ask",
			review_agents: ["code-reviewer"],
		})),
	})
}

/**
 * Place A and B as already-merged, C as the active (unmerged) stage.
 *
 * `firstUnmergedStage` walks studio.stages in order and returns the
 * first stage whose `stages/<name>/units/` directory on intent main
 * has no `.md` files. Merging via `--no-ff` lands the stage branch's
 * unit files on intent main's tree — that's the merged signal the
 * cursor reads.
 *
 * To make stages A and B "actually merged", we add a per-stage unit
 * commit on each branch, switch back to main, and merge with --no-ff.
 * This yields:
 *   haiku/<slug>/main → main carries A's and B's units in the tree
 *   haiku/<slug>/a    → merged into main (units appear on main's tree)
 *   haiku/<slug>/b    → merged into main (units appear on main's tree)
 *   haiku/<slug>/c    → no units on main's tree → cursor pins here
 */
function setCursorOnStageC(repoRoot, slug) {
	const main = `haiku/${slug}/main`
	const intentDir = join(repoRoot, ".haiku", "intents", slug)
	// For each prior stage: branch off main, write per-stage unit
	// content (the new "merged" disk signal under the disk-state cursor
	// model — intent main's `stages/<X>/units/` carries merged content),
	// merge --no-ff back into main. Stage c stays diverged.
	for (const stage of ["a", "b"]) {
		const branch = `haiku/${slug}/${stage}`
		git(repoRoot, "checkout", "-b", branch)
		const unitsDir = join(intentDir, "stages", stage, "units")
		mkdirSync(unitsDir, { recursive: true })
		writeFileSync(
			join(unitsDir, "unit-01-work.md"),
			matter.stringify(`# ${stage} unit\n`, { title: `${stage}-work` }),
		)
		git(repoRoot, "add", "-A")
		git(repoRoot, "commit", "-m", `${stage} work`)
		git(repoRoot, "checkout", main)
		git(
			repoRoot,
			"merge",
			"--no-ff",
			"--no-edit",
			"-m",
			`merge ${stage}`,
			branch,
		)
	}
	const cBranch = `haiku/${slug}/c`
	git(repoRoot, "checkout", "-b", cBranch)
	const marker = join(intentDir, "stages", "c")
	mkdirSync(marker, { recursive: true })
	writeFileSync(join(marker, ".c-marker"), "active stage divergence\n")
	git(repoRoot, "add", "-A")
	git(repoRoot, "commit", "-m", "diverge stage c from main")
}

function currentBranch(repoRoot) {
	return git(repoRoot, "rev-parse", "--abbrev-ref", "HEAD")
}

// ── Scenario 1: basic carryover ──────────────────────────────────────

test("FB on stage A carries over: cursor on C surfaces stage-A action", async () => {
	if (!HAS_GIT) return
	await withRepo("fb-carry-basic", async ({ repoRoot, intentDir, slug }) => {
		buildThreeStageStudio(repoRoot)
		makeIntent({
			intentDir,
			slug,
			studio: "fb3",
			extraFm: { stages: ["a", "b", "c"] },
		})
		setCursorOnStageC(repoRoot, slug)

		makeFeedback({
			intentDir,
			stage: "a",
			id: "01",
			title: "stage-a concern",
			body: "needs revisit",
			closed: false,
		})

		const action = await runTick(slug)
		assert.strictEqual(
			action.action,
			"start_feedback_hat",
			`expected start_feedback_hat (Track B); got '${action.action}'`,
		)
		assert.strictEqual(
			action.stage,
			"a",
			`expected revisit to stage A; got stage='${action.stage}'`,
		)
		assert.ok(
			Array.isArray(action.feedback_ids) &&
				action.feedback_ids.includes("FB-001"),
			`expected FB-001 in feedback_ids; got ${JSON.stringify(action.feedback_ids)}`,
		)
	})
})

// ── Scenario 2: earliest unaddressed stage wins ──────────────────────

test("multiple earlier-stage FBs: cursor picks A (earliest), not B", async () => {
	if (!HAS_GIT) return
	await withRepo("fb-carry-earliest", async ({ repoRoot, intentDir, slug }) => {
		buildThreeStageStudio(repoRoot)
		makeIntent({
			intentDir,
			slug,
			studio: "fb3",
			extraFm: { stages: ["a", "b", "c"] },
		})
		setCursorOnStageC(repoRoot, slug)

		makeFeedback({
			intentDir,
			stage: "a",
			id: "01",
			title: "a fb",
			body: "a",
			closed: false,
		})
		makeFeedback({
			intentDir,
			stage: "b",
			id: "01",
			title: "b fb",
			body: "b",
			closed: false,
		})

		const action = await runTick(slug)
		assert.strictEqual(action.action, "start_feedback_hat")
		assert.strictEqual(
			action.stage,
			"a",
			`earliest-first rule: expected stage A even with B also open; got '${action.stage}'`,
		)
	})
})

// ── Scenario 3: closed FB on earlier stage doesn't carry over ────────

test("closed FB on earlier stage is skipped; cursor walks Track A on active stage", async () => {
	if (!HAS_GIT) return
	await withRepo("fb-carry-closed", async ({ repoRoot, intentDir, slug }) => {
		buildThreeStageStudio(repoRoot)
		makeIntent({
			intentDir,
			slug,
			studio: "fb3",
			extraFm: { stages: ["a", "b", "c"] },
		})
		setCursorOnStageC(repoRoot, slug)

		makeFeedback({
			intentDir,
			stage: "a",
			id: "01",
			title: "already-closed",
			body: "resolved",
			closed: true, // sets closed_at
		})

		const action = await runTick(slug)
		// Track B should skip the closed FB. Cursor falls through to
		// Track A on stage C — which has no units yet, so the action
		// is `elaborate(c)`.
		assert.notStrictEqual(
			action.action,
			"start_feedback_hat",
			`closed FB must not preempt Track A; got start_feedback_hat`,
		)
		assert.strictEqual(
			action.stage,
			"c",
			`expected Track-A action on active stage C; got stage='${action.stage}'`,
		)
	})
})

// ── Scenario 4: branch state is NOT changed by the pure cursor ────────

test("dispatchOrchestratorAction does not switch branches on revisit (pure cursor)", async () => {
	if (!HAS_GIT) return
	await withRepo("fb-carry-branch", async ({ repoRoot, intentDir, slug }) => {
		buildThreeStageStudio(repoRoot)
		makeIntent({
			intentDir,
			slug,
			studio: "fb3",
			extraFm: { stages: ["a", "b", "c"] },
		})
		setCursorOnStageC(repoRoot, slug)

		makeFeedback({
			intentDir,
			stage: "a",
			id: "01",
			title: "stage-a concern",
			body: "needs revisit",
			closed: false,
		})

		// Pre-tick: we're on haiku/<slug>/c (set by setCursorOnStageC).
		const before = currentBranch(repoRoot)
		assert.strictEqual(
			before,
			`haiku/${slug}/c`,
			"precondition: on stage C branch",
		)

		const action = await runTick(slug)
		assert.strictEqual(action.action, "start_feedback_hat")
		assert.strictEqual(action.stage, "a")

		// Post-tick: pure cursor doesn't checkout. Branch unchanged.
		// Branch switching to the FB target stage is a runtime concern
		// (haiku_run_next + ensureOnStageBranch), not a cursor concern,
		// and even there the guard uses firstUnmergedStage (active
		// stage), not the FB target. Documenting via assertion.
		const after = currentBranch(repoRoot)
		assert.strictEqual(
			after,
			`haiku/${slug}/c`,
			`pure cursor should not change branches; was '${before}', now '${after}'`,
		)
	})
})

// ── Scenario 6: intent-scope FB does NOT cause stage rewind ──────────

test("intent-scope FB surfaces on current stage, not as a rewind", async () => {
	if (!HAS_GIT) return
	await withRepo(
		"fb-carry-intent-scope",
		async ({ repoRoot, intentDir, slug }) => {
			buildThreeStageStudio(repoRoot)
			makeIntent({
				intentDir,
				slug,
				studio: "fb3",
				extraFm: { stages: ["a", "b", "c"] },
			})
			setCursorOnStageC(repoRoot, slug)

			// No stage-scope FBs. Just an intent-scope one.
			makeFeedback({
				intentDir,
				stage: "", // intent-scope
				id: "01",
				title: "intent-wide concern",
				body: "intent scope",
				origin: "studio-review",
				closed: false,
			})

			const action = await runTick(slug)
			// Track B walks intent-scope FBs after stage-scope ones, and
			// dispatches them with `currentStage` (= active stage = C).
			assert.strictEqual(action.action, "start_feedback_hat")
			assert.strictEqual(
				action.stage,
				"c",
				`intent-scope FB must dispatch on current stage, not rewind to A; got '${action.stage}'`,
			)
			assert.notStrictEqual(
				action.stage,
				"a",
				"intent-scope FB must not rewind to stage A",
			)
		},
	)
})

// ── Sanity: intent-scope FB FILE LOCATION proves it's not a rewind ───

test("intent-scope FB lives at <intentDir>/feedback/, not under any stage", async () => {
	if (!HAS_GIT) return
	await withRepo(
		"fb-carry-fb-location",
		async ({ repoRoot, intentDir, slug }) => {
			buildThreeStageStudio(repoRoot)
			makeIntent({
				intentDir,
				slug,
				studio: "fb3",
				extraFm: { stages: ["a", "b", "c"] },
			})
			setCursorOnStageC(repoRoot, slug)

			const result = makeFeedback({
				intentDir,
				stage: "",
				id: "01",
				title: "intent fb",
				body: "x",
				origin: "studio-review",
				closed: false,
			})

			// Path must be under <intentDir>/feedback/, not <intentDir>/stages/*/feedback/.
			assert.ok(
				result.path.startsWith(join(intentDir, "feedback")),
				`expected intent-scope FB under <intent>/feedback; got ${result.path}`,
			)
			// FM body integrity round-trip — we'll need this same shape if a
			// future test exercises FB-content-survives-merge.
			const parsed = matter(readFileSync(result.path, "utf8"))
			assert.strictEqual(parsed.data.origin, "studio-review")
			assert.strictEqual(parsed.data.closed_at, null)
		},
	)
})

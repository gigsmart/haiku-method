// Integration test for haiku_run_next + Track-B revisit branch alignment.
//
// When the cursor returns `start_feedback_hat` for a stage *earlier*
// than firstUnmergedStage (a feedback rewind), haiku_run_next must
// realign the working tree to that earlier stage's branch BEFORE
// returning the action — otherwise the agent's fix-hat work commits
// land on the wrong branch.
//
// This test drives haiku_run_next.handle directly (not the cursor in
// isolation) to cover the post-cursor branch-alignment guard added
// in 2026-05-06.

import { test } from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import matter from "gray-matter"
import {
	initTestRepo,
	makeFeedback,
	makeIntent,
	makeStudio,
} from "./_v4-fixtures.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, "..", "src")

function git(cwd, ...args) {
	return execFileSync("git", args, {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim()
}

function currentBranch(cwd) {
	return git(cwd, "rev-parse", "--abbrev-ref", "HEAD")
}

async function withRepo(slug, fn) {
	const repoRoot = mkdtempSync(join(tmpdir(), "rn-revisit-"))
	const orig = process.cwd()
	process.chdir(repoRoot)
	try {
		// Bare repo + initial commit. initTestRepo creates the intent
		// branch (haiku/<slug>/main) and intent dir.
		const { intentDir } = initTestRepo({ repoRoot, slug })
		git(repoRoot, "config", "commit.gpgsign", "false")

		// Synthetic 3-stage continuous studio.
		const studio = "test-studio"
		makeStudio({
			repoRoot,
			studio,
			stages: [
				{
					name: "a",
					hats: ["planner", "builder", "verifier"],
					fix_hats: ["builder", "feedback-assessor"],
					review: "ask",
					review_agents: ["code-reviewer"],
				},
				{
					name: "b",
					hats: ["planner", "builder", "verifier"],
					fix_hats: ["builder", "feedback-assessor"],
					review: "ask",
					review_agents: ["code-reviewer"],
				},
				{
					name: "c",
					hats: ["planner", "builder", "verifier"],
					fix_hats: ["builder", "feedback-assessor"],
					review: "ask",
					review_agents: ["code-reviewer"],
				},
			],
		})
		makeIntent({ intentDir, slug, studio })

		await fn({ repoRoot, intentDir, slug, studio })
	} finally {
		process.chdir(orig)
		rmSync(repoRoot, { recursive: true, force: true })
	}
}

/**
 * Drive a stage to "merged" by creating the stage branch with at least
 * one commit ahead of intent main, then merging it back. Mirrors what
 * `merge_stage` would do in real flow.
 */
function landStage(repoRoot, slug, stage) {
	const stageBranch = `haiku/${slug}/${stage}`
	const mainBranch = `haiku/${slug}/main`
	git(repoRoot, "checkout", "-q", "-b", stageBranch)
	// Write per-stage unit content under the intent dir — that's the
	// new "merged" disk signal the cursor reads from intent main.
	const unitsDir = join(
		repoRoot,
		".haiku",
		"intents",
		slug,
		"stages",
		stage,
		"units",
	)
	mkdirSync(unitsDir, { recursive: true })
	writeFileSync(
		join(unitsDir, "unit-01-work.md"),
		matter.stringify(`# ${stage} unit\n`, { title: `${stage}-work` }),
	)
	git(repoRoot, "add", "-A")
	git(repoRoot, "commit", "-q", "-m", `${stage} work`)
	git(repoRoot, "checkout", "-q", mainBranch)
	git(
		repoRoot,
		"merge",
		"--no-ff",
		"--no-edit",
		"-m",
		`merge ${stage}`,
		stageBranch,
	)
}

test("run_next: FB on earlier stage rewinds branch + cursor returns Track-B action", async () => {
	const slug = "rev1"
	await withRepo(slug, async ({ repoRoot, intentDir }) => {
		// Land stages a and b. Stage c left unfinished (the active
		// stage). Now firstUnmergedStage = c.
		landStage(repoRoot, slug, "a")
		landStage(repoRoot, slug, "b")
		// Create stage c branch with divergent commit so it's "active."
		git(repoRoot, "checkout", "-q", "-b", `haiku/${slug}/c`)
		writeFileSync(join(repoRoot, "c.txt"), "c in flight\n")
		git(repoRoot, "add", "-A")
		git(repoRoot, "commit", "-q", "-m", "c in flight")
		// Cursor entrypoint requires us to be on a stage branch on
		// entry; switch to main so the pre-tick guard moves us to c.
		git(repoRoot, "checkout", "-q", `haiku/${slug}/main`)

		// Open an FB on stage A's per-stage feedback dir. This forces
		// the cursor to walk Track B back to stage a.
		makeFeedback({
			intentDir,
			stage: "a",
			id: "FB-001",
			title: "rewind to a",
			body: "agent left a thing on stage a",
			origin: "user-chat",
			author: "user",
		})

		// Drive haiku_run_next via its handler.
		const { orchestratorToolHandlers } = await import(
			`${SRC}/tools/orchestrator/index.ts`
		)
		const runNextTool = orchestratorToolHandlers.get("haiku_run_next")
		const resp = await runNextTool.handle({ intent: slug })
		// Tool responses are MCP envelopes; the structured action lives
		// inside an embedded JSON block in the text response, but the
		// tool also exposes the action via _meta. The simplest signal:
		// inspect the rendered text to confirm the action name and the
		// stage.
		const text = resp.content?.[0]?.text ?? ""
		assert.match(
			text,
			/start_feedback_hat/,
			`expected start_feedback_hat in response; got: ${text.slice(0, 400)}`,
		)
		assert.match(
			text,
			/"stage":\s*"a"/,
			`expected stage="a" in response; got: ${text.slice(0, 400)}`,
		)

		// Branch must be aligned to stage a now.
		assert.equal(
			currentBranch(repoRoot),
			`haiku/${slug}/a`,
			`run_next should have checked out haiku/${slug}/a after Track-B revisit; got ${currentBranch(repoRoot)}`,
		)
	})
})

test("run_next: action with no stage doesn't disturb the branch", async () => {
	// Sanity: when the cursor returns an intent-scope action (no
	// stage), the post-cursor revisit guard must NOT do anything.
	const slug = "rev2"
	await withRepo(slug, async ({ repoRoot, intentDir }) => {
		// Land all three stages so the cursor goes intent-level.
		landStage(repoRoot, slug, "a")
		landStage(repoRoot, slug, "b")
		landStage(repoRoot, slug, "c")
		git(repoRoot, "checkout", "-q", `haiku/${slug}/main`)

		const before = currentBranch(repoRoot)
		const { orchestratorToolHandlers } = await import(
			`${SRC}/tools/orchestrator/index.ts`
		)
		const runNextTool = orchestratorToolHandlers.get("haiku_run_next")
		const resp = await runNextTool.handle({ intent: slug })
		const text = resp.content?.[0]?.text ?? ""
		assert.match(
			text,
			/intent_review|merge_intent|sealed/,
			`expected an intent-scope action; got: ${text.slice(0, 200)}`,
		)
		assert.equal(currentBranch(repoRoot), before)
	})
})

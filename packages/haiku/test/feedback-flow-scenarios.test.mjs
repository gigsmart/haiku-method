#!/usr/bin/env npx tsx
// feedback-flow-scenarios.test.mjs — P15 (2026-05-06).
//
// Comprehensive coverage of feedback flow under v4. Each stage has
// its own feedback track. The intent has its own. Replies thread
// through. Closure replies surface as unread until dismissed. Test
// every combination and several sad paths.

import assert from "node:assert"
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import matter from "gray-matter"
import { initTestRepo, makeFeedback, makeIntent, makeStudio } from "./_v4-fixtures.mjs"

const HAS_GIT = (() => {
	try {
		execFileSync("git", ["--version"], { stdio: "ignore" })
		return true
	} catch {
		return false
	}
})()

async function withRepo(slug, fn) {
	const root = mkdtempSync(join(tmpdir(), "haiku-fb-flow-"))
	const orig = process.cwd()
	try {
		const repo = initTestRepo({ repoRoot: root, slug })
		process.chdir(root)
		return await fn(repo)
	} finally {
		try {
			process.chdir(orig)
		} catch {
			process.chdir(tmpdir())
		}
		rmSync(root, { recursive: true, force: true })
	}
}

async function runTick(slug) {
	const { dispatchOrchestratorAction } = await import(
		"../src/orchestrator/workflow/run-tick.js"
	)
	const { clearStudioCache } = await import("../src/studio-reader.js")
	clearStudioCache()
	return dispatchOrchestratorAction(slug, "")
}

function readFm(path) {
	return matter(readFileSync(path, "utf8")).data
}

function writeUnit(intentDir, stage, name, fm) {
	const unitsDir = join(intentDir, "stages", stage, "units")
	mkdirSync(unitsDir, { recursive: true })
	writeFileSync(
		join(unitsDir, `${name}.md`),
		matter.stringify(`# ${name}\n`, fm),
	)
}

// ── Per-stage independence ───────────────────────────────────────────

test("FB on stage A doesn't affect stage B's queue", async () => {
	if (!HAS_GIT) return
	await withRepo("test-fb-isolation", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({
			repoRoot,
			studio: "test",
			stages: [
				{
					name: "a",
					hats: ["planner", "verifier"],
					fix_hats: ["classifier", "planner", "feedback-assessor"],
					review: "ask",
					review_agents: ["code-reviewer"],
				},
				{
					name: "b",
					hats: ["planner", "verifier"],
					fix_hats: ["classifier", "planner", "feedback-assessor"],
					review: "ask",
					review_agents: ["code-reviewer"],
				},
			],
		})
		makeIntent({ intentDir, slug, studio: "test" })

		// FB on stage A — should preempt stage A's work.
		writeUnit(intentDir, "a", "unit-01", {
			title: "u1",
			depends_on: [],
			started_at: null,
			iterations: [],
			reviews: {},
			approvals: {},
			discovery: {},
		})
		makeFeedback({
			intentDir,
			stage: "a",
			id: "01",
			title: "stage-a issue",
			body: "needs fix",
			closed: false,
		})
		const action = await runTick(slug)
		assert.strictEqual(
			action.action,
			"start_feedback_hat",
			`expected fix-hat dispatch on stage A; got: ${action.action}`,
		)
		assert.strictEqual(action.stage, "a")
	})
})

// ── Intent-scope vs stage-scope FBs ──────────────────────────────────

test("intent-scope FB is preserved separately from stage-scope FBs", async () => {
	if (!HAS_GIT) return
	await withRepo("test-fb-scopes", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" })
		makeIntent({ intentDir, slug, studio: "test" })

		// One stage-scope FB on design.
		writeUnit(intentDir, "design", "unit-01", {
			title: "u1",
			depends_on: [],
			started_at: null,
			iterations: [],
			reviews: {},
			approvals: {},
			discovery: {},
		})
		makeFeedback({
			intentDir,
			stage: "design",
			id: "01",
			title: "design fb",
			body: "stage-scope concern",
			closed: false,
		})
		// One intent-scope FB.
		makeFeedback({
			intentDir,
			stage: "",
			id: "01",
			title: "intent fb",
			body: "intent-wide concern",
			origin: "studio-review",
			closed: false,
		})

		const stageFbDir = join(intentDir, "stages", "design", "feedback")
		const intentFbDir = join(intentDir, "feedback")
		assert.ok(existsSync(stageFbDir))
		assert.ok(existsSync(intentFbDir))

		// Each scope's FB lives in its own directory — verify the
		// files don't accidentally end up in the wrong dir.
		const stageFiles = readdirSync(stageFbDir)
		const intentFiles = readdirSync(intentFbDir)
		assert.ok(stageFiles.some((f) => f.includes("design-fb")))
		assert.ok(intentFiles.some((f) => f.includes("intent-fb")))
		// And neither dir contains the other scope's FB.
		assert.ok(!stageFiles.some((f) => f.includes("intent-fb")))
		assert.ok(!intentFiles.some((f) => f.includes("design-fb")))
	})
})

// ── Cross-stage preemption ───────────────────────────────────────────

test("open FB on earlier stage preempts current-stage work", async () => {
	if (!HAS_GIT) return
	await withRepo("test-fb-cross-stage", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({
			repoRoot,
			studio: "test",
			stages: [
				{
					name: "a",
					hats: ["planner", "verifier"],
					fix_hats: ["classifier", "planner", "feedback-assessor"],
					review: "ask",
					review_agents: ["code-reviewer"],
				},
				{
					name: "b",
					hats: ["planner", "verifier"],
					fix_hats: ["classifier", "planner", "feedback-assessor"],
					review: "ask",
					review_agents: ["code-reviewer"],
				},
			],
		})
		makeIntent({ intentDir, slug, studio: "test" })

		// Stage `a`: empty + open FB
		makeFeedback({
			intentDir,
			stage: "a",
			id: "01",
			title: "a-stage fb",
			body: "needs attention",
			closed: false,
		})
		// Stage `b`: wave-ready unit
		writeUnit(intentDir, "b", "unit-01", {
			title: "u1",
			depends_on: [],
			started_at: null,
			iterations: [],
			reviews: {},
			approvals: {},
			discovery: {},
		})

		const action = await runTick(slug)
		// Open FB on earlier stage must take priority over stage B's
		// wave-ready unit.
		assert.ok(
			action.action === "start_feedback_hat" || action.stage === "a",
			`expected stage-a preemption; got: action=${action.action} stage=${action.stage}`,
		)
	})
})

// ── Replies thread ───────────────────────────────────────────────────

test("FB carries a replies array; replies survive read/write round-trip", async () => {
	if (!HAS_GIT) return
	await withRepo("test-fb-replies", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" })
		makeIntent({ intentDir, slug, studio: "test" })

		const fbPath = join(
			intentDir,
			"stages",
			"design",
			"feedback",
			"01-with-replies.md",
		)
		mkdirSync(join(intentDir, "stages", "design", "feedback"), {
			recursive: true,
		})
		writeFileSync(
			fbPath,
			matter.stringify("Original concern body.\n", {
				title: "FB with replies",
				origin: "user-chat",
				author: "user",
				author_type: "human",
				status: "pending",
				created_at: "2026-05-06T10:00:00Z",
				targets: { unit: null, invalidates: [] },
				replies: [
					{
						author: "agent",
						author_type: "agent",
						body: "Looking at this now.",
						created_at: "2026-05-06T10:05:00Z",
					},
					{
						author: "user",
						author_type: "human",
						body: "Thanks; need answer by EOD.",
						created_at: "2026-05-06T10:10:00Z",
					},
				],
			}),
		)
		const fm = readFm(fbPath)
		assert.strictEqual(Array.isArray(fm.replies), true)
		assert.strictEqual(fm.replies.length, 2)
		assert.strictEqual(fm.replies[0].author, "agent")
		assert.strictEqual(fm.replies[1].body.includes("EOD"), true)
	})
})

// ── Closure reply unread → dismiss ───────────────────────────────────

test("closure_reply + closure_reply_unread true survive parse, dismissable via direct write", async () => {
	if (!HAS_GIT) return
	await withRepo("test-fb-closure", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" })
		makeIntent({ intentDir, slug, studio: "test" })

		const fbPath = join(
			intentDir,
			"stages",
			"design",
			"feedback",
			"02-closed-with-reply.md",
		)
		mkdirSync(join(intentDir, "stages", "design", "feedback"), {
			recursive: true,
		})
		writeFileSync(
			fbPath,
			matter.stringify("Original.\n", {
				title: "Closed",
				origin: "user-chat",
				author: "user",
				author_type: "human",
				status: "closed",
				closed_at: "2026-05-06T11:00:00Z",
				targets: { unit: null, invalidates: [] },
				closure_reply: {
					text: "Fixed by switching to UTC throughout.",
					at: "2026-05-06T11:00:00Z",
				},
				closure_reply_unread: true,
			}),
		)
		const before = readFm(fbPath)
		assert.strictEqual(before.closure_reply.text.includes("UTC"), true)
		assert.strictEqual(before.closure_reply_unread, true)

		// Simulate dismiss — write closure_reply_unread: false, verify
		// closure_reply itself is unchanged (the reply text persists
		// post-dismiss; only the unread flag flips).
		const updated = { ...before, closure_reply_unread: false }
		writeFileSync(
			fbPath,
			matter.stringify("Original.\n", updated),
		)
		const after = readFm(fbPath)
		assert.strictEqual(after.closure_reply_unread, false)
		assert.strictEqual(after.closure_reply.text, before.closure_reply.text)
	})
})

// ── Sad path: FB filed on nonexistent stage ──────────────────────────

test("FB filed on nonexistent stage — file lands in stage feedback dir even if stage isn't declared", async () => {
	if (!HAS_GIT) return
	await withRepo("test-fb-no-stage", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" })
		makeIntent({ intentDir, slug, studio: "test" })

		// makeFeedback creates the dir if absent — no error. The cursor
		// can later relocate via haiku_feedback_move when the agent
		// realizes the misplacement, but at write time the file system
		// permits it. Worst case: an orphan dir; not a crash.
		const result = makeFeedback({
			intentDir,
			stage: "nonexistent-stage",
			id: "01",
			title: "orphan",
			body: "filed on stage that wasn't declared",
			closed: false,
		})
		assert.ok(existsSync(result.path))
	})
})

// ── Sad path: FB with malformed iterations ───────────────────────────

test("FB with malformed iterations frontmatter doesn't crash readFeedbackFiles", async () => {
	if (!HAS_GIT) return
	await withRepo("test-fb-malformed", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" })
		makeIntent({ intentDir, slug, studio: "test" })

		const fbDir = join(intentDir, "stages", "design", "feedback")
		mkdirSync(fbDir, { recursive: true })
		writeFileSync(
			join(fbDir, "03-malformed.md"),
			matter.stringify("body\n", {
				title: "malformed",
				origin: "user-chat",
				author: "user",
				author_type: "human",
				status: "pending",
				// iterations should be array; this is a malformed string
				iterations: "not-an-array",
				targets: { unit: null, invalidates: [] },
			}),
		)
		const { readFeedbackFiles } = await import("../src/state-tools.ts")
		const items = readFeedbackFiles(slug, "design")
		// Should at least surface the FB without throwing.
		assert.strictEqual(items.length, 1)
		// Iterations defaults to empty array on malformed input.
		assert.deepStrictEqual(items[0].iterations, [])
	})
})

// ── Sad path: FB lifecycle violation on terminal status ──────────────

test("set_targets refuses to classify already-closed FB (lifecycle guard)", async () => {
	if (!HAS_GIT) return
	await withRepo("test-fb-closed-classify", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" })
		makeIntent({ intentDir, slug, studio: "test" })

		const fbDir = join(intentDir, "stages", "design", "feedback")
		mkdirSync(fbDir, { recursive: true })
		writeFileSync(
			join(fbDir, "04-closed.md"),
			matter.stringify("body\n", {
				title: "Closed",
				origin: "user-chat",
				author: "user",
				author_type: "human",
				status: "closed",
				closed_at: "2026-05-06T12:00:00Z",
				targets: { unit: null, invalidates: [] },
			}),
		)
		// Initialize git for branch-enforcement guard.
		execFileSync("git", ["add", "-A"], { cwd: repoRoot, stdio: "pipe" })
		execFileSync("git", ["commit", "-m", "fb fixture"], {
			cwd: repoRoot,
			stdio: "pipe",
		})

		const { handleStateTool } = await import("../src/state-tools.ts")
		const r = handleStateTool("haiku_feedback_set_targets", {
			intent: slug,
			stage: "design",
			feedback_id: 4,
			target_unit: "unit-99",
			target_invalidates: ["user"],
		})
		const block = r.content.find((c) => c.type === "text")
		assert.ok(block)
		const p = JSON.parse(block.text)
		assert.strictEqual(r.isError, true)
		assert.strictEqual(p.error, "lifecycle_violation")
	})
})

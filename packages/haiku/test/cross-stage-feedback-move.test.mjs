// cross-stage-feedback-move.test.mjs — Regression test for v3 plugin
// 3.16.3 bug surfaced in panda's session 2026-05-06: cross-stage
// `haiku_feedback_move` failed with "feedback not found in stage X"
// even though the file existed on disk. Same-stage move (triage
// confirm — to_stage equals stage) worked. The agent eventually
// diagnosed it: "The cross-stage move appears to have a bug in
// 3.16.3 — same-stage confirms work, but to_stage to a different
// stage fails." Workaround was to triage all FBs on the source stage
// instead of routing to their owning stage, losing cross-stage
// routing as a feature.
//
// This test pins the v4 contract: cross-stage move must succeed as
// long as (1) source FB exists, (2) target stage exists, (3) FB is
// not closed/rejected. The file should physically relocate, get a
// fresh FB-NN at the target, and stamp triaged_at.

import { test } from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
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
	const repoRoot = mkdtempSync(join(tmpdir(), `csfm-${slug}-`))
	const orig = process.cwd()
	process.chdir(repoRoot)
	try {
		const { intentDir } = initTestRepo({ repoRoot, slug })
		git(repoRoot, "config", "commit.gpgsign", "false")
		await fn({ repoRoot, intentDir, slug })
	} finally {
		process.chdir(orig)
		rmSync(repoRoot, { recursive: true, force: true })
	}
}

function buildTwoStageStudio(repoRoot) {
	makeStudio({
		repoRoot,
		studio: "csfm",
		stages: [
			{
				name: "inception",
				hats: ["planner", "verifier"],
				fix_hats: ["classifier", "feedback-assessor"],
				review: "ask",
				review_agents: ["code-reviewer"],
			},
			{
				name: "design",
				hats: ["planner", "verifier"],
				fix_hats: ["classifier", "feedback-assessor"],
				review: "ask",
				review_agents: ["code-reviewer"],
			},
		],
	})
}

test("haiku_feedback_move: cross-stage relocation moves the file (panda 2026-05-06 v3 regression)", async () => {
	if (!HAS_GIT) return
	await withRepo("csfm-cross", async ({ repoRoot, intentDir, slug }) => {
		buildTwoStageStudio(repoRoot)
		makeIntent({
			intentDir,
			slug,
			studio: "csfm",
			mode: "continuous",
			extraFm: { stages: ["inception", "design"] },
		})
		// User-authored FB on inception that the agent decides should
		// route to design.
		// makeFeedback's `id` is the numeric prefix used in the
		// on-disk filename (`08-…md`). Agent-facing FB IDs are
		// `FB-NN`; the engine handler normalises both forms.
		makeFeedback({
			intentDir,
			stage: "inception",
			id: "08",
			title: "chart spec belongs to design",
			body: "x-axis dates, y-axis day count — design surface",
			origin: "user-chat",
			author: "user",
		})

		const inceptionFbDir = join(
			intentDir,
			"stages",
			"inception",
			"feedback",
		)
		const designFbDir = join(intentDir, "stages", "design", "feedback")
		assert.ok(
			existsSync(join(inceptionFbDir, "008-chart-spec-belongs-to-design.md")),
			"setup: FB-008 should land on inception",
		)

		// Switch to the target stage's branch — v4 enforceStageBranch
		// requires the agent be on the target's branch for the write side.
		try {
			git(repoRoot, "checkout", "-q", "-b", `haiku/${slug}/design`)
		} catch {
			git(repoRoot, "checkout", "-q", `haiku/${slug}/design`)
		}

		const { handleStateTool } = await import(
			"../src/state-tools.ts"
		)
		const { clearStudioCache } = await import("../src/studio-reader.ts")
		clearStudioCache()
		const result = handleStateTool("haiku_feedback_move", {
			intent: slug,
			stage: "inception",
			feedback_id: 8,
			to_stage: "design",
		})
		assert.ok(
			!result.isError,
			`expected cross-stage move to succeed; got: ${JSON.stringify(result)}`,
		)
		const text = result.content?.[0]?.text ?? ""
		const parsed = JSON.parse(text)
		assert.strictEqual(
			parsed.moved,
			true,
			`expected moved: true on cross-stage relocation; got: ${text}`,
		)
		assert.ok(
			typeof parsed.feedback_id === "string" && parsed.feedback_id.startsWith("FB-"),
			`expected new FB-NN id; got: ${parsed.feedback_id}`,
		)
		assert.ok(
			parsed.file.includes("/stages/design/feedback/"),
			`file should now be in design's feedback dir; got: ${parsed.file}`,
		)
		assert.ok(parsed.triaged_at, "expected triaged_at to be stamped")

		// File should be physically gone from the source dir and present in the target.
		const srcAfter = existsSync(inceptionFbDir)
			? readdirSync(inceptionFbDir)
			: []
		const dstAfter = existsSync(designFbDir) ? readdirSync(designFbDir) : []
		assert.equal(
			srcAfter.length,
			0,
			`expected source dir to be empty after relocation; got: ${srcAfter}`,
		)
		assert.equal(
			dstAfter.length,
			1,
			`expected target dir to have 1 file; got: ${dstAfter}`,
		)
	})
})

test("haiku_feedback_move: same-stage call confirms triage without moving the file", async () => {
	if (!HAS_GIT) return
	await withRepo("csfm-same", async ({ repoRoot, intentDir, slug }) => {
		buildTwoStageStudio(repoRoot)
		makeIntent({
			intentDir,
			slug,
			studio: "csfm",
			mode: "continuous",
			extraFm: { stages: ["inception", "design"] },
		})
		makeFeedback({
			intentDir,
			stage: "inception",
			id: "07",
			title: "stays here",
			body: "belongs on inception",
			origin: "user-chat",
			author: "user",
		})

		try {
			git(repoRoot, "checkout", "-q", "-b", `haiku/${slug}/inception`)
		} catch {
			git(repoRoot, "checkout", "-q", `haiku/${slug}/inception`)
		}

		const { handleStateTool } = await import(
			"../src/state-tools.ts"
		)
		const { clearStudioCache } = await import("../src/studio-reader.ts")
		clearStudioCache()
		const result = handleStateTool("haiku_feedback_move", {
			intent: slug,
			stage: "inception",
			feedback_id: 7,
			to_stage: "inception",
		})
		assert.ok(!result.isError)
		const parsed = JSON.parse(result.content[0].text)
		assert.strictEqual(parsed.moved, false, "same-stage move is triage-only")
		assert.ok(parsed.triaged_at)
	})
})

test("haiku_feedback_move: rejects when target stage isn't a stage of the intent", async () => {
	if (!HAS_GIT) return
	await withRepo("csfm-bad-stage", async ({ repoRoot, intentDir, slug }) => {
		buildTwoStageStudio(repoRoot)
		makeIntent({
			intentDir,
			slug,
			studio: "csfm",
			mode: "continuous",
			extraFm: { stages: ["inception", "design"] },
		})
		makeFeedback({
			intentDir,
			stage: "inception",
			id: "01",
			title: "fb-01",
			body: "...",
			origin: "user-chat",
			author: "user",
		})

		const { handleStateTool } = await import(
			"../src/state-tools.ts"
		)
		const { clearStudioCache } = await import("../src/studio-reader.ts")
		clearStudioCache()
		const result = handleStateTool("haiku_feedback_move", {
			intent: slug,
			stage: "inception",
			feedback_id: 1,
			to_stage: "phantom-stage",
		})
		assert.ok(result.isError)
		const text = result.content?.[0]?.text ?? ""
		assert.ok(
			text.includes("phantom-stage") &&
				text.toLowerCase().includes("not a stage"),
			`expected target-stage rejection; got: ${text}`,
		)
	})
})

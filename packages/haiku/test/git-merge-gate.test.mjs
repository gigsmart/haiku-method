#!/usr/bin/env npx tsx
// Tests for the three pure-git code paths added in this PR:
//   1. getCurrentState isDone merge-gate (current-state.ts:118-134)
//   2. gate_outcome=advanced handler (gate.ts:560-607)
//   3. checkoutFromBranchOnIntentMain (git-worktree.ts:1379-1454)
//
// All three require a real git repo. Each section creates an isolated
// tmpdir git repo, exercises the path, and cleans up.

import assert from "node:assert"
import { execSync } from "node:child_process"
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import matter from "gray-matter"

const __dirname = dirname(fileURLToPath(import.meta.url))
process.env.CLAUDE_PLUGIN_ROOT = resolve(__dirname, "..", "..", "..", "plugin")

const { getCurrentState } = await import("../src/current-state.ts")
const { runWorkflowTick } = await import(
	"../src/orchestrator/workflow/run-tick.ts"
)
const { checkoutFromBranchOnIntentMain } = await import(
	"../src/git-worktree.ts"
)
const { _resetIsGitRepoForTests, setHaikuRootForTests } = await import(
	"../src/state/shared.ts"
)
const { resolveStageHats: _resolveStageHats } = await import(
	"../src/orchestrator/studio.ts"
)
const { readReviewAgentPaths: _readReviewAgentPaths } = await import(
	"../src/studio-reader.ts"
)

let passed = 0
let failed = 0
const origCwd = process.cwd()

function test(name, fn) {
	try {
		fn()
		passed++
		console.log(`  ✓ ${name}`)
	} catch (err) {
		failed++
		console.log(`  ✗ ${name}`)
		console.log(`    ${err.message}`)
	}
}

// ── Git repo helpers ──────────────────────────────────────────────────────────

function makeGitRepo() {
	const root = mkdtempSync(join(tmpdir(), "haiku-git-gate-"))
	function git(cmd) {
		return execSync(cmd, { cwd: root, stdio: "pipe", encoding: "utf8" }).trim()
	}
	git("git init -b main")
	git("git config user.email test@example.com")
	git("git config user.name Test")
	git("git commit --allow-empty -m init")
	return {
		root,
		git,
		cleanup: () => rmSync(root, { recursive: true, force: true }),
	}
}

function writeIntent(root, slug, frontmatter) {
	const iDir = join(root, ".haiku", "intents", slug)
	mkdirSync(iDir, { recursive: true })
	const lines = ["---"]
	for (const [k, v] of Object.entries(frontmatter)) {
		if (v == null) continue
		if (typeof v === "boolean") lines.push(`${k}: ${v}`)
		else lines.push(`${k}: "${v}"`)
	}
	lines.push("---", "", "# Body")
	writeFileSync(join(iDir, "intent.md"), lines.join("\n"))
}

function writeStageState(root, slug, stage, state) {
	const sd = join(root, ".haiku", "intents", slug, "stages", stage)
	mkdirSync(sd, { recursive: true })
	writeFileSync(join(sd, "state.json"), JSON.stringify(state, null, 2))
}

/** v4: write a fully-signed unit (terminal hat advance + every required
 *  approval). Mirrors the canonical "stage is logically completed"
 *  signal the cursor reads. Studio-aware so the hats and review-agent
 *  set match what `derivedStageState` expects. */
function writeCompletedUnit(root, slug, stage, studio = "software") {
	const sd = join(root, ".haiku", "intents", slug, "stages", stage)
	const unitsDir = join(sd, "units")
	mkdirSync(unitsDir, { recursive: true })
	const at = "2026-05-09T00:00:00Z"
	// Read studio config dynamically — keeps the fixture aligned with
	// whatever `software/<stage>` declares without a hardcoded list.
	const hats = _resolveStageHats(studio, stage)
	const agents = Object.keys(_readReviewAgentPaths(studio, stage)).sort()
	const reviews = { spec: { at }, user: { at } }
	const approvals = { spec: { at }, quality_gates: { at }, user: { at } }
	for (const a of agents) {
		reviews[a] = { at }
		approvals[a] = { at }
	}
	writeFileSync(
		join(sd, "elaboration.md"),
		matter.stringify(`# Elaboration ${stage}\n`, {
			title: stage,
			verified_at: at,
		}),
	)
	const unitFm = {
		title: `${stage}-u1`,
		started_at: at,
		iterations: hats.map((hat) => ({
			hat,
			started_at: at,
			completed_at: at,
			result: "advance",
		})),
		reviews,
		approvals,
	}
	writeFileSync(
		join(unitsDir, `${stage}-u1.md`),
		matter.stringify(`# ${stage}-u1\n`, unitFm),
	)
}

// ═══════════════════════════════════════════════════════════════════════════
// Section 1 — getCurrentState merge-gate (current-state.ts:118-134)
// ═══════════════════════════════════════════════════════════════════════════

console.log("=== getCurrentState merge-gate ===")

test("completed+advanced stage NOT merged stays current", () => {
	const { root, git, cleanup } = makeGitRepo()
	try {
		// Create intent main and a stage branch with the unit on it.
		// Unit lives only on the stage branch (not merged into intent
		// main yet) — v4's intentMainHasStageUnits returns false →
		// status="active" → inception stays current.
		git("git checkout -b haiku/gate-test/main")
		git("git checkout -b haiku/gate-test/inception")
		writeIntent(root, "gate-test", {
			studio: "software",
			active_stage: "inception",
		})
		writeCompletedUnit(root, "gate-test", "inception")
		git("git add -A")
		git("git commit -m 'inception stage work'")
		git("git checkout haiku/gate-test/main")
		// Remove the unit files from the working tree on intent main
		// so the on-disk view reflects "stage hasn't merged yet."
		rmSync(join(root, ".haiku", "intents", "gate-test", "stages", "inception"), {
			recursive: true,
			force: true,
		})

		process.chdir(root)
		_resetIsGitRepoForTests()

		const haikuRoot = join(root, ".haiku")
		// Re-write intent.md after rm above.
		writeIntent(root, "gate-test", {
			studio: "software",
			active_stage: "inception",
		})

		const state = getCurrentState("gate-test", haikuRoot)
		// Stage branch not yet merged into intent main → inception stays
		// current (the cursor's natural "first unmerged stage" behavior).
		assert.ok(state, "should return a state")
		assert.strictEqual(state.stage, "inception")
	} finally {
		process.chdir(origCwd)
		_resetIsGitRepoForTests()
		cleanup()
	}
})

test("completed+advanced stage IS merged advances past it to next", () => {
	const { root, git, cleanup } = makeGitRepo()
	try {
		git("git checkout -b haiku/gate-merged/main")
		git("git checkout -b haiku/gate-merged/inception")
		writeIntent(root, "gate-merged", {
			studio: "software",
			active_stage: "inception",
		})
		writeCompletedUnit(root, "gate-merged", "inception")
		git("git add -A")
		git("git commit -m 'inception stage work'")
		git("git checkout haiku/gate-merged/main")
		// Merge inception into intent main — units now live on intent
		// main's tree, so intentMainHasStageUnits returns true →
		// status="completed" for inception.
		git("git merge haiku/gate-merged/inception --no-ff -m 'merge inception'")

		process.chdir(root)
		_resetIsGitRepoForTests()

		const haikuRoot = join(root, ".haiku")

		const state = getCurrentState("gate-merged", haikuRoot)
		// Inception merged → derived status="completed" → advances past
		// inception to the next stage (design has no units → pending →
		// becomes current).
		assert.ok(state, "should return a state")
		assert.strictEqual(
			state.stage,
			"design",
			"should advance past merged inception to design",
		)
	} finally {
		process.chdir(origCwd)
		_resetIsGitRepoForTests()
		cleanup()
	}
})

// ═══════════════════════════════════════════════════════════════════════════
// Section 2 — gate_outcome=advanced handler (gate.ts:560-607)
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n=== gate_outcome=advanced handler ===")

// v4: `awaiting_external_review` action removed. External review is
// now signaled by the actual merge into intent main — no separate
// polling action. The cursor's firstUnmergedStage check naturally
// stays on the un-merged stage until the user merges the MR.

// ═══════════════════════════════════════════════════════════════════════════
// Section 3 — checkoutFromBranchOnIntentMain (git-worktree.ts:1379-1454)
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n=== checkoutFromBranchOnIntentMain ===")

test("no-op (ok=false) when intent main branch does not exist", () => {
	const { root, cleanup } = makeGitRepo()
	try {
		process.chdir(root)
		_resetIsGitRepoForTests()

		// No haiku/cbr-noMain/main branch created
		const result = checkoutFromBranchOnIntentMain(
			"cbr-noMain",
			"haiku/cbr-noMain/inception",
			".haiku/intents/cbr-noMain/stages/inception/feedback",
			"carry feedback",
		)
		assert.strictEqual(result.ok, false)
		assert.ok(
			result.message.includes("does not exist"),
			`expected 'does not exist' in: ${result.message}`,
		)
		assert.deepStrictEqual(result.paths_copied, [])
	} finally {
		process.chdir(origCwd)
		_resetIsGitRepoForTests()
		cleanup()
	}
})

test("no-op (ok=true) when source branch does not exist", () => {
	const { root, git, cleanup } = makeGitRepo()
	try {
		git("git checkout -b haiku/cbr-noSrc/main")

		process.chdir(root)
		_resetIsGitRepoForTests()

		const result = checkoutFromBranchOnIntentMain(
			"cbr-noSrc",
			"haiku/cbr-noSrc/nonexistent-stage",
			".haiku/intents/cbr-noSrc/stages/inception/feedback",
			"carry feedback",
		)
		assert.strictEqual(result.ok, true)
		assert.ok(
			result.message.includes("does not exist"),
			`expected 'does not exist' in: ${result.message}`,
		)
		assert.deepStrictEqual(result.paths_copied, [])
	} finally {
		process.chdir(origCwd)
		_resetIsGitRepoForTests()
		cleanup()
	}
})

test("no-op (ok=true) when no files at path prefix on source branch", () => {
	const { root, git, cleanup } = makeGitRepo()
	try {
		git("git checkout -b haiku/cbr-noFiles/main")
		git("git checkout -b haiku/cbr-noFiles/inception")
		git("git commit --allow-empty -m 'inception work, no feedback files'")
		git("git checkout haiku/cbr-noFiles/main")

		process.chdir(root)
		_resetIsGitRepoForTests()

		const result = checkoutFromBranchOnIntentMain(
			"cbr-noFiles",
			"haiku/cbr-noFiles/inception",
			".haiku/intents/cbr-noFiles/stages/inception/feedback",
			"carry feedback",
		)
		assert.strictEqual(result.ok, true)
		assert.ok(
			result.message.includes("no files under"),
			`expected 'no files under' in: ${result.message}`,
		)
		assert.deepStrictEqual(result.paths_copied, [])
	} finally {
		process.chdir(origCwd)
		_resetIsGitRepoForTests()
		cleanup()
	}
})

test("copies feedback files from stage branch onto intent main", () => {
	const { root, git, cleanup } = makeGitRepo()
	try {
		// Intent main
		git("git checkout -b haiku/cbr-copy/main")
		// Stage branch with a feedback file
		git("git checkout -b haiku/cbr-copy/inception")
		const fbDir = join(
			root,
			".haiku",
			"intents",
			"cbr-copy",
			"stages",
			"inception",
			"feedback",
		)
		mkdirSync(fbDir, { recursive: true })
		writeFileSync(
			join(fbDir, "FB-001-test.md"),
			"---\nstatus: pending\n---\n\nTest feedback body.",
		)
		git("git add .haiku")
		git("git commit -m 'add feedback file'")
		// Switch to intent main (function runs in-place when on intent main)
		git("git checkout haiku/cbr-copy/main")

		process.chdir(root)
		_resetIsGitRepoForTests()

		const pathPrefix = ".haiku/intents/cbr-copy/stages/inception/feedback"
		const result = checkoutFromBranchOnIntentMain(
			"cbr-copy",
			"haiku/cbr-copy/inception",
			pathPrefix,
			"carry inception feedback to intent main",
		)
		assert.strictEqual(
			result.ok,
			true,
			`expected ok=true, got: ${result.message}`,
		)
		assert.strictEqual(
			result.paths_copied.length,
			1,
			`expected 1 path copied, got: ${JSON.stringify(result.paths_copied)}`,
		)
		assert.ok(
			result.paths_copied[0].includes("FB-001-test.md"),
			`expected FB-001-test.md in paths_copied: ${result.paths_copied}`,
		)
		// File should now exist on intent main
		const copiedPath = join(root, result.paths_copied[0])
		assert.ok(existsSync(copiedPath), `expected copied file at ${copiedPath}`)
		assert.ok(
			readFileSync(copiedPath, "utf8").includes("Test feedback body."),
			"copied file content should match original",
		)
	} finally {
		process.chdir(origCwd)
		_resetIsGitRepoForTests()
		cleanup()
	}
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)

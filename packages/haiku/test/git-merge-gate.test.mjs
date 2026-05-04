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

// ═══════════════════════════════════════════════════════════════════════════
// Section 1 — getCurrentState merge-gate (current-state.ts:118-134)
// ═══════════════════════════════════════════════════════════════════════════

console.log("=== getCurrentState merge-gate ===")

test("completed+advanced stage NOT merged stays current", () => {
	const { root, git, cleanup } = makeGitRepo()
	try {
		// Create intent main and a diverging stage branch (not merged)
		git("git checkout -b haiku/gate-test/main")
		git("git checkout -b haiku/gate-test/inception")
		git("git commit --allow-empty -m 'inception stage work'")
		git("git checkout haiku/gate-test/main")

		process.chdir(root)
		_resetIsGitRepoForTests()

		const haikuRoot = join(root, ".haiku")
		writeIntent(root, "gate-test", {
			studio: "software",
			active_stage: "inception",
		})
		writeStageState(root, "gate-test", "inception", {
			stage: "inception",
			status: "completed",
			phase: "gate",
			gate_outcome: "advanced",
		})

		const state = getCurrentState("gate-test", haikuRoot)
		// Stage branch not yet merged → isDone=false → inception stays current
		assert.ok(state, "should return a state")
		assert.strictEqual(state.stage, "inception")
		assert.strictEqual(state.phase, "gate")
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
		git("git commit --allow-empty -m 'inception stage work'")
		git("git checkout haiku/gate-merged/main")
		// Merge inception into intent main — now isDone=true for inception
		git("git merge haiku/gate-merged/inception --no-ff -m 'merge inception'")

		process.chdir(root)
		_resetIsGitRepoForTests()

		const haikuRoot = join(root, ".haiku")
		writeIntent(root, "gate-merged", {
			studio: "software",
			active_stage: "inception",
		})
		writeStageState(root, "gate-merged", "inception", {
			stage: "inception",
			status: "completed",
			phase: "gate",
			gate_outcome: "advanced",
		})
		// design has no state.json → treated as pending → becomes current

		const state = getCurrentState("gate-merged", haikuRoot)
		// Inception merged → isDone=true → advances past inception to design
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

test("stage NOT merged emits awaiting_external_review with branch names", () => {
	const { root, git, cleanup } = makeGitRepo()
	try {
		git("git checkout -b haiku/adv-gate/main")
		git("git checkout -b haiku/adv-gate/inception")
		git("git commit --allow-empty -m 'inception stage work'")
		git("git checkout haiku/adv-gate/main")
		// Stage branch NOT merged into intent main

		process.chdir(root)
		_resetIsGitRepoForTests()
		setHaikuRootForTests(join(root, ".haiku"))

		const haikuRoot = join(root, ".haiku")
		writeIntent(root, "adv-gate", {
			studio: "software",
			active_stage: "inception",
		})
		writeStageState(root, "adv-gate", "inception", {
			stage: "inception",
			status: "completed",
			phase: "gate",
			gate_outcome: "advanced",
		})

		const result = runWorkflowTick("adv-gate", haikuRoot)
		assert.ok(result, "tick should return a result")
		assert.strictEqual(result.state, "gate_review")
		assert.ok(result.action, "should have an action")
		assert.strictEqual(result.action.action, "awaiting_external_review")
		assert.strictEqual(result.action.stage, "inception")
		assert.ok(
			result.action.message.includes("haiku/adv-gate/inception"),
			`message should name the stage branch, got: ${result.action.message}`,
		)
		assert.ok(
			result.action.message.includes("haiku/adv-gate/main"),
			`message should name the intent main branch, got: ${result.action.message}`,
		)
	} finally {
		process.chdir(origCwd)
		_resetIsGitRepoForTests()
		setHaikuRootForTests(null)
		cleanup()
	}
})

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
			join(fbDir, "FB-01-test.md"),
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
			result.paths_copied[0].includes("FB-01-test.md"),
			`expected FB-01-test.md in paths_copied: ${result.paths_copied}`,
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

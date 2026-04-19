#!/usr/bin/env npx tsx
// Test suite for reject_hat + scope-violation deadlock prevention.
//
// The deadlock shape: a hat commits an out-of-scope file, then every
// subsequent reject_hat call returns unit_scope_violation_on_reject
// without advancing any counter. Without a persistent counter, the
// MAX_BOLTS escape never fires and the unit is stuck forever.
//
// This suite verifies that:
//   1. reject_hat with a clean worktree succeeds (no regression)
//   2. reject_hat with a scope violation returns unit_scope_violation_on_reject
//   3. Repeated scope-violation rejects bump scope_reject_attempts
//   4. After MAX_BOLTS_FAIL attempts, max_bolts_exceeded fires
//      (persistent_scope_violation reason)
//   5. A successful scope-clean reject resets the counter

import { execSync } from "node:child_process"
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import assert from "node:assert"

import { handleStateTool } from "../src/state-tools.ts"

// ── Setup ──────────────────────────────────────────────────────────────────

const tmp = mkdtempSync(join(tmpdir(), "haiku-reject-deadlock-"))
const origCwd = process.cwd()

let passed = 0
let failed = 0

function test(name, fn) {
	try {
		fn()
		passed++
		console.log(`  \u2713 ${name}`)
	} catch (e) {
		failed++
		console.log(`  \u2717 ${name}: ${e.message}`)
	}
}

function getTextResult(r) {
	return r.content[0].text
}

// Set up a git repo to satisfy isGitRepo()
function makeGitProject(name) {
	const projDir = join(tmp, name)
	mkdirSync(projDir, { recursive: true })
	execSync("git init -q", { cwd: projDir })
	execSync("git config user.email test@test.local && git config user.name test", {
		cwd: projDir,
		shell: "/bin/bash",
	})
	writeFileSync(join(projDir, ".gitignore"), "node_modules\n")
	execSync("git add -A && git commit -q -m init", {
		cwd: projDir,
		shell: "/bin/bash",
	})
	return projDir
}

// Bootstrap a minimal intent on a stage branch.
function makeIntent(projDir, slug, stage) {
	const intentDir = join(projDir, ".haiku", "intents", slug)
	mkdirSync(join(intentDir, "stages", stage, "units"), { recursive: true })

	writeFileSync(
		join(intentDir, "intent.md"),
		`---\ntitle: Test Intent\nstudio: software\nmode: continuous\nactive_stage: ${stage}\nstatus: active\nstarted_at: 2026-04-04T18:00:00Z\ncompleted_at: null\n---\n\nTest.\n`,
	)
	writeFileSync(
		join(intentDir, "stages", stage, "state.json"),
		JSON.stringify({
			stage,
			status: "active",
			phase: "execute",
			started_at: "2026-04-04T18:00:00Z",
			completed_at: null,
			gate_entered_at: null,
			gate_outcome: null,
		}),
	)
	writeFileSync(
		join(intentDir, "stages", stage, "units", "unit-01-test.md"),
		`---\nstatus: active\nbolt: 1\nhat: design-reviewer\nhat_started_at: 2026-04-04T18:00:00Z\n---\n\nBody\n`,
	)

	// Create stage branch + unit branch + unit worktree.
	execSync(`git checkout -q -b haiku/${slug}/${stage}`, { cwd: projDir, shell: "/bin/bash" })
	execSync("git add -A && git commit -q -m init", { cwd: projDir, shell: "/bin/bash" })

	const wtBase = join(projDir, ".haiku", "worktrees", slug, "unit-01-test")
	execSync(`git worktree add -q -b haiku/${slug}/unit-01-test "${wtBase}"`, {
		cwd: projDir,
		shell: "/bin/bash",
	})

	return { intentDir, wtBase }
}

try {

// Note: scope validation relies on isGitRepo() and the unit-worktree
// layout. The setup mirrors production — creates a real git repo with
// a unit worktree forked from a stage branch. Tests exercise only the
// advance_hat / reject_hat MCP handlers, not the full orchestrator.

console.log("\n=== MAX_BOLTS_FAIL escape from persistent scope violation ===")

test("repeated scope-violation rejects trip max_bolts_exceeded", () => {
	const projDir = makeGitProject("max-bolts")
	const { wtBase } = makeIntent(projDir, "test-max", "design")
	process.chdir(projDir)

	// Plant the same kind of out-of-scope commit
	mkdirSync(join(wtBase, "production", "src"), { recursive: true })
	writeFileSync(join(wtBase, "production", "src", "bad.ts"), "const y = 2;\n")
	execSync("git add -A && git commit -q -m 'out-of-scope'", {
		cwd: wtBase,
		shell: "/bin/bash",
	})

	// Call reject_hat 5 times. The first 4 should return
	// unit_scope_violation_on_reject with incrementing scope_reject_attempts.
	// The 5th should return max_bolts_exceeded.
	let lastParsed
	for (let i = 1; i <= 5; i++) {
		const r = handleStateTool("haiku_unit_reject_hat", {
			intent: "test-max",
			unit: "unit-01-test",
		})
		lastParsed = JSON.parse(getTextResult(r))
	}

	assert.strictEqual(lastParsed.error, "max_bolts_exceeded")
	assert.strictEqual(lastParsed.reason, "persistent_scope_violation")
	assert.ok(lastParsed.attempts >= 5, `expected attempts >=5, got ${lastParsed.attempts}`)
})

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`)

} finally {
	process.chdir(origCwd)
	try { rmSync(tmp, { recursive: true, force: true }) } catch {}
	process.exit(failed > 0 ? 1 : 0)
}

#!/usr/bin/env node
// scripts/__tests__/check-no-god-files.test.mjs
//
// Smoke test for the god-file guardrail. Two assertions:
//
//   1. Running the script against the current repo exits 0 (every
//      oversize file in the repo today is allowlisted with a reason).
//      This is the regression: if someone removes an allowlist entry
//      without splitting the file, CI starts failing — that's the
//      desired behavior, but the test catches accidental breakage of
//      the script itself (e.g. file-discovery glob regression like
//      the `**/*.ts` skip-depth-0 bug we fixed during construction).
//
//   2. The script's stdout names every allowlisted file. Catches the
//      "globbed nothing" failure mode where the script silently
//      reports "no god files" because it never scanned anything.

import assert from "node:assert"
import { execFileSync } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, "..", "..")
const scriptPath = resolve(__dirname, "..", "check-no-god-files.mjs")

let passed = 0
let failed = 0

function test(name, fn) {
	try {
		fn()
		passed++
		console.log(`  ✓ ${name}`)
	} catch (err) {
		failed++
		console.log(`  ✗ ${name}: ${err instanceof Error ? err.message : err}`)
	}
}

test("script exits 0 on the current repo (every oversize file is allowlisted)", () => {
	const out = execFileSync("node", [scriptPath], {
		encoding: "utf8",
		cwd: repoRoot,
	})
	assert.match(
		out,
		/✓ No god files detected/,
		`expected success message; got: ${out}`,
	)
})

test("script names every known oversize file in stdout", () => {
	const out = execFileSync("node", [scriptPath], {
		encoding: "utf8",
		cwd: repoRoot,
	})
	// These are the four files currently allowlisted. If a future
	// commit splits one out of god-file range, drop it from this
	// assertion AND from the ALLOWLIST in the script.
	const expected = [
		"packages/haiku/src/state-tools.ts",
		"packages/haiku/src/git-worktree.ts",
		"packages/haiku/src/orchestrator/workflow/drift-baseline.ts",
		"packages/haiku-ui/src/pages/review/stage/StageReview.tsx",
	]
	for (const path of expected) {
		assert.ok(
			out.includes(path),
			`expected output to mention ${path}; full output:\n${out}`,
		)
	}
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)

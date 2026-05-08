#!/usr/bin/env node
// Run all H·AI·K·U MCP test suites
// Usage: node test/run-all.mjs

import { execSync } from "node:child_process"
import { readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const testDir = dirname(fileURLToPath(import.meta.url))
// Exclude state-tools.test.mjs — it tests the haiku-parse CLI binary
// and requires a build step first (npm run build). Run it separately
// with: npm run test:parse
const testFiles = readdirSync(testDir)
	.filter((f) => f.endsWith(".test.mjs") && f !== "state-tools.test.mjs")
	.sort()

let totalPassed = 0
let totalFailed = 0
const results = []

for (const file of testFiles) {
	const filePath = join(testDir, file)
	console.log(`\n${"═".repeat(60)}`)
	console.log(`  Running: ${file}`)
	console.log(`${"═".repeat(60)}`)

	try {
		const output = execSync(`npx tsx "${filePath}"`, {
			encoding: "utf8",
			stdio: ["pipe", "pipe", "pipe"],
			cwd: join(testDir, ".."),
			timeout: 60000,
		})
		process.stdout.write(output)

		// Parse pass/fail from output. Three output flavors are supported:
		//   - "X passed, Y failed" — bespoke runners in this repo
		//   - "ℹ pass X" + "ℹ fail Y" — node:test default reporter
		//   - "# pass X" + "# fail Y" — node:test TAP reporter (default
		//     under tsx in some CI environments; locally on macOS it
		//     emits the `ℹ` glyph form, but Linux runners default to
		//     TAP). Without this, ~30 test files would silently report
		//     0/0 in CI and the silent-test-loss guard would fail the
		//     run even though every test passed.
		const match = output.match(/(\d+) passed, (\d+) failed/)
		const nodeTestPass =
			output.match(/ℹ pass (\d+)/) || output.match(/^# pass (\d+)/m)
		const nodeTestFail =
			output.match(/ℹ fail (\d+)/) || output.match(/^# fail (\d+)/m)
		if (match) {
			const p = Number.parseInt(match[1], 10)
			const f = Number.parseInt(match[2], 10)
			totalPassed += p
			totalFailed += f
			results.push({
				file,
				passed: p,
				failed: f,
				status: f > 0 ? "FAIL" : "PASS",
			})
		} else if (nodeTestPass && nodeTestFail) {
			const p = Number.parseInt(nodeTestPass[1], 10)
			const f = Number.parseInt(nodeTestFail[1], 10)
			totalPassed += p
			totalFailed += f
			results.push({
				file,
				passed: p,
				failed: f,
				status: f > 0 ? "FAIL" : "PASS",
			})
		} else {
			results.push({ file, passed: 0, failed: 0, status: "PASS" })
		}
	} catch (e) {
		// Print stdout and stderr from the failing test
		if (e.stdout) process.stdout.write(e.stdout)
		if (e.stderr) process.stderr.write(e.stderr)

		// Attempt to parse pass/fail counts from stdout even on non-zero exit
		const crashMatch = e.stdout?.match(/(\d+) passed, (\d+) failed/)
		const crashNodeTestPass =
			e.stdout?.match(/ℹ pass (\d+)/) ||
			e.stdout?.match(/^# pass (\d+)/m)
		const crashNodeTestFail =
			e.stdout?.match(/ℹ fail (\d+)/) ||
			e.stdout?.match(/^# fail (\d+)/m)
		if (crashMatch) {
			const p = Number.parseInt(crashMatch[1], 10)
			const f = Number.parseInt(crashMatch[2], 10)
			totalPassed += p
			totalFailed += f
			results.push({
				file,
				passed: p,
				failed: f,
				status: f > 0 ? "FAIL" : "CRASH",
			})
		} else if (crashNodeTestPass && crashNodeTestFail) {
			const p = Number.parseInt(crashNodeTestPass[1], 10)
			const f = Number.parseInt(crashNodeTestFail[1], 10)
			totalPassed += p
			totalFailed += f
			results.push({
				file,
				passed: p,
				failed: f,
				status: f > 0 ? "FAIL" : "CRASH",
			})
		} else {
			totalFailed++
			results.push({ file, passed: 0, failed: 1, status: "CRASH" })
		}
	}
}

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(60)}`)
console.log("  SUMMARY")
console.log(`${"═".repeat(60)}`)
console.log("")

const maxLen = Math.max(...results.map((r) => r.file.length))
for (const r of results) {
	const icon = r.status === "PASS" ? "✓" : r.status === "CRASH" ? "💥" : "✗"
	console.log(
		`  ${icon} ${r.file.padEnd(maxLen + 2)} ${r.passed} passed, ${r.failed} failed`,
	)
}

console.log("")
console.log(
	`  Total: ${totalPassed} passed, ${totalFailed} failed across ${testFiles.length} test files`,
)
console.log("")

// ── Silent-test-loss guard ──────────────────────────────────────────────────
//
// 2026-05-06 incident: 12 v0-to-v4 migrator tests reported as "0 passed,
// 0 failed" because the aggregator didn't recognize node:test output
// format. The tests were running and passing, but invisible to the
// aggregator. Adding a runner that only knew about one format silently
// hid coverage. This guard fails the run if ANY test file reports 0/0
// (no passes, no failures) — which means either the file ran zero
// tests (legitimate empty file: rare; the right move is to delete it)
// or its format isn't being parsed (the bug we're guarding against).
//
// To allowlist a deliberately empty/setup-only file, name it
// `_*-helper.mjs` or similar — only `*.test.mjs` files are picked up
// by the loader.
const silentFiles = results.filter((r) => r.passed === 0 && r.failed === 0)
if (silentFiles.length > 0) {
	console.error(
		`\n  ✗ SILENT TESTS — ${silentFiles.length} test file(s) reported 0/0:`,
	)
	for (const r of silentFiles) {
		console.error(`    - ${r.file}`)
	}
	console.error(
		`\n  Either: (a) the file truly runs zero tests (delete it),`,
	)
	console.error(
		`  or (b) its output format isn't parsed by run-all.mjs's regex set.`,
	)
	console.error(
		`  See the silent-test-loss guard for context.\n`,
	)
	process.exit(1)
}

process.exit(totalFailed > 0 ? 1 : 0)

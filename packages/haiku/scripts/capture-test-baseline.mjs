#!/usr/bin/env node
/**
 * Capture / diff a pass/fail baseline for packages/haiku test suite.
 *
 * Purpose: lets the unit-02 reviewer assert no regressions — every test that
 * was passing on the parent commit must still be passing on HEAD.
 *
 * Modes:
 *   --mode=capture  Run `npm test` locally, write artifacts/test-baseline.json
 *                   with { recorded_at, head, count, tests: [{ file, name, passed }] }.
 *   --mode=diff     Run `npm test` locally, compare against baseline, write
 *                   artifacts/test-deltas.json with { added, removed, regressed }.
 *                   Exit non-zero if any test at baseline with passed=true is
 *                   now failing (regression).
 *
 * Writes into:
 *   .haiku/intents/universal-feedback-model-and-review-recovery/stages/development/artifacts/
 *
 * Invoked by:
 *   builder (at unit start)  -- capture mode
 *   reviewer (pre advance)   -- diff mode
 */

import { execSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const haikuPkgRoot = resolve(here, "..")
const repoRoot = resolve(haikuPkgRoot, "..", "..")
const artifactsDir = join(
	repoRoot,
	".haiku",
	"intents",
	"universal-feedback-model-and-review-recovery",
	"stages",
	"development",
	"artifacts",
)
const baselineFile = join(artifactsDir, "test-baseline.json")
const deltasFile = join(artifactsDir, "test-deltas.json")

function parseArgs(argv) {
	const out = {}
	for (const arg of argv.slice(2)) {
		const match = arg.match(/^--([^=]+)(?:=(.*))?$/)
		if (match) out[match[1]] = match[2] ?? true
	}
	return out
}

function currentHead() {
	try {
		return execSync("git rev-parse HEAD", {
			cwd: haikuPkgRoot,
			encoding: "utf8",
		}).trim()
	} catch {
		return "unknown"
	}
}

/**
 * Run the packages/haiku test suite and parse the human-readable output from
 * `test/run-all.mjs`. Each test file prints `  ✓ name` for passes and
 * `  ✗ name: …` for failures; the file header line is `  Running: file.test.mjs`.
 */
function runTests() {
	let output = ""
	try {
		output = execSync("npm test --silent", {
			cwd: haikuPkgRoot,
			encoding: "utf8",
			stdio: ["pipe", "pipe", "pipe"],
			env: { ...process.env, CI: "1" },
			maxBuffer: 64 * 1024 * 1024,
		})
	} catch (err) {
		output = (err.stdout || "") + (err.stderr || "")
	}

	const lines = output.split("\n")
	const tests = []
	let currentFile = null
	for (const line of lines) {
		const runMatch = line.match(/^\s*Running:\s+(\S+\.test\.mjs)/)
		if (runMatch) {
			currentFile = runMatch[1]
			continue
		}
		const passMatch = line.match(/^\s+✓\s+(.+)$/)
		if (passMatch && currentFile) {
			tests.push({ file: currentFile, name: passMatch[1].trim(), passed: true })
			continue
		}
		const failMatch = line.match(/^\s+✗\s+([^:]+)(?::.*)?$/)
		if (failMatch && currentFile) {
			tests.push({
				file: currentFile,
				name: failMatch[1].trim(),
				passed: false,
			})
		}
	}

	return { tests, raw: output }
}

function ensureArtifactsDir() {
	if (!existsSync(artifactsDir)) {
		mkdirSync(artifactsDir, { recursive: true })
	}
}

function capture() {
	ensureArtifactsDir()
	const { tests } = runTests()
	const passed = tests.filter((t) => t.passed).length
	const failed = tests.length - passed
	const payload = {
		recorded_at: new Date().toISOString(),
		head: currentHead(),
		count: tests.length,
		passed,
		failed,
		tests,
	}
	writeFileSync(baselineFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
	console.log(
		`Baseline captured: ${passed} passed, ${failed} failed (${tests.length} total).`,
	)
	console.log(`Wrote ${baselineFile}`)
}

function diff() {
	ensureArtifactsDir()
	if (!existsSync(baselineFile)) {
		console.error(`No baseline at ${baselineFile} — run --mode=capture first.`)
		process.exit(2)
	}
	const baseline = JSON.parse(readFileSync(baselineFile, "utf8"))
	const baselineMap = new Map()
	for (const t of baseline.tests) {
		baselineMap.set(`${t.file}::${t.name}`, t)
	}

	const { tests } = runTests()
	const currentMap = new Map()
	for (const t of tests) {
		currentMap.set(`${t.file}::${t.name}`, t)
	}

	const added = []
	const removed = []
	const regressed = []

	for (const [key, cur] of currentMap) {
		if (!baselineMap.has(key)) added.push(cur)
	}
	for (const [key, base] of baselineMap) {
		if (!currentMap.has(key)) removed.push(base)
	}
	for (const [key, base] of baselineMap) {
		const cur = currentMap.get(key)
		if (base.passed && cur && !cur.passed) regressed.push({ base, cur })
	}

	const payload = {
		compared_at: new Date().toISOString(),
		baseline_head: baseline.head,
		current_head: currentHead(),
		summary: {
			added: added.length,
			removed: removed.length,
			regressed: regressed.length,
		},
		added,
		removed,
		regressed,
	}
	writeFileSync(deltasFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
	console.log(
		`Deltas: +${added.length} added, -${removed.length} removed, !${regressed.length} regressed.`,
	)
	console.log(`Wrote ${deltasFile}`)
	if (regressed.length > 0) {
		console.error("Regressions (previously passing tests now failing):")
		for (const { base, cur } of regressed) {
			console.error(`  - ${base.file} :: ${base.name}`)
		}
		process.exit(1)
	}
}

const args = parseArgs(process.argv)
const mode = args.mode || "capture"
if (mode === "capture") capture()
else if (mode === "diff") diff()
else {
	console.error(`Unknown --mode=${mode}. Use capture or diff.`)
	process.exit(2)
}

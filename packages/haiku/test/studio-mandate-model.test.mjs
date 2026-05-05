#!/usr/bin/env npx tsx
// Test suite for resolveStudioMandateModel — the studio-author-time
// model cascade (mandate → stage → studio) used by review-agents,
// discovery fan-out, integrators, and studio-level fix-hats.
// Run: npx tsx test/studio-mandate-model.test.mjs

import assert from "node:assert"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

let passed = 0
let failed = 0

function test(name, fn) {
	try {
		fn()
		passed++
		console.log(`  ✓ ${name}`)
	} catch (e) {
		failed++
		console.log(`  ✗ ${name}: ${e.message}`)
	}
}

// ── Fixture studio under cwd/.haiku/studios ──────────────────────────────
// studioSearchPaths() probes cwd/.haiku/studios first, so a temp cwd
// gives us a clean fixture without touching the real plugin/studios tree.
const tmp = mkdtempSync(join(tmpdir(), "haiku-mandate-model-"))
const origCwd = process.cwd()
process.chdir(tmp)

const studiosRoot = join(tmp, ".haiku", "studios")
mkdirSync(studiosRoot, { recursive: true })

function writeStudio(name, defaultModel) {
	const dir = join(studiosRoot, name)
	mkdirSync(dir, { recursive: true })
	const fm = defaultModel ? `default_model: ${defaultModel}\n` : ""
	writeFileSync(join(dir, "STUDIO.md"), `---\nname: ${name}\n${fm}---\n`)
	return dir
}

function writeStage(studio, stage, defaultModel) {
	const dir = join(studiosRoot, studio, "stages", stage)
	mkdirSync(dir, { recursive: true })
	const fm = defaultModel ? `default_model: ${defaultModel}\n` : ""
	writeFileSync(
		join(dir, "STAGE.md"),
		`---\nname: ${stage}\n${fm}hats:\n  - planner\n---\n`,
	)
	return dir
}

function writeMandate(studio, stage, agent, model) {
	const dir = join(studiosRoot, studio, "stages", stage, "review-agents")
	mkdirSync(dir, { recursive: true })
	const fm = model ? `model: ${model}\n` : ""
	const path = join(dir, `${agent}.md`)
	writeFileSync(path, `---\n${fm}interpretation: lens\n---\n**Mandate:** test\n`)
	return path
}

writeStudio("alpha", "sonnet")
writeStudio("beta", "haiku")
writeStudio("gamma", undefined) // no default → cascade should yield undefined
writeStage("alpha", "build", undefined) // no stage default
writeStage("alpha", "review", "opus") // stage overrides studio
const mandateOpus = writeMandate("alpha", "build", "lens", "opus")
const mandateBare = writeMandate("alpha", "build", "bare", undefined)
const mandateGarbage = writeMandate("alpha", "build", "garbage", "definitely-not-a-tier")

try {
	// Import after fixture is in place. Module-level singletons
	// (_pluginRoot in config.ts, the studio-reader cache) capture the
	// CWD-relative search path on first call.
	const { resolveStudioMandateModel } = await import(
		"../src/orchestrator/prompts/_helpers.ts"
	)

	console.log("\n=== resolveStudioMandateModel ===")

	test("no mandate / no stage → studio default", () => {
		const result = resolveStudioMandateModel({ studio: "alpha" })
		assert.strictEqual(result, "sonnet")
	})

	test("no mandate / stage with no default → falls through to studio", () => {
		const result = resolveStudioMandateModel({
			studio: "alpha",
			stage: "build",
		})
		assert.strictEqual(result, "sonnet")
	})

	test("no mandate / stage with own default → stage wins over studio", () => {
		const result = resolveStudioMandateModel({
			studio: "alpha",
			stage: "review",
		})
		assert.strictEqual(result, "opus")
	})

	test("mandate with model → mandate wins over stage and studio", () => {
		const result = resolveStudioMandateModel({
			mandatePath: mandateOpus,
			studio: "alpha",
			stage: "review", // stage default is opus too — make sure mandate read fires
		})
		assert.strictEqual(result, "opus")
	})

	test("mandate without model → falls through to stage default", () => {
		const result = resolveStudioMandateModel({
			mandatePath: mandateBare,
			studio: "alpha",
			stage: "review",
		})
		assert.strictEqual(result, "opus") // stage default wins
	})

	test("mandate with bare model + no stage → falls through to studio default", () => {
		const result = resolveStudioMandateModel({
			mandatePath: mandateBare,
			studio: "alpha",
		})
		assert.strictEqual(result, "sonnet")
	})

	test("garbage mandate value is rejected by sanitizer, falls through", () => {
		const result = resolveStudioMandateModel({
			mandatePath: mandateGarbage,
			studio: "alpha",
		})
		assert.strictEqual(result, "sonnet")
	})

	test("nonexistent mandate path → falls through cleanly", () => {
		const result = resolveStudioMandateModel({
			mandatePath: join(tmp, "does-not-exist.md"),
			studio: "alpha",
		})
		assert.strictEqual(result, "sonnet")
	})

	test("studio with haiku default → returns haiku", () => {
		const result = resolveStudioMandateModel({ studio: "beta" })
		assert.strictEqual(result, "haiku")
	})

	test("studio with no default → cascade yields undefined", () => {
		const result = resolveStudioMandateModel({ studio: "gamma" })
		assert.strictEqual(result, undefined)
	})

	test("integrator path: no mandate, with stage → cascade still works", () => {
		// Mirrors the integrate_fix_chains call site exactly: no mandatePath,
		// stage may be present (per-stage chain) or absent (intent-completion).
		const result = resolveStudioMandateModel({
			studio: "alpha",
			stage: "review",
		})
		assert.strictEqual(result, "opus")
	})

	test("integrator path: no mandate, no stage → studio default (intent-completion case)", () => {
		const result = resolveStudioMandateModel({ studio: "beta" })
		assert.strictEqual(result, "haiku")
	})
} finally {
	process.chdir(origCwd)
	rmSync(tmp, { recursive: true, force: true })
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)

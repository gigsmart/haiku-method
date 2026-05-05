#!/usr/bin/env npx tsx
// Tests for haiku_baseline_init MCP tool.
//
// Coverage (per unit spec):
//   1. establish-all on a fresh intent writes a baseline for every stage with
//      all tracked files; tracking_classes counts match the file inventory.
//   2. establish-all on an intent with an existing baseline is idempotent —
//      files whose SHA matches are skipped; baselines_skipped_existing reflects
//      the count.
//   3. establish-paths with a single path adds only that file's entry.
//   4. establish-paths with a workflow-managed path returns
//      path_outside_tracked_surface with reason: "deny_list_match" and writes
//      nothing.
//   5. establish-paths with a path outside the intent directory returns
//      path_outside_tracked_surface with reason: "path_escape".
//   6. intent_not_found for an unknown slug.
//   7. intent_not_active for an archived intent.
//   8. tracked_surface_empty warning when an intent has no tracked files yet.
//   9. Kill-switch: tool succeeds with a warning when drift_detection: false.

import assert from "node:assert"
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// ── Test infrastructure ────────────────────────────────────────────────────

const tmp = mkdtempSync(join(tmpdir(), "haiku-baseline-init-test-"))

// Import the shared test root override so we can redirect findHaikuRoot().
const { setHaikuRootForTests } = await import("../src/state/shared.ts")

// Import the tool handler.
const toolModule = await import(
	"../src/tools/orchestrator/haiku_baseline_init.ts"
)
const tool = toolModule.default

let passed = 0
let failed = 0

async function test(name, fn) {
	try {
		await fn()
		passed++
		console.log(`  ✓ ${name}`)
	} catch (e) {
		failed++
		console.log(`  ✗ ${name}: ${e.message}`)
		if (process.env.VERBOSE) console.error(e)
	}
}

/** Parse the JSON text response from the tool. */
function parseResponse(result) {
	assert.ok(result.content, "result should have content")
	assert.ok(result.content.length > 0, "content should be non-empty")
	return JSON.parse(result.content[0].text)
}

// ── Fixture builder ────────────────────────────────────────────────────────

let testCounter = 0

function makeIntentFixture(opts = {}) {
	const slug = `test-intent-${++testCounter}`
	const root = join(tmp, `root-${testCounter}`)
	const intentDir = join(root, "intents", slug)
	const stagesDir = join(intentDir, "stages")
	mkdirSync(intentDir, { recursive: true })

	// Write intent.md — minimal frontmatter.
	const archived = opts.archived === true ? "archived: true\n" : ""
	writeFileSync(
		join(intentDir, "intent.md"),
		`---\nslug: ${slug}\n${archived}---\n# Test Intent\n`,
	)

	// Write .haiku/settings.yml if kill-switch requested.
	if (opts.driftDisabled === true) {
		mkdirSync(root, { recursive: true })
		writeFileSync(join(root, "settings.yml"), "drift_detection: false\n")
	}

	// Create stages if provided.
	const stages = opts.stages ?? []
	for (const stageOpts of stages) {
		const stage = stageOpts.name
		const stageBase = join(stagesDir, stage)
		mkdirSync(stageBase, { recursive: true })

		// Write provided files.
		for (const file of stageOpts.artifacts ?? []) {
			const absPath = join(stageBase, "artifacts", file.name)
			mkdirSync(join(stageBase, "artifacts"), { recursive: true })
			writeFileSync(absPath, file.content ?? `content of ${file.name}`)
		}
		for (const file of stageOpts.knowledge ?? []) {
			const absPath = join(stageBase, "knowledge", file.name)
			mkdirSync(join(stageBase, "knowledge"), { recursive: true })
			writeFileSync(absPath, file.content ?? `knowledge: ${file.name}`)
		}
	}

	// Intent-scope knowledge/.
	for (const file of opts.knowledge ?? []) {
		mkdirSync(join(intentDir, "knowledge"), { recursive: true })
		writeFileSync(
			join(intentDir, "knowledge", file.name),
			file.content ?? `global knowledge: ${file.name}`,
		)
	}

	return { slug, root, intentDir }
}

// ── Tests ──────────────────────────────────────────────────────────────────

console.log("\n=== establish-all: fresh intent ===")

await test("establish-all on a fresh intent writes baselines for all tracked files; tracking_classes counts match", async () => {
	const { slug, root, intentDir } = makeIntentFixture({
		stages: [
			{
				name: "design",
				artifacts: [
					{ name: "layout.html", content: "<html/>" },
					{ name: "styles.css", content: "body{}" },
				],
				knowledge: [{ name: "notes.md", content: "# Notes" }],
			},
			{
				name: "development",
				artifacts: [{ name: "app.js", content: "console.log('hi')" }],
			},
		],
	})

	setHaikuRootForTests(root)
	try {
		const result = await tool.handle({
			intent_slug: slug,
			mode: "establish-all",
		})
		const data = parseResponse(result)

		assert.strictEqual(data.ok, true, "should be ok")
		assert.strictEqual(data.intent_slug, slug)
		// 2 design artifacts + 1 design knowledge + 1 dev artifact = 4 files.
		assert.strictEqual(data.baselines_created, 4, "should create 4 baselines")
		assert.strictEqual(
			data.baselines_skipped_existing,
			0,
			"no skips on fresh intent",
		)
		// Stage-output: 3 (layout.html, styles.css, app.js)
		// knowledge: 1 (notes.md)
		assert.strictEqual(
			data.tracking_classes["stage-output"],
			3,
			"3 stage-output files",
		)
		assert.strictEqual(data.tracking_classes.knowledge, 1, "1 knowledge file")
		// unit-output and intent-meta are always 0 in v1.
		assert.strictEqual(data.tracking_classes["unit-output"], 0)
		assert.strictEqual(data.tracking_classes["intent-meta"], 0)

		// Verify baseline.json files were written on disk.
		const designBaseline = join(intentDir, "stages", "design", "baseline.json")
		const devBaseline = join(
			intentDir,
			"stages",
			"development",
			"baseline.json",
		)
		assert.ok(existsSync(designBaseline), "design baseline.json should exist")
		assert.ok(existsSync(devBaseline), "development baseline.json should exist")

		// Spot-check a baseline entry.
		const designData = JSON.parse(readFileSync(designBaseline, "utf-8"))
		const layoutKey = "stages/design/artifacts/layout.html"
		assert.ok(
			layoutKey in designData,
			"layout.html entry should be in baseline",
		)
		assert.strictEqual(
			designData[layoutKey].author_class,
			"agent",
			"author_class should be agent",
		)
		assert.strictEqual(
			designData[layoutKey].acknowledged_via,
			"baseline-init",
			"acknowledged_via should be baseline-init",
		)
		assert.strictEqual(designData[layoutKey].tracking_class, "stage-output")
	} finally {
		setHaikuRootForTests(null)
	}
})

console.log("\n=== establish-all: idempotency ===")

await test("establish-all on an intent with an existing baseline skips files whose SHA matches; baselines_skipped_existing reflects count", async () => {
	const { slug, root } = makeIntentFixture({
		stages: [
			{
				name: "design",
				artifacts: [
					{ name: "a.html", content: "<a/>" },
					{ name: "b.html", content: "<b/>" },
				],
			},
		],
	})

	setHaikuRootForTests(root)
	try {
		// First call — establish all.
		await tool.handle({ intent_slug: slug, mode: "establish-all" })

		// Second call — should be fully idempotent.
		const result2 = await tool.handle({
			intent_slug: slug,
			mode: "establish-all",
		})
		const data2 = parseResponse(result2)

		assert.strictEqual(data2.ok, true)
		assert.strictEqual(
			data2.baselines_created,
			0,
			"no new baselines on second run",
		)
		assert.strictEqual(
			data2.baselines_skipped_existing,
			2,
			"both files should be skipped",
		)
	} finally {
		setHaikuRootForTests(null)
	}
})

console.log("\n=== establish-paths: single path ===")

await test("establish-paths with a single path adds only that file's entry", async () => {
	const { slug, root, intentDir } = makeIntentFixture({
		stages: [
			{
				name: "design",
				artifacts: [
					{ name: "hero.html", content: "<hero/>" },
					{ name: "footer.html", content: "<footer/>" },
				],
			},
		],
	})

	setHaikuRootForTests(root)
	try {
		const result = await tool.handle({
			intent_slug: slug,
			mode: "establish-paths",
			paths: ["stages/design/artifacts/hero.html"],
		})
		const data = parseResponse(result)

		assert.strictEqual(data.ok, true)
		assert.strictEqual(
			data.baselines_created,
			1,
			"should create exactly 1 baseline",
		)
		assert.strictEqual(data.baselines_skipped_existing, 0)

		// Verify only hero.html is in the baseline, not footer.html.
		const baselinePath = join(intentDir, "stages", "design", "baseline.json")
		assert.ok(existsSync(baselinePath), "baseline.json should be created")
		const baselineData = JSON.parse(readFileSync(baselinePath, "utf-8"))
		assert.ok(
			"stages/design/artifacts/hero.html" in baselineData,
			"hero.html should be baselined",
		)
		assert.ok(
			!("stages/design/artifacts/footer.html" in baselineData),
			"footer.html should NOT be baselined",
		)
	} finally {
		setHaikuRootForTests(null)
	}
})

console.log("\n=== establish-paths: workflow-managed path rejected ===")

await test("establish-paths with a workflow-managed path returns path_outside_tracked_surface with reason: deny_list_match and writes nothing", async () => {
	const { slug, root, intentDir } = makeIntentFixture({
		stages: [{ name: "development", artifacts: [{ name: "real.md" }] }],
	})

	setHaikuRootForTests(root)
	try {
		// Ensure no baseline.json exists before the call.
		const baselinePath = join(
			intentDir,
			"stages",
			"development",
			"baseline.json",
		)
		assert.ok(
			!existsSync(baselinePath),
			"baseline should not exist before test",
		)

		// Pass a workflow-managed path.
		const result = await tool.handle({
			intent_slug: slug,
			mode: "establish-paths",
			paths: ["stages/development/units/unit-01-foo.md"],
		})
		const data = parseResponse(result)

		assert.strictEqual(data.ok, false)
		assert.strictEqual(data.code, "path_outside_tracked_surface")
		assert.strictEqual(data.reason, "deny_list_match")

		// Verify nothing was written.
		assert.ok(
			!existsSync(baselinePath),
			"baseline.json should NOT be written on deny",
		)
	} finally {
		setHaikuRootForTests(null)
	}
})

await test("establish-paths with intent.md path returns deny_list_match", async () => {
	const { slug, root } = makeIntentFixture({
		stages: [{ name: "development" }],
	})

	setHaikuRootForTests(root)
	try {
		const result = await tool.handle({
			intent_slug: slug,
			mode: "establish-paths",
			paths: ["intent.md"],
		})
		const data = parseResponse(result)
		assert.strictEqual(data.ok, false)
		assert.strictEqual(data.code, "path_outside_tracked_surface")
		assert.strictEqual(data.reason, "deny_list_match")
	} finally {
		setHaikuRootForTests(null)
	}
})

await test("establish-paths with state.json path returns deny_list_match", async () => {
	const { slug, root } = makeIntentFixture({
		stages: [{ name: "development" }],
	})

	setHaikuRootForTests(root)
	try {
		const result = await tool.handle({
			intent_slug: slug,
			mode: "establish-paths",
			paths: ["stages/development/state.json"],
		})
		const data = parseResponse(result)
		assert.strictEqual(data.ok, false)
		assert.strictEqual(data.code, "path_outside_tracked_surface")
		assert.strictEqual(data.reason, "deny_list_match")
	} finally {
		setHaikuRootForTests(null)
	}
})

await test("establish-paths with drift-subsystem-internal path (baseline.json) returns deny_list_match", async () => {
	const { slug, root } = makeIntentFixture({
		stages: [{ name: "development" }],
	})

	setHaikuRootForTests(root)
	try {
		const result = await tool.handle({
			intent_slug: slug,
			mode: "establish-paths",
			paths: ["stages/development/baseline.json"],
		})
		const data = parseResponse(result)
		assert.strictEqual(data.ok, false)
		assert.strictEqual(data.code, "path_outside_tracked_surface")
		assert.strictEqual(data.reason, "deny_list_match")
	} finally {
		setHaikuRootForTests(null)
	}
})

console.log("\n=== establish-paths: path escape rejected ===")

await test("establish-paths with a path outside the intent directory returns path_outside_tracked_surface with reason: path_escape", async () => {
	const { slug, root } = makeIntentFixture({
		stages: [{ name: "development" }],
	})

	setHaikuRootForTests(root)
	try {
		const result = await tool.handle({
			intent_slug: slug,
			mode: "establish-paths",
			// Traverse out of intent directory.
			paths: ["../../some-other-file.txt"],
		})
		const data = parseResponse(result)
		assert.strictEqual(data.ok, false)
		assert.strictEqual(data.code, "path_outside_tracked_surface")
		assert.strictEqual(data.reason, "path_escape")
	} finally {
		setHaikuRootForTests(null)
	}
})

console.log("\n=== intent_not_found ===")

await test("intent_not_found for an unknown slug", async () => {
	const root = join(tmp, `root-nf-${testCounter++}`)
	mkdirSync(root, { recursive: true })

	setHaikuRootForTests(root)
	try {
		const result = await tool.handle({
			intent_slug: "nonexistent-intent",
			mode: "establish-all",
		})
		const data = parseResponse(result)
		assert.strictEqual(data.ok, false)
		assert.strictEqual(data.code, "intent_not_found")
	} finally {
		setHaikuRootForTests(null)
	}
})

console.log("\n=== intent_not_active (archived) ===")

await test("intent_not_active for an archived intent", async () => {
	const { slug, root } = makeIntentFixture({
		archived: true,
		stages: [{ name: "development" }],
	})

	setHaikuRootForTests(root)
	try {
		const result = await tool.handle({
			intent_slug: slug,
			mode: "establish-all",
		})
		const data = parseResponse(result)
		assert.strictEqual(data.ok, false)
		assert.strictEqual(data.code, "intent_not_active")
	} finally {
		setHaikuRootForTests(null)
	}
})

console.log("\n=== tracked_surface_empty warning ===")

await test("tracked_surface_empty warning when intent has no tracked files", async () => {
	// Intent with stages directory but no tracked files inside them.
	const { slug, root } = makeIntentFixture({
		stages: [{ name: "development" }],
		// No artifacts, knowledge, or discovery files.
	})

	setHaikuRootForTests(root)
	try {
		const result = await tool.handle({
			intent_slug: slug,
			mode: "establish-all",
		})
		const data = parseResponse(result)

		assert.strictEqual(data.ok, true)
		assert.strictEqual(data.baselines_created, 0)
		assert.strictEqual(data.baselines_skipped_existing, 0)
		assert.ok(
			typeof data.warning === "string" &&
				data.warning.includes("tracked_surface_empty"),
			"should carry tracked_surface_empty warning",
		)
	} finally {
		setHaikuRootForTests(null)
	}
})

console.log("\n=== kill-switch interaction ===")

await test("tool succeeds with a drift_disabled_warning when drift_detection: false", async () => {
	const { slug, root } = makeIntentFixture({
		driftDisabled: true,
		stages: [
			{
				name: "development",
				artifacts: [{ name: "output.ts", content: "export default {}" }],
			},
		],
	})

	setHaikuRootForTests(root)
	try {
		const result = await tool.handle({
			intent_slug: slug,
			mode: "establish-all",
		})
		const data = parseResponse(result)

		// Tool must succeed (AC-G1-KS: safe to call when drift_detection: false).
		assert.strictEqual(
			data.ok,
			true,
			"should be ok even when kill-switch is on",
		)
		// Must have created a baseline.
		assert.strictEqual(
			data.baselines_created,
			1,
			"should still create a baseline",
		)
		// Must include the warning.
		assert.ok(
			typeof data.drift_disabled_warning === "string" &&
				data.drift_disabled_warning.length > 0,
			"should carry drift_disabled_warning",
		)
	} finally {
		setHaikuRootForTests(null)
	}
})

// ── Bonus: tool is registered in index.ts ─────────────────────────────────

console.log("\n=== tool registration ===")

await test("haiku_baseline_init is registered in orchestratorToolHandlers", async () => {
	const { orchestratorToolHandlers } = await import(
		"../src/tools/orchestrator/index.ts"
	)
	assert.ok(
		orchestratorToolHandlers.has("haiku_baseline_init"),
		"haiku_baseline_init should be in the registry",
	)
})

// ── Cleanup + summary ──────────────────────────────────────────────────────

try {
	rmSync(tmp, { recursive: true, force: true })
} catch {}

console.log("")
console.log(`  ${passed + failed} tests: ${passed} passed, ${failed} failed`)
console.log("")

process.exit(failed > 0 ? 1 : 0)

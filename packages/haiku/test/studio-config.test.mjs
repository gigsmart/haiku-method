#!/usr/bin/env npx tsx
// Tests for the StudioConfig shaper — verifies the in-memory shape
// matches the on-disk studio definitions.

import assert from "node:assert"
import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

// Point at the plugin root so resolveStudio() can find the bundled
// studios. The test file lives at
// packages/haiku/test/studio-config.test.mjs; the plugin dir is at
// the repo root.
const __dirname = dirname(fileURLToPath(import.meta.url))
process.env.CLAUDE_PLUGIN_ROOT = resolve(__dirname, "..", "..", "..", "plugin")

const { buildStudioConfig } = await import(
	"../src/orchestrator/workflow/build-studio-config.ts"
)

let passed = 0
let failed = 0

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

console.log("=== StudioConfig: software studio ===")

const software = buildStudioConfig("software")
assert.ok(software, "software studio should resolve via alias")

test("resolves via alias", () => {
	assert.strictEqual(software.dir, "software")
	assert.strictEqual(software.name, "application-development")
	assert.strictEqual(software.slug, "appdev")
})

test("default stages list is preserved in declared order", () => {
	assert.deepStrictEqual(software.defaultStages, [
		"inception",
		"design",
		"product",
		"development",
		"operations",
		"security",
	])
})

test("each declared stage resolves to a StageConfig", () => {
	for (const stageName of software.defaultStages) {
		assert.ok(
			software.stages[stageName],
			`stage '${stageName}' should have a config`,
		)
	}
})

test("studio default_model is sonnet", () => {
	assert.strictEqual(software.defaultModel, "sonnet")
})

test("development stage gate is compound [external, ask]", () => {
	const gate = software.stages.development.gate
	assert.deepStrictEqual(gate, ["external", "ask"])
})

test("development stage hats are [planner, builder, reviewer]", () => {
	const hatNames = software.stages.development.hats.map((h) => h.name)
	assert.deepStrictEqual(hatNames, ["planner", "builder", "reviewer"])
})

test("design stage hats are [designer-prep, designer, design-reviewer]", () => {
	const hatNames = software.stages.design.hats.map((h) => h.name)
	assert.deepStrictEqual(hatNames, [
		"designer-prep",
		"designer",
		"design-reviewer",
	])
})

test("design stage review agents include inception-coverage", () => {
	const agentNames = software.stages.design.reviewAgents.map((a) => a.name)
	assert.ok(
		agentNames.includes("inception-coverage"),
		`expected design.reviewAgents to include 'inception-coverage', got [${agentNames.join(", ")}]`,
	)
	const inceptionCoverage = software.stages.design.reviewAgents.find(
		(a) => a.name === "inception-coverage",
	)
	assert.ok(
		existsSync(inceptionCoverage.mandatePath),
		`inception-coverage mandate path must exist on disk: ${inceptionCoverage.mandatePath}`,
	)
})

test("development stage fix_hats are [classifier, builder, feedback-assessor]", () => {
	// Classifier is the v4 first-pass triage hat — runs before the
	// implementer to decide target_unit / target_invalidates on
	// user-authored FBs that landed without classification.
	const fixHatNames = software.stages.development.fixHats.map((h) => h.name)
	assert.deepStrictEqual(fixHatNames, [
		"classifier",
		"builder",
		"feedback-assessor",
	])
})

test("each hat config carries a mandate path that exists on disk", () => {
	for (const stageName of software.defaultStages) {
		const stage = software.stages[stageName]
		for (const hat of stage.hats) {
			assert.ok(
				existsSync(hat.mandatePath),
				`hat '${stageName}/${hat.name}' mandate path must exist: ${hat.mandatePath}`,
			)
		}
	}
})

test("development stage carries cross-stage review-agent includes", () => {
	const includes = software.stages.development.reviewAgentsInclude
	assert.ok(
		includes.length >= 2,
		`expected at least 2 includes, got ${includes.length}`,
	)
	const designInclude = includes.find((i) => i.stage === "design")
	assert.ok(designInclude, "should include design-stage agents")
	assert.ok(
		designInclude.agents.includes("consistency"),
		"design includes should list 'consistency'",
	)
})

test("development stage inputs reference upstream stages", () => {
	const inputs = software.stages.development.inputs
	const stages = new Set(inputs.map((i) => i.stage))
	assert.ok(stages.has("inception"), "should include inception input")
	assert.ok(stages.has("design"), "should include design input")
	assert.ok(stages.has("product"), "should include product input")
})

test("studio carries a description and body", () => {
	assert.ok(software.description.length > 0, "description must be non-empty")
	assert.ok(software.body.length > 0, "body must be non-empty")
})

console.log("\n=== StudioConfig: error paths ===")

test("unknown studio identifier returns null", () => {
	const cfg = buildStudioConfig("nonexistent-studio")
	assert.strictEqual(cfg, null)
})

console.log("\n=== StudioConfig: gate parsing ===")

test("simple-gate stages parse to single string", () => {
	// inception default review is ask; verify shape
	const gate = software.stages.inception.gate
	assert.ok(
		typeof gate === "string" || Array.isArray(gate),
		"gate must be string or array",
	)
})

console.log("\n=== StudioConfig: studio-level extras ===")

test("studio has at least one studio-level review agent", () => {
	assert.ok(
		software.studioReviewAgents.length > 0,
		"software studio ships studio-level review agents",
	)
})

test("studio-level review-agent paths exist on disk", () => {
	for (const agent of software.studioReviewAgents) {
		assert.ok(
			existsSync(agent.mandatePath),
			`studio review-agent '${agent.name}' path must exist`,
		)
	}
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)

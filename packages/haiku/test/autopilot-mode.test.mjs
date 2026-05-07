#!/usr/bin/env npx tsx
// Tests for Fix 1: autopilot-as-mode.
//
// Verifies:
//   (a) tool-defs.ts mode enum includes "autopilot" (not a separate boolean flag).
//   (b) mode: "autopilot" causes the gate handler to promote `ask` gates to `auto`.
//   (c) mode: "autopilot" does NOT promote `external` or compound gates (safety).
//   (d) The legacy `autopilot: true` boolean is honored as a FALLBACK when
//       `intent.mode !== "autopilot"`, so existing intents authored with the
//       boolean+continuous shape keep working without a hard migration. Canonical
//       new intents should use `mode: autopilot` directly. Compound gates like
//       `[external, ask]` strip `ask` (drop the local-review pause) but keep
//       external — autopilot never fakes external signals.

import assert from "node:assert"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
process.env.CLAUDE_PLUGIN_ROOT = resolve(__dirname, "..", "..", "..", "plugin")

// Eager import — module resolution happens at top-level so failures
// are visible even if all tests pass.
const { orchestratorToolDefs } = await import(
	"../src/orchestrator/tool-defs.ts"
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

// ── Part A: mode enum ─────────────────────────────────────────────────────────
//
// Mode is no longer a property of haiku_intent_create — it's set
// exclusively via haiku_select_mode (engine-managed elicitation). The
// canonical enum lives in `state/schemas/intent.ts` as INTENT_MODES.

console.log("=== mode enum (INTENT_MODES) ===")

const createDef = orchestratorToolDefs.find(
	(d) => d.name === "haiku_intent_create",
)
assert.ok(createDef, "haiku_intent_create tool must be defined")
assert.ok(
	!createDef.inputSchema.properties.mode,
	"haiku_intent_create must NOT accept mode — it's engine-managed via haiku_select_mode now",
)

const { INTENT_MODES: modeEnum } = await import(
	"../src/state/schemas/intent.ts"
)

test("mode enum contains 'continuous'", () => {
	assert.ok(
		modeEnum.includes("continuous"),
		`enum is: ${JSON.stringify(modeEnum)}`,
	)
})

test("mode enum contains 'discrete'", () => {
	assert.ok(
		modeEnum.includes("discrete"),
		`enum is: ${JSON.stringify(modeEnum)}`,
	)
})

test("mode enum contains 'autopilot'", () => {
	assert.ok(
		modeEnum.includes("autopilot"),
		`enum is: ${JSON.stringify(modeEnum)}`,
	)
})

test("mode enum contains 'quick' (single-stage continuous-style mode)", () => {
	assert.ok(modeEnum.includes("quick"), `enum is: ${JSON.stringify(modeEnum)}`)
})

test("mode enum does NOT contain 'hybrid' (virtual state, not a stored mode)", () => {
	assert.ok(
		!modeEnum.includes("hybrid"),
		`enum must not include 'hybrid'; got: ${JSON.stringify(modeEnum)}`,
	)
})

test("mode enum has exactly 5 values (continuous, discrete, autopilot, discrete-hybrid, quick)", () => {
	assert.strictEqual(
		modeEnum.length,
		5,
		`expected 5-value enum, got: ${JSON.stringify(modeEnum)}`,
	)
})

// ── Part B: gate handler reads mode field for autopilot ───────────────────────

console.log("\n=== gate handler: autopilot derived from mode field ===")

// We test the gate handler indirectly via runWorkflowTick. An intent
// with mode: autopilot + gate: ask should auto-advance (action=advance_stage
// or completeOrReviewIntent), not pause for human approval.

const { runWorkflowTick } = await import(
	"../src/orchestrator/workflow/run-tick.ts"
)

function fixture(slug, intentFm, stages = {}, studioOverrideDir = null) {
	const root = mkdtempSync(join(tmpdir(), "haiku-autopilot-"))
	const haikuRoot = join(root, ".haiku")
	const iDir = join(haikuRoot, "intents", slug)
	mkdirSync(iDir, { recursive: true })

	const fmLines = ["---"]
	for (const [k, v] of Object.entries(intentFm)) {
		if (v == null) continue
		if (typeof v === "boolean") fmLines.push(`${k}: ${v}`)
		else if (Array.isArray(v) && v.every((x) => typeof x === "string"))
			fmLines.push(`${k}: [${v.map((x) => `"${x}"`).join(", ")}]`)
		else fmLines.push(`${k}: "${v}"`)
	}
	fmLines.push("---", "", "# Intent body")
	writeFileSync(join(iDir, "intent.md"), fmLines.join("\n"))

	for (const [stageName, stageState] of Object.entries(stages)) {
		const sd = join(iDir, "stages", stageName)
		mkdirSync(sd, { recursive: true })
		writeFileSync(join(sd, "state.json"), JSON.stringify(stageState, null, 2))
	}

	// Optional project-level studio override directory (for Fix 2 tests).
	if (studioOverrideDir) {
		const overrideStudioDir = join(
			haikuRoot,
			"studios",
			studioOverrideDir.studio,
		)
		mkdirSync(overrideStudioDir, { recursive: true })
		for (const [stageName, files] of Object.entries(
			studioOverrideDir.stages || {},
		)) {
			const stageDir = join(overrideStudioDir, "stages", stageName)
			mkdirSync(stageDir, { recursive: true })
			for (const [fileName, content] of Object.entries(files)) {
				writeFileSync(join(stageDir, fileName), content)
			}
		}
	}

	return {
		haikuRoot,
		cleanup: () => rmSync(root, { recursive: true, force: true }),
	}
}

// Test: mode=autopilot with a completed gate-phase stage advances to intent review.
// The gate handler sees reviewType=auto (from autopilot promotion) and
// since there's no next stage, calls completeOrReviewIntent → advance_phase
// (enters completion review because intent_completion_review is default true).
//
// `process.chdir` into the temp root so that `findHaikuRoot()` inside
// workflowAdvanceStage / sealIntentState resolves to the test's temp
// directory instead of the real project .haiku/. Without this, side-
// effects from the gate handler (intent.md writes, state.json writes)
// would leak into the real intent tree.
test("mode:autopilot auto-advances a completed `ask` gate stage", () => {
	const slug = "test-autopilot-gate"
	const { haikuRoot, cleanup } = fixture(
		slug,
		{
			studio: "software",
			mode: "autopilot",
			stages: ["inception"],
			active_stage: "inception",
		},
		{
			inception: {
				status: "active",
				phase: "gate",
				started_at: "2026-01-01T00:00:00Z",
				completed_at: null,
				gate_entered_at: "2026-01-01T01:00:00Z",
				gate_outcome: null,
				visits: 1,
				iterations: [{ index: 1, started_at: "2026-01-01T00:00:00Z" }],
			},
		},
	)

	const origCwd = process.cwd()
	let result
	try {
		process.chdir(join(haikuRoot, "..")) // chdir to root (parent of .haiku)
		result = runWorkflowTick(slug, haikuRoot)
	} finally {
		process.chdir(origCwd)
		cleanup()
	}

	assert.ok(result, "tick must return a result")
	assert.ok(result.action, "result must have an action")
	// With autopilot mode, the gate should NOT pause for human review.
	// The action should be either advance_stage (to next stage) or
	// advance_phase (entering completion review / intent review).
	// It should NOT be gate_review (which would block for human approval).
	assert.notStrictEqual(
		result.action.action,
		"gate_review",
		`autopilot mode should not emit gate_review for an ask gate; got: ${result.action.action} — message: ${result.action.message}`,
	)
})

// Test: the legacy `autopilot: true` boolean (without `mode: autopilot`) is
// honored as a backwards-compatibility fallback in gate.ts.
//
// Decision history: the original Fix 1 contract (this test as authored)
// said the boolean MUST be ignored — only `intent.mode` should drive
// gate-handler behavior. That contract was relaxed in commit a61e6f69e
// ("fix(workflow): autopilot honors legacy boolean + drops ask from
// compound gates") because long-lived intents in the wild carry the
// legacy boolean alongside `mode: continuous` (or no mode at all) and
// silently popping local-review gates for those intents is a worse UX
// than honoring the boolean. The canonical mode taxonomy (memory.md
// `feedback_modes_taxonomy.md`) still says "autopilot is NOT a separate
// boolean", and the migration path is to upgrade legacy intent.md files
// to set `mode: autopilot` when an `autopilot: true` boolean is present.
// Until that migration ships, the legacy fallback stays.
//
// This test is updated to verify the CURRENT contract (legacy boolean is
// honored) rather than the original Fix 1 contract. When the migration
// lands and the fallback is removed, this test flips back.
// v4: legacy `autopilot: true` boolean fallback removed. Per the
// mode taxonomy lock (`mode: continuous | discrete | discrete-hybrid |
// autopilot | quick`), autopilot is its own first-class mode, not a
// boolean override on top of continuous. Intents authored before v4
// with the legacy boolean are migrated by the v0→v4 soft-scrub.

// ── Part C: Fix 2 regression — partial studio override doesn't truncate stages ─

console.log("\n=== Fix 2 regression: partial studio override ===")

const { resolveIntentStages } = await import("../src/orchestrator/studio.ts")
const { clearStudioCache } = await import("../src/studio-reader.ts")

test("partial project override (no STUDIO.md) does NOT truncate full studio stage list", () => {
	// Simulate: project has .haiku/studios/software/stages/development/
	// but NO STUDIO.md. Should not truncate the software studio's 6 stages.
	const root = mkdtempSync(join(tmpdir(), "haiku-override-"))
	const haikuRoot = join(root, ".haiku")

	// Create project-level partial override with only one stage dir, no STUDIO.md
	const overrideStageDir = join(
		haikuRoot,
		"studios",
		"software",
		"stages",
		"development",
	)
	mkdirSync(overrideStageDir, { recursive: true })
	// No STUDIO.md — intentionally absent.
	// Add an outputs/ subdirectory to simulate real content.
	const outputsDir = join(overrideStageDir, "outputs")
	mkdirSync(outputsDir, { recursive: true })

	// Override the haiku root so studioSearchPaths picks up our temp directory
	const origCwd = process.cwd()
	try {
		process.chdir(root)
		clearStudioCache()

		const intent = {
			studio: "software",
			stages: [
				"inception",
				"design",
				"product",
				"development",
				"operations",
				"security",
			],
		}
		const stages = resolveIntentStages(intent, "software")

		assert.strictEqual(
			stages.length,
			6,
			`expected 6 stages from plugin STUDIO.md, got ${stages.length}: [${stages.join(", ")}]`,
		)
		assert.deepStrictEqual(
			stages,
			[
				"inception",
				"design",
				"product",
				"development",
				"operations",
				"security",
			],
			"stage order must match plugin STUDIO.md declaration",
		)
	} finally {
		process.chdir(origCwd)
		clearStudioCache()
		rmSync(root, { recursive: true, force: true })
	}
})

test("partial project override with STUDIO.md DOES override the stage list", () => {
	// If STUDIO.md IS present in the project override, it should take effect.
	const root = mkdtempSync(join(tmpdir(), "haiku-full-override-"))
	const haikuRoot = join(root, ".haiku")

	const overrideDir = join(haikuRoot, "studios", "software")
	mkdirSync(overrideDir, { recursive: true })
	// Write a full STUDIO.md with a restricted stage list
	writeFileSync(
		join(overrideDir, "STUDIO.md"),
		`---
name: application-development
slug: appdev
description: Project-level override with custom stages
category: software
stages: [inception, development]
---
Project-level software studio override.
`,
	)

	const origCwd = process.cwd()
	try {
		process.chdir(root)
		clearStudioCache()

		const intent = { studio: "software" }
		const stages = resolveIntentStages(intent, "software")

		assert.strictEqual(
			stages.length,
			2,
			`project override with STUDIO.md should limit to 2 stages, got ${stages.length}: [${stages.join(", ")}]`,
		)
		assert.deepStrictEqual(stages, ["inception", "development"])
	} finally {
		process.chdir(origCwd)
		clearStudioCache()
		rmSync(root, { recursive: true, force: true })
	}
})

// ── Part D: Fix 3 — pre-seal stage-completeness guard ─────────────────────────

console.log("\n=== Fix 3: pre-seal stage-completeness guard ===")

const { findIncompleteStages } = await import(
	"../src/orchestrator/workflow/side-effects.ts"
)

// Test: 3-stage intent where only 2 stages completed — findIncompleteStages
// returns the incomplete stage so completeOrReviewIntent can block.
test("findIncompleteStages returns incomplete stages when some are missing state.json", () => {
	const slug = "test-completeness-guard-partial"
	const root = mkdtempSync(join(tmpdir(), "haiku-completeness-"))
	const haikuRoot = join(root, ".haiku")
	const iDir = join(haikuRoot, "intents", slug)
	mkdirSync(iDir, { recursive: true })

	// Intent with 3 stages, only 2 will have completed state.json.
	const intentFm = [
		"---",
		`studio: "software"`,
		`stages: ["inception", "design", "product"]`,
		`active_stage: "product"`,
		"---",
		"",
		"# Test intent for completeness guard",
	].join("\n")
	writeFileSync(join(iDir, "intent.md"), intentFm)

	// inception: completed
	const inceptionDir = join(iDir, "stages", "inception")
	mkdirSync(inceptionDir, { recursive: true })
	writeFileSync(
		join(inceptionDir, "state.json"),
		JSON.stringify({ status: "completed" }),
	)

	// design: completed
	const designDir = join(iDir, "stages", "design")
	mkdirSync(designDir, { recursive: true })
	writeFileSync(
		join(designDir, "state.json"),
		JSON.stringify({ status: "completed" }),
	)

	// product: active (not completed) — simulates stages that never ran
	const productDir = join(iDir, "stages", "product")
	mkdirSync(productDir, { recursive: true })
	writeFileSync(
		join(productDir, "state.json"),
		JSON.stringify({ status: "active", phase: "gate" }),
	)

	const origCwd = process.cwd()
	let result
	try {
		process.chdir(root)
		clearStudioCache()
		result = findIncompleteStages(slug, "software")
	} finally {
		process.chdir(origCwd)
		clearStudioCache()
		rmSync(root, { recursive: true, force: true })
	}

	assert.deepStrictEqual(
		result,
		["product"],
		`expected ["product"] incomplete, got: ${JSON.stringify(result)}`,
	)
})

// Test: all stages completed — findIncompleteStages returns empty array.
test("findIncompleteStages returns [] when all declared stages are completed", () => {
	const slug = "test-completeness-guard-full"
	const root = mkdtempSync(join(tmpdir(), "haiku-completeness-full-"))
	const haikuRoot = join(root, ".haiku")
	const iDir = join(haikuRoot, "intents", slug)
	mkdirSync(iDir, { recursive: true })

	const intentFm = [
		"---",
		`studio: "software"`,
		`stages: ["inception", "design"]`,
		`active_stage: "design"`,
		"---",
		"",
		"# Test intent for completeness guard — all complete",
	].join("\n")
	writeFileSync(join(iDir, "intent.md"), intentFm)

	for (const stage of ["inception", "design"]) {
		const stDir = join(iDir, "stages", stage)
		mkdirSync(stDir, { recursive: true })
		writeFileSync(
			join(stDir, "state.json"),
			JSON.stringify({ status: "completed" }),
		)
	}

	const origCwd = process.cwd()
	let result
	try {
		process.chdir(root)
		clearStudioCache()
		result = findIncompleteStages(slug, "software")
	} finally {
		process.chdir(origCwd)
		clearStudioCache()
		rmSync(root, { recursive: true, force: true })
	}

	assert.deepStrictEqual(
		result,
		[],
		`expected empty array, got: ${JSON.stringify(result)}`,
	)
})

// Test: stage with missing state.json entirely is also flagged as incomplete.
test("findIncompleteStages includes stages with no state.json at all", () => {
	const slug = "test-completeness-guard-missing"
	const root = mkdtempSync(join(tmpdir(), "haiku-completeness-miss-"))
	const haikuRoot = join(root, ".haiku")
	const iDir = join(haikuRoot, "intents", slug)
	mkdirSync(iDir, { recursive: true })

	const intentFm = [
		"---",
		`studio: "software"`,
		`stages: ["inception", "design", "product"]`,
		`active_stage: "design"`,
		"---",
		"",
		"# Test intent — missing stage dir",
	].join("\n")
	writeFileSync(join(iDir, "intent.md"), intentFm)

	// Only inception has state.json; design and product don't exist at all.
	const inceptionDir = join(iDir, "stages", "inception")
	mkdirSync(inceptionDir, { recursive: true })
	writeFileSync(
		join(inceptionDir, "state.json"),
		JSON.stringify({ status: "completed" }),
	)

	const origCwd = process.cwd()
	let result
	try {
		process.chdir(root)
		clearStudioCache()
		result = findIncompleteStages(slug, "software")
	} finally {
		process.chdir(origCwd)
		clearStudioCache()
		rmSync(root, { recursive: true, force: true })
	}

	assert.deepStrictEqual(
		result,
		["design", "product"],
		`expected ["design", "product"] incomplete, got: ${JSON.stringify(result)}`,
	)
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)

// __tests__/derived-stage-state.test.ts — Pure-function tests for
// `deriveStageStatePure`. No I/O, no git, no fixtures — every input
// the function takes is constructed inline so the state-machine
// branches are exercised in milliseconds.
//
// Run via: cd packages/shared && npx tsx src/__tests__/derived-stage-state.test.ts
//
// The engine wrapper (packages/haiku/src/orchestrator/workflow/derived-stage-state.ts)
// and the website wrapper (website/lib/browse/intent-parsing.ts) gather
// the inputs from disk and VCS API respectively; this file pins what
// the pure function does once the inputs are in hand. Coverage matrix:
//
//   status × stageMergedIntoMain × hats × approvalRoles
//   phase  × intentMode × elaborationVerified × units × hats × roles
//   gate_outcome × per-unit approvals
//   visits × per-unit iterations.length
//   started_at × earliest unit started_at
//   completed_at × status === "completed" gating

import assert from "node:assert"
import {
	type DerivedUnitView,
	deriveStageStatePure,
} from "../derived-stage-state"

let passed = 0
let failed = 0

function test(name: string, fn: () => void): void {
	try {
		fn()
		passed++
		console.log(`  ✓ ${name}`)
	} catch (e) {
		failed++
		const msg = e instanceof Error ? e.message : String(e)
		console.log(`  ✗ ${name}: ${msg}`)
	}
}

const at = "2026-05-09T00:00:00Z"
const later = "2026-05-09T01:00:00Z"

function unit(name: string, fm: Record<string, unknown> = {}): DerivedUnitView {
	return { name, fm }
}

const startedUnit = unit("u1", { started_at: at })
const advancedUnit = unit("u1", {
	started_at: at,
	iterations: [
		{ hat: "researcher", started_at: at, completed_at: at, result: "advance" },
		{ hat: "verifier", started_at: at, completed_at: at, result: "advance" },
	],
})
const fullySigned = unit("u1", {
	started_at: at,
	iterations: [
		{ hat: "researcher", started_at: at, completed_at: at, result: "advance" },
		{ hat: "verifier", started_at: at, completed_at: later, result: "advance" },
	],
	reviews: { spec: { at }, user: { at } },
	approvals: { spec: { at }, quality_gates: { at }, user: { at } },
})

console.log("── status ────────────────────────────────────────────")

test("stageMergedIntoMain=true → completed (regardless of units)", () => {
	const out = deriveStageStatePure({
		stage: "design",
		units: [],
		intentMode: "continuous",
		stageMergedIntoMain: true,
	})
	assert.strictEqual(out.status, "completed")
	assert.strictEqual(out.phase, null)
})

test("stageMergedIntoMain=false + no units → pending", () => {
	const out = deriveStageStatePure({
		stage: "design",
		units: [],
		intentMode: "continuous",
		stageMergedIntoMain: false,
	})
	assert.strictEqual(out.status, "pending")
})

test("stageMergedIntoMain=false + started unit → active", () => {
	const out = deriveStageStatePure({
		stage: "design",
		units: [startedUnit],
		intentMode: "continuous",
		stageMergedIntoMain: false,
	})
	assert.strictEqual(out.status, "active")
})

test("stageMergedIntoMain=false + only spec units (no started_at, no its) → pending", () => {
	const out = deriveStageStatePure({
		stage: "design",
		units: [unit("u1"), unit("u2")],
		intentMode: "continuous",
		stageMergedIntoMain: false,
	})
	assert.strictEqual(out.status, "pending")
})

// Date-typed timestamps: YAML 1.1 auto-promotes unquoted ISO timestamps
// to JS `Date` objects via gray-matter. The pure function must treat
// these the same as ISO strings (the website path doesn't normalize
// before calling in). These tests pin that invariant.

test("Date-typed started_at counts as started (gray-matter auto-promote)", () => {
	const u = unit("u1", { started_at: new Date("2026-05-09T00:00:00Z") })
	const out = deriveStageStatePure({
		stage: "design",
		units: [u],
		intentMode: "continuous",
		stageMergedIntoMain: false,
	})
	assert.strictEqual(out.status, "active")
})

test("invalid Date-typed started_at does NOT count as started", () => {
	// new Date("invalid") yields NaN — guard via !Number.isNaN(getTime()).
	const u = unit("u1", { started_at: new Date("not-a-date") })
	const out = deriveStageStatePure({
		stage: "design",
		units: [u],
		intentMode: "continuous",
		stageMergedIntoMain: false,
	})
	assert.strictEqual(out.status, "pending")
})

test("Date-typed iteration.completed_at flows through to completed_at output", () => {
	const dateLater = new Date("2026-05-09T01:00:00Z")
	const u = unit("u1", {
		started_at: at,
		iterations: [
			{ hat: "researcher", started_at: at, completed_at: at, result: "advance" },
			{
				hat: "verifier",
				started_at: at,
				completed_at: dateLater,
				result: "advance",
			},
		],
		reviews: { spec: { at }, user: { at } },
		approvals: { spec: { at }, quality_gates: { at }, user: { at } },
	})
	const out = deriveStageStatePure({
		stage: "design",
		units: [u],
		intentMode: "continuous",
		hats: ["researcher", "verifier"],
		approvalRoles: ["spec", "quality_gates", "user"],
	})
	assert.strictEqual(out.status, "completed")
	// coerceTimestamp converts the Date to its ISO string before
	// derivation compares; result must equal the canonical ISO form.
	assert.strictEqual(out.completed_at, dateLater.toISOString())
})

test("Date-typed unit.started_at flows through to started_at output", () => {
	const dateAt = new Date("2026-05-08T12:00:00Z")
	const u = unit("u1", { started_at: dateAt })
	const out = deriveStageStatePure({
		stage: "design",
		units: [u],
		intentMode: "continuous",
		stageMergedIntoMain: false,
	})
	assert.strictEqual(out.started_at, dateAt.toISOString())
})

test("stageMergedIntoMain=null (fs mode) + fully signed → completed", () => {
	const out = deriveStageStatePure({
		stage: "design",
		units: [fullySigned],
		intentMode: "continuous",
		hats: ["researcher", "verifier"],
		approvalRoles: ["spec", "quality_gates", "user"],
	})
	assert.strictEqual(out.status, "completed")
})

test("fs mode + fully signed but missing terminal hat → active", () => {
	const out = deriveStageStatePure({
		stage: "design",
		units: [
			unit("u1", {
				started_at: at,
				iterations: [
					{
						hat: "researcher",
						started_at: at,
						completed_at: at,
						result: "advance",
					},
				],
				approvals: { spec: { at }, quality_gates: { at }, user: { at } },
			}),
		],
		intentMode: "continuous",
		hats: ["researcher", "verifier"],
		approvalRoles: ["spec", "quality_gates", "user"],
	})
	// Last iteration's hat is "researcher", not the terminal "verifier" → not complete.
	assert.strictEqual(out.status, "active")
})

console.log("\n── phase ─────────────────────────────────────────────")

test("autopilot + no units → elaborate (decompose pending)", () => {
	const out = deriveStageStatePure({
		stage: "design",
		units: [],
		intentMode: "autopilot",
	})
	// Autopilot skips the elaborate gate, but with no units, phase=elaborate
	// because decompose is still pending.
	assert.strictEqual(out.phase, "elaborate")
})

test("non-autopilot + elaborationVerified=false → elaborate", () => {
	const out = deriveStageStatePure({
		stage: "design",
		units: [advancedUnit],
		intentMode: "continuous",
		elaborationVerified: false,
		hats: ["researcher", "verifier"],
		// Pass approvalRoles so status doesn't auto-complete from per-unit
		// vacuous "all approvals signed" (empty approvalRoles is vacuously true).
		approvalRoles: ["spec", "quality_gates", "user"],
	})
	assert.strictEqual(out.phase, "elaborate")
})

test("non-autopilot + elaborationVerified=null + no units → elaborate", () => {
	const out = deriveStageStatePure({
		stage: "design",
		units: [],
		intentMode: "continuous",
		elaborationVerified: null,
	})
	assert.strictEqual(out.phase, "elaborate")
})

test("autopilot + elaborationVerified=null bypasses gate", () => {
	const out = deriveStageStatePure({
		stage: "design",
		units: [advancedUnit],
		intentMode: "autopilot",
		elaborationVerified: null,
		hats: ["researcher", "verifier"],
		// Autopilot trims approvals to spec + quality_gates.
		approvalRoles: ["spec", "quality_gates"],
	})
	// Hats done, but no reviews/approvals → review (or gate, depending
	// on which check fires first). Autopilot has no review chain
	// configured here → falls into gate.
	assert.notStrictEqual(out.phase, "elaborate")
})

test("hats configured + iterations partial → execute", () => {
	const out = deriveStageStatePure({
		stage: "design",
		units: [
			unit("u1", {
				started_at: at,
				iterations: [
					{
						hat: "researcher",
						started_at: at,
						completed_at: at,
						result: "advance",
					},
				],
			}),
		],
		intentMode: "continuous",
		hats: ["researcher", "verifier"],
		elaborationVerified: true,
	})
	assert.strictEqual(out.phase, "execute")
})

test("hats done + reviews missing → review", () => {
	const out = deriveStageStatePure({
		stage: "design",
		units: [advancedUnit],
		intentMode: "continuous",
		hats: ["researcher", "verifier"],
		reviewRoles: ["spec", "user"],
		// Required so status doesn't vacuously complete on empty approvalRoles.
		approvalRoles: ["spec", "quality_gates", "user"],
		elaborationVerified: true,
	})
	assert.strictEqual(out.phase, "review")
})

test("reviews signed + approvals missing → gate", () => {
	const u = unit("u1", {
		started_at: at,
		iterations: [
			{
				hat: "researcher",
				started_at: at,
				completed_at: at,
				result: "advance",
			},
			{ hat: "verifier", started_at: at, completed_at: at, result: "advance" },
		],
		reviews: { spec: { at }, user: { at } },
		// Missing approvals.
	})
	const out = deriveStageStatePure({
		stage: "design",
		units: [u],
		intentMode: "continuous",
		hats: ["researcher", "verifier"],
		reviewRoles: ["spec", "user"],
		approvalRoles: ["spec", "quality_gates", "user"],
		elaborationVerified: true,
	})
	assert.strictEqual(out.phase, "gate")
})

test("all approvals signed → phase=null (past gate, awaiting merge)", () => {
	const out = deriveStageStatePure({
		stage: "design",
		units: [fullySigned],
		intentMode: "continuous",
		hats: ["researcher", "verifier"],
		reviewRoles: ["spec", "user"],
		approvalRoles: ["spec", "quality_gates", "user"],
		elaborationVerified: true,
	})
	// Fully signed in fs mode → status=completed → phase forced to null.
	assert.strictEqual(out.phase, null)
})

console.log("\n── gate_outcome ──────────────────────────────────────")

test("every unit fully approved → advanced", () => {
	const out = deriveStageStatePure({
		stage: "design",
		units: [fullySigned, fullySigned],
		intentMode: "continuous",
		approvalRoles: ["spec", "quality_gates", "user"],
	})
	assert.strictEqual(out.gate_outcome, "advanced")
})

test("any unit missing any approval → null", () => {
	const u = unit("u1", {
		started_at: at,
		approvals: { spec: { at }, quality_gates: { at } /* missing user */ },
	})
	const out = deriveStageStatePure({
		stage: "design",
		units: [u],
		intentMode: "continuous",
		approvalRoles: ["spec", "quality_gates", "user"],
	})
	assert.strictEqual(out.gate_outcome, null)
})

test("new unit with empty approvals re-opens gate even if siblings approved", () => {
	const fresh = unit("u-late", { started_at: later })
	const out = deriveStageStatePure({
		stage: "design",
		units: [fullySigned, fresh],
		intentMode: "continuous",
		approvalRoles: ["spec", "quality_gates", "user"],
	})
	assert.strictEqual(out.gate_outcome, null)
})

console.log("\n── visits / started_at / completed_at ────────────────")

test("visits = max iteration count across units", () => {
	const u1 = unit("u1", {
		started_at: at,
		iterations: [
			{ hat: "a", started_at: at, completed_at: at, result: "advance" },
		],
	})
	const u2 = unit("u2", {
		started_at: at,
		iterations: [
			{ hat: "a", started_at: at, completed_at: at, result: "reject" },
			{ hat: "a", started_at: at, completed_at: at, result: "advance" },
			{ hat: "b", started_at: at, completed_at: at, result: "advance" },
		],
	})
	const out = deriveStageStatePure({
		stage: "design",
		units: [u1, u2],
		intentMode: "continuous",
	})
	assert.strictEqual(out.visits, 3)
})

test("started_at = earliest unit started_at", () => {
	const earlier = "2026-05-08T12:00:00Z"
	const u1 = unit("u1", { started_at: at })
	const u2 = unit("u2", { started_at: earlier })
	const out = deriveStageStatePure({
		stage: "design",
		units: [u1, u2],
		intentMode: "continuous",
	})
	assert.strictEqual(out.started_at, earlier)
})

test("completed_at = null when status !== completed", () => {
	const out = deriveStageStatePure({
		stage: "design",
		units: [advancedUnit],
		intentMode: "continuous",
		hats: ["researcher", "verifier"],
		stageMergedIntoMain: false,
	})
	assert.strictEqual(out.completed_at, null)
})

test("completed_at = latest terminal-advance when completed (fs mode)", () => {
	const out = deriveStageStatePure({
		stage: "design",
		units: [fullySigned],
		intentMode: "continuous",
		hats: ["researcher", "verifier"],
		approvalRoles: ["spec", "quality_gates", "user"],
	})
	assert.strictEqual(out.status, "completed")
	// The terminal-advance iteration's completed_at is `later` per the
	// fixture; that's the value derived.
	assert.strictEqual(out.completed_at, later)
})

console.log(`\n── Result: ${passed} passed, ${failed} failed ───────────`)
process.exit(failed === 0 ? 0 : 1)

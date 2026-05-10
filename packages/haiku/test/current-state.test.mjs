#!/usr/bin/env npx tsx
// Unit tests for getCurrentState — the unified resolver every consumer
// (orchestrator pre-tick, HTTP API, browse SPA) reads to answer "where
// is this intent right now?". The function is now load-bearing for
// UI/engine consistency, so these tests pin every resolution branch.

import assert from "node:assert"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import matter from "gray-matter"

const __dirname = dirname(fileURLToPath(import.meta.url))
process.env.CLAUDE_PLUGIN_ROOT = resolve(__dirname, "..", "..", "..", "plugin")

const { getCurrentState } = await import("../src/current-state.ts")
const { resolveStageHats: _resolveStageHats } = await import(
	"../src/orchestrator/studio.ts"
)
const { readReviewAgentPaths: _readReviewAgentPaths } = await import(
	"../src/studio-reader.ts"
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

/** v4: build a temp .haiku root with intent.md + per-stage units that
 *  match the requested {status, phase} shape. The legacy v3 fixture
 *  wrote state.json directly; the v4 derivation reads per-unit FM
 *  instead, so we synthesize units that produce the right derived
 *  status/phase via `deriveStageState`. */
function fixture(slug, frontmatter, stages = {}) {
	const root = mkdtempSync(join(tmpdir(), "haiku-current-state-"))
	const haikuRoot = join(root, ".haiku")
	const iDir = join(haikuRoot, "intents", slug)
	mkdirSync(iDir, { recursive: true })

	const fmLines = ["---"]
	for (const [k, v] of Object.entries(frontmatter)) {
		if (v == null) continue
		if (typeof v === "boolean") fmLines.push(`${k}: ${v}`)
		else if (Array.isArray(v) && v.every((x) => typeof x === "string"))
			fmLines.push(`${k}: [${v.map((x) => `"${x}"`).join(", ")}]`)
		else if (Array.isArray(v) || (typeof v === "object" && v !== null))
			fmLines.push(`${k}: ${JSON.stringify(v)}`)
		else fmLines.push(`${k}: "${v}"`)
	}
	if (!("mode" in frontmatter)) fmLines.push(`mode: "continuous"`)
	fmLines.push("---", "", "# Intent body")
	writeFileSync(join(iDir, "intent.md"), fmLines.join("\n"))

	const studio = frontmatter.studio || ""
	const at = "2026-05-09T00:00:00Z"
	for (const [stageName, stageState] of Object.entries(stages)) {
		const sd = join(iDir, "stages", stageName)
		mkdirSync(sd, { recursive: true })

		// v4 fixture protocol: stageState is a plain object describing
		// the desired derived shape (status + phase). Allow legacy
		// "state.json string" for the malformed-file case — we just
		// drop it now (deriveStageState ignores state.json).
		if (typeof stageState === "string") continue

		const status = stageState.status || "pending"
		const phase = stageState.phase || ""
		if (status === "pending") continue

		const unitsDir = join(sd, "units")
		mkdirSync(unitsDir, { recursive: true })
		const hats = studio ? _resolveStageHats(studio, stageName) : []
		const agents = studio
			? Object.keys(_readReviewAgentPaths(studio, stageName)).sort()
			: []
		const reviews = { spec: { at }, user: { at } }
		const approvals = { spec: { at }, quality_gates: { at }, user: { at } }
		for (const a of agents) {
			reviews[a] = { at }
			approvals[a] = { at }
		}

		// status: completed → fully signed (terminal hat advanced + all
		// approvals). status: active with phase: execute → some hats run.
		// status: active with phase: review → hats done but reviews missing.
		// status: active with phase: gate → reviews signed, approvals missing.
		// status: active with phase: elaborate (default for active) → no
		// units actually written; status will derive as "pending" instead,
		// so emit a unit with no iterations to force "active".
		let iterations = []
		let unitReviews = {}
		let unitApprovals = {}
		if (status === "completed") {
			iterations = hats.map((hat) => ({
				hat,
				started_at: at,
				completed_at: at,
				result: "advance",
			}))
			unitReviews = reviews
			unitApprovals = approvals
		} else if (phase === "execute") {
			// Mid-hat: only first hat advanced.
			iterations = hats.length > 0
				? [{ hat: hats[0], started_at: at, completed_at: at, result: "advance" }]
				: []
		} else if (phase === "review") {
			iterations = hats.map((hat) => ({
				hat,
				started_at: at,
				completed_at: at,
				result: "advance",
			}))
		} else if (phase === "gate") {
			iterations = hats.map((hat) => ({
				hat,
				started_at: at,
				completed_at: at,
				result: "advance",
			}))
			unitReviews = reviews
		} else {
			// "elaborate" or unknown — emit a started but un-advanced unit.
			iterations = []
		}

		// Seed verified elaboration so we don't trip the per-stage
		// elaborate gate. Use matter.stringify so the YAML quotes the
		// timestamp — raw `verified_at: 2026-...Z` parses as a Date
		// object, which the typeof-string check in derivePhase rejects.
		writeFileSync(
			join(sd, "elaboration.md"),
			matter.stringify(`# Elaboration ${stageName}\n`, {
				title: stageName,
				verified_at: at,
			}),
		)

		const unitFm = {
			title: `${stageName}-u1`,
			started_at: at,
			iterations,
			reviews: unitReviews,
			approvals: unitApprovals,
		}
		writeFileSync(
			join(unitsDir, `${stageName}-u1.md`),
			matter.stringify(`# ${stageName}-u1\n`, unitFm),
		)
	}

	return {
		haikuRoot,
		cleanup: () => rmSync(root, { recursive: true, force: true }),
	}
}

console.log("=== getCurrentState ===")

test("returns null when intent.md does not exist", () => {
	assert.strictEqual(getCurrentState("nope", "/tmp/does-not-exist"), null)
})

test("returns null when studio frontmatter is empty", () => {
	const { haikuRoot, cleanup } = fixture("no-studio", { studio: "" })
	try {
		assert.strictEqual(getCurrentState("no-studio", haikuRoot), null)
	} finally {
		cleanup()
	}
})

test("returns null when intent is composite", () => {
	const { haikuRoot, cleanup } = fixture("composite-intent", {
		studio: "software",
		composite: [{ studio: "software", stages: ["design"] }],
	})
	try {
		assert.strictEqual(getCurrentState("composite-intent", haikuRoot), null)
	} finally {
		cleanup()
	}
})

test("returns first stage when first stage is not done", () => {
	// v4: with units present + verified elaboration but hat sequence
	// not complete, derived phase is "execute" (one hat advanced).
	// The legacy v3 assertion of phase: "elaborate" doesn't apply —
	// "elaborate" only fires now when elaboration.md is missing/
	// unverified or units don't exist yet.
	const { haikuRoot, cleanup } = fixture(
		"first-active",
		{ studio: "software" },
		{
			inception: { stage: "inception", status: "active", phase: "execute" },
		},
	)
	try {
		const r = getCurrentState("first-active", haikuRoot)
		assert.ok(r)
		assert.strictEqual(r.studio, "software")
		assert.strictEqual(r.stage, "inception")
		assert.strictEqual(r.phase, "execute")
	} finally {
		cleanup()
	}
})

test("returns second stage when first is done and second is active", () => {
	const { haikuRoot, cleanup } = fixture(
		"second-active",
		{ studio: "software" },
		{
			inception: { stage: "inception", status: "completed", phase: "gate" },
			design: { stage: "design", status: "active", phase: "execute" },
		},
	)
	try {
		const r = getCurrentState("second-active", haikuRoot)
		assert.ok(r)
		assert.strictEqual(r.stage, "design")
		assert.strictEqual(r.phase, "execute")
	} finally {
		cleanup()
	}
})

test("returns last stage when every stage is done", () => {
	const { haikuRoot, cleanup } = fixture(
		"all-done",
		{ studio: "software" },
		{
			inception: { stage: "inception", status: "completed", phase: "gate" },
			design: { stage: "design", status: "completed", phase: "gate" },
			product: { stage: "product", status: "completed", phase: "gate" },
			development: {
				stage: "development",
				status: "completed",
				phase: "gate",
			},
			operations: { stage: "operations", status: "completed", phase: "gate" },
			security: { stage: "security", status: "completed", phase: "gate" },
		},
	)
	try {
		const r = getCurrentState("all-done", haikuRoot)
		assert.ok(r)
		assert.strictEqual(r.stage, "security")
	} finally {
		cleanup()
	}
})

// v3 zombie tests deleted (2026-05-09):
//
//  - "status=completed + gate_outcome=blocked counts as not done":
//    v4 derivation never returns "blocked" — that was a v3 state.json
//    field. Stage status comes from branch-merge state + per-unit
//    completion; there is no separate blocked sentinel.
//
//  - "malformed state.json is treated as not done":
//    v4 doesn't read state.json. A malformed file is invisible to
//    derivation. The behavior the test pinned (parse-fail = not done)
//    no longer applies.
//
//  - "phase strings outside the valid set normalize to empty":
//    v4 derives phase from per-unit FM, never reads a free-form phase
//    string. Invalid-phase normalization is moot.

test("ignores intent.md.active_stage — derives from per-unit FM only", () => {
	// intent.md says active_stage=design but per-unit FM shows inception
	// still has work in flight (units exist + not fully signed). The
	// whole point of the resolver is that derivation wins over the
	// active_stage cache; if we accidentally read the cache, this test
	// catches it.
	const { haikuRoot, cleanup } = fixture(
		"stale-cache",
		{ studio: "software", active_stage: "design" },
		{
			inception: { stage: "inception", status: "active", phase: "execute" },
			design: { stage: "design", status: "pending", phase: "" },
		},
	)
	try {
		const r = getCurrentState("stale-cache", haikuRoot)
		assert.ok(r)
		assert.strictEqual(r.stage, "inception")
	} finally {
		cleanup()
	}
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)

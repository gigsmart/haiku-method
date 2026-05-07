#!/usr/bin/env npx tsx
// haiku_reflect was originally v3-only — it read intent.status,
// completed_at, per-stage state.json, and per-unit bolt/hat/status,
// all of which are gone in v4. Without dual-path coverage it would
// emit garbage on v4 intents (every status "unknown", every stage
// pending, every unit count 0/N completed).
//
// This test stands up a v4 intent on disk and checks that
// haiku_reflect's report carries the v4-derived facts: schema
// indicator, sealed_at-derived status, per-stage status from unit
// iterations[], and unit completion count from terminal-advance + user
// approval.

import assert from "node:assert"
import { execSync } from "node:child_process"
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import matter from "gray-matter"
import { handleStateTool } from "../src/state-tools.ts"

let passed = 0
let failed = 0
let projDir = ""
let originalCwd = ""

function test(name, fn) {
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

function getTextResult(result) {
	const block = result.content.find((c) => c.type === "text")
	return block?.text ?? ""
}

function git(cwd, ...args) {
	return execSync(`git ${args.map((a) => JSON.stringify(a)).join(" ")}`, {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim()
}

function setupV4Intent() {
	projDir = mkdtempSync(join(tmpdir(), "haiku-reflect-v4-"))
	originalCwd = process.cwd()
	process.chdir(projDir)
	git(projDir, "init", "-q")
	git(projDir, "config", "user.email", "test@haiku.test")
	git(projDir, "config", "user.name", "haiku test")
	git(projDir, "commit", "--allow-empty", "-q", "-m", "init")
	const slug = "v4-reflect-test"
	git(projDir, "checkout", "-q", "-b", `haiku/${slug}/main`)

	const intentDir = join(projDir, ".haiku", "intents", slug)
	mkdirSync(join(intentDir, "stages", "design", "units"), { recursive: true })

	// v4 intent: plugin_version stamped, no v3 fields.
	writeFileSync(
		join(intentDir, "intent.md"),
		matter.stringify("# Reflect test\n", {
			title: "Reflect dual-path",
			studio: "software",
			mode: "discrete",
			plugin_version: "4.0.0",
			started_at: "2026-04-15T09:00:00Z",
			approvals: {},
			sealed_at: null,
		}),
	)

	// Two units in design: one fully completed (terminal advance + user
	// approval), one in-flight.
	writeFileSync(
		join(intentDir, "stages", "design", "units", "unit-01-complete.md"),
		matter.stringify("# unit-01\n", {
			title: "First unit",
			started_at: "2026-04-15T10:00:00Z",
			iterations: [
				{
					hat: "verifier",
					started_at: "t",
					completed_at: "t",
					result: "advance",
				},
			],
			reviews: { user: { at: "t" } },
			approvals: { user: { at: "t" } },
		}),
	)
	writeFileSync(
		join(intentDir, "stages", "design", "units", "unit-02-inflight.md"),
		matter.stringify("# unit-02\n", {
			title: "Second unit",
			started_at: "2026-04-15T11:00:00Z",
			iterations: [
				{ hat: "builder", started_at: "t" }, // no result yet
			],
			reviews: {},
			approvals: {},
		}),
	)
	return { slug }
}

function teardown() {
	if (originalCwd) process.chdir(originalCwd)
	if (projDir && existsSync(projDir))
		rmSync(projDir, { recursive: true, force: true })
}

console.log("\n── haiku_reflect on v4 intent ─────────────────────────────")

const { slug } = setupV4Intent()
try {
	const result = handleStateTool("haiku_reflect", { intent: slug })
	const out = getTextResult(result)

	test("emits v4 schema indicator", () => {
		assert.match(out, /Schema:\s*v4/)
	})

	test("intent status derived from sealed_at = null → active", () => {
		assert.match(out, /Status:\s*active/)
	})

	test("intent shows in-progress completion", () => {
		assert.match(out, /Completed:\s*in progress/)
	})

	test("per-stage status is derived (not pending) when units have started", () => {
		// design has two units; one complete, one in-flight → stage is "active"
		assert.match(out, /### design[\s\S]*?Status:\s*active/)
	})

	test("unit count reflects iterations[]-based completion", () => {
		// 1/2 completed
		assert.match(out, /Units:\s*1\/2 completed/)
	})

	test("unit detail surfaces last_hat from iterations[]", () => {
		// unit-02 in-flight on builder
		assert.match(out, /unit-02-inflight[\s\S]*last_hat=builder/)
	})

	test("unit detail derives status from iterations[]", () => {
		// unit-01 last result advance → completed
		assert.match(out, /unit-01-complete[\s\S]*status=completed/)
		// unit-02 in-flight → in_progress (no terminal result)
		assert.match(out, /unit-02-inflight[\s\S]*status=in_progress/)
	})

	test("does NOT crash on missing per-stage state.json (v4 normal)", () => {
		// If the report rendered, no crash. The fixture intentionally
		// has no state.json — that's the v4 default.
		assert.ok(out.length > 0)
	})
} finally {
	teardown()
}

console.log(`\n── Result: ${passed} passed, ${failed} failed ──────────────`)
process.exit(failed > 0 ? 1 : 0)

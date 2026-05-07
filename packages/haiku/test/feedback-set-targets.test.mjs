#!/usr/bin/env npx tsx
// haiku_feedback_set_targets — classifier-hat path that lets the agent
// fill in target_unit / target_invalidates on a user-authored FB after
// creation. Once set, immutable per the FB-as-unit architecture.

import assert from "node:assert"
import { execSync } from "node:child_process"
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

function setupRepo() {
	projDir = mkdtempSync(join(tmpdir(), "haiku-set-targets-"))
	originalCwd = process.cwd()
	process.chdir(projDir)
	git(projDir, "init", "-q")
	git(projDir, "config", "user.email", "test@haiku.test")
	git(projDir, "config", "user.name", "haiku test")
	git(projDir, "commit", "--allow-empty", "-q", "-m", "init")
	const intentSlug = "ingest-rebuild"
	git(projDir, "checkout", "-q", "-b", `haiku/${intentSlug}/main`)
	const intentDir = join(projDir, ".haiku", "intents", intentSlug)
	mkdirSync(intentDir, { recursive: true })
	mkdirSync(join(intentDir, "stages", "design", "feedback"), {
		recursive: true,
	})
	writeFileSync(
		join(intentDir, "intent.md"),
		matter.stringify("# Ingest rebuild\n", {
			title: "Ingest rebuild",
			studio: "software",
			mode: "discrete",
		}),
	)
	// FB authored without targets — typical user-chat case.
	writeFileSync(
		join(intentDir, "stages", "design", "feedback", "01-rate-limit.md"),
		matter.stringify("Need a per-tenant rate limit.\n", {
			title: "Per-tenant rate limit",
			origin: "user-chat",
			author: "user",
			author_type: "human",
			status: "pending",
			created_at: new Date().toISOString(),
			targets: { unit: null, invalidates: [] },
		}),
	)
	// Pre-classified FB — to test the immutability guard.
	writeFileSync(
		join(intentDir, "stages", "design", "feedback", "02-already-set.md"),
		matter.stringify("Existing classified finding.\n", {
			title: "Existing classified",
			origin: "adversarial-review",
			author: "completeness",
			author_type: "agent",
			status: "pending",
			created_at: new Date().toISOString(),
			targets: { unit: "unit-01-foo", invalidates: ["completeness"] },
		}),
	)
	return { intentSlug, intentDir }
}

function teardown() {
	if (originalCwd) process.chdir(originalCwd)
	if (projDir && existsSync(projDir)) rmSync(projDir, { recursive: true, force: true })
}

console.log("\n── haiku_feedback_set_targets ───────────────────────────")

const { intentSlug, intentDir } = setupRepo()
try {
	test("classifies an unclassified FB (target_unit + invalidates)", () => {
		const r = handleStateTool("haiku_feedback_set_targets", {
			intent: intentSlug,
			stage: "design",
			feedback_id: 1,
			target_unit: "unit-02-rate-limit",
			target_invalidates: ["user", "completeness"],
		})
		const p = JSON.parse(getTextResult(r))
		assert.strictEqual(p.ok, true)
		assert.strictEqual(p.target_unit, "unit-02-rate-limit")
		assert.deepStrictEqual(p.target_invalidates, ["user", "completeness"])

		const fm = matter(
			readFileSync(
				join(
					intentDir,
					"stages",
					"design",
					"feedback",
					"01-rate-limit.md",
				),
				"utf8",
			),
		).data
		assert.strictEqual(fm.targets.unit, "unit-02-rate-limit")
		assert.deepStrictEqual(fm.targets.invalidates, ["user", "completeness"])
		// reasoning is optional — when omitted, no targets.reasoning
		// field is written
		assert.strictEqual(fm.targets.reasoning, undefined)
	})

	test("classifies with reasoning paragraph stored on targets.reasoning", () => {
		// Re-stage a fresh FB-005 since FB-001/02/03/04 are already
		// classified or closed by earlier tests in this file.
		writeFileSync(
			join(intentDir, "stages", "design", "feedback", "05-with-reason.md"),
			matter.stringify("Body here.\n", {
				title: "Reasoning test",
				origin: "user-chat",
				author: "user",
				author_type: "human",
				status: "pending",
				created_at: new Date().toISOString(),
				targets: { unit: null, invalidates: [] },
			}),
		)
		const reasoning =
			"Cross-cutting finding affecting both schema + worker; routing to intent-scope so the fix touches design + build together."
		const r = handleStateTool("haiku_feedback_set_targets", {
			intent: intentSlug,
			stage: "design",
			feedback_id: 5,
			target_unit: null,
			target_invalidates: ["user"],
			reasoning,
		})
		const p = JSON.parse(getTextResult(r))
		assert.strictEqual(p.ok, true)
		assert.strictEqual(p.reasoning, reasoning)

		const fm = matter(
			readFileSync(
				join(
					intentDir,
					"stages",
					"design",
					"feedback",
					"05-with-reason.md",
				),
				"utf8",
			),
		).data
		assert.strictEqual(fm.targets.reasoning, reasoning)
	})

	test("classifies as intent-scope (target_unit: null)", () => {
		// Re-stage a fresh FB-003 first.
		writeFileSync(
			join(intentDir, "stages", "design", "feedback", "03-glossary.md"),
			matter.stringify("Need a unified glossary.\n", {
				title: "Glossary",
				origin: "user-chat",
				author: "user",
				author_type: "human",
				status: "pending",
				created_at: new Date().toISOString(),
				targets: { unit: null, invalidates: [] },
			}),
		)
		const r = handleStateTool("haiku_feedback_set_targets", {
			intent: intentSlug,
			stage: "design",
			feedback_id: 3,
			target_unit: null,
			target_invalidates: ["user"],
		})
		const p = JSON.parse(getTextResult(r))
		assert.strictEqual(p.ok, true)
		assert.strictEqual(p.target_unit, null)
	})

	test("refuses to overwrite already-classified targets", () => {
		const r = handleStateTool("haiku_feedback_set_targets", {
			intent: intentSlug,
			stage: "design",
			feedback_id: 2,
			target_unit: "unit-99-redirect",
			target_invalidates: ["user"],
		})
		const p = JSON.parse(getTextResult(r))
		assert.strictEqual(r.isError, true)
		assert.strictEqual(p.error, "targets_already_set")
		assert.strictEqual(p.current_target_unit, "unit-01-foo")
		assert.deepStrictEqual(p.current_target_invalidates, ["completeness"])
	})

	test("refuses on missing FB", () => {
		// Use a high but in-range number — the schema accepts 1..999 but
		// no FB-999 exists in this fixture, so the engine returns
		// feedback_not_found (not the input_invalid gate).
		const r = handleStateTool("haiku_feedback_set_targets", {
			intent: intentSlug,
			stage: "design",
			feedback_id: 999,
			target_unit: null,
			target_invalidates: [],
		})
		const p = JSON.parse(getTextResult(r))
		assert.strictEqual(r.isError, true)
		assert.strictEqual(p.error, "feedback_not_found")
	})

	test("refuses on closed FB (lifecycle guard)", () => {
		writeFileSync(
			join(intentDir, "stages", "design", "feedback", "04-closed.md"),
			matter.stringify("Already done.\n", {
				title: "Closed FB",
				origin: "user-chat",
				author: "user",
				author_type: "human",
				status: "closed",
				closed_at: new Date().toISOString(),
				created_at: new Date().toISOString(),
				targets: { unit: null, invalidates: [] },
			}),
		)
		const r = handleStateTool("haiku_feedback_set_targets", {
			intent: intentSlug,
			stage: "design",
			feedback_id: 4,
			target_unit: "unit-05-late",
			target_invalidates: ["user"],
		})
		const p = JSON.parse(getTextResult(r))
		assert.strictEqual(r.isError, true)
		assert.strictEqual(p.error, "lifecycle_violation")
	})

	test("schema-gate rejects malformed input (no feedback_id)", () => {
		const r = handleStateTool("haiku_feedback_set_targets", {
			intent: intentSlug,
			stage: "design",
			target_unit: null,
			target_invalidates: [],
		})
		const p = JSON.parse(getTextResult(r))
		assert.strictEqual(r.isError, true)
		assert.strictEqual(p.error, "haiku_feedback_set_targets_input_invalid")
	})
} finally {
	teardown()
}

console.log(`\n── Result: ${passed} passed, ${failed} failed ──────────────`)
process.exit(failed > 0 ? 1 : 0)

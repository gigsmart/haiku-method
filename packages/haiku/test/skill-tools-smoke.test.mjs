#!/usr/bin/env npx tsx
// Smoke coverage for skill-backing tools that had zero tests pre-2026-05-06:
//   haiku_intent_archive       — sets archived: true on intent.md
//   haiku_intent_unarchive     — clears the archived field
//   haiku_backlog              — read/write project backlog file
//   haiku_capacity             — historical metrics (v4 dual-path)
//   haiku_release_notes        — reads CHANGELOG.md
//   haiku_dashboard            — multi-intent overview (v4 dual-path)
//   haiku_review               — git-diff snapshot for pre-delivery review
//   haiku_seed                 — long-term idea tracker
//   haiku_version_info         — returns mcp + plugin version strings
//
// These were flagged in the v4 audit as "untested or remove." We
// keep all of them; this file proves they don't crash on the
// canonical happy path and the v4-relevant ones produce sane output.

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
import haiku_intent_archive from "../src/tools/orchestrator/haiku_intent_archive.ts"
import haiku_intent_unarchive from "../src/tools/orchestrator/haiku_intent_unarchive.ts"

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
	const block = result.content?.find((c) => c.type === "text")
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
	projDir = mkdtempSync(join(tmpdir(), "haiku-skill-smoke-"))
	originalCwd = process.cwd()
	process.chdir(projDir)
	git(projDir, "init", "-q")
	git(projDir, "config", "user.email", "test@haiku.test")
	git(projDir, "config", "user.name", "haiku test")
	git(projDir, "commit", "--allow-empty", "-q", "-m", "init")

	// Set up a v4 intent with two units (one complete, one in-flight).
	const slug = "smoke-intent"
	git(projDir, "checkout", "-q", "-b", `haiku/${slug}/main`)
	const intentDir = join(projDir, ".haiku", "intents", slug)
	mkdirSync(join(intentDir, "stages", "design", "units"), { recursive: true })
	writeFileSync(
		join(intentDir, "intent.md"),
		matter.stringify("# smoke\n", {
			title: "Smoke",
			studio: "software",
			mode: "discrete",
			plugin_version: "4.0.0",
			started_at: "2026-04-15T09:00:00Z",
			approvals: {},
			sealed_at: null,
		}),
	)
	writeFileSync(
		join(intentDir, "stages", "design", "units", "unit-01.md"),
		matter.stringify("# u1\n", {
			title: "u1",
			started_at: "2026-04-15T10:00:00Z",
			iterations: [
				{ hat: "verifier", started_at: "t", completed_at: "t", result: "advance" },
			],
			reviews: { user: { at: "t" } },
			approvals: { user: { at: "t" } },
		}),
	)
	writeFileSync(
		join(intentDir, "stages", "design", "units", "unit-02.md"),
		matter.stringify("# u2\n", {
			title: "u2",
			started_at: "2026-04-15T11:00:00Z",
			iterations: [{ hat: "builder", started_at: "t" }],
			reviews: {},
			approvals: {},
		}),
	)
	git(projDir, "add", "-A")
	git(projDir, "commit", "-q", "-m", "fixture")
	return { slug, intentDir }
}

function teardown() {
	if (originalCwd) process.chdir(originalCwd)
	if (projDir && existsSync(projDir))
		rmSync(projDir, { recursive: true, force: true })
}

console.log("\n── Skill-backing tool smoke ──────────────────────────────")

const { slug, intentDir } = setupRepo()
try {
	// ── haiku_version_info ────────────────────────────────────────────

	test("haiku_version_info returns mcp + plugin version", () => {
		const r = handleStateTool("haiku_version_info", {})
		const p = JSON.parse(getTextResult(r))
		assert.ok(typeof p.mcp_version === "string" && p.mcp_version.length > 0)
		assert.ok(
			typeof p.plugin_version === "string" && p.plugin_version.length > 0,
		)
	})

	// ── haiku_dashboard ──────────────────────────────────────────────

	test("haiku_dashboard renders v4 intent without crashing", () => {
		const r = handleStateTool("haiku_dashboard", {})
		const p = JSON.parse(getTextResult(r))
		assert.match(p.markdown, /## smoke-intent/)
	})

	test("haiku_dashboard surfaces v4 schema indicator", () => {
		const r = handleStateTool("haiku_dashboard", {})
		const p = JSON.parse(getTextResult(r))
		assert.match(p.markdown, /Schema:\s*v4/)
	})

	test("haiku_dashboard reports active status (sealed_at: null)", () => {
		const r = handleStateTool("haiku_dashboard", {})
		const p = JSON.parse(getTextResult(r))
		assert.match(p.markdown, /Status:\s*active/)
	})

	test("haiku_dashboard derives stage status from per-unit iterations[]", () => {
		const r = handleStateTool("haiku_dashboard", {})
		const p = JSON.parse(getTextResult(r))
		// design has 1 of 2 units complete → "active"
		assert.match(p.markdown, /\|\s*design\s*\|\s*active/)
	})

	// ── haiku_capacity ──────────────────────────────────────────────

	test("haiku_capacity counts v4 intents (sealed_at-derived status)", () => {
		const r = handleStateTool("haiku_capacity", {})
		const p = JSON.parse(getTextResult(r))
		// One active (sealed_at: null) intent in this fixture.
		assert.match(p.markdown, /Active:\s*1/)
		assert.match(p.markdown, /Total intents:\s*1/)
	})

	test("haiku_capacity computes iterations from v4 iterations[] when bolt is absent", () => {
		const r = handleStateTool("haiku_capacity", {})
		const p = JSON.parse(getTextResult(r))
		// Both fixture units have iterations[] (length 1 each); median = 1.
		assert.match(p.markdown, /design\s*\|\s*2\s*\|\s*1/)
	})

	// ── haiku_release_notes ──────────────────────────────────────────

	test("haiku_release_notes returns markdown (or graceful 'no changelog' message)", () => {
		const r = handleStateTool("haiku_release_notes", {})
		const text = getTextResult(r)
		assert.ok(text.length > 0)
	})

	// ── haiku_review ──────────────────────────────────────────────

	test("haiku_review returns review instructions (smoke)", () => {
		const r = handleStateTool("haiku_review", {})
		const text = getTextResult(r)
		// Tool returns prose review instructions. Sanity: non-empty.
		assert.ok(text.length > 100, "review output should be substantial")
	})

	// ── haiku_backlog (read empty) ───────────────────────────────────

	test("haiku_backlog read on empty backlog is graceful", () => {
		const r = handleStateTool("haiku_backlog", { action: "list" })
		const text = getTextResult(r)
		assert.ok(text.length > 0)
	})

	// ── haiku_seed (read empty) ──────────────────────────────────────

	test("haiku_seed list on empty seed file is graceful", () => {
		const r = handleStateTool("haiku_seed", { action: "list" })
		const text = getTextResult(r)
		assert.ok(text.length > 0)
	})

	// ── haiku_intent_archive / unarchive ─────────────────────────────

	test("haiku_intent_archive flips archived: true", async () => {
		const r = await haiku_intent_archive.handle({ intent: slug })
		const p = JSON.parse(getTextResult(r))
		assert.strictEqual(p.action, "intent_archived")
		const fm = matter(readFileSync(join(intentDir, "intent.md"), "utf8")).data
		assert.strictEqual(fm.archived, true)
	})

	test("haiku_intent_archive on already-archived intent is a noop", async () => {
		const r = await haiku_intent_archive.handle({ intent: slug })
		const p = JSON.parse(getTextResult(r))
		assert.strictEqual(p.action, "noop")
	})

	test("haiku_intent_unarchive clears archived", async () => {
		const r = await haiku_intent_unarchive.handle({ intent: slug })
		const p = JSON.parse(getTextResult(r))
		assert.strictEqual(p.action, "intent_unarchived")
		const fm = matter(readFileSync(join(intentDir, "intent.md"), "utf8")).data
		// `archived: false` OR field deleted entirely both satisfy the
		// invariant (the implementation deletes the field; either form
		// is acceptable in tests).
		assert.notStrictEqual(fm.archived, true)
	})
} finally {
	teardown()
}

console.log(`\n── Result: ${passed} passed, ${failed} failed ──────────────`)
process.exit(failed > 0 ? 1 : 0)

#!/usr/bin/env npx tsx
// discovery-edge-cases.test.mjs — Edge-case coverage for the cursor's
// discovery gate (`discovery_required`).
//
// Cursor logic (cursor.ts §"3. Discovery"): for every wave-ready unit
// the cursor walks the studio's `discovery/*.md` templates. Each
// template that is `required: true` must have a matching record at
// `unit.fm.discovery.<agent> = { at }`. The first miss the cursor finds
// emits `discovery_required { stage, agent, units: [unit] }`.
//
// Existing single-agent + single-unit coverage lives in
// `cursor-walk.test.mjs`. This file extends to:
//
//   1. Multiple required agents on one unit — cursor must walk all of
//      them, not skip any. Stamping records one-at-a-time produces a
//      progression of distinct discovery_required emits before the
//      cursor moves on.
//   2. Partial records — pre-stamping one agent's `at` makes the cursor
//      dispatch ONLY for the remaining agent, not re-dispatch the
//      already-stamped one.
//   3. Optional discovery (`required: false`) — cursor must NOT block
//      on it; tick advances past discovery to the next gate.
//   4. Multiple units — cursor only blocks on the unit that's missing,
//      and reports that unit specifically.

import assert from "node:assert"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import matter from "gray-matter"
import { initTestRepo, makeIntent, makeStudio } from "./_v4-fixtures.mjs"

const HAS_GIT = (() => {
	try {
		execFileSync("git", ["--version"], { stdio: "ignore" })
		return true
	} catch {
		return false
	}
})()

// ── Fixture helpers ──────────────────────────────────────────────────

async function withTmpRepo(slug, fn) {
	const dir = mkdtempSync(join(tmpdir(), "haiku-disc-edge-"))
	const stableCwd = tmpdir()
	const origCwd = process.cwd()
	try {
		const repo = initTestRepo({ repoRoot: dir, slug })
		return await fn(repo)
	} finally {
		try {
			process.chdir(origCwd)
		} catch {
			process.chdir(stableCwd)
		}
		rmSync(dir, { recursive: true, force: true })
	}
}

async function runTick(repoRoot, slug) {
	const origCwd = process.cwd()
	process.chdir(repoRoot)
	try {
		const { dispatchOrchestratorAction } = await import(
			"../src/orchestrator/workflow/run-tick.js"
		)
		const { clearStudioCache } = await import("../src/studio-reader.js")
		clearStudioCache()
		return dispatchOrchestratorAction(slug, "")
	} finally {
		process.chdir(origCwd)
	}
}

/**
 * Drop a discovery template under the project-local studio override
 * path. Studio search paths put `.haiku/studios/` first so this beats
 * any plugin built-in.
 */
function writeDiscoveryTemplate(repoRoot, studio, stage, agent, opts = {}) {
	const dir = join(
		repoRoot,
		".haiku",
		"studios",
		studio,
		"stages",
		stage,
		"discovery",
	)
	mkdirSync(dir, { recursive: true })
	const fm = {
		name: agent,
		// Each template needs a unique `location:` — the studio loader
		// throws on collision (cursor.ts loader uniqueness guard).
		location: opts.location ?? `stages/${stage}/${agent.toUpperCase()}.md`,
		...(opts.required === false ? { required: false } : {}),
	}
	writeFileSync(
		join(dir, `${agent}.md`),
		matter.stringify(`Run ${agent} discovery.\n`, fm),
	)
}

function writeUnit(intentDir, stage, name, fm, body = "") {
	const unitsDir = join(intentDir, "stages", stage, "units")
	mkdirSync(unitsDir, { recursive: true })
	const path = join(unitsDir, `${name}.md`)
	writeFileSync(path, matter.stringify(body || `# ${name}\n`, fm))
	return path
}

function readUnitFm(intentDir, stage, name) {
	const path = join(intentDir, "stages", stage, "units", `${name}.md`)
	const parsed = matter(readFileSync(path, "utf8"))
	return { path, data: parsed.data, body: parsed.content }
}

function stampDiscovery(intentDir, stage, name, agent, at = new Date().toISOString()) {
	const { path, data, body } = readUnitFm(intentDir, stage, name)
	const next = { ...data }
	const disc =
		next.discovery && typeof next.discovery === "object" ? { ...next.discovery } : {}
	disc[agent] = { at }
	next.discovery = disc
	writeFileSync(path, matter.stringify(body, next))
}

// ── Tests ────────────────────────────────────────────────────────────

test("discovery: 2+ required agents on one unit — cursor walks each, none skipped", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("disc-multi-agent", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" })
		makeIntent({ intentDir, slug, studio: "test" })
		writeDiscoveryTemplate(repoRoot, "test", "design", "research-agent")
		writeDiscoveryTemplate(repoRoot, "test", "design", "risk-agent")

		writeUnit(intentDir, "design", "unit-01", {
			title: "u1",
			depends_on: [],
			started_at: null,
			iterations: [],
			reviews: {},
			approvals: {},
			discovery: {},
		})

		// Tick 1 — cursor emits discovery_required for the FIRST missing
		// agent. We don't pin which agent comes first (readdir order on
		// the discovery dir is filesystem-dependent), but it MUST be one
		// of the two declared agents.
		const a1 = await runTick(repoRoot, slug)
		assert.strictEqual(
			a1.action,
			"discovery_required",
			`tick 1: expected discovery_required, got ${a1.action} — ${a1.message}`,
		)
		assert.ok(
			a1.agent === "research-agent" || a1.agent === "risk-agent",
			`tick 1: agent must be one of the two declared, got '${a1.agent}'`,
		)
		assert.deepStrictEqual(a1.units, ["unit-01"])

		// Stamp the first agent. Cursor must NOT skip — tick 2 emits
		// discovery_required for the OTHER agent.
		stampDiscovery(intentDir, "design", "unit-01", a1.agent)
		const a2 = await runTick(repoRoot, slug)
		assert.strictEqual(
			a2.action,
			"discovery_required",
			`tick 2: expected discovery_required for second agent, got ${a2.action} — ${a2.message}`,
		)
		assert.notStrictEqual(
			a2.agent,
			a1.agent,
			`tick 2: cursor must walk to the second agent, not re-emit '${a1.agent}'`,
		)
		assert.deepStrictEqual(a2.units, ["unit-01"])

		// Stamp the second agent. Both records present — cursor moves on
		// (start_unit_hat / elaborate / similar), NOT discovery_required.
		stampDiscovery(intentDir, "design", "unit-01", a2.agent)
		const a3 = await runTick(repoRoot, slug)
		assert.notStrictEqual(
			a3.action,
			"discovery_required",
			`tick 3: with both agents stamped, cursor must advance, got: ${a3.action}`,
		)
	})
})

test("discovery: partial record — only the missing agent triggers discovery_required", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("disc-partial", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" })
		makeIntent({ intentDir, slug, studio: "test" })
		writeDiscoveryTemplate(repoRoot, "test", "design", "research-agent")
		writeDiscoveryTemplate(repoRoot, "test", "design", "risk-agent")

		// Pre-stamp ONE agent on the unit.
		writeUnit(intentDir, "design", "unit-01", {
			title: "u1",
			depends_on: [],
			started_at: null,
			iterations: [],
			reviews: {},
			approvals: {},
			discovery: { "research-agent": { at: "2026-05-01T00:00:00Z" } },
		})

		const action = await runTick(repoRoot, slug)
		assert.strictEqual(
			action.action,
			"discovery_required",
			`expected discovery_required for the unstamped agent, got ${action.action} — ${action.message}`,
		)
		assert.strictEqual(
			action.agent,
			"risk-agent",
			`cursor must dispatch the OTHER agent (risk-agent), got '${action.agent}'`,
		)
	})
})

test("discovery: optional template (required: false) does not block the cursor", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("disc-optional", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" })
		makeIntent({ intentDir, slug, studio: "test" })
		// Single agent, optional. Cursor must skip it entirely.
		writeDiscoveryTemplate(repoRoot, "test", "design", "research-agent", {
			required: false,
		})

		writeUnit(intentDir, "design", "unit-01", {
			title: "u1",
			depends_on: [],
			started_at: null,
			iterations: [],
			reviews: {},
			approvals: {},
			discovery: {},
		})

		const action = await runTick(repoRoot, slug)
		assert.notStrictEqual(
			action.action,
			"discovery_required",
			`optional discovery must NOT block; got ${action.action} — ${action.message}`,
		)
		// Sanity: with no other gate in the way, cursor advances to
		// start_unit_hat (the wave-ready unit's first hat dispatches).
		assert.strictEqual(
			action.action,
			"start_unit_hat",
			`expected cursor to advance to start_unit_hat, got ${action.action}`,
		)
	})
})

test("discovery: optional + required mix — cursor blocks on required, ignores optional", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("disc-mixed-req", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" })
		makeIntent({ intentDir, slug, studio: "test" })
		writeDiscoveryTemplate(repoRoot, "test", "design", "research-agent", {
			required: false,
		})
		writeDiscoveryTemplate(repoRoot, "test", "design", "risk-agent")

		writeUnit(intentDir, "design", "unit-01", {
			title: "u1",
			depends_on: [],
			started_at: null,
			iterations: [],
			reviews: {},
			approvals: {},
			discovery: {},
		})

		const action = await runTick(repoRoot, slug)
		assert.strictEqual(
			action.action,
			"discovery_required",
			`expected discovery_required for the required agent, got ${action.action}`,
		)
		assert.strictEqual(
			action.agent,
			"risk-agent",
			`cursor must dispatch the REQUIRED agent only, got '${action.agent}'`,
		)
	})
})

test("discovery: multi-unit stage — cursor blocks on the unit missing the record", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("disc-multi-unit", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" })
		makeIntent({ intentDir, slug, studio: "test" })
		writeDiscoveryTemplate(repoRoot, "test", "design", "research-agent")

		// unit-01 has its discovery record stamped.
		writeUnit(intentDir, "design", "unit-01", {
			title: "u1",
			depends_on: [],
			started_at: null,
			iterations: [],
			reviews: {},
			approvals: {},
			discovery: { "research-agent": { at: "2026-05-01T00:00:00Z" } },
		})
		// unit-02 is missing its record — cursor must surface it.
		writeUnit(intentDir, "design", "unit-02", {
			title: "u2",
			depends_on: [],
			started_at: null,
			iterations: [],
			reviews: {},
			approvals: {},
			discovery: {},
		})

		const action = await runTick(repoRoot, slug)
		assert.strictEqual(
			action.action,
			"discovery_required",
			`expected discovery_required, got ${action.action} — ${action.message}`,
		)
		assert.strictEqual(action.agent, "research-agent")
		// Only the unstamped unit is named in `units`. The cursor walks
		// units in alphabetical order and emits the FIRST miss it sees,
		// so unit-02 must be the one reported (unit-01 is stamped).
		assert.deepStrictEqual(
			action.units,
			["unit-02"],
			`cursor must report only the missing unit, got ${JSON.stringify(action.units)}`,
		)
	})
})

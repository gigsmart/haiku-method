#!/usr/bin/env npx tsx
// discovery-edge-cases.test.mjs — Edge-case coverage for the cursor's
// discovery gate (`discovery_required`).
//
// Cursor logic (cursor.ts §"3. Discovery"): for the active stage the
// cursor walks the studio's `discovery/*.md` templates. Each template
// that is `required: true` declares a `location:` (with `{intent-slug}`
// substitution). The first location whose file is NOT on disk emits
// `discovery_required { stage, agent, units: [<first-unit>] }`. The
// `units[0]` field is representative — discovery artifacts are
// intent-scoped (one file serves every unit), so the unit is just for
// prompt context.
//
// Existing single-agent + single-unit coverage lives in
// `cursor-walk.test.mjs`. This file extends to:
//
//   1. Multiple required agents on one stage — cursor must walk all
//      of them, not skip any. Writing each artifact one-at-a-time
//      produces a progression of distinct discovery_required emits
//      before the cursor moves on.
//   2. Partial state — pre-writing one agent's artifact makes the
//      cursor dispatch ONLY for the remaining agent.
//   3. Optional discovery (`required: false`) — cursor must NOT block
//      on it; tick advances past discovery to the next gate.
//   4. Multi-unit stages — the artifact is intent-scoped, so a single
//      file write satisfies the gate for every wave-ready unit.

import assert from "node:assert"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"
import matter from "gray-matter"
import {
	initTestRepo,
	makeIntent,
	makeStudio,
	onStageBranch,
	runTickWithBranchAlignment,
} from "./_v4-fixtures.mjs"

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
	return runTickWithBranchAlignment(repoRoot, slug)
}

/**
 * Drop a discovery template under the project-local studio override
 * path. Studio search paths put `.haiku/studios/` first so this beats
 * any plugin built-in. The `location:` is intent-scoped (the cursor
 * substitutes `{intent-slug}` at check time).
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
	// Intent-scoped, unique per agent. The cursor reads this exact
	// path at check time; writing the file at this location is the
	// signal that discovery ran.
	const location =
		opts.location ??
		`.haiku/intents/{intent-slug}/knowledge/${agent.toUpperCase()}.md`
	const fm = {
		name: agent,
		location,
		...(opts.required === false ? { required: false } : {}),
	}
	writeFileSync(
		join(dir, `${agent}.md`),
		matter.stringify(`Run ${agent} discovery.\n`, fm),
	)
	return location
}

function writeUnit(intentDir, stage, name, fm, body = "") {
	const slug = intentDir.split("/").pop() ?? ""
	const repoRoot = intentDir.split("/").slice(0, -3).join("/")
	const path = join(intentDir, "stages", stage, "units", `${name}.md`)
	onStageBranch(repoRoot, slug, stage, () => {
		mkdirSync(join(intentDir, "stages", stage, "units"), { recursive: true })
		writeFileSync(path, matter.stringify(body || `# ${name}\n`, fm))
	})
	return path
}

/**
 * Write the discovery artifact for an agent — this is the
 * "discovery ran" signal under the file-as-witness model.
 */
function writeDiscoveryArtifact(repoRoot, slug, locationTemplate) {
	const resolved = locationTemplate.replace(/\{intent-slug\}/g, slug)
	const absPath = join(repoRoot, resolved)
	mkdirSync(dirname(absPath), { recursive: true })
	writeFileSync(absPath, "discovery output\n")
	return absPath
}

// ── Tests ────────────────────────────────────────────────────────────

test("discovery: 2+ required agents on one stage — cursor walks each, none skipped", async () => {
	if (!HAS_GIT) return
	await withTmpRepo(
		"disc-multi-agent",
		async ({ repoRoot, intentDir, slug }) => {
			makeStudio({ repoRoot, studio: "test" })
			makeIntent({ intentDir, slug, studio: "test" })
			const locA = writeDiscoveryTemplate(
				repoRoot,
				"test",
				"design",
				"research-agent",
			)
			const locB = writeDiscoveryTemplate(
				repoRoot,
				"test",
				"design",
				"risk-agent",
			)
			const locByAgent = { "research-agent": locA, "risk-agent": locB }

			writeUnit(intentDir, "design", "unit-01", {
				title: "u1",
				depends_on: [],
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

			// Write the first artifact. Cursor must NOT skip — tick 2 emits
			// discovery_required for the OTHER agent.
			writeDiscoveryArtifact(repoRoot, slug, locByAgent[a1.agent])
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

			// Write the second artifact. Both files present — cursor moves on
			// (start_unit_hat / elaborate / similar), NOT discovery_required.
			writeDiscoveryArtifact(repoRoot, slug, locByAgent[a2.agent])
			const a3 = await runTick(repoRoot, slug)
			assert.notStrictEqual(
				a3.action,
				"discovery_required",
				`tick 3: with both artifacts on disk, cursor must advance, got: ${a3.action}`,
			)
		},
	)
})

test("discovery: partial state — only the missing agent triggers discovery_required", async () => {
	if (!HAS_GIT) return
	await withTmpRepo("disc-partial", async ({ repoRoot, intentDir, slug }) => {
		makeStudio({ repoRoot, studio: "test" })
		makeIntent({ intentDir, slug, studio: "test" })
		const locA = writeDiscoveryTemplate(
			repoRoot,
			"test",
			"design",
			"research-agent",
		)
		writeDiscoveryTemplate(repoRoot, "test", "design", "risk-agent")

		// Pre-write the research-agent artifact.
		writeDiscoveryArtifact(repoRoot, slug, locA)

		writeUnit(intentDir, "design", "unit-01", {
			title: "u1",
			depends_on: [],
		})

		const action = await runTick(repoRoot, slug)
		assert.strictEqual(
			action.action,
			"discovery_required",
			`expected discovery_required for the unwritten agent, got ${action.action} — ${action.message}`,
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

test("discovery: multi-unit stage — one artifact write satisfies the gate for every unit", async () => {
	if (!HAS_GIT) return
	await withTmpRepo(
		"disc-multi-unit",
		async ({ repoRoot, intentDir, slug }) => {
			makeStudio({ repoRoot, studio: "test" })
			makeIntent({ intentDir, slug, studio: "test" })
			const loc = writeDiscoveryTemplate(
				repoRoot,
				"test",
				"design",
				"research-agent",
			)

			// Two wave-ready units. Discovery is intent-scoped — one file
			// serves both.
			writeUnit(intentDir, "design", "unit-01", { title: "u1", depends_on: [] })
			writeUnit(intentDir, "design", "unit-02", { title: "u2", depends_on: [] })

			// Tick 1 — artifact missing, cursor blocks. The action carries a
			// representative unit (alphabetically first) — units[0] is for
			// prompt context, not per-unit isolation.
			const a1 = await runTick(repoRoot, slug)
			assert.strictEqual(
				a1.action,
				"discovery_required",
				`tick 1: expected discovery_required, got ${a1.action} — ${a1.message}`,
			)
			assert.strictEqual(a1.agent, "research-agent")
			assert.deepStrictEqual(
				a1.units,
				["unit-01"],
				`representative unit should be alphabetically first, got ${JSON.stringify(a1.units)}`,
			)

			// Write the artifact. Single file write satisfies both units;
			// cursor advances past discovery to the next gate.
			writeDiscoveryArtifact(repoRoot, slug, loc)
			const a2 = await runTick(repoRoot, slug)
			assert.notStrictEqual(
				a2.action,
				"discovery_required",
				`tick 2: with the artifact on disk, cursor must advance for every wave-ready unit, got ${a2.action}`,
			)
		},
	)
})

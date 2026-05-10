#!/usr/bin/env npx tsx
// derived-stage-state.test.mjs — Verify the v4 derived-stage-state
// function returns the right { status, phase, gate_outcome, ... }
// shape for every state.json field the engine USED to read.
//
// Each test builds a v4 intent on disk via the _v4-fixtures helpers
// then asserts the derivation matches what state.json would have said
// when the file existed (the migration target). Running these against
// real fixtures is the contract: if the derivation drifts from what
// callers expected from state.json, the test fails.

import assert from "node:assert"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import matter from "gray-matter"
import { ensureOnStageBranch } from "../src/git-worktree.ts"
import { deriveStageState } from "../src/orchestrator/workflow/derived-stage-state.ts"
import {
	initTestRepo,
	makeIntent,
	makeMergedUnit,
	makeStudio,
	onStageBranch,
	seedVerifiedElaboration,
} from "./_v4-fixtures.mjs"

/**
 * Production calls `deriveStageState` after `ensureOnStageBranch` has
 * aligned the working tree with the stage branch — that's where unit
 * files actually live in v4. Tests have to do the same dance or
 * `listUnits` reads an empty `units/` dir on intent main and every
 * derivation collapses to "pending".
 */
function deriveOnStageBranch({ slug, studio, stage, intentDir, intentMode }) {
	ensureOnStageBranch(slug, stage)
	return deriveStageState({ slug, studio, stage, intentDir, intentMode })
}

const HAS_GIT = (() => {
	try {
		execFileSync("git", ["--version"], { stdio: "ignore" })
		return true
	} catch {
		return false
	}
})()

function withTmpRepo(slug, fn) {
	const dir = mkdtempSync(join(tmpdir(), "haiku-derived-state-"))
	const stableCwd = tmpdir()
	const origCwd = process.cwd()
	try {
		const repo = initTestRepo({ repoRoot: dir, slug })
		return fn(repo)
	} finally {
		try {
			process.chdir(origCwd)
		} catch {
			process.chdir(stableCwd)
		}
		rmSync(dir, { recursive: true, force: true })
	}
}

// ── status ──────────────────────────────────────────────────────────

test("status: empty stage → pending", { skip: !HAS_GIT }, () => {
	withTmpRepo("derived-empty", ({ repoRoot, intentDir, slug }) => {
		process.chdir(repoRoot)
		makeStudio({
			repoRoot,
			studio: "test-studio",
			stages: [{ name: "design", hats: ["planner", "verifier"] }],
		})
		makeIntent({ intentDir, slug, studio: "test-studio" })
		seedVerifiedElaboration({ intentDir, stage: "design" })

		const state = deriveOnStageBranch({
			slug,
			studio: "test-studio",
			stage: "design",
			intentDir,
			intentMode: "continuous",
		})
		assert.strictEqual(state.status, "pending")
		assert.strictEqual(state.phase, "elaborate")
		assert.strictEqual(state.gate_outcome, null)
		assert.strictEqual(state.visits, 0)
	})
})

test(
	"status: units exist on stage branch but not merged → active",
	{ skip: !HAS_GIT },
	() => {
		withTmpRepo("derived-active", ({ repoRoot, intentDir, slug }) => {
			process.chdir(repoRoot)
			makeStudio({
				repoRoot,
				studio: "test-studio",
				stages: [{ name: "design", hats: ["planner", "verifier"] }],
			})
			makeIntent({ intentDir, slug, studio: "test-studio" })
			seedVerifiedElaboration({ intentDir, stage: "design" })
			makeMergedUnit({
				intentDir,
				stage: "design",
				unit: "u1",
				hats: ["planner", "verifier"],
				// Continuous mode requires spec + quality_gates + user (no
				// review agents in test studio). Signing all three exercises
				// the "fully approved" branch where status stays active
				// (stage branch hasn't merged into intent main) but the gate
				// has resolved.
				roles: ["spec", "quality_gates", "user"],
			})

			const state = deriveOnStageBranch({
				slug,
				studio: "test-studio",
				stage: "design",
				intentDir,
				intentMode: "continuous",
			})
			assert.strictEqual(state.status, "active")
			// Unit fully signed but stage branch not merged → no in-flight phase.
			assert.strictEqual(state.phase, null)
			assert.strictEqual(state.gate_outcome, "advanced")
		})
	},
)

// ── phase ───────────────────────────────────────────────────────────

test(
	"phase: missing elaboration.md, no units → elaborate",
	{ skip: !HAS_GIT },
	() => {
		withTmpRepo("derived-phase-elab", ({ repoRoot, intentDir, slug }) => {
			process.chdir(repoRoot)
			makeStudio({
				repoRoot,
				studio: "test-studio",
				stages: [{ name: "design", hats: ["planner", "verifier"] }],
			})
			makeIntent({ intentDir, slug, studio: "test-studio" })
			// no seedVerifiedElaboration — elaboration.md missing
			const state = deriveOnStageBranch({
				slug,
				studio: "test-studio",
				stage: "design",
				intentDir,
				intentMode: "continuous",
			})
			assert.strictEqual(state.phase, "elaborate")
		})
	},
)

test(
	"phase: elaboration.md present but unverified → elaborate",
	{ skip: !HAS_GIT },
	() => {
		withTmpRepo("derived-phase-elab2", ({ repoRoot, intentDir, slug }) => {
			process.chdir(repoRoot)
			makeStudio({
				repoRoot,
				studio: "test-studio",
				stages: [{ name: "design", hats: ["planner", "verifier"] }],
			})
			makeIntent({ intentDir, slug, studio: "test-studio" })
			// elaboration.md without verified_at
			onStageBranch(repoRoot, slug, "design", () => {
				mkdirSync(join(intentDir, "stages", "design"), { recursive: true })
				writeFileSync(
					join(intentDir, "stages", "design", "elaboration.md"),
					matter.stringify("# elab\n", { title: "elab" }),
				)
			})
			const state = deriveOnStageBranch({
				slug,
				studio: "test-studio",
				stage: "design",
				intentDir,
				intentMode: "continuous",
			})
			assert.strictEqual(state.phase, "elaborate")
		})
	},
)

test(
	"phase: units exist but mid-hat → execute",
	{ skip: !HAS_GIT },
	() => {
		withTmpRepo("derived-phase-exec", ({ repoRoot, intentDir, slug }) => {
			process.chdir(repoRoot)
			makeStudio({
				repoRoot,
				studio: "test-studio",
				stages: [{ name: "design", hats: ["planner", "verifier"] }],
			})
			makeIntent({ intentDir, slug, studio: "test-studio" })
			seedVerifiedElaboration({ intentDir, stage: "design" })
			// Unit present, but only first hat advanced (verifier still pending).
			onStageBranch(repoRoot, slug, "design", () => {
				mkdirSync(join(intentDir, "stages", "design", "units"), {
					recursive: true,
				})
				const at = new Date().toISOString()
				writeFileSync(
					join(intentDir, "stages", "design", "units", "u1.md"),
					matter.stringify("# u1\n", {
						title: "u1",
						started_at: at,
						iterations: [
							{
								hat: "planner",
								started_at: at,
								completed_at: at,
								result: "advance",
							},
						],
					}),
				)
			})
			const state = deriveOnStageBranch({
				slug,
				studio: "test-studio",
				stage: "design",
				intentDir,
				intentMode: "continuous",
			})
			assert.strictEqual(state.phase, "execute")
			assert.strictEqual(state.gate_outcome, null)
		})
	},
)

test(
	"phase: hats done but reviews missing → review",
	{ skip: !HAS_GIT },
	() => {
		withTmpRepo("derived-phase-review", ({ repoRoot, intentDir, slug }) => {
			process.chdir(repoRoot)
			makeStudio({
				repoRoot,
				studio: "test-studio",
				stages: [{ name: "design", hats: ["planner", "verifier"] }],
			})
			makeIntent({ intentDir, slug, studio: "test-studio" })
			seedVerifiedElaboration({ intentDir, stage: "design" })
			// Unit's terminal hat advanced but reviews map empty.
			onStageBranch(repoRoot, slug, "design", () => {
				mkdirSync(join(intentDir, "stages", "design", "units"), {
					recursive: true,
				})
				const at = new Date().toISOString()
				writeFileSync(
					join(intentDir, "stages", "design", "units", "u1.md"),
					matter.stringify("# u1\n", {
						title: "u1",
						started_at: at,
						iterations: [
							{
								hat: "planner",
								started_at: at,
								completed_at: at,
								result: "advance",
							},
							{
								hat: "verifier",
								started_at: at,
								completed_at: at,
								result: "advance",
							},
						],
						// reviews/approvals omitted
					}),
				)
			})
			const state = deriveOnStageBranch({
				slug,
				studio: "test-studio",
				stage: "design",
				intentDir,
				intentMode: "continuous",
			})
			assert.strictEqual(state.phase, "review")
		})
	},
)

test(
	"phase: reviews signed but approvals missing → gate",
	{ skip: !HAS_GIT },
	() => {
		withTmpRepo("derived-phase-gate", ({ repoRoot, intentDir, slug }) => {
			process.chdir(repoRoot)
			makeStudio({
				repoRoot,
				studio: "test-studio",
				stages: [{ name: "design", hats: ["planner", "verifier"] }],
			})
			makeIntent({ intentDir, slug, studio: "test-studio" })
			seedVerifiedElaboration({ intentDir, stage: "design" })
			onStageBranch(repoRoot, slug, "design", () => {
				mkdirSync(join(intentDir, "stages", "design", "units"), {
					recursive: true,
				})
				const at = new Date().toISOString()
				const reviews = { spec: { at }, user: { at } }
				const approvals = {
					spec: { at },
					quality_gates: { at },
					// user approval missing → still in gate
				}
				writeFileSync(
					join(intentDir, "stages", "design", "units", "u1.md"),
					matter.stringify("# u1\n", {
						title: "u1",
						started_at: at,
						iterations: [
							{
								hat: "planner",
								started_at: at,
								completed_at: at,
								result: "advance",
							},
							{
								hat: "verifier",
								started_at: at,
								completed_at: at,
								result: "advance",
							},
						],
						reviews,
						approvals,
					}),
				)
			})
			const state = deriveOnStageBranch({
				slug,
				studio: "test-studio",
				stage: "design",
				intentDir,
				intentMode: "continuous",
			})
			assert.strictEqual(state.phase, "gate")
			assert.strictEqual(state.gate_outcome, null)
		})
	},
)

// ── gate_outcome (the per-unit aggregate model) ─────────────────────

test(
	"gate_outcome: every unit fully approved → advanced",
	{ skip: !HAS_GIT },
	() => {
		withTmpRepo("derived-gate-adv", ({ repoRoot, intentDir, slug }) => {
			process.chdir(repoRoot)
			makeStudio({
				repoRoot,
				studio: "test-studio",
				stages: [{ name: "design", hats: ["planner", "verifier"] }],
			})
			makeIntent({ intentDir, slug, studio: "test-studio" })
			seedVerifiedElaboration({ intentDir, stage: "design" })
			makeMergedUnit({
				intentDir,
				stage: "design",
				unit: "u1",
				hats: ["planner", "verifier"],
				roles: ["spec", "quality_gates", "user"],
			})
			makeMergedUnit({
				intentDir,
				stage: "design",
				unit: "u2",
				hats: ["planner", "verifier"],
				roles: ["spec", "quality_gates", "user"],
			})
			const state = deriveOnStageBranch({
				slug,
				studio: "test-studio",
				stage: "design",
				intentDir,
				intentMode: "continuous",
			})
			assert.strictEqual(state.gate_outcome, "advanced")
			assert.strictEqual(state.phase, null)
		})
	},
)

test(
	"gate_outcome: NEW unit lands post-approval → re-opens gate",
	{ skip: !HAS_GIT },
	() => {
		// This is the load-bearing semantic per the design. Adding a unit
		// after the stage is past gate must invalidate the per-stage
		// gate signal, because the new unit lacks approvals.
		withTmpRepo("derived-gate-reopen", ({ repoRoot, intentDir, slug }) => {
			process.chdir(repoRoot)
			makeStudio({
				repoRoot,
				studio: "test-studio",
				stages: [{ name: "design", hats: ["planner", "verifier"] }],
			})
			makeIntent({ intentDir, slug, studio: "test-studio" })
			seedVerifiedElaboration({ intentDir, stage: "design" })
			// Two units fully approved.
			makeMergedUnit({
				intentDir,
				stage: "design",
				unit: "u1",
				hats: ["planner", "verifier"],
				roles: ["spec", "quality_gates", "user"],
			})
			makeMergedUnit({
				intentDir,
				stage: "design",
				unit: "u2",
				hats: ["planner", "verifier"],
				roles: ["spec", "quality_gates", "user"],
			})
			// First derive: gate is "advanced".
			const before = deriveOnStageBranch({
				slug,
				studio: "test-studio",
				stage: "design",
				intentDir,
				intentMode: "continuous",
			})
			assert.strictEqual(before.gate_outcome, "advanced")

			// Add a third unit with no approvals (e.g. fix-loop spawned it).
			onStageBranch(repoRoot, slug, "design", () => {
				const at = new Date().toISOString()
				writeFileSync(
					join(intentDir, "stages", "design", "units", "u3-late.md"),
					matter.stringify("# u3-late\n", {
						title: "u3-late",
						started_at: at,
						// No iterations, no approvals → fresh unit.
					}),
				)
			})

			const after = deriveOnStageBranch({
				slug,
				studio: "test-studio",
				stage: "design",
				intentDir,
				intentMode: "continuous",
			})
			assert.strictEqual(
				after.gate_outcome,
				null,
				"new unit with no approvals must re-open the gate",
			)
			// Phase should now report "execute" (new unit needs hats run).
			assert.strictEqual(after.phase, "execute")
		})
	},
)

// ── autopilot mode ──────────────────────────────────────────────────

test(
	"autopilot: trims roles to spec + quality_gates",
	{ skip: !HAS_GIT },
	() => {
		withTmpRepo("derived-autopilot", ({ repoRoot, intentDir, slug }) => {
			process.chdir(repoRoot)
			makeStudio({
				repoRoot,
				studio: "test-studio",
				stages: [{ name: "design", hats: ["planner", "verifier"] }],
			})
			makeIntent({
				intentDir,
				slug,
				studio: "test-studio",
				mode: "autopilot",
			})
			// Autopilot bypasses elaboration.md gate — no seed needed.
			makeMergedUnit({
				intentDir,
				stage: "design",
				unit: "u1",
				hats: ["planner", "verifier"],
				// Only the autopilot-relevant roles signed.
				roles: ["spec", "quality_gates"],
			})
			const state = deriveOnStageBranch({
				slug,
				studio: "test-studio",
				stage: "design",
				intentDir,
				intentMode: "autopilot",
			})
			assert.strictEqual(state.gate_outcome, "advanced")
			assert.strictEqual(state.phase, null)
		})
	},
)

// ── visits + started_at ─────────────────────────────────────────────

test("visits: max iteration count across units", { skip: !HAS_GIT }, () => {
	withTmpRepo("derived-visits", ({ repoRoot, intentDir, slug }) => {
		process.chdir(repoRoot)
		makeStudio({
			repoRoot,
			studio: "test-studio",
			stages: [{ name: "design", hats: ["planner", "verifier"] }],
		})
		makeIntent({ intentDir, slug, studio: "test-studio" })
		seedVerifiedElaboration({ intentDir, stage: "design" })
		// u1: 2 iterations (full hat sequence). u2: 4 iterations
		// (one reject + redo).
		onStageBranch(repoRoot, slug, "design", () => {
			mkdirSync(join(intentDir, "stages", "design", "units"), {
				recursive: true,
			})
			const at = new Date().toISOString()
			writeFileSync(
				join(intentDir, "stages", "design", "units", "u1.md"),
				matter.stringify("# u1\n", {
					title: "u1",
					started_at: at,
					iterations: [
						{ hat: "planner", started_at: at, completed_at: at, result: "advance" },
						{ hat: "verifier", started_at: at, completed_at: at, result: "advance" },
					],
				}),
			)
			writeFileSync(
				join(intentDir, "stages", "design", "units", "u2.md"),
				matter.stringify("# u2\n", {
					title: "u2",
					started_at: at,
					iterations: [
						{ hat: "planner", started_at: at, completed_at: at, result: "advance" },
						{ hat: "verifier", started_at: at, completed_at: at, result: "reject" },
						{ hat: "planner", started_at: at, completed_at: at, result: "advance" },
						{ hat: "verifier", started_at: at, completed_at: at, result: "advance" },
					],
				}),
			)
		})
		const state = deriveOnStageBranch({
			slug,
			studio: "test-studio",
			stage: "design",
			intentDir,
			intentMode: "continuous",
		})
		assert.strictEqual(state.visits, 4)
	})
})

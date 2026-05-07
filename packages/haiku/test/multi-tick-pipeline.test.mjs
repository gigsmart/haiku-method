#!/usr/bin/env npx tsx
// multi-tick-pipeline.test.mjs — Multi-tick pipeline scenario.
//
// Existing cursor tests are single-tick: each builds a static disk
// fixture and asserts the next action. This one drives the cursor
// through MANY ticks against a 3-stage studio (a, b, c) and asserts
// the pipeline reaches `sealed`.
//
// On every tick we read the action and simulate the agent/engine
// response by writing the appropriate frontmatter to disk:
//   - elaborate            → write a wave-ready unit
//   - start_unit_hat       → append iteration with result=advance
//   - dispatch_review      → stamp reviews.<role>.at
//   - user_gate            → stamp reviews.user.at OR approvals.user.at
//   - dispatch_approval    → stamp approvals.<role>.at
//   - dispatch_quality_gates → stamp approvals.quality_gates.at
//   - merge_stage          → commit + fast-forward stage branch into intent main
//   - intent_review        → stamp intent.approvals.<role>.at
//   - merge_intent         → stamp sealed_at on intent.md
//   - sealed               → break
//
// Cap: 100 ticks. If the loop exits without sealing, fail and dump
// the action sequence so the regression is debuggable.

import assert from "node:assert"
import { execFileSync } from "node:child_process"
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs"
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

function git(cwd, ...args) {
	return execFileSync("git", args, {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim()
}

async function withTmpRepo(slug, fn) {
	const dir = mkdtempSync(join(tmpdir(), "haiku-multi-tick-"))
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

function unitsDirOf(intentDir, stage) {
	return join(intentDir, "stages", stage, "units")
}

function readUnitFm(intentDir, stage, unitName) {
	const path = join(unitsDirOf(intentDir, stage), `${unitName}.md`)
	const raw = readFileSync(path, "utf8")
	return { path, parsed: matter(raw) }
}

function writeUnitFm(path, fm, body) {
	writeFileSync(path, matter.stringify(body || `# unit\n`, fm))
}

function readIntentFm(intentDir) {
	const path = join(intentDir, "intent.md")
	const raw = readFileSync(path, "utf8")
	return { path, parsed: matter(raw) }
}

function writeIntentFm(path, fm, body) {
	writeFileSync(path, matter.stringify(body || "# intent\n", fm))
}

/**
 * Create a wave-ready unit (started_at: null, no iterations).
 */
function createWaveReadyUnit(intentDir, stage, name) {
	const dir = unitsDirOf(intentDir, stage)
	mkdirSync(dir, { recursive: true })
	const path = join(dir, `${name}.md`)
	const fm = {
		title: name,
		depends_on: [],
		started_at: null,
		iterations: [],
		reviews: {},
		approvals: {},
		discovery: {},
	}
	writeFileSync(path, matter.stringify(`# ${name}\n`, fm))
	return path
}

/**
 * Stamp a hat-advance iteration on every unit named in `units`.
 */
function stampHatAdvance(intentDir, stage, units, hat) {
	const at = new Date().toISOString()
	for (const u of units) {
		const { path, parsed } = readUnitFm(intentDir, stage, u)
		const fm = { ...parsed.data }
		// First hat lands started_at if it's missing.
		if (fm.started_at == null) fm.started_at = at
		const its = Array.isArray(fm.iterations) ? [...fm.iterations] : []
		its.push({
			hat,
			started_at: at,
			completed_at: at,
			result: "advance",
		})
		fm.iterations = its
		writeUnitFm(path, fm, parsed.content)
	}
}

/**
 * Stamp `reviews.<role>.at` on every unit listed.
 */
function stampReviewRole(intentDir, stage, units, role) {
	const at = new Date().toISOString()
	for (const u of units) {
		const { path, parsed } = readUnitFm(intentDir, stage, u)
		const fm = { ...parsed.data }
		fm.reviews = { ...(fm.reviews || {}), [role]: { at } }
		writeUnitFm(path, fm, parsed.content)
	}
}

/**
 * Stamp `approvals.<role>.at` on every unit listed.
 */
function stampApprovalRole(intentDir, stage, units, role) {
	const at = new Date().toISOString()
	for (const u of units) {
		const { path, parsed } = readUnitFm(intentDir, stage, u)
		const fm = { ...parsed.data }
		fm.approvals = { ...(fm.approvals || {}), [role]: { at } }
		writeUnitFm(path, fm, parsed.content)
	}
}

/**
 * Materialise a merged stage branch.
 *
 * Cursor's `firstUnmergedStage` checks `isBranchMerged(haiku/<slug>/<stage>,
 * haiku/<slug>/main)` via `git merge-base --is-ancestor`. Easiest way to
 * make that true: commit current state on the stage branch, then
 * fast-forward main to it. `git checkout <stage>` (creating fresh from
 * main if needed), commit, then `git checkout main && git merge --ff-only <stage>`.
 */
function mergeStageBranch(repoRoot, slug, stage) {
	const stageBranch = `haiku/${slug}/${stage}`
	const mainBranch = `haiku/${slug}/main`

	// Make sure we're on main first, with the latest state staged + committed.
	// If there are uncommitted FM changes, get them on main so the stage
	// branch we create from main inherits them.
	git(repoRoot, "checkout", mainBranch)
	try {
		git(repoRoot, "add", "-A")
		git(repoRoot, "commit", "-m", `pre-stage ${stage} on main`)
	} catch {
		// nothing to commit
	}

	// Create the stage branch from main (or check it out if it exists)
	try {
		git(repoRoot, "checkout", "-b", stageBranch)
	} catch {
		git(repoRoot, "checkout", stageBranch)
		try {
			git(repoRoot, "merge", "--ff-only", mainBranch)
		} catch {
			/* already up to date */
		}
	}

	// Stage branch must contain at least one commit so its tip is a
	// real ref. Make an empty commit if nothing else.
	try {
		git(repoRoot, "commit", "--allow-empty", "-m", `stage ${stage} merge marker`)
	} catch {
		/* ignore */
	}

	// Merge stage branch into main with --no-ff so a merge commit is
	// created. The cursor's isStageBranchMerged check requires main to
	// be STRICTLY ahead of the stage branch (a fast-forward where main
	// points at the stage tip is treated as "uninitialized").
	git(repoRoot, "checkout", mainBranch)
	git(repoRoot, "merge", "--no-ff", "--no-edit", "-m", `merge ${stage}`, stageBranch)
}

test("multi-tick: 3-stage continuous intent walks from elaborate to sealed", async (t) => {
	if (!HAS_GIT) return

	await withTmpRepo("multi-tick-pipeline", async ({ repoRoot, intentDir, slug }) => {
		// 3 stages, each with planner→builder→verifier hats and one
		// configured review agent (code-reviewer). No design-direction,
		// no clarify, no discovery — those are tested separately.
		makeStudio({
			repoRoot,
			studio: "multi3",
			stages: [
				{
					name: "a",
					hats: ["planner", "builder", "verifier"],
					fix_hats: ["builder", "feedback-assessor"],
					review: "ask",
					review_agents: ["code-reviewer"],
				},
				{
					name: "b",
					hats: ["planner", "builder", "verifier"],
					fix_hats: ["builder", "feedback-assessor"],
					review: "ask",
					review_agents: ["code-reviewer"],
				},
				{
					name: "c",
					hats: ["planner", "builder", "verifier"],
					fix_hats: ["builder", "feedback-assessor"],
					review: "ask",
					review_agents: ["code-reviewer"],
				},
			],
		})
		makeIntent({
			intentDir,
			slug,
			studio: "multi3",
			mode: "continuous",
			extraFm: { stages: ["a", "b", "c"] },
		})

		// Plant exactly one unit per stage so each elaborate dispatch has
		// a concrete unit to seed. We don't seed them up front — the
		// cursor returns `elaborate` per stage and the test reacts.

		const seenActions = []
		let noopStreak = 0
		let finalAction = null

		for (let tick = 0; tick < 100; tick++) {
			const action = await runTick(repoRoot, slug)
			seenActions.push({ tick, action: action.action, stage: action.stage, hat: action.hat, role: action.role, gate_kind: action.gate_kind })

			// Bail-out: 3 consecutive noops with no progress = stuck.
			if (action.action === "noop") {
				noopStreak++
				if (noopStreak >= 3) {
					console.error("Action sequence:", JSON.stringify(seenActions, null, 2))
					assert.fail(
						`Cursor stuck in noop for 3 consecutive ticks (tick ${tick})`,
					)
				}
				continue
			}
			noopStreak = 0

			if (action.action === "sealed") {
				finalAction = action
				break
			}

			// React to the action. Each branch mutates disk so the next
			// tick sees fresh state.
			switch (action.action) {
				case "elaborate": {
					// Write one unit for this stage.
					const unitName = `unit-01-${action.stage}`
					createWaveReadyUnit(intentDir, action.stage, unitName)
					break
				}
				case "start_unit_hat": {
					// Append `result: advance` for each unit on this hat.
					stampHatAdvance(intentDir, action.stage, action.units, action.hat)
					break
				}
				case "dispatch_review": {
					stampReviewRole(intentDir, action.stage, action.units, action.role)
					break
				}
				case "user_gate": {
					// gate_kind = "spec" → reviews.user.at
					// gate_kind = "approval" → approvals.user.at
					if (action.gate_kind === "spec") {
						stampReviewRole(intentDir, action.stage, action.units, "user")
					} else {
						stampApprovalRole(intentDir, action.stage, action.units, "user")
					}
					break
				}
				case "dispatch_approval": {
					stampApprovalRole(intentDir, action.stage, action.units, action.role)
					break
				}
				case "dispatch_quality_gates": {
					stampApprovalRole(
						intentDir,
						action.stage,
						action.units,
						"quality_gates",
					)
					break
				}
				case "merge_stage": {
					mergeStageBranch(repoRoot, slug, action.stage)
					break
				}
				case "intent_review": {
					// Stamp intent-level approval for the named role.
					const { path, parsed } = readIntentFm(intentDir)
					const fm = { ...parsed.data }
					const approvals = { ...(fm.approvals || {}) }
					approvals[action.role] = { at: new Date().toISOString() }
					fm.approvals = approvals
					writeIntentFm(path, fm, parsed.content)
					break
				}
				case "merge_intent": {
					// Engine response: stamp sealed_at on intent.md.
					const { path, parsed } = readIntentFm(intentDir)
					const fm = { ...parsed.data }
					fm.sealed_at = new Date().toISOString()
					writeIntentFm(path, fm, parsed.content)
					break
				}
				case "drift_detected":
				case "discovery_required":
				case "design_direction_required":
				case "clarify_required":
				case "start_feedback_hat":
				case "close_feedback":
				case "select_studio":
				case "error": {
					console.error("Unexpected action:", action)
					console.error("Action sequence:", JSON.stringify(seenActions, null, 2))
					assert.fail(
						`Unexpected action '${action.action}' at tick ${tick}: ${action.message}`,
					)
				}
				default: {
					console.error("Unknown action:", action)
					console.error("Action sequence:", JSON.stringify(seenActions, null, 2))
					assert.fail(
						`Unknown action '${action.action}' at tick ${tick}`,
					)
				}
			}
		}

		if (!finalAction || finalAction.action !== "sealed") {
			console.error("Action sequence:", JSON.stringify(seenActions, null, 2))
			assert.fail(
				`Pipeline did not reach 'sealed' within 100 ticks. Final: ${JSON.stringify(finalAction)}`,
			)
		}

		// Post-conditions: every stage's single unit should have all
		// reviews + approvals signed.
		for (const stage of ["a", "b", "c"]) {
			const unitName = `unit-01-${stage}`
			const { parsed } = readUnitFm(intentDir, stage, unitName)
			const fm = parsed.data
			assert.ok(fm.reviews?.spec?.at, `${stage}: spec review`)
			assert.ok(fm.reviews?.["code-reviewer"]?.at, `${stage}: code-reviewer review`)
			assert.ok(fm.reviews?.user?.at, `${stage}: user review`)
			assert.ok(fm.approvals?.spec?.at, `${stage}: spec approval`)
			assert.ok(
				fm.approvals?.quality_gates?.at,
				`${stage}: quality_gates approval`,
			)
			assert.ok(fm.approvals?.["code-reviewer"]?.at, `${stage}: code-reviewer approval`)
			assert.ok(fm.approvals?.user?.at, `${stage}: user approval`)
		}

		// Useful for debugging when the test passes too — pipe the action
		// sequence on success so the canonical multi-tick path is logged.
		t.diagnostic(
			`Pipeline sealed in ${seenActions.length} ticks. Action sequence: ${seenActions
				.map((s) => `${s.action}${s.stage ? `(${s.stage}${s.hat ? `/${s.hat}` : ""}${s.role ? `/${s.role}` : ""})` : ""}`)
				.join(" → ")}`,
		)
	})
})
